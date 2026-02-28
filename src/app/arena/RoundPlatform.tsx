"use client";

import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { formatCountdown, shortAddr } from "@/lib/utils";
import type { FlightRound } from "./Arena";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";
import { VoxelPickaxe } from "./VoxelPickaxe";
import { SettlementBurst } from "./SettlementBurst";

// ─── Custos palette ─────────────────────────────────────────────────

const COLORS = {
  base: "#ff3b30",
  baseDark: "#cc2920",
  highlight: "#ff6b5a",
  correct: "#ffd700",
  correctDark: "#e6b800",
  incorrect: "#4a3a34",
  incorrectDark: "#332824",
};

const PHASE_COLORS: Record<string, string> = {
  commit: "#ffffff",
  reveal: "#f59e0b",
  settling: "#d946ef",
  settled: "#4ade80",
  expired: "#666666",
};

// Display labels — "commit" → "MINE" for user-facing text
const PHASE_LABEL: Record<string, string> = {
  commit: "MINE",
  reveal: "REVEAL",
  settling: "SETTLING",
  settled: "SETTLED",
  expired: "EXPIRED",
};

// Phase → emissive tint on blocks (gives each phase a distinct color feel)
const PHASE_EMISSIVE: Record<string, { color: string; base: number; pulse: number; freq: number }> = {
  commit:   { color: "#ffffff", base: 0.18, pulse: 0.08, freq: 1.5 },
  reveal:   { color: "#f59e0b", base: 0.22, pulse: 0.12, freq: 2.5 },
  settling: { color: "#d946ef", base: 0.30, pulse: 0.15, freq: 5.0 },
  settled:  { color: "#4ade80", base: 0.12, pulse: 0.03, freq: 0.8 },
  expired:  { color: "#666666", base: 0.05, pulse: 0.0,  freq: 0.0 },
};

// Tier → vertical block rows per agent: T0/T1=1, T2=2, T3=3
const TIER_LAYERS: Record<number, number> = { 0: 1, 1: 1, 2: 2, 3: 3 };

const BLOCK_SIZE = 0.42;
const GAP = 0.03;
const STEP = BLOCK_SIZE + GAP;
const BASE_Y = 0.08;

// 9-point cross-section
const CROSS_SECTION: [number, number][] = [
  [0, 0],
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

// ─── Types ──────────────────────────────────────────────────────────

interface VoxelBlock {
  pos: [number, number, number];
  agentIndex: number;
  layerInAgent: number;
  color: string;
}

interface RoundPlatformProps {
  position: [number, number, number];
  round: FlightRound;
  onSelectAgent: (agent: AgentInscription, roundId: string, phase: string) => void;
  selectedAgentWallet: string | null;
  selectedRoundId: string | null;
  onShake?: (intensity: number) => void;
}

// ─── Platform Base (styled RoundedBox cubes matching the block aesthetic) ──

function PlatformBase({ phaseColor }: { phaseColor: string }) {
  const blocks = useMemo(() => {
    const result: { pos: [number, number, number]; isEdge: boolean }[] = [];
    const W = 5, D = 4, BS = 0.48, GP = 0.04, ST = BS + GP;
    const halfW = (W - 1) / 2, halfD = (D - 1) / 2;
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const isEdge = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        result.push({ pos: [(x - halfW) * ST, 0, (z - halfD) * ST], isEdge });
      }
    }
    return result;
  }, []);

  return (
    <group position={[0, -0.06, 0]}>
      {blocks.map((b, i) => (
        <RoundedBox
          key={i}
          args={[0.48, 0.12, 0.48]}
          radius={0.02}
          smoothness={4}
          position={b.pos}
          receiveShadow
        >
          <meshStandardMaterial
            color={b.isEdge ? "#1a0808" : "#120606"}
            emissive={phaseColor}
            emissiveIntensity={b.isEdge ? 0.2 : 0.1}
            roughness={0.5}
            metalness={0.4}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

// ─── TowerDebris (InstancedMesh particles) ──────────────────────────

function TowerDebris({ count, radius, height, color }: {
  count: number; radius: number; height: number; color: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2 + Math.random() * 1.2,
      r: radius * 0.5 + Math.random() * radius * 1.4,
      y: Math.random() * height * 1.3,
      speed: 0.1 + Math.random() * 0.35,
      size: 0.025 + Math.random() * 0.065,
      wobble: Math.random() * Math.PI * 2,
      phaseOffset: Math.random() * Math.PI * 2,
    })), [count, radius, height]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const angle = p.angle + t * p.speed;
      const r = p.r + Math.sin(t * 0.6 + p.phaseOffset) * 0.25;
      dummy.position.set(Math.cos(angle) * r, p.y + Math.sin(t * 0.9 + p.wobble) * 0.15, Math.sin(angle) * r);
      dummy.rotation.set(t * p.speed * 1.5, t * p.speed * 0.8, t * p.speed * 0.3);
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} emissive={color} emissiveIntensity={0.5} />
    </instancedMesh>
  );
}

