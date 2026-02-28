import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORACLE_WALLET = "0x19ee9d68ca11fcf3db49146b88cae6e746e67f96";

/**
 * Returns the 3 most recent rounds that have at least 1 non-oracle agent inscription.
 * Used as a fallback when the live flight window rounds have no agents yet.
 */
export async function GET() {
  try {
    const sql = getDb();

    // Find 3 most recent rounds with non-oracle agents (query inscriptions directly)
    const rounds = await sql`
      SELECT round_id
      FROM inscriptions
      WHERE LOWER(wallet) != ${ORACLE_WALLET}
      GROUP BY round_id
      ORDER BY round_id DESC
      LIMIT 3
    `;

    if (rounds.length === 0) {
      return NextResponse.json([]);
    }

    const roundIds = rounds.map((r) => r.round_id);

    // Fetch full round + inscription data for these rounds
    const results = [];
    for (const rid of roundIds) {
      const roundRows = await sql`SELECT * FROM rounds WHERE round_id = ${rid}`;
      if (roundRows.length === 0) continue;
      const round = roundRows[0];

      const now = Math.floor(Date.now() / 1000);
      let phase: string;
      if (round.settled) phase = "settled";
      else if (round.expired) phase = "expired";
      else if (now < Number(round.commit_close_at)) phase = "commit";
      else if (now < Number(round.reveal_close_at)) phase = "reveal";
      else phase = "settling";

      const inscriptions = await sql`
        SELECT DISTINCT ON (LOWER(i.wallet))
          i.inscription_id,
          i.wallet,
          i.revealed,
          i.content,
          i.correct,
          COALESCE(s.tier, 0) AS tier
        FROM inscriptions i
        LEFT JOIN agent_stakes s ON LOWER(i.wallet) = LOWER(s.wallet)
        WHERE i.round_id = ${rid}
          AND LOWER(i.wallet) != ${ORACLE_WALLET}
        ORDER BY LOWER(i.wallet), i.inscription_id DESC
      `;

      results.push({
        roundId: rid,
        phase,
        question: round.question_text ?? null,
        revealedAnswer: round.revealed_answer ?? null,
        correctCount: round.correct_count,
        agents: inscriptions.map((row: any) => ({
          inscriptionId: row.inscription_id.toString(),
          wallet: row.wallet,
          revealed: row.revealed,
          content: row.revealed ? row.content : null,
          correct: row.correct,
          tier: Number(row.tier),
        })),
      });
    }

    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=20" },
    });
  } catch (err) {
    console.error("[populated-flight] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
