"use client";

import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { formatCountdown, shortAddr } from "@/lib/utils";
import type { FlightRound } from "./Arena";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

const PHASE_COLORS: Record<string, string> = {
  commit: "#ffffff",
  reveal: "#facc15",
  settling: "#fb923c",
  settled: "#4ade80",
  expired: "#666666",
};

// Each agent tier contributes this many "layers" of blocks to the tower
const TIER_LAYERS: Record<number, number> = { 0: 3, 1: 5, 2: 7, 3: 9 };

const BLOCK_SIZE = 0.42;
const GAP = 0.03;
const STEP = BLOCK_SIZE + GAP;

// Vibrant color palette — punchy, saturated, fun
const COLORS = {
  base:          "#f06040",  // bright coral-red
  baseDark:      "#d84830",  // deeper coral
  baseLight:     "#ff7858",  // highlight
  baseBright:    "#ff5030",  // most saturated
  correct:       "#fbbf24",  // vivid gold-yellow
  correctDark:   "#f59e0b",  // deeper gold
  correctBright: "#fcd34d",  // bright gold
  incorrect:     "#78716c",  // warm grey
  incorrectDark: "#57534e",  // dark warm grey
};

interface RoundPlatformProps {
  position: [number, number, number];
  round: FlightRound;
  onSelectAgent: (agent: AgentInscription, roundId: string, phase: string) => void;
  selectedAgentWallet: string | null;
}

interface VoxelBlock {
  pos: [number, number, number];
  agentIndex: number;
  color: string;
  layerInAgent: number;
}

/** Cube debris particles orbiting/exploding from a tower */
function TowerDebris({ count, radius, height, color }: {
  count: number; radius: number; height: number; color: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2 + Math.random() * 1.2,
      r: radius * 0.5 + Math.random() * radius * 1.4,
      y: Math.random() * height * 1.3,
      speed: 0.1 + Math.random() * 0.35,
      size: 0.025 + Math.random() * 0.065,
      wobble: Math.random() * Math.PI * 2,
      phaseOffset: Math.random() * Math.PI * 2,
    }));
  }, [count, radius, height]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const angle = p.angle + t * p.speed;
      const r = p.r + Math.sin(t * 0.6 + p.phaseOffset) * 0.25;

      dummy.position.set(
        Math.cos(angle) * r,
        p.y + Math.sin(t * 0.9 + p.wobble) * 0.15,
        Math.sin(angle) * r
      );
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
      <meshStandardMaterial color={color} roughness={0.75} metalness={0.05} emissive={color} emissiveIntensity={0.08} />
    </instancedMesh>
  );
}

