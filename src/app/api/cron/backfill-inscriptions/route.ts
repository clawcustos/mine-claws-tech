import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getDb } from "@/lib/db";
import { CONTRACTS, RPC_URL as DEFAULT_RPC_URL } from "@/lib/constants";
import { CUSTOS_PROXY_ABI } from "@/lib/abis";
import { getTier } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RPC_URL = (process.env.BASE_RPC_URL || DEFAULT_RPC_URL).replace(/\s/g, "");
const ORACLE_WALLET = "0x19ee9d68ca11fcf3db49146b88cae6e746e67f96";

function getClient() {
  return createPublicClient({ transport: http(RPC_URL), chain: base });
}

export async function GET(req: NextRequest) {
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

    // Get on-chain inscription count
    const inscriptionCount = await client.readContract({
      address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
      abi: CUSTOS_PROXY_ABI,
      functionName: "inscriptionCount",
    });
    const total = Number(inscriptionCount);

    // Get existing inscription IDs from DB
    const existing = await sql`SELECT inscription_id FROM inscriptions`;
    const existingIds = new Set(existing.map((r) => Number(r.inscription_id)));

    let inserted = 0;
    let skippedOracle = 0;
    let skippedExisting = 0;
    let skippedNonRound = 0;
    const errors: string[] = [];

    // Scan backwards from most recent, stop when we've seen 20 existing in a row
    let consecutiveExisting = 0;
    const MAX_CONSECUTIVE = 20;

    for (let i = total; i >= 1; i--) {
      if (existingIds.has(i)) {
        skippedExisting++;
        consecutiveExisting++;
        if (consecutiveExisting >= MAX_CONSECUTIVE) break;
        continue;
      }
      consecutiveExisting = 0;

      try {
        // Check which round this inscription belongs to
        const roundId = await client.readContract({
          address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
          abi: CUSTOS_PROXY_ABI,
          functionName: "inscriptionRoundId",
          args: [BigInt(i)],
        });
        const roundIdNum = Number(roundId);

        if (roundIdNum === 0) {
          skippedNonRound++;
          continue;
        }

        // Get wallet
        const wallet = await client.readContract({
          address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
          abi: CUSTOS_PROXY_ABI,
          functionName: "inscriptionAgent",
          args: [BigInt(i)],
        });
        const walletLower = (wallet as string).toLowerCase();

        if (walletLower === ORACLE_WALLET) {
          skippedOracle++;
          continue;
        }

        // Get content
        const [revealed, content] = await client.readContract({
          address: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
          abi: CUSTOS_PROXY_ABI,
          functionName: "getInscriptionContent",
          args: [BigInt(i)],
        });

        // Check correctness
        let correct: boolean | null = null;
        const roundRows =
          await sql`SELECT revealed_answer, settled FROM rounds WHERE round_id = ${roundIdNum}`;
        if (
          roundRows.length > 0 &&
          roundRows[0].settled &&
          roundRows[0].revealed_answer &&
          revealed &&
          content
        ) {
          correct =
            content.trim() ===
            (roundRows[0].revealed_answer as string).trim();
        }

        // Get stake tier
        let tier = 0;
        try {
          const stake = await client.readContract({
            address: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
            abi: [
              {
                type: "function",
                name: "getStake",
                inputs: [{ name: "wallet", type: "address" }],
                stateMutability: "view",
                outputs: [
                  {
                    type: "tuple",
                    components: [
                      { name: "amount", type: "uint256" },
                      { name: "withdrawalQueued", type: "bool" },
                      { name: "unstakeEpochId", type: "uint256" },
                      { name: "stakedIndex", type: "uint256" },
                    ],
                  },
                ],
              },
            ],
            functionName: "getStake",
            args: [walletLower as `0x${string}`],
          });
          tier = getTier(stake.amount);

          // Upsert agent_stakes
          await sql`
            INSERT INTO agent_stakes (wallet, stake_amount, tier, updated_at)
            VALUES (${walletLower}, ${stake.amount.toString()}, ${tier}, now())
            ON CONFLICT (wallet) DO UPDATE SET
              stake_amount = EXCLUDED.stake_amount,
              tier = EXCLUDED.tier,
              updated_at = now()
          `;
        } catch {
          // stake lookup failed, use tier 0
        }

        await sql`
          INSERT INTO inscriptions (
            inscription_id, round_id, agent_id, wallet, block_type,
            summary, content_hash, proof_hash, prev_hash, cycle_count,
            revealed, content, correct
          ) VALUES (
            ${i},
            ${roundIdNum},
            ${0},
            ${walletLower},
            ${"mine-commit"},
            ${""},
            ${""},
            ${""},
            ${""},
            ${0},
            ${revealed},
            ${revealed ? content : null},
            ${correct}
          )
          ON CONFLICT (inscription_id) DO UPDATE SET
            revealed = EXCLUDED.revealed,
            content = EXCLUDED.content,
            correct = EXCLUDED.correct
        `;

        inserted++;
        existingIds.add(i);
        console.log(
          `[backfill] Inscription ${i} | round: ${roundIdNum} | wallet: ${walletLower.substring(0, 10)} | revealed: ${revealed}`,
        );
      } catch (e: any) {
        const msg = `Inscription ${i}: ${e.shortMessage || e.message}`;
        errors.push(msg);
        console.error(`[backfill] Error:`, msg);
      }
    }

    return NextResponse.json({
      ok: true,
      totalOnChain: total,
      inserted,
      skippedExisting,
      skippedOracle,
      skippedNonRound,
      errors: errors.length,
    });
  } catch (err) {
    console.error("[backfill] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
