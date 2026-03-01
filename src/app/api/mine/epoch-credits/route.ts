/**
 * GET /api/mine/epoch-credits?epochId=2
 *
 * Returns the tier-weighted total credits for an epoch, calculated from
 * settled rounds. Each correct inscription is weighted by the wallet's
 * staking tier (1x/2x/3x) so the total matches what the contract will
 * report at epoch close.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const epochId = searchParams.get("epochId");

  if (!epochId || isNaN(Number(epochId))) {
    return NextResponse.json(
      { error: "epochId param required (integer)" },
      { status: 400 }
    );
  }

  try {
    const sql = getDb();

    const [result] = await sql`
      SELECT COALESCE(SUM(GREATEST(s.tier, 1)), 0)::int AS total_credits
      FROM inscriptions i
      JOIN rounds r ON r.round_id = i.round_id
      LEFT JOIN agent_stakes s ON LOWER(s.wallet) = LOWER(i.wallet)
      WHERE r.epoch_id = ${Number(epochId)}
        AND r.settled = true
        AND i.correct = true
    `;

    return NextResponse.json(
      {
        epochId: Number(epochId),
        totalCredits: result.total_credits,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
