"use client";

import { useMemo } from "react";
import { Text } from "@react-three/drei";
import { MinerCube } from "./MinerCube";
import type { FlightRound } from "./Arena";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

// ─── Layout constants ───────────────────────────────────────────────

const CUBE_SIZE = 0.9;
const GAP = 0.25;
const CELL = CUBE_SIZE + GAP;
const ROUND_GAP = 0.6; // extra gap between round groups
const BASE_Y = 0.45; // cubes sit just above the ground plane

// Phase colors for round labels
const PHASE_COLORS: Record<string, string> = {
  commit: "#22d3ee",
  reveal: "#f59e0b",
  settling: "#d946ef",
  settled: "#4ade80",
  expired: "#666666",
};

// ─── Types ──────────────────────────────────────────────────────────

interface MinerWorldProps {
  flightRounds: FlightRound[];
  onSelectAgent: (
    agent: AgentInscription,
    roundId: string,
    phase: string,
  ) => void;
  selectedAgentWallet: string | null;
}

interface PlacedMiner {
  agent: AgentInscription;
  roundIndex: number;
  roundId: string;
  phase: string;
  position: [number, number, number];
  dropDelay: number;
}

// ─── Component ──────────────────────────────────────────────────────

export function MinerWorld({
  flightRounds,
  onSelectAgent,
  selectedAgentWallet,
}: MinerWorldProps) {
  // Compute grid positions for all miners across all rounds
  const { miners, roundLabels, totalWidth } = useMemo(() => {
    const placed: PlacedMiner[] = [];
    const labels: { text: string; position: [number, number, number]; color: string }[] = [];

    // Lay out rounds left-to-right, each round's agents in rows
    const maxCols = 6; // max agents per row within a round
    let groupX = 0;

    flightRounds.forEach((round, roundIdx) => {
      const agents = round.agents;
      const cols = Math.min(agents.length, maxCols);
      const rows = cols > 0 ? Math.ceil(agents.length / maxCols) : 0;

      // Group width
      const groupWidth = Math.max(cols, 1) * CELL;

      // Round label above the group
      const labelX = groupX + (groupWidth - CELL) / 2;
      const phaseColor = PHASE_COLORS[round.phase] ?? "#666";
      labels.push({
        text: `#${round.roundId} ${round.phase.toUpperCase()}`,
        position: [labelX, BASE_Y + 1.0, 0],
        color: phaseColor,
      });

      agents.forEach((agent, agentIdx) => {
        const col = agentIdx % maxCols;
        const row = Math.floor(agentIdx / maxCols);
        const x = groupX + col * CELL;
        const z = row * CELL;

        placed.push({
          agent,
          roundIndex: roundIdx,
          roundId: round.roundId,
          phase: round.phase,
          position: [x, BASE_Y, z],
          dropDelay: agentIdx * 0.06, // staggered drop
        });
      });

      groupX += groupWidth + ROUND_GAP;
    });

    return { miners: placed, roundLabels: labels, totalWidth: groupX - ROUND_GAP };
  }, [flightRounds]);

  // Center offset so the grid is centered at world origin
  const offsetX = -totalWidth / 2;

  return (
    <group position={[offsetX, 0, -0.5]}>
      {/* Round labels */}
      {roundLabels.map((label, i) => (
        <Text
          key={`label-${i}`}
          position={label.position}
          fontSize={0.12}
          color={label.color}
          anchorX="center"
          anchorY="middle"
        >
          {label.text}
        </Text>
      ))}

      {/* Miner cubes */}
      {miners.map((m) => (
        <MinerCube
          key={`${m.roundId}-${m.agent.wallet}`}
          agent={m.agent}
          phase={m.phase}
          roundIndex={m.roundIndex}
          roundId={m.roundId}
          position={m.position}
          onSelect={onSelectAgent}
          isSelected={selectedAgentWallet === m.agent.wallet}
          dropDelay={m.dropDelay}
        />
      ))}

      {/* Empty state */}
      {miners.length === 0 && (
        <Text
          position={[0, 0.5, 0]}
          fontSize={0.14}
          color="#444"
          anchorX="center"
          anchorY="middle"
        >
          waiting for miners...
        </Text>
      )}
    </group>
  );
}
