import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getDb } from "@/lib/db";
import { CONTRACTS } from "@/lib/constants";
import { MINE_CONTROLLER_ABI, CUSTOS_PROXY_ABI } from "@/lib/abis";
import { getTier } from "@/lib/utils";

const RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

function getClient() {
  return createPublicClient({ transport: http(RPC_URL), chain: base });
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

    // 1. Detect new rounds
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

    // 2. Update active (unsettled, unexpired) rounds
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

      // 3. When settled, mark correct inscriptions
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

      // 4. Check for unrevealed inscriptions — pick up reveals
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

    // 5. Refresh stale agent_stakes (>1hr old)
    const staleStakes = await sql`
      SELECT wallet FROM agent_stakes
      WHERE updated_at < now() - interval '1 hour'
      LIMIT 20
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
      updatedRounds: updatedCount,
      refreshedStakes: staleStakes.length,
    });
  } catch (err) {
    console.error("[cron] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
