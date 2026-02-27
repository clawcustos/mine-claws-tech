import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const ORACLE_WALLET = "0x19ee9d68ca11fcf3db49146b88cae6e746e67f96";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const id = parseInt(roundId, 10);

  if (isNaN(id) || id < 1) {
    return NextResponse.json({ error: "Invalid roundId" }, { status: 400 });
  }

  try {
    const sql = getDb();

    // Fetch round
    const rounds = await sql`
      SELECT * FROM rounds WHERE round_id = ${id}
    `;

    if (rounds.length === 0) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    const round = rounds[0];

    // Compute phase from timestamps + flags
    const now = Math.floor(Date.now() / 1000);
    let phase: string;
    if (round.settled) phase = "settled";
    else if (round.expired) phase = "expired";
    else if (now < Number(round.commit_close_at)) phase = "commit";
    else if (now < Number(round.reveal_close_at)) phase = "reveal";
    else phase = "settling";

    // Fetch inscriptions with tier from agent_stakes
    const inscriptions = await sql`
      SELECT
        i.inscription_id,
        i.wallet,
        i.revealed,
        i.content,
        i.correct,
        COALESCE(s.tier, 0) AS tier
      FROM inscriptions i
      LEFT JOIN agent_stakes s ON LOWER(i.wallet) = LOWER(s.wallet)
      WHERE i.round_id = ${id}
        AND LOWER(i.wallet) != ${ORACLE_WALLET}
      ORDER BY i.inscription_id
    `;

    const agents = inscriptions.map((row) => ({
      inscriptionId: row.inscription_id.toString(),
      wallet: row.wallet,
      revealed: row.revealed,
      content: row.revealed ? row.content : null,
      correct: row.correct,
      tier: Number(row.tier),
    }));

    const result = {
      roundId: id,
      phase,
      question: round.question_text ?? null,
      revealedAnswer: round.revealed_answer ?? null,
      correctCount: round.correct_count,
      agents,
    };

    const isSettled = round.settled || round.expired;

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": isSettled
          ? "public, max-age=3600"
          : "public, max-age=3, stale-while-revalidate=5",
      },
    });
  } catch (err) {
    console.error(`[round-inscriptions API] Error for round ${id}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch round inscriptions" },
      { status: 500 }
    );
  }
}