/** Single interactive rounded cube in the tower */
function TowerBlock({ block, phase, agent, isSelected, isHovered, onHover, onClick }: {
  block: VoxelBlock;
  phase: string;
  agent: AgentInscription;
  isSelected: boolean;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const spawnTime = useRef(Date.now());
  const hasLanded = useRef(false);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const elapsed = (Date.now() - spawnTime.current) / 1000;

    const dropDelay = block.pos[1] * 0.1;
    const dropProgress = Math.min(1, Math.max(0, (elapsed - dropDelay) / 0.3));
    const eased = 1 - Math.pow(1 - dropProgress, 3);

    const startY = block.pos[1] + 5;
    let y = THREE.MathUtils.lerp(startY, block.pos[1], eased);

    if (dropProgress >= 1) hasLanded.current = true;

    if (hasLanded.current) {
      const sinceLand = elapsed - dropDelay - 0.3;
      if (sinceLand > 0 && sinceLand < 0.2) {
        y += Math.sin(sinceLand * Math.PI / 0.1) * 0.02 * (1 - sinceLand / 0.2);
      }
    }

    if (hasLanded.current) {
      if (phase === "reveal") {
        y += Math.sin(t * 2.5 + block.agentIndex * 0.7 + block.layerInAgent * 0.3) * 0.015;
      } else if (phase === "commit") {
        y += Math.sin(t * 1.0 + block.agentIndex * 1.1 + block.layerInAgent * 0.2) * 0.006;
      } else if (phase === "settled" && agent.correct === true) {
        y += 0.02 + Math.sin(t * 1.5 + block.layerInAgent * 0.4) * 0.015;
      } else if (phase === "settled" && agent.correct === false) {
        const crumbleX = Math.sin(block.agentIndex * 3.7 + block.layerInAgent * 2.1) * 0.04;
        const crumbleZ = Math.cos(block.agentIndex * 2.3 + block.layerInAgent * 1.7) * 0.04;
        groupRef.current.position.x = block.pos[0] + crumbleX;
        groupRef.current.position.z = block.pos[2] + crumbleZ;
        groupRef.current.rotation.z = Math.sin(block.agentIndex * 1.3 + block.layerInAgent) * 0.08;
        groupRef.current.rotation.x = Math.cos(block.agentIndex * 2.1 + block.layerInAgent) * 0.06;
      }
    }

    groupRef.current.position.y = y;

    const s = isHovered || isSelected ? 1.06 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.15);
  });

  const emissiveAmt = isHovered || isSelected ? 0.2 : (phase === "reveal" ? 0.1 : 0.04);

  return (
    <group ref={groupRef} position={block.pos}>
      <RoundedBox
        args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]}
        radius={BLOCK_SIZE * 0.13}
        smoothness={4}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onHover(false); document.body.style.cursor = "auto"; }}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={isHovered ? COLORS.baseLight : block.color}
          emissive={block.color}
          emissiveIntensity={emissiveAmt}
          roughness={0.72}
          metalness={0.04}
        />
      </RoundedBox>
    </group>
  );
}

