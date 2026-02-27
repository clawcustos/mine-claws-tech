/**
 * GET /api/mine/commit-calldata?wallet=0x50771...&roundId=71
 *
 * Option B — fully pre-computed calldata for bankr Mine integration.
 *
 * Returns everything bankr needs to participate in a round:
 *  - commitCalldata  → inscribe mine-commit on CustosNetworkProxy (commit window)
 *  - revealCalldata  → reveal inscription on CustosNetworkProxy (reveal window)
 *  - bankrInstruction → ready-to-paste bankr prompt (always the right one for current window)
 *
 * Salt is deterministic: keccak256("custos-mine-salt-v1" + roundId + wallet)
 * ContentHash formula: keccak256(utf8(answer) + raw_bytes(salt))  ← matches proxy verify
 *
 * Usage by bankr agent:
 *   1. GET /api/mine/commit-calldata?wallet=0x50771...
 *   2. Read bankrInstruction field
 *   3. Submit that instruction as a bankr prompt — done
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  encodeFunctionData,
  concat,
  toBytes,
  type Address,
  type Hex,
} from 'viem';
import { CONTRACTS, CHAIN_ID, RPC_URL as DEFAULT_RPC_URL } from '@/lib/constants';
import { MINE_CONTROLLER_ABI, CUSTOS_PROXY_ABI } from '@/lib/abis';


export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const RPC_URL = process.env.BASE_RPC_URL || DEFAULT_RPC_URL;

const baseChain = {
  id: CHAIN_ID,
  name: 'base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const client = createPublicClient({ transport: http(RPC_URL), chain: baseChain });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rc = client.readContract.bind(client) as (args: any) => Promise<any>;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic salt: keccak256("custos-mine-salt-v1" + roundId + wallet) */
function deriveSalt(roundId: bigint, wallet: Address): Hex {
  return keccak256(encodePacked(
    ['string', 'uint256', 'address'],
    ['custos-mine-salt-v1', roundId, wallet]
  ));
}

/**
 * ContentHash that matches proxy reveal() verification:
 * keccak256(abi.encodePacked(string_content, bytes32_salt))
 * = keccak256(utf8_bytes(content) ++ raw_bytes(salt))
 */
function computeContentHash(answerHex: string, salt: Hex): Hex {
  const answerBytes = new TextEncoder().encode(answerHex); // UTF-8, not hex-decode
  const saltBytes   = toBytes(salt);                        // raw bytes32
  return keccak256(concat([answerBytes, saltBytes]));
}

/** Get wallet's prevHash for chain linking — uses getChainHeadByWallet directly */
async function getWalletPrevHash(wallet: Address): Promise<Hex> {
  try {
    const chainHead = await rc({
      address: CONTRACTS.CUSTOS_PROXY,
      abi: CUSTOS_PROXY_ABI,
      functionName: 'getChainHeadByWallet',
      args: [wallet],
    }) as Hex;
    return chainHead ?? `0x${'00'.repeat(32)}` as Hex;
  } catch {
    return `0x${'00'.repeat(32)}` as Hex;
  }
}

/** Resolve blockchain answer from question JSON */
async function resolveAnswer(questionJson: string): Promise<string | null> {
  try {
    const q = JSON.parse(questionJson);
    const blockNumber = BigInt(q.blockNumber);
    const field: string = q.fieldDescription;

    const block = await client.getBlock({ blockNumber, includeTransactions: field === 'firstTransactionHash' });
    if (!block) return null;

    // Special case: firstTransactionHash
    if (field === 'firstTransactionHash') {
      const txs = block.transactions as string[];
      if (!txs || txs.length === 0) return null;
      return txs[0] as string;
    }

    // Map challenge field names to viem block property names
    const fieldMap: Record<string, string> = {
      blockHash: 'hash',
      // Add more mappings as needed
    };
    const key = fieldMap[field] ?? field;
    const rawValue = (block as Record<string, unknown>)[key];
    if (rawValue === undefined || rawValue === null) return null;

    // Return hex strings lowercase (addresses, hashes — must match oracle's answer)
    if (typeof rawValue === 'string' && rawValue.startsWith('0x')) {
      return rawValue.toLowerCase();
    }
    // Numbers/bigints: convert to decimal string (e.g. timestamp, gasUsed)
    if (typeof rawValue === 'bigint' || typeof rawValue === 'number') {
      return BigInt(rawValue).toString(10);
    }
    return null;
  } catch {
    return null;
  }
}

