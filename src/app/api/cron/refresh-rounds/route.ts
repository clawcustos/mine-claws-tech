import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { getDb } from "@/lib/db";
import { CONTRACTS, RPC_URL as DEFAULT_RPC_URL } from "@/lib/constants";
import { MINE_CONTROLLER_ABI, CUSTOS_PROXY_ABI } from "@/lib/abis";
import { getTier } from "@/lib/utils";

const RPC_URL = (process.env.BASE_RPC_URL || DEFAULT_RPC_URL).replace(/\s/g, "");
const ORACLE_WALLET = "0x19eE9D68cA11Fcf3Db49146b88cAE6E746E67F96".toLowerCase();

// Scan last ~16 min of Base blocks per run (~500 blocks at 2s/block).
// Overlap between runs is safe — ON CONFLICT DO NOTHING deduplicates.
const LOG_SCAN_BLOCKS = 500n;

const PROOF_INSCRIBED_EVENT = parseAbiItem(
  "event ProofInscribed(uint256 indexed agentId, bytes32 indexed proofHash, bytes32 prevHash, string blockType, string summary, uint256 cycleCount, bytes32 contentHash, uint256 inscriptionId)"
);

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

function getClient() {
  return createPublicClient({ transport: http(RPC_URL), chain: base });
}

/**
 * Ensure a round row exists in the DB; fetch from chain if missing.
 */
