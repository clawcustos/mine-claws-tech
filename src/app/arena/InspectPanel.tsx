"use client";

import { useState, useEffect } from "react";
import { shortAddr } from "@/lib/utils";
import { BASESCAN } from "@/lib/constants";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

interface InspectPanelProps {
  agent: AgentInscription;
  roundId: string;
  displayRoundNum?: number;
  phase: string;
  onClose: () => void;
}

const PHASE_COLORS: Record<string, string> = {
  commit: "#ffffff",
  reveal: "#f59e0b",
  settling: "#d946ef",
  settled: "#4ade80",
  expired: "#666666",
};

export function InspectPanel({ agent, roundId, displayRoundNum, phase, onClose }: InspectPanelProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(agent.wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const statusText = (() => {
    if (phase === "settled" && agent.correct === true) return "SUCCESS";
    if (phase === "settled" && agent.correct === false) return "FAIL";
    if (agent.revealed) return "REVEALED";
    return "MINED";
  })();

  const statusColor = (() => {
    if (phase === "settled" && agent.correct === true) return "#22c55e";
    if (phase === "settled" && agent.correct === false) return "#ef4444";
    if (agent.revealed) return "#eab308";
    return "#888";
  })();

  const phaseColor = PHASE_COLORS[phase] ?? "#666";
  const tierLabel = agent.tier > 0 ? `T${agent.tier}` : "—";

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        background: "rgba(8,8,8,0.96)",
        borderTop: "1px solid #222",
        borderRadius: "14px 14px 0 0",
        backdropFilter: "blur(12px)",
        fontFamily: "monospace",
        zIndex: 20,
      }
    : {
        position: "absolute",
        top: 90,
        right: 12,
        width: 260,
        background: "rgba(8,8,8,0.95)",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        backdropFilter: "blur(12px)",
        fontFamily: "monospace",
        zIndex: 20,
      };

  return (
    <div className="arena-inspect" style={panelStyle}>
      {/* Mobile handle */}
      {isMobile && (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#333" }} />
        </div>
      )}

      {/* Header row: round + phase pill + close */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px", borderBottom: "1px solid #1a1a1a",
      }}>
        <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>#{displayRoundNum ?? roundId}</span>
        <span style={{
          fontSize: 9, color: "#000", background: phaseColor,
          padding: "1px 6px", borderRadius: 3, fontWeight: 700,
          letterSpacing: "0.04em",
        }}>
          {phase === "commit" ? "MINE" : phase.toUpperCase()}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onClose}
          style={{
            background: "none", border: "1px solid #222", color: "#555", cursor: "pointer",
            fontSize: 11, lineHeight: 1, padding: "2px 6px", borderRadius: 3,
            fontFamily: "monospace",
          }}
        >
          esc
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: isMobile ? "10px 12px 16px" : "10px 12px 14px" }}>
        {/* Wallet row */}
        <div style={{ marginBottom: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#111", borderRadius: 4, padding: "6px 8px",
          }}>
            <span style={{ fontSize: 12, color: "#ddd", flex: 1 }}>
              {shortAddr(agent.wallet)}
            </span>
            <button
              onClick={handleCopy}
              style={{
                background: "none", border: "1px solid #222", color: copied ? "#4ade80" : "#666",
                fontSize: 9, padding: "2px 6px", cursor: "pointer", fontFamily: "monospace",
                borderRadius: 3, transition: "color 0.2s",
              }}
            >
              {copied ? "done" : "copy"}
            </button>
            <a
              href={`${BASESCAN}/address/${agent.wallet}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                border: "1px solid #222", color: "#dc2626", textDecoration: "none",
                fontSize: 9, padding: "2px 6px", borderRadius: 3, fontFamily: "monospace",
              }}
            >
              scan
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: "flex", gap: isMobile ? 16 : 0,
          justifyContent: isMobile ? "flex-start" : "space-between",
          marginBottom: 10,
        }}>
          <div>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.06em", marginBottom: 2 }}>ID</div>
            <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>#{agent.inscriptionId}</span>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.06em", marginBottom: 2 }}>TIER</div>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: agent.tier >= 3 ? "#dc2626" : agent.tier >= 2 ? "#f59e0b" : agent.tier >= 1 ? "#aaa" : "#444",
            }}>
              {tierLabel}
            </span>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.06em", marginBottom: 2 }}>STATUS</div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: statusColor,
              background: `${statusColor}18`, padding: "1px 5px", borderRadius: 3,
            }}>
              {statusText}
            </span>
          </div>
        </div>

        {/* Answer (if revealed) */}
        {agent.revealed && agent.content && (
          <div style={{
            background: "#111", borderRadius: 4, padding: "6px 8px",
            borderLeft: `2px solid ${statusColor}`,
          }}>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.06em", marginBottom: 3 }}>ANSWER</div>
            <span style={{ fontSize: 11, color: "#ccc", wordBreak: "break-all", lineHeight: 1.4 }}>
              {agent.content.length > 60 ? agent.content.slice(0, 28) + "..." + agent.content.slice(-24) : agent.content}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
