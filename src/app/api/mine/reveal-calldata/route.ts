/**
 * GET /api/mine/reveal-calldata?wallet=0x50771...&roundId=71
 *
 * Returns the reveal() calldata for a bankr wallet that committed in the given round.
 *
 * The reveal function signature is:
 *   reveal(uint256 inscriptionId, string content, bytes32 salt)
 * where:
 *   - inscriptionId = the proxy inscription ID of the wallet's mine-commit
 *   - content       = the answer string (e.g. "0x4200...")
 *   - salt          = deterministic keccak256("custos-mine-salt-v1" + roundId + wallet)
 *
 * Salt is deterministic: keccak256(encodePacked(['string','uint256','address'], ['custos-mine-salt-v1', roundId, wallet]))
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  encodeFunctionData,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic salt: keccak256("custos-mine-salt-v1" + roundId + wallet) */
function deriveSalt(roundId: bigint, wallet: Address): Hex {
  return keccak256(encodePacked(
    ['string', 'uint256', 'address'],
    ['custos-mine-salt-v1', roundId, wallet]
  ));
}

/** Resolve blockchain answer from question JSON */
async function resolveAnswer(questionJson: string): Promise<string | null> {
  try {
    const q = JSON.parse(questionJson);
    const blockNumber = BigInt(q.blockNumber);
    const field: string = q.fieldDescription;

    const block = await client.getBlock({ blockNumber, includeTransactions: field === 'firstTransactionHash' });
    if (!block) return null;

    if (field === 'firstTransactionHash') {
      const txs = block.transactions as string[];
      if (!txs || txs.length === 0) return null;
      return txs[0] as string;
    }

    const rawValue = (block as Record<string, unknown>)[field];
    if (rawValue === undefined || rawValue === null) return null;

    // Return hex strings as-is (addresses, hashes — do NOT pad; must match oracle's answer)
    if (typeof rawValue === 'string' && rawValue.startsWith('0x')) {
      return rawValue;
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

/**
 * Find wallet's mine-commit inscription for a given roundId.
 * Scans backwards from total inscriptions — bankr's commit will be recent.
 * Returns the inscriptionId (bigint) or null.
 */
async function findCommitInscription(wallet: Address, roundId: bigint): Promise<bigint | null> {
  try {
    const total = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'inscriptionCount' }) as bigint;
    const scanFrom = total;
    const scanLimit = BigInt(100); // scan last 100 inscriptions

    for (let i = scanFrom; i > scanFrom - scanLimit && i > BigInt(0); i--) {
      try {
        const agent = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'inscriptionAgent', args: [i] }) as Address;
        if (agent.toLowerCase() !== wallet.toLowerCase()) continue;

        const insRoundId = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'inscriptionRoundId', args: [i] }) as bigint;
        if (insRoundId !== roundId) continue;

        // Check it's not yet revealed
        const revealTime = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'inscriptionRevealTime', args: [i] }) as bigint;
        if (revealTime === BigInt(0)) {
          // Not yet revealed — this is the commit inscription we want
          return i;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

type RoundResult = {
  roundId: bigint;
  commitCloseAt: bigint;
  revealCloseAt: bigint;
  answerHash: Hex;
  questionUri: string;
  oracleInscriptionId: bigint;
  settled: boolean;
  expired: boolean;
  revealedAnswer: string;
};

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletParam  = searchParams.get('wallet');
  const roundIdParam = searchParams.get('roundId');
  // Optional: caller can provide inscriptionId directly (skip scan)
  const insIdParam   = searchParams.get('inscriptionId');

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

    // 1. Fetch round — find the active one in reveal window
    let r: RoundResult;
    if (roundIdParam) {
      r = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getRound', args: [BigInt(roundIdParam)] });
    } else {
      const roundCount = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'roundCount', args: [] }) as bigint;
      const now = Math.floor(Date.now() / 1000);
      let found: RoundResult | null = null;
      for (let i = roundCount; i > BigInt(0) && i > roundCount - BigInt(5); i--) {
        const candidate = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getRound', args: [i] }) as RoundResult;
        const cInReveal = now >= Number(candidate.commitCloseAt) && now < Number(candidate.revealCloseAt);
        if (cInReveal) { found = candidate; break; }
      }
      if (!found) {
        return NextResponse.json({
          roundId: roundCount.toString(), wallet,
          windows: { inReveal: false, revealSecsLeft: 0, settled: false, expired: false },
          revealCalldata: null, inscriptionId: null,
          bankrInstruction: 'No round in reveal window. All settled/expired or still in commit.',
        });
      }
      r = found;
    }

    const now          = Math.floor(Date.now() / 1000);
    const inReveal     = now >= Number(r.commitCloseAt) && now < Number(r.revealCloseAt);
    const revealSecsLeft = Math.max(0, Number(r.revealCloseAt) - now);

    // 2. Fetch question content from oracle inscription (must be revealed by oracle)
    let questionJson: string | null = null;
    let question: Record<string, unknown> | null = null;
    try {
      const insResult = await rc({ address: CONTRACTS.CUSTOS_PROXY, abi: CUSTOS_PROXY_ABI, functionName: 'getInscriptionContent', args: [r.oracleInscriptionId] });
      const revealed = Array.isArray(insResult) ? insResult[0] : insResult.revealed;
      const content  = Array.isArray(insResult) ? insResult[1] : insResult.content;
      if (revealed && content) {
        questionJson = content as string;
        question     = JSON.parse(content as string);
      }
    } catch { /* not yet revealed */ }

    // 3. Resolve answer
    const answer = questionJson ? await resolveAnswer(questionJson) : null;

    // 4. Derive salt
    const salt = deriveSalt(r.roundId, wallet);

    // 5. Find commit inscription
    let inscriptionId: bigint | null = null;
    if (insIdParam) {
      inscriptionId = BigInt(insIdParam);
    } else if (inReveal || !roundIdParam) {
      inscriptionId = await findCommitInscription(wallet, r.roundId);
    }

    // 6. Build reveal calldata
    let revealCalldata: object | null = null;
    let bankrInstruction: string;

    if (!inReveal) {
      bankrInstruction = `Not in reveal window. Round ${r.roundId} — revealCloseAt: ${r.revealCloseAt}, settled: ${r.settled}, expired: ${r.expired}.`;
    } else if (!inscriptionId) {
      bankrInstruction = `In reveal window but no commit inscription found for wallet ${wallet} in round ${r.roundId}. Was commit submitted during the commit window?`;
    } else if (!answer) {
      bankrInstruction = `In reveal window but could not resolve answer for round ${r.roundId}. Oracle may not have revealed question yet.`;
    } else {
      const revealData = encodeFunctionData({
        abi: CUSTOS_PROXY_ABI,
        functionName: 'reveal',
        args: [inscriptionId, answer, salt],
      });
      revealCalldata = { to: CONTRACTS.CUSTOS_PROXY, data: revealData, value: '0', chainId: CHAIN_ID };
      bankrInstruction = `Submit this transaction:\n${JSON.stringify(revealCalldata)}`;
    }

    return NextResponse.json({
      roundId:        r.roundId.toString(),
      wallet,
      question,
      answer,
      salt,
      inscriptionId:  inscriptionId?.toString() ?? null,
      windows: {
        inReveal,
        revealSecsLeft,
        settled:  r.settled,
        expired:  r.expired,
      },
      revealCalldata,
      bankrInstruction,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}


export const GET = handler;
