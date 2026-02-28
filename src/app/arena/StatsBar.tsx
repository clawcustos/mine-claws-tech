"use client";

import Link from "next/link";
import { formatCountdown } from "@/lib/utils";
import { ROUNDS_PER_EPOCH } from "@/lib/constants";

const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";

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
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      background: "rgba(10,10,10,0.88)",
      backdropFilter: "blur(10px)",
      fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
      zIndex: 10,
    }}>
      {/* Nav row — matches mine/stake/epochs/docs pages */}
      <nav style={{
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        borderBottom: "1px solid #111",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
            mine<span style={{ color: "#dc2626" }}>.claws.tech</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
            {([["mine", "/mine"], ["stake", "/stake"], ["epochs", "/epochs"], ["arena", "/arena"], ["docs", "/docs"]] as [string, string][]).map(([label, href]) => (
              <Link key={href} href={href} style={{ color: label === "arena" ? "#fff" : "#555", textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#dc2626", textDecoration: "none", border: "1px solid #dc2626", padding: "4px 10px", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            miner skill →
          </a>
        </div>
      </nav>

      {/* Stats strip */}
      <div style={{
        padding: "6px 16px 7px",
        display: "flex",
        gap: 20,
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        borderBottom: "1px solid #1a1a1a",
      }}>
        <StatChip label="EPOCH" value={epochLabel} />
        <StatChip label="ROUND" value={roundCount !== undefined ? `${roundCount} / ${ROUNDS_PER_EPOCH}` : "—"} />
        <StatChip label="REWARDS" value={rewardPool} sub={rewardUsd} accent />
        <StatChip label="MINERS" value={stakedAgents !== undefined ? stakedAgents.toString() : "—"} />
        <StatChip label="NEXT" value={epochTimeLeft > 0 ? formatCountdown(epochTimeLeft) : "—"} />
      </div>
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
