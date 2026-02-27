import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, decodeEventLog } from "viem";
import { base } from "viem/chains";
import { verifyAlchemySignature } from "@/lib/alchemy";
import { getDb } from "@/lib/db";
import { CONTRACTS } from "@/lib/constants";
import { CUSTOS_PROXY_ABI, MINE_CONTROLLER_ABI } from "@/lib/abis";
import { getTier } from "@/lib/utils";

const RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const ORACLE_WALLET = "0x19eE9D68cA11Fcf3Db49146b88cAE6E746E67F96".toLowerCase();

function getClient() {
  return createPublicClient({ transport: http(RPC_URL), chain: base });
}

/**
 * Ensure a round row exists in the DB; fetch from chain if missing.
 */
async function ensureRound(roundId: number) {
  const sql = getDb();
  const existing = await sql`SELECT round_id FROM rounds WHERE round_id = ${roundId}`;
  if (existing.length > 0) return;

  const client = getClient();
  const round = await client.readContract({
    address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
    abi: MINE_CONTROLLER_ABI,
    functionName: "getRound",
    args: [BigInt(roundId)],
  });

  // Resolve question text from oracle inscription
  let questionText: string | null = null;
  if (round.oracleInscriptionId && round.oracleInscriptionId > 0n) {
    try {
      const [revealed, content] = await client.readContract({
        address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
        abi: CUSTOS_PROXY_ABI,
        functionName: "getInscriptionContent",
        args: [round.oracleInscriptionId],
      });
      if (revealed && content) {
        try {
          const parsed = JSON.parse(content);
          questionText = parsed.question ?? null;
        } catch { /* ignore parse error */ }
      }
    } catch { /* ignore read error */ }
  }

  await sql`
    INSERT INTO rounds (
      round_id, epoch_id, commit_open_at, commit_close_at, reveal_close_at,
      answer_hash, oracle_inscription_id, settled, expired, revealed_answer,
      correct_count, question_text
    ) VALUES (
      ${roundId},
      ${Number(round.epochId)},
      ${Number(round.commitOpenAt)},
      ${Number(round.commitCloseAt)},
      ${Number(round.revealCloseAt)},
      ${round.answerHash},
      ${Number(round.oracleInscriptionId)},
      ${round.settled},
      ${round.expired},
      ${round.revealedAnswer || null},
      ${Number(round.correctCount)},
      ${questionText}
    )
    ON CONFLICT (round_id) DO NOTHING
  `;
}

/**
 * Refresh agent_stakes for a wallet if missing or stale (>1hr).
 */
async function refreshStakeIfNeeded(wallet: string) {
  const sql = getDb();
  const existing = await sql`
    SELECT updated_at FROM agent_stakes
    WHERE wallet = ${wallet.toLowerCase()}
  `;

  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  if (existing.length > 0 && existing[0].updated_at > oneHourAgo) return;

  const client = getClient();
  const stake = await client.readContract({
    address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
    abi: MINE_CONTROLLER_ABI,
    functionName: "getStake",
    args: [wallet as `0x${string}`],
  });

  const tier = getTier(stake.amount);

  await sql`
    INSERT INTO agent_stakes (wallet, stake_amount, tier, updated_at)
    VALUES (${wallet.toLowerCase()}, ${stake.amount.toString()}, ${tier}, now())
    ON CONFLICT (wallet) DO UPDATE SET
      stake_amount = EXCLUDED.stake_amount,
      tier = EXCLUDED.tier,
      updated_at = now()
  `;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify HMAC signature
    const signature = req.headers.get("x-alchemy-signature") ?? "";
    if (!verifyAlchemySignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Alchemy Custom Webhook payload shape:
    // { webhookId, id, createdAt, type, event: { data: { block: { logs: [...] } } } }
    const logs = payload?.event?.data?.block?.logs;
    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const client = getClient();
    const sql = getDb();
    let processed = 0;

    for (const log of logs) {
      try {
        // Decode the ProofInscribed event
        const decoded = decodeEventLog({
          abi: CUSTOS_PROXY_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName !== "ProofInscribed") continue;

        const args = decoded.args as {
          agentId: bigint;
          proofHash: string;
          prevHash: string;
          blockType: string;
          summary: string;
          cycleCount: bigint;
          contentHash: string;
          inscriptionId: bigint;
        };

        // Only process mine-related inscriptions
        if (!args.blockType.includes("mine")) continue;

        const inscriptionId = Number(args.inscriptionId);

        // Resolve wallet via inscriptionAgent()
        const wallet = await client.readContract({
          address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
          abi: CUSTOS_PROXY_ABI,
          functionName: "inscriptionAgent",
          args: [args.inscriptionId],
        });

        const walletLower = (wallet as string).toLowerCase();

        // Skip oracle wallet
        if (walletLower === ORACLE_WALLET) continue;

        // Resolve roundId via inscriptionRoundId()
        const roundId = await client.readContract({
          address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
          abi: CUSTOS_PROXY_ABI,
          functionName: "inscriptionRoundId",
          args: [args.inscriptionId],
        });

        const roundIdNum = Number(roundId);

        // Ensure round exists in DB
        await ensureRound(roundIdNum);

        // Insert inscription
        const txHash = log.transaction?.hash ?? null;
        const blockNumber = log.block?.number
          ? parseInt(log.block.number, 16)
          : null;

        await sql`
          INSERT INTO inscriptions (
            inscription_id, round_id, agent_id, wallet, block_type,
            summary, content_hash, proof_hash, prev_hash, cycle_count,
            tx_hash, block_number
          ) VALUES (
            ${inscriptionId},
            ${roundIdNum},
            ${Number(args.agentId)},
            ${walletLower},
            ${args.blockType},
            ${args.summary},
            ${args.contentHash},
            ${args.proofHash},
            ${args.prevHash},
            ${Number(args.cycleCount)},
            ${txHash},
            ${blockNumber}
          )
          ON CONFLICT (inscription_id) DO NOTHING
        `;

        // Refresh stake data if needed
        await refreshStakeIfNeeded(walletLower);

        processed++;
      } catch (err) {
        console.error("[webhook] Error processing log:", err);
        // Continue processing other logs
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    console.error("[webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
