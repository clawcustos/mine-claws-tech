"use client";

import { useMemo, useRef, useEffect } from "react";
import { ROUNDS_PER_EPOCH } from "@/lib/constants";

interface EpochTimelineProps {
  allRoundsData: any;
  roundCount: number;
  currentFlightIds: string[];
}

export function EpochTimeline({ allRoundsData, roundCount, currentFlightIds }: EpochTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rounds = useMemo(() => {
    const arr: Array<{
      id: number;
      settled: boolean;
      expired: boolean;
      correctCount: number;
      isFlight: boolean;
    }> = [];

    for (let i = 1; i <= ROUNDS_PER_EPOCH; i++) {
      const data = allRoundsData?.[i - 1]?.result as any;
      const isFlight = currentFlightIds.includes(i.toString());

      arr.push({
        id: i,
        settled: data?.settled ?? false,
        expired: data?.expired ?? false,
        correctCount: data ? Number(data.correctCount ?? 0) : 0,
        isFlight,
      });
    }

    return arr;
  }, [allRoundsData, currentFlightIds]);

  // Auto-scroll to current rounds
  useEffect(() => {
    if (scrollRef.current && roundCount > 10) {
      const blockWidth = 8; // 6px + 2px gap
      scrollRef.current.scrollLeft = Math.max(0, (roundCount - 10) * blockWidth);
    }
  }, [roundCount]);

  return (
    <div className="arena-timeline" style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      background: "rgba(10,10,10,0.85)",
      backdropFilter: "blur(8px)",
      borderTop: "1px solid #1a1a1a",
      padding: "8px 12px",
      fontFamily: "monospace",
      zIndex: 10,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
      }}>
        <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.1em" }}>
          EPOCH TIMELINE — {roundCount} / {ROUNDS_PER_EPOCH}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#555" }}>
          <span><span style={{ display: "inline-block", width: 6, height: 6, background: "#22c55e", marginRight: 3, verticalAlign: "middle" }} />settled</span>
          <span><span style={{ display: "inline-block", width: 6, height: 6, background: "#dc2626", marginRight: 3, verticalAlign: "middle" }} />active</span>
          <span><span style={{ display: "inline-block", width: 6, height: 6, background: "#1a1a1a", marginRight: 3, verticalAlign: "middle", border: "1px solid #333" }} />future</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {rounds.map((r) => {
          let bg = "#111"; // future
          let border = "1px solid #1a1a1a";
          let title = `Round ${r.id}`;

          if (r.id > roundCount) {
            // Future round — dark
            bg = "#0a0a0a";
            border = "1px solid #151515";
            title += " (future)";
          } else if (r.isFlight) {
            // Active flight round
            bg = "#dc2626";
            border = "1px solid #dc2626";
            title += " (active)";
          } else if (r.settled) {
            bg = r.correctCount > 0 ? "#22c55e" : "#555";
            border = `1px solid ${r.correctCount > 0 ? "#22c55e" : "#555"}`;
            title += ` (settled, ${r.correctCount} correct)`;
          } else if (r.expired) {
            bg = "#333";
            border = "1px solid #333";
            title += " (expired)";
          }

          return (
            <div
              key={r.id}
              title={title}
              style={{
                width: 6,
                height: 16,
                minWidth: 6,
                background: bg,
                border,
                borderRadius: 1,
                cursor: "default",
                opacity: r.isFlight ? 1 : 0.8,
                animation: r.isFlight ? "pulse 1.8s ease-in-out infinite" : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
