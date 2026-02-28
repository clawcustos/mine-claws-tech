"use client";

import { shortAddr } from "@/lib/utils";
import { BASESCAN } from "@/lib/constants";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

const C = {
  label: "#999",
  sub: "#777",
  text: "#ccc",
  border: "#1a1a1a",
};

interface InspectPanelProps {
  agent: AgentInscription;
  roundId: string;
  phase: string;
  onClose: () => void;
}

export function InspectPanel({ agent, roundId, phase, onClose }: InspectPanelProps) {
  const statusText = (() => {
    if (phase === "settled" && agent.correct === true) return "CORRECT";
    if (phase === "settled" && agent.correct === false) return "INCORRECT";
    if (agent.revealed) return "REVEALED";
    return "COMMITTED";
  })();

  const statusColor = (() => {
    if (phase === "settled" && agent.correct === true) return "#22c55e";
    if (phase === "settled" && agent.correct === false) return "#666";
    if (agent.revealed) return "#eab308";
    return "#ffffff";
  })();

  const tierLabel = agent.tier > 0 ? `Tier ${agent.tier}` : "Unstaked";

  return (
    <div className="arena-inspect" style={{
      position: "absolute",
      top: 90,
      right: 12,
      width: 260,
      background: "rgba(10,10,10,0.92)",
      border: `1px solid ${C.border}`,
      backdropFilter: "blur(8px)",
      fontFamily: "monospace",
      zIndex: 20,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em" }}>AGENT DETAILS</div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: "#555", cursor: "pointer",
            fontSize: 14, lineHeight: 1, padding: 0,
          }}
        >
          x
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Wallet */}
        <div>
          <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>WALLET</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: C.text, wordBreak: "break-all" }}>
              {shortAddr(agent.wallet)}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(agent.wallet)}
              style={{
                background: "none", border: `1px solid ${C.border}`, color: C.sub,
                fontSize: 9, padding: "2px 6px", cursor: "pointer", fontFamily: "monospace",
              }}
            >
              copy
            </button>
          </div>
        </div>

        {/* Inscription ID */}
        <div>
          <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>INSCRIPTION</div>
          <a
            href={`${BASESCAN}/address/${agent.wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#dc2626", textDecoration: "none" }}
          >
            #{agent.inscriptionId} ↗
          </a>
        </div>

        {/* Round */}
        <div>
          <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>ROUND</div>
          <span style={{ fontSize: 12, color: C.text }}>#{roundId}</span>
        </div>

        {/* Status */}
        <div>
          <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>STATUS</div>
          <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>{statusText}</span>
        </div>

        {/* Tier */}
        <div>
          <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>TIER</div>
          <span style={{ fontSize: 12, color: agent.tier > 0 ? "#dc2626" : C.sub }}>{tierLabel}</span>
        </div>

        {/* Revealed answer */}
        {agent.revealed && agent.content && (
          <div>
            <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>ANSWER</div>
            <span style={{
              fontSize: 12, color: C.text, wordBreak: "break-all",
            }}>
              {agent.content.length > 40 ? agent.content.slice(0, 20) + "…" + agent.content.slice(-16) : agent.content}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
