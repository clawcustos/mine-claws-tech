"use client";

import Link from "next/link";
import { formatCountdown } from "@/lib/utils";
import { ROUNDS_PER_EPOCH } from "@/lib/constants";

interface StatsBarProps {
  epochId?: string;
  epochOpen?: boolean;
  roundCount?: number;
  rewardPool: string;
  rewardUsd?: string;
  stakedAgents?: number;
  epochTimeLeft: number;
}

export function StatsBar({
  epochId, epochOpen, roundCount, rewardPool,
  rewardUsd, stakedAgents, epochTimeLeft,
}: StatsBarProps) {
  const epochLabel = epochOpen === undefined ? "—"
    : epochOpen ? `#${epochId}` : "closed";

  return (
    <div className="arena-stats" style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      background: "rgba(10,10,10,0.85)",
      backdropFilter: "blur(8px)",
      borderBottom: "1px solid #1a1a1a",
      padding: "8px 12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      fontFamily: "monospace",
      zIndex: 10,
      flexWrap: "wrap",
    }}>
      {/* Left — branding + back */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 18, height: 18, borderRadius: 2 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 11 }}>
            mine<span style={{ color: "#dc2626" }}>.claws.tech</span>
          </span>
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <StatChip label="EPOCH" value={epochLabel} />
        <StatChip label="ROUND" value={roundCount !== undefined ? `${roundCount} / ${ROUNDS_PER_EPOCH}` : "—"} />
        <StatChip label="REWARDS" value={rewardPool} sub={rewardUsd} accent />
        <StatChip label="MINERS" value={stakedAgents !== undefined ? stakedAgents.toString() : "—"} />
        <StatChip label="NEXT" value={epochTimeLeft > 0 ? formatCountdown(epochTimeLeft) : "—"} />
      </div>

      {/* Back link */}
      <Link href="/" style={{
        fontSize: 10, color: "#555", textDecoration: "none",
        border: "1px solid #1a1a1a", padding: "3px 8px",
      }}>
        dashboard →
      </Link>
    </div>
  );
}

function StatChip({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div style={{ fontSize: 8, color: "#555", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: accent ? "#dc2626" : "#ccc",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 8, color: "#444" }}>{sub}</div>}
    </div>
  );
}