/** Find the most recent mine-commit inscription for a wallet+roundId */
async function findCommitInscription(wallet: Address, roundId: bigint): Promise<bigint | null> {
  try {
    const total = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'inscriptionCount' }) as bigint;
    // Walk backwards from latest — bankr's commit will be recent
    for (let i = total; i > total - BigInt(50) && i > BigInt(0); i--) {
      const agent = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'inscriptionAgent', args: [i] }) as Address;
      if (agent.toLowerCase() !== wallet.toLowerCase()) continue;
      // Check if it's a mine-commit for this round by checking the reveal data
      try {
        const revealResult = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'getInscriptionWithReveal', args: [i] }) as { revealed: boolean; content: string; contentHash: Hex };
        if (!revealResult.revealed) {
          // Unrevealed inscription by this wallet — likely the commit we want
          // Verify by checking round matches via proxy inscriptionRoundId if available
          return i;
        }
      } catch {
        // getInscriptionWithReveal may not exist on this impl
        return i;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Route ───────────────────────────────────────────────────────────────────

type RoundResult = {
  roundId: bigint;
  epochId: bigint;
  commitOpenAt: bigint;
  commitCloseAt: bigint;
  revealCloseAt: bigint;
  answerHash: Hex;
  questionUri: string;
  oracleInscriptionId: bigint;
  settled: boolean;
  expired: boolean;
  revealedAnswer: string;
  correctCount: bigint;
};

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletParam  = searchParams.get('wallet');
  const roundIdParam = searchParams.get('roundId');

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }

  const wallet = walletParam as Address;

  try {
    // 0. Stake gate — only staked agents get calldata
    const stake = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'getStake',
      args: [wallet],
    }) as any;

    const stakedBalance = (stake as any).amount ?? (Array.isArray(stake) ? stake[0] : BigInt(0));

    const MIN_STAKE = BigInt('25000000') * BigInt(10) ** BigInt(18); // 25M tokens
    if (stakedBalance < MIN_STAKE) {
      return NextResponse.json(
        { error: 'wallet not staked — minimum 25M CUSTOS stake required to access calldata' },
        { status: 403 }
      );
    }

    // 1. Fetch round — find the active one (in commit or reveal window)
    let r: RoundResult;
    if (roundIdParam) {
      r = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getRound', args: [BigInt(roundIdParam)] });
    } else {
      // Walk backwards from roundCount to find a round in commit or reveal window
      const roundCount = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'roundCount', args: [] }) as bigint;
      const now = Math.floor(Date.now() / 1000);
      let found: RoundResult | null = null;
      for (let i = roundCount; i > BigInt(0) && i > roundCount - BigInt(5); i--) {
        const candidate = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getRound', args: [i] }) as RoundResult;
        const cInCommit = now >= Number(candidate.commitOpenAt) && now < Number(candidate.commitCloseAt);
        const cInReveal = now >= Number(candidate.commitCloseAt) && now < Number(candidate.revealCloseAt);
        if (cInCommit || cInReveal) { found = candidate; break; }
      }
      if (!found) {
        return NextResponse.json({
          roundId: roundCount.toString(), wallet,
          windows: { inCommit: false, inReveal: false, commitSecsLeft: 0, revealSecsLeft: 0, settled: false, expired: false },
          commitCalldata: null, revealCalldata: null, commitInscriptionId: null,
          bankrInstruction: `No active round. Latest is ${roundCount}. All settled/expired. Next round will be posted by oracle.`,
        });
      }
      r = found;
    }

    const now           = Math.floor(Date.now() / 1000);
    const inCommit      = now >= Number(r.commitOpenAt)  && now < Number(r.commitCloseAt);
    const inReveal      = now >= Number(r.commitCloseAt) && now < Number(r.revealCloseAt);
    const commitSecsLeft = Number(r.commitCloseAt) - now;
    const revealSecsLeft = Number(r.revealCloseAt) - now;

    // 2. Parse question from questionUri
    // New format: custos://mine/q/{round}/{fieldDescription}/{blockNumber}
    // Old format: custos://inscription/{id} — falls back to reading inscription content
    let questionJson: string | null = null;
    let question: Record<string, unknown> | null = null;
    const uriMatch = r.questionUri.match(/custos:\/\/mine\/q\/(\d+)\/([^\/]+)\/(\d+)/);
    if (uriMatch) {
      question = {
        roundNumber: parseInt(uriMatch[1]),
        fieldDescription: uriMatch[2],
        blockNumber: parseInt(uriMatch[3]),
        question: `What is the ${uriMatch[2]} of block ${uriMatch[3]}?`,
      };
      questionJson = JSON.stringify(question);
    } else {
      // Fallback: old inscription-based format
      try {
        const insResult = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'getInscriptionContent', args: [r.oracleInscriptionId] });
        const revealed = Array.isArray(insResult) ? insResult[0] : insResult.revealed;
        const content  = Array.isArray(insResult) ? insResult[1] : insResult.content;
        if (revealed && content) {
          questionJson = content as string;
          question     = JSON.parse(content as string);
        }
      } catch { /* not available */ }
    }

    // 3. Resolve answer from chain
    const answer = questionJson ? await resolveAnswer(questionJson) : null;

    // 4. Derive deterministic salt
    const salt = deriveSalt(r.roundId, wallet);

    // 5. Build commit calldata
    let commitCalldata: object | null = null;
    let commitInscriptionId: string | null = null;

    if (answer && inCommit) {
      const contentHash = computeContentHash(answer, salt);
      const prevHash    = await getWalletPrevHash(wallet);
      const proofHash   = keccak256(encodePacked(['bytes32', 'bytes32'], [contentHash, prevHash]));
      const summary     = `mine-commit: round ${r.roundId} | ${question?.fieldDescription ?? 'unknown'}`;

      const commitData = encodeFunctionData({
        abi: CUSTOS_PROXY_ABI,
        functionName: 'inscribe',
        args: [proofHash, prevHash, 'mine-commit', summary, contentHash, r.roundId],
      });
      commitCalldata = { to: CONTRACTS.CUSTOS_PROXY, data: commitData, value: '0', chainId: CHAIN_ID };
    }

    // 6. Build reveal calldata — find the wallet's commit inscription for this round
    let revealCalldata: object | null = null;

    if (inReveal) {
      const insId = await findCommitInscription(wallet, r.roundId);
      if (insId && answer) {
        const revealData = encodeFunctionData({
          abi: CUSTOS_PROXY_ABI,
          functionName: 'reveal',
          args: [insId, answer, salt],
        });
        revealCalldata = { to: CONTRACTS.CUSTOS_PROXY, data: revealData, value: '0', chainId: CHAIN_ID };
        commitInscriptionId = insId.toString();
      }
    }

    // 7. Build bankr instruction — single prompt that does the right thing for current window
    let bankrInstruction: string;
    if (inCommit && commitCalldata) {
      bankrInstruction = `Submit this transaction:\n${JSON.stringify(commitCalldata)}`;
    } else if (inReveal && revealCalldata) {
      bankrInstruction = `Submit this transaction:\n${JSON.stringify(revealCalldata)}`;
    } else if (inCommit && !answer) {
      bankrInstruction = `Cannot build commit — question not yet revealed onchain for round ${r.roundId}. Try again in 30s.`;
    } else if (inReveal && !revealCalldata) {
      bankrInstruction = `In reveal window but no commit inscription found for wallet ${wallet} in round ${r.roundId}. Was commit submitted?`;
    } else {
      bankrInstruction = `No action needed. Round ${r.roundId} — inCommit: ${inCommit}, inReveal: ${inReveal}, settled: ${r.settled}, expired: ${r.expired}. Next window opens at commitOpenAt of round ${Number(r.roundId) + 1}.`;
    }

    return NextResponse.json({
      roundId:      r.roundId.toString(),
      wallet,
      questionUri:  r.questionUri,
      question,
      answer,
      salt,
      windows: {
        inCommit,
        inReveal,
        commitSecsLeft,
        revealSecsLeft,
        settled:  r.settled,
        expired:  r.expired,
      },
      commitCalldata,
      revealCalldata,
      commitInscriptionId,
      // ← The main field: paste this directly into bankr
      bankrInstruction,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}


export const GET = handler;