// ─── Main RoundPlatform ─────────────────────────────────────────────

export function RoundPlatform({ position, round, onSelectAgent, selectedAgentWallet, selectedRoundId, onShake }: RoundPlatformProps) {
  const phaseColor = PHASE_COLORS[round.phase] ?? "#666666";
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);
  const agents = round.agents;
  const count = agents.length;

  // ─── Cursor-following tooltip (imperative DOM for perf) ──────────
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "1000",
      display: "none",
      background: "rgba(0,0,0,0.9)",
      border: `1px solid ${COLORS.highlight}`,
      padding: "5px 10px",
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#eee",
      whiteSpace: "nowrap",
      borderRadius: "3px",
      transform: "translate(12px, -50%)",
    });
    document.body.appendChild(el);
    tooltipRef.current = el;
    return () => { el.remove(); };
  }, []);

  // Follow cursor globally (avoids R3F event type issues)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${e.clientX}px`;
        tooltipRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Update tooltip content when hovered agent changes
  useEffect(() => {
    if (!tooltipRef.current) return;
    if (!hoveredAgent) {
      tooltipRef.current.style.display = "none";
      return;
    }
    const agent = agents.find(a => a.wallet === hoveredAgent);
    if (!agent) {
      tooltipRef.current.style.display = "none";
      return;
    }
    let html = shortAddr(agent.wallet);
    if (agent.tier > 0) html += `<span style="color:${COLORS.base};margin-left:5px">T${agent.tier}</span>`;
    if (round.phase === "settled" && agent.correct === true) html += `<span style="color:#4ade80;margin-left:5px">correct</span>`;
    if (round.phase === "settled" && agent.correct === false) html += `<span style="color:#888;margin-left:5px">wrong</span>`;
    tooltipRef.current.innerHTML = html;
    tooltipRef.current.style.display = "block";
  }, [hoveredAgent, agents, round.phase]);

  // Smooth position transitions
  const platformRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(...position));
  targetPos.current.set(...position);

  useFrame(() => {
    if (!platformRef.current) return;
    platformRef.current.position.lerp(targetPos.current, 0.08);
  });

  // Build blocks: cross-section × layers per agent
  const { voxels, towerHeight, agentTopY } = useMemo(() => {
    const blocks: VoxelBlock[] = [];
    const topY = new Map<string, number>();
    if (count === 0) return { voxels: blocks, towerHeight: 0, agentTopY: topY };

    const blocksPerLayer = count <= 2 ? CROSS_SECTION.length : count <= 4 ? 5 : 4;
    let layerY = BASE_Y;

    agents.forEach((agent, agentIdx) => {
      const layers = TIER_LAYERS[agent.tier] ?? 1;

      let colorA: string, colorB: string;
      if (round.phase === "settled" && agent.correct === true) {
        colorA = COLORS.correct;
        colorB = COLORS.correctDark;
      } else if (round.phase === "settled" && agent.correct === false) {
        colorA = COLORS.incorrect;
        colorB = COLORS.incorrectDark;
      } else if (round.phase === "expired") {
        colorA = COLORS.incorrect;
        colorB = COLORS.incorrectDark;
      } else {
        colorA = agentIdx % 2 === 0 ? COLORS.base : COLORS.baseDark;
        colorB = agentIdx % 2 === 0 ? COLORS.baseDark : COLORS.base;
      }

      for (let ly = 0; ly < layers; ly++) {
        for (let bi = 0; bi < blocksPerLayer; bi++) {
          const [gx, gz] = CROSS_SECTION[bi % CROSS_SECTION.length];
          const jx = Math.sin(agentIdx * 3.1 + ly * 2.7 + bi * 1.3) * 0.012;
          const jz = Math.cos(agentIdx * 2.3 + ly * 1.9 + bi * 3.7) * 0.012;
          blocks.push({
            pos: [gx * STEP + jx, layerY + BLOCK_SIZE / 2, gz * STEP + jz],
            agentIndex: agentIdx,
            layerInAgent: ly,
            color: (ly + bi) % 2 === 0 ? colorA : colorB,
          });
        }
        layerY += STEP;
      }

      // Track the top Y of each agent's blocks
      topY.set(agent.wallet, layerY);
    });

    return { voxels: blocks, towerHeight: layerY, agentTopY: topY };
  }, [agents, count, round.phase]);

  // Block group refs
  const blockRefs = useRef<(THREE.Group | null)[]>([]);
  blockRefs.current.length = voxels.length;

  // Material refs
  const materialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  materialRefs.current.length = voxels.length;

  // Per-agent spawn times
  const spawnTimes = useRef(new Map<string, number>());

  // Detect new agents for shake
  const prevAgentCount = useRef(0);
  useEffect(() => {
    if (count > prevAgentCount.current && prevAgentCount.current > 0 && round.phase === "commit") {
      onShake?.(0.03);
    }
    prevAgentCount.current = count;
  }, [count, round.phase, onShake]);

  // Settlement burst
  const [burstTrigger, setBurstTrigger] = useState(false);
  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (round.phase === "settled" && prevPhase.current !== "settled") {
      setBurstTrigger(true);
      onShake?.(0.08);
    }
    prevPhase.current = round.phase;
  }, [round.phase, onShake]);

  // ─── Single useFrame — ALL block animations ────────────────────────
  useFrame(({ clock }) => {
    if (voxels.length === 0) return;
    const t = clock.getElapsedTime();
    const now = Date.now();

    for (let i = 0; i < agents.length; i++) {
      if (!spawnTimes.current.has(agents[i].wallet)) {
        spawnTimes.current.set(agents[i].wallet, now);
      }
    }

    const phaseEmit = PHASE_EMISSIVE[round.phase] ?? PHASE_EMISSIVE.commit;

    for (let i = 0; i < voxels.length; i++) {
      const group = blockRefs.current[i];
      if (!group) continue;

      const block = voxels[i];
      const agent = agents[block.agentIndex];
      if (!agent) continue;

      const [px, py, pz] = block.pos;
      const spawnTime = spawnTimes.current.get(agent.wallet) ?? now;
      const elapsed = (now - spawnTime) / 1000;

      // Drop-in animation
      const dropDelay = py * 0.1;
      const dropProgress = Math.min(1, Math.max(0, (elapsed - dropDelay) / 0.3));
      const eased = 1 - Math.pow(1 - dropProgress, 3);
      const startY = py + 5;
      let y = THREE.MathUtils.lerp(startY, py, eased);
      const landed = dropProgress >= 1;

      // Bounce on landing
      if (landed) {
        const sinceLand = elapsed - dropDelay - 0.3;
        if (sinceLand > 0 && sinceLand < 0.2) {
          y += Math.sin(sinceLand * Math.PI / 0.1) * 0.02 * (1 - sinceLand / 0.2);
        }
      }

      // ─── Phase-specific animations ──────────────────────────────
      let rx = 0, rz = 0;
      let xOff = 0, zOff = 0;

      if (landed) {
        const bOff = block.agentIndex * 1.1 + block.layerInAgent * 0.3;

        if (round.phase === "commit") {
          // MINE: Rhythmic bob + pickaxe impact wobble synced to swing peak (sin(t*4) peak)
          y += Math.sin(t * 1.5 + bOff) * 0.025;
          xOff = Math.sin(t * 0.8 + bOff * 2) * 0.008;
          rz = Math.sin(t * 1.5 + bOff) * 0.02;
          // Impact pulse — peaks when pickaxe contacts (sin(t*4) = 1)
          // Uses pow to sharpen the pulse into a brief jolt
          const impact = Math.max(0, Math.sin(t * 4));
          const pulse = Math.pow(impact, 8); // sharp spike at contact
          y += pulse * 0.04 * (1 - py * 0.15); // top blocks wobble more
          rz += pulse * 0.04 * Math.sin(bOff * 3);
          rx = pulse * 0.03 * Math.cos(bOff * 2);
        } else if (round.phase === "reveal") {
          // REVEAL: Revealed blocks float up with a green tint; unrevealed breathe anxiously
          if (agent.revealed) {
            // Revealed — calm confident float
            y += 0.04 + Math.sin(t * 1.2 + bOff) * 0.015;
            rz = Math.sin(t * 0.6 + bOff) * 0.01;
          } else {
            // Unrevealed — tense breathing, blocks expand/contract
            y += Math.sin(t * 2.5 + bOff) * 0.035;
            const breathScale = 1 + Math.sin(t * 2.5 + bOff) * 0.015;
            group.scale.set(breathScale, breathScale, breathScale);
          }
        } else if (round.phase === "settling") {
          // SETTLING: Anxious vibration — rapid shimmer + purple-tinted shake
          y += Math.sin(t * 8 + bOff * 3) * 0.012;
          xOff = Math.sin(t * 12 + bOff * 5) * 0.006;
          zOff = Math.cos(t * 10 + bOff * 4) * 0.006;
          rx = Math.sin(t * 6 + bOff) * 0.03;
          rz = Math.cos(t * 7 + bOff) * 0.03;
        } else if (round.phase === "settled" && agent.correct === true) {
          // SETTLED CORRECT: Victorious float + gentle golden bob
          y += 0.06 + Math.sin(t * 1.2 + block.layerInAgent * 0.5) * 0.025;
          rz = Math.sin(t * 0.5 + bOff) * 0.01;
        } else if (round.phase === "settled" && agent.correct === false) {
          // SETTLED INCORRECT: Defeated — sink, tilt, scattered
          y -= 0.03;
          xOff = Math.sin(block.agentIndex * 3.7 + block.layerInAgent * 2.1) * 0.06;
          zOff = Math.cos(block.agentIndex * 2.3 + block.layerInAgent * 1.7) * 0.06;
          rz = Math.sin(block.agentIndex * 1.3 + block.layerInAgent) * 0.12;
          rx = Math.cos(block.agentIndex * 2.1 + block.layerInAgent) * 0.08;
        }
      }

      group.position.set(px + xOff, y, pz + zOff);
      group.rotation.set(rx, 0, rz);

      // Reset scale — reveal unrevealed uses breathing scale animation, skip those
      const isBreathing = round.phase === "reveal" && !agent.revealed;
      if (!isBreathing && landed) {
        const isH = hoveredAgent === agent.wallet;
        const isS = selectedAgentWallet === agent.wallet && selectedRoundId === round.roundId;
        const s = isH || isS ? 1.12 : 1;
        group.scale.lerp(new THREE.Vector3(s, s, s), 0.15);
      } else if (!landed) {
        group.scale.set(1, 1, 1);
      }

      // ─── Phase-reactive emissive colors ─────────────────────────
      const mat = materialRefs.current[i];
      if (mat) {
        const isH = hoveredAgent === agent.wallet;
        const isS = selectedAgentWallet === agent.wallet;
        const isActiveRound = selectedRoundId === round.roundId;

        if (isS && isActiveRound && i === selectedBlockIdx) {
          // Bright cyan for the specifically clicked block (active round only)
          mat.emissive.set("#00bfff");
          mat.emissiveIntensity = 0.45 + Math.sin(t * 3) * 0.15;
        } else if (isS && isActiveRound) {
          // Dimmer cyan for the agent's other blocks (active round only)
          mat.emissive.set("#00bfff");
          mat.emissiveIntensity = 0.18 + Math.sin(t * 2) * 0.06;
        } else if (isS) {
          // Subtle indicator on other rounds where this agent appears
          mat.emissive.set("#00bfff");
          mat.emissiveIntensity = 0.08 + Math.sin(t * 1.5) * 0.03;
        } else if (isH) {
          mat.emissive.set("#ffffff");
          mat.emissiveIntensity = 0.15 + Math.sin(t * 5) * 0.05;
        } else if (round.phase === "settled" && agent.correct === true) {
          // Gold glow for correct
          mat.emissive.set(COLORS.correct);
          mat.emissiveIntensity = 0.25 + Math.sin(t * 1.2) * 0.08;
        } else if (round.phase === "settled" && agent.correct === false) {
          // Dim for incorrect
          mat.emissive.set("#222222");
          mat.emissiveIntensity = 0.03;
        } else if (round.phase === "reveal" && agent.revealed) {
          // Revealed during reveal phase — green-tinted glow to stand out
          mat.emissive.set("#22c55e");
          mat.emissiveIntensity = 0.20 + Math.sin(t * 1.2 + block.agentIndex * 0.7) * 0.06;
        } else {
          // Phase-tinted emissive pulse
          mat.emissive.set(phaseEmit.color);
          mat.emissiveIntensity = phaseEmit.base + Math.sin(t * phaseEmit.freq + block.agentIndex * 0.7) * phaseEmit.pulse;
        }
      }
    }
  });

  // Debris color
  const debrisColor = round.phase === "settled" && agents.some(a => a.correct)
    ? COLORS.correct : round.phase === "settled" ? COLORS.incorrect : COLORS.base;

  return (
    <group ref={platformRef} position={position}>
      <PlatformBase phaseColor={phaseColor} />

      {/* Phase label + countdown — HTML overlay for crisp text at any zoom */}
      <Html position={[0, -0.3, 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: "none" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "monospace", whiteSpace: "nowrap", userSelect: "none",
        }}>
          <span style={{ fontSize: 11, color: phaseColor, fontWeight: 700 }}>
            #{round.roundId}
          </span>
          <span style={{
            fontSize: 9, color: "#000", background: phaseColor,
            padding: "1px 6px", borderRadius: 3, fontWeight: 700,
            letterSpacing: "0.05em",
          }}>
            {PHASE_LABEL[round.phase] ?? round.phase.toUpperCase()}
          </span>
          {round.countdown > 0 && (
            <span style={{ fontSize: 11, color: phaseColor, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {formatCountdown(round.countdown)}
            </span>
          )}
        </div>
      </Html>

      {/* Question — only shown when a block on this round is selected */}
      {round.question && selectedRoundId === round.roundId && (
        <Html position={[0, towerHeight + 0.6, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
          <div style={{
            color: "#bbb", fontSize: 10, fontFamily: "monospace", maxWidth: 160,
            textAlign: "center", lineHeight: 1.4, background: "rgba(0,0,0,0.88)",
            padding: "5px 8px", borderRadius: 3, border: `1px solid ${phaseColor}55`,
          }}>
            {round.question.length > 60 ? round.question.slice(0, 57) + "..." : round.question}
          </div>
        </Html>
      )}

      {/* ─── Individual RoundedBox blocks ─────────────────────────── */}
      {voxels.map((block, i) => {
        const agent = agents[block.agentIndex];
        if (!agent) return null;

        return (
          <group
            key={`${agent.wallet}-${block.layerInAgent}-${i}`}
            ref={(el) => { blockRefs.current[i] = el; }}
            position={block.pos}
          >
            <RoundedBox
              args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]}
              radius={BLOCK_SIZE * 0.13}
              smoothness={4}
              onClick={(e) => { e.stopPropagation(); setSelectedBlockIdx(i); onSelectAgent(agent, round.roundId, round.phase); }}
              onPointerOver={(e) => { e.stopPropagation(); setHoveredAgent(agent.wallet); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { setHoveredAgent(null); document.body.style.cursor = "auto"; }}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                ref={(el) => { materialRefs.current[i] = el; }}
                color={block.color}
                emissive={block.color}
                emissiveIntensity={0.15}
                roughness={0.4}
                metalness={0.3}
              />
            </RoundedBox>

            {selectedAgentWallet === agent.wallet && selectedRoundId === round.roundId && i === selectedBlockIdx && (
              <RoundedBox args={[BLOCK_SIZE + 0.03, BLOCK_SIZE + 0.03, BLOCK_SIZE + 0.03]} radius={BLOCK_SIZE * 0.13} smoothness={4}>
                <meshStandardMaterial color="#00bfff" transparent opacity={0.15} emissive="#00bfff" emissiveIntensity={0.5} />
              </RoundedBox>
            )}
          </group>
        );
      })}

      {/* Pickaxe — commit phase */}
      {count > 0 && round.phase === "commit" && (
        <VoxelPickaxe active={true} position={[1.5, towerHeight * 0.75, 0]} />
      )}

      {/* Debris */}
      {count > 0 && (
        <TowerDebris
          count={Math.min(40 + count * 15, 80)}
          radius={1.0}
          height={towerHeight + 0.5}
          color={debrisColor}
        />
      )}

      {/* Settlement burst */}
      <SettlementBurst
        trigger={burstTrigger}
        position={[0, towerHeight / 2, 0]}
        correctCount={round.correctCount}
        totalCount={count}
      />

      {count === 0 && (
        <Text position={[0, 0.3, 0]} fontSize={0.1} color="#444" anchorX="center" anchorY="middle">
          no inscriptions
        </Text>
      )}
    </group>
  );
}
