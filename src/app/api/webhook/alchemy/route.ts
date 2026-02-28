import { NextResponse } from "next/server";

// Alchemy Custom Webhook has been removed — inscription detection and stake
// updates are now handled by getLogs polling in /api/cron/refresh-rounds.
// This route is kept as a stub to return 410 if Alchemy retries any queued deliveries.

export async function POST() {
  return NextResponse.json({ error: "Webhook decommissioned" }, { status: 410 });
}