async function ensureRound(
  client: ReturnType<typeof getClient>,
  sql: ReturnType<typeof getDb>,
  roundId: number
) {
  const existing = await sql`SELECT round_id FROM rounds WHERE round_id = ${roundId}`;
  if (existing.length > 0) return;

  const round = await client.readContract({
    address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
    abi: MINE_CONTROLLER_ABI,
    functionName: "getRound",
    args: [BigInt(roundId)],
  });

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
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
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

export async function GET(req: NextRequest) {
  // Verify cron secret in production
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();
    const client = getClient();

    // ── 1. Detect new rounds ───────────────────────────────────────────────
    const roundCount = await client.readContract({
      address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
      abi: MINE_CONTROLLER_ABI,
      functionName: "roundCount",
    });

    const maxResult = await sql`SELECT COALESCE(MAX(round_id), 0) AS max_id FROM rounds`;
    const maxRoundId = maxResult[0].max_id as number;
    const onChainCount = Number(roundCount);

    // Insert any new rounds
    for (let rid = maxRoundId + 1; rid <= onChainCount; rid++) {
      const round = await client.readContract({
        address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
        abi: MINE_CONTROLLER_ABI,
        functionName: "getRound",
        args: [BigInt(rid)],
      });

      if (!round.commitOpenAt || round.commitOpenAt === 0n) continue;

      // Resolve question text
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
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }

      await sql`
        INSERT INTO rounds (
          round_id, epoch_id, commit_open_at, commit_close_at, reveal_close_at,
          answer_hash, oracle_inscription_id, settled, expired, revealed_answer,
          correct_count, question_text
        ) VALUES (
          ${rid},
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

    // ── 2. Poll ProofInscribed events (replaces Alchemy Custom Webhook) ────
    // One getLogs call per cron run (~100 CUs) vs webhook scanning every block.
    let newInscriptions = 0;
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > LOG_SCAN_BLOCKS ? currentBlock - LOG_SCAN_BLOCKS : 0n;

    try {
      const proofLogs = await client.getLogs({
        address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
        event: PROOF_INSCRIBED_EVENT,
        fromBlock,
        toBlock: currentBlock,
      });

      for (const log of proofLogs) {
        try {
          const { agentId, proofHash, prevHash, blockType, summary, cycleCount, contentHash, inscriptionId } = log.args;
          if (!blockType?.includes("mine")) continue;

          const insId = Number(inscriptionId);

          // Skip if already in DB (avoids unnecessary RPC calls on overlap)
          const exists = await sql`SELECT 1 FROM inscriptions WHERE inscription_id = ${insId}`;
          if (exists.length > 0) continue;

          // Resolve wallet and roundId in parallel
          const [wallet, roundId] = await Promise.all([
            client.readContract({
              address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
              abi: CUSTOS_PROXY_ABI,
              functionName: "inscriptionAgent",
              args: [inscriptionId!],
            }),
            client.readContract({
              address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
              abi: CUSTOS_PROXY_ABI,
              functionName: "inscriptionRoundId",
              args: [inscriptionId!],
            }),
          ]);

          const walletLower = (wallet as string).toLowerCase();
          if (walletLower === ORACLE_WALLET) continue;

          const roundIdNum = Number(roundId);

          // Ensure round exists (step 1 handles most, this catches edge cases)
          await ensureRound(client, sql, roundIdNum);

          await sql`
            INSERT INTO inscriptions (
              inscription_id, round_id, agent_id, wallet, block_type,
              summary, content_hash, proof_hash, prev_hash, cycle_count,
              tx_hash, block_number
            ) VALUES (
              ${insId},
              ${roundIdNum},
              ${Number(agentId)},
              ${walletLower},
              ${blockType},
              ${summary},
              ${contentHash},
              ${proofHash},
              ${prevHash},
              ${Number(cycleCount)},
              ${log.transactionHash},
              ${Number(log.blockNumber)}
            )
            ON CONFLICT (inscription_id) DO NOTHING
          `;

          newInscriptions++;
        } catch (err) {
          console.error("[cron] Error processing ProofInscribed log:", err);
        }
      }
    } catch (err) {
      console.error("[cron] Failed to poll ProofInscribed events:", err);
    }

    // ── 3. Poll CUSTOS_TOKEN Transfer events for stake changes ─────────────
    // Two filtered getLogs calls (~200 CUs total) detect stake/unstake instantly.
    let stakeUpdates = 0;

    try {
      const [stakeLogs, unstakeLogs] = await Promise.all([
        client.getLogs({
          address: CONTRACTS.CUSTOS_TOKEN as `0x${string}`,
          event: TRANSFER_EVENT,
          args: { to: CONTRACTS.MINE_CONTROLLER as `0x${string}` },
          fromBlock,
          toBlock: currentBlock,
        }),
        client.getLogs({
          address: CONTRACTS.CUSTOS_TOKEN as `0x${string}`,
          event: TRANSFER_EVENT,
          args: { from: CONTRACTS.MINE_CONTROLLER as `0x${string}` },
          fromBlock,
          toBlock: currentBlock,
        }),
      ]);

      // Collect unique wallets that staked or unstaked
      const changedWallets = new Set<string>();
      const mineControllerLower = CONTRACTS.MINE_CONTROLLER.toLowerCase();
      for (const log of [...stakeLogs, ...unstakeLogs]) {
        const from = log.args.from?.toLowerCase();
        const to = log.args.to?.toLowerCase();
        const userWallet = from === mineControllerLower ? to : from;
        if (userWallet) changedWallets.add(userWallet);
      }

      for (const wallet of changedWallets) {
        try {
          const stake = await client.readContract({
            address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
            abi: MINE_CONTROLLER_ABI,
            functionName: "getStake",
            args: [wallet as `0x${string}`],
          });

          const tier = getTier(stake.amount);

          await sql`
            INSERT INTO agent_stakes (wallet, stake_amount, tier, updated_at)
            VALUES (${wallet}, ${stake.amount.toString()}, ${tier}, now())
            ON CONFLICT (wallet) DO UPDATE SET
              stake_amount = EXCLUDED.stake_amount,
              tier = EXCLUDED.tier,
              updated_at = now()
          `;
          stakeUpdates++;
        } catch (err) {
          console.error(`[cron] Failed to refresh stake for ${wallet}:`, err);
        }
      }
    } catch (err) {
      console.error("[cron] Failed to poll Transfer events:", err);
    }

    // ── 4. Update active (unsettled, unexpired) rounds ─────────────────────
    const activeRounds = await sql`
      SELECT round_id FROM rounds
      WHERE settled = false AND expired = false
    `;

    let updatedCount = 0;

    for (const row of activeRounds) {
      const rid = row.round_id as number;

      const round = await client.readContract({
        address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
        abi: MINE_CONTROLLER_ABI,
        functionName: "getRound",
        args: [BigInt(rid)],
      });

      // Resolve question if we don't have it yet
      let questionText: string | null = null;
      const existingRound = await sql`SELECT question_text FROM rounds WHERE round_id = ${rid}`;
      if (!existingRound[0]?.question_text && round.oracleInscriptionId > 0n) {
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
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }

      await sql`
        UPDATE rounds SET
          settled = ${round.settled},
          expired = ${round.expired},
          revealed_answer = ${round.revealedAnswer || null},
          correct_count = ${Number(round.correctCount)},
          question_text = COALESCE(${questionText}, question_text),
          updated_at = now()
        WHERE round_id = ${rid}
      `;

      // 5. When settled, mark correct inscriptions
      if (round.settled && round.revealedAnswer) {
        await sql`
          UPDATE inscriptions SET
            correct = (TRIM(content) = TRIM(${round.revealedAnswer}))
          WHERE round_id = ${rid}
            AND revealed = true
            AND content IS NOT NULL
            AND correct IS NULL
        `;
      }

      // 6. Check for unrevealed inscriptions — pick up reveals
      const unrevealed = await sql`
        SELECT inscription_id FROM inscriptions
        WHERE round_id = ${rid} AND revealed = false
      `;

      for (const ins of unrevealed) {
        try {
          const [revealed, content] = await client.readContract({
            address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
            abi: CUSTOS_PROXY_ABI,
            functionName: "getInscriptionContent",
            args: [BigInt(ins.inscription_id)],
          });

          if (revealed) {
            let correct: boolean | null = null;
            if (round.settled && round.revealedAnswer && content) {
              correct = content.trim() === round.revealedAnswer.trim();
            }

            await sql`
              UPDATE inscriptions SET
                revealed = true,
                content = ${content},
                correct = ${correct}
              WHERE inscription_id = ${ins.inscription_id}
            `;
          }
        } catch (err) {
          console.error(`[cron] Failed to check reveal for inscription ${ins.inscription_id}:`, err);
        }
      }

      updatedCount++;
    }

    // ── 7. Refresh stale agent_stakes (safety net) ─────────────────────────
    // Step 3 handles event-driven updates. This catches anything missed.
    const staleStakes = await sql`
      SELECT wallet FROM agent_stakes
      WHERE updated_at < now() - interval '10 minutes'
      LIMIT 50
    `;

    for (const row of staleStakes) {
      try {
        const stake = await client.readContract({
          address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
          abi: MINE_CONTROLLER_ABI,
          functionName: "getStake",
          args: [row.wallet as `0x${string}`],
        });

        const tier = getTier(stake.amount);

        await sql`
          UPDATE agent_stakes SET
            stake_amount = ${stake.amount.toString()},
            tier = ${tier},
            updated_at = now()
          WHERE wallet = ${row.wallet}
        `;
      } catch (err) {
        console.error(`[cron] Failed to refresh stake for ${row.wallet}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      newRounds: onChainCount - maxRoundId,
      newInscriptions,
      stakeUpdates,
      updatedRounds: updatedCount,
      refreshedStakes: staleStakes.length,
    });
  } catch (err) {
    console.error("[cron] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
