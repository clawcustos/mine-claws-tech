import { TIER_AMOUNTS } from "./constants";

export function formatCustos(raw: bigint | undefined): string {
  if (raw === undefined || raw === null) return "—";
  const n = Number(raw) / 1e18;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export function getTier(amount: bigint): 0 | 1 | 2 | 3 {
  if (amount >= TIER_AMOUNTS[3]) return 3;
  if (amount >= TIER_AMOUNTS[2]) return 2;
  if (amount >= TIER_AMOUNTS[1]) return 1;
  return 0;
}

export function getTierLabel(tier: number): string {
  const labels: Record<number, string> = {
    0: "Unstaked",
    1: "Tier 1 (1× credits)",
    2: "Tier 2 (2× credits)",
    3: "Tier 3 (3× credits)",
  };
  return labels[tier] ?? "Unknown";
}

export function getWindowStatus(
  commitOpenAt: bigint,
  commitCloseAt: bigint,
  revealCloseAt: bigint
): "commit" | "reveal" | "settle" | "expired" {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < commitCloseAt) return "commit";
  if (now < revealCloseAt) return "reveal";
  return "settle";
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