export function RoundPlatform({ position, round, onSelectAgent, selectedAgentWallet }: RoundPlatformProps) {
  const phaseColor = PHASE_COLORS[round.phase] ?? "#666666";
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // Build the voxel tower
  const { voxels, towerHeight } = useMemo(() => {
    const blocks: VoxelBlock[] = [];
    if (round.agents.length === 0) return { voxels: blocks, towerHeight: 0 };

    // Cross-section pattern
    const crossSection: [number, number][] = [
      [0, 0],
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];

    let layerY = 0.08; // just above platform

    round.agents.forEach((agent, agentIdx) => {
      const layers = TIER_LAYERS[agent.tier] ?? 2;

      let colorA: string, colorB: string;
      if (round.phase === "settled" && agent.correct === true) {
        colorA = COLORS.correct;
        colorB = COLORS.correctDark;
      } else if (round.phase === "settled" && agent.correct === false) {
        colorA = COLORS.incorrect;
        colorB = COLORS.incorrectDark;
      } else {
        // Alternate warm coral shades per agent for visual variety
        colorA = agentIdx % 2 === 0 ? COLORS.base : COLORS.baseBright;
        colorB = agentIdx % 2 === 0 ? COLORS.baseDark : COLORS.base;
      }

      const blocksPerLayer = round.agents.length <= 2
        ? crossSection.length
        : round.agents.length <= 4 ? 5 : 4;

      for (let ly = 0; ly < layers; ly++) {
        for (let bi = 0; bi < blocksPerLayer; bi++) {
          const [gx, gz] = crossSection[bi % crossSection.length];
          const jitterX = Math.sin(agentIdx * 3.1 + ly * 2.7 + bi * 1.3) * 0.012;
          const jitterZ = Math.cos(agentIdx * 2.3 + ly * 1.9 + bi * 3.7) * 0.012;

          blocks.push({
            pos: [gx * STEP + jitterX, layerY + BLOCK_SIZE / 2, gz * STEP + jitterZ],
            agentIndex: agentIdx,
            color: (ly + bi) % 2 === 0 ? colorA : colorB,
            layerInAgent: ly,
          });
        }
        layerY += STEP;
      }
    });

    return { voxels: blocks, towerHeight: layerY };
  }, [round.agents, round.phase]);

  const debrisColor = round.phase === "settled" && round.agents.some(a => a.correct)
    ? COLORS.correctBright : round.phase === "settled" ? COLORS.incorrect : COLORS.baseBright;

  return (
    <group position={position}>
      {/* Platform base */}
      <RoundedBox args={[2.6, 0.05, 2]} radius={0.015} smoothness={4} position={[0, -0.025, 0]} receiveShadow>
        <meshStandardMaterial color="#181818" roughness={0.92} metalness={0.08} />
      </RoundedBox>

      {/* Phase accent rim */}
      <mesh position={[0, 0.005, 0]}>
        <boxGeometry args={[2.66, 0.006, 2.06]} />
        <meshStandardMaterial color={phaseColor} emissive={phaseColor} emissiveIntensity={0.7} transparent opacity={0.6} />
      </mesh>

      {/* Phase label */}
      <Text position={[0, -0.01, 1.18]} fontSize={0.12} color={phaseColor} anchorX="center" anchorY="middle">
        {`#${round.roundId}  ${round.phase.toUpperCase()}`}
      </Text>

      {round.countdown > 0 && (
        <Text position={[0, -0.01, 1.38]} fontSize={0.09} color={phaseColor} anchorX="center" anchorY="middle">
          {formatCountdown(round.countdown)}
        </Text>
      )}

      {/* Question text */}
      {round.question && (
        <Html position={[0, towerHeight + 0.6, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div style={{
            color: "#bbb", fontSize: 10, fontFamily: "monospace", maxWidth: 190,
            textAlign: "center", lineHeight: 1.5, background: "rgba(0,0,0,0.8)",
            padding: "5px 8px", borderRadius: 3, border: `1px solid ${phaseColor}44`,
          }}>
            {round.question.length > 65 ? round.question.slice(0, 62) + "..." : round.question}
          </div>
        </Html>
      )}

      {/* Voxel tower blocks */}
      {voxels.map((block, i) => {
        const agent = round.agents[block.agentIndex];
        if (!agent) return null;
        return (
          <TowerBlock
            key={`${agent.inscriptionId}-${i}`}
            block={block}
            phase={round.phase}
            agent={agent}
            isSelected={selectedAgentWallet === agent.wallet}
            isHovered={hoveredAgent === agent.wallet}
            onHover={(h) => setHoveredAgent(h ? agent.wallet : null)}
            onClick={() => onSelectAgent(agent, round.roundId, round.phase)}
          />
        );
      })}

      {/* Hover tooltip above tower */}
      {hoveredAgent && round.agents.map((agent) => {
        if (hoveredAgent !== agent.wallet) return null;
        return (
          <Html key={`tip-${agent.inscriptionId}`} position={[0, towerHeight + 0.25, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(0,0,0,0.9)", border: "1px solid #555",
              padding: "5px 10px", fontSize: 10, fontFamily: "monospace",
              color: "#eee", whiteSpace: "nowrap", borderRadius: 3,
            }}>
              {shortAddr(agent.wallet)}
              {agent.tier > 0 && <span style={{ color: COLORS.baseBright, marginLeft: 5 }}>T{agent.tier}</span>}
              {agent.correct === true && <span style={{ color: "#4ade80", marginLeft: 5 }}>correct</span>}
              {agent.correct === false && <span style={{ color: "#888", marginLeft: 5 }}>wrong</span>}
            </div>
          </Html>
        );
      })}

      {/* Debris */}
      {round.agents.length > 0 && (
        <TowerDebris
          count={Math.min(40 + round.agents.length * 15, 80)}
          radius={1.0}
          height={towerHeight + 0.5}
          color={debrisColor}
        />
      )}

      {round.agents.length === 0 && (
        <Text position={[0, 0.3, 0]} fontSize={0.1} color="#444" anchorX="center" anchorY="middle">
          no inscriptions
        </Text>
      )}
    </group>
  );
}
