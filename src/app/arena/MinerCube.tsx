"use client";

import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Html } from "@react-three/drei";
import * as THREE from "three";
import { shortAddr } from "@/lib/utils";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

// ─── Round color palettes ───────────────────────────────────────────
const ROUND_COLORS: Record<number, { shell: string; shellDark: string; accent: string }> = {
  0: { shell: "#f97316", shellDark: "#ea580c", accent: "#fb923c" }, // warm orange/coral
  1: { shell: "#06b6d4", shellDark: "#0891b2", accent: "#22d3ee" }, // cool cyan/teal
  2: { shell: "#ec4899", shellDark: "#db2777", accent: "#f472b6" }, // pink/magenta
};

const SCREEN_COLOR = "#0a0a0a";
const LIMB_COLOR = "#e2e8f0";
const HEAD_COLOR = "#f1f5f9";

// ─── Types ──────────────────────────────────────────────────────────

type MinerState = "mining" | "idle" | "celebrating" | "dejected" | "anxious";

interface MinerCubeProps {
  agent: AgentInscription;
  phase: string;
  roundIndex: number;
  roundId: string;
  position: [number, number, number];
  onSelect: (agent: AgentInscription, roundId: string, phase: string) => void;
  isSelected: boolean;
  /** Drop-in delay in seconds */
  dropDelay: number;
}

function getMinerState(phase: string, agent: AgentInscription): MinerState {
  if (phase === "commit") return "mining";
  if (phase === "reveal") return "idle";
  if (phase === "settling") return "anxious";
  if (phase === "settled" || phase === "expired") {
    if (agent.correct === true) return "celebrating";
    if (agent.correct === false) return "dejected";
    return "idle";
  }
  return "idle";
}

// ─── StickFigure ────────────────────────────────────────────────────

function StickFigure({ state }: { state: MinerState }) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    switch (state) {
      case "mining": {
        // Body rocks side to side
        groupRef.current.rotation.z = Math.sin(t * 3) * 0.12;
        groupRef.current.position.y = 0;
        // Pickaxe swing — right arm swings up/down
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -0.5 + Math.sin(t * 4) * 0.8;
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = Math.sin(t * 3 + 1) * 0.3;
        }
        // Legs shift weight
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 3) * 0.15;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t * 3) * 0.15;
        // Head nods
        if (headRef.current) headRef.current.rotation.x = Math.sin(t * 4) * 0.1;
        break;
      }
      case "idle": {
        // Subtle breathing bob
        groupRef.current.position.y = Math.sin(t * 1.5) * 0.008;
        groupRef.current.rotation.z = 0;
        // Occasional look-around
        if (headRef.current) {
          headRef.current.rotation.y = Math.sin(t * 0.7) * 0.3;
          headRef.current.rotation.x = 0;
        }
        // Arms relaxed
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0.1 + Math.sin(t * 1.2) * 0.05;
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0.1 + Math.sin(t * 1.2 + 0.5) * 0.05;
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        break;
      }
      case "celebrating": {
        // Jumping + arms raised
        const jump = Math.abs(Math.sin(t * 4));
        groupRef.current.position.y = jump * 0.04;
        groupRef.current.rotation.z = Math.sin(t * 6) * 0.08;
        // Spin
        groupRef.current.rotation.y = t * 2;
        // Arms up
        if (leftArmRef.current) leftArmRef.current.rotation.x = -2.5 + Math.sin(t * 8) * 0.2;
        if (rightArmRef.current) rightArmRef.current.rotation.x = -2.5 + Math.sin(t * 8 + 1) * 0.2;
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 4) * 0.3;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t * 4) * 0.3;
        if (headRef.current) { headRef.current.rotation.x = -0.2; headRef.current.rotation.y = 0; }
        break;
      }
      case "dejected": {
        // Slumped posture, slow sway
        groupRef.current.position.y = -0.01;
        groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.04;
        groupRef.current.rotation.y = 0;
        // Head down
        if (headRef.current) { headRef.current.rotation.x = 0.4; headRef.current.rotation.y = 0; }
        // Arms hanging
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0.3;
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0.3;
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        break;
      }
      case "anxious": {
        // Pacing/shifting weight, faster breathing
        groupRef.current.position.y = Math.sin(t * 3) * 0.012;
        groupRef.current.rotation.z = Math.sin(t * 2) * 0.06;
        groupRef.current.rotation.y = Math.sin(t * 1.5) * 0.4;
        // Fidgety arms
        if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 4) * 0.4;
        if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.sin(t * 4 + 1) * 0.4;
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 2.5) * 0.2;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t * 2.5) * 0.2;
        if (headRef.current) { headRef.current.rotation.y = Math.sin(t * 3) * 0.2; headRef.current.rotation.x = 0; }
        break;
      }
    }
  });

  // Scale the stick figure to fit inside the cube screen area
  const s = 0.22;

  return (
    <group ref={groupRef} scale={[s, s, s]} position={[0, 0, 0.01]}>
      {/* Head */}
      <mesh ref={headRef} position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={HEAD_COLOR} />
      </mesh>

      {/* Body/torso */}
      <mesh ref={bodyRef} position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.25, 6]} />
        <meshStandardMaterial color={LIMB_COLOR} />
      </mesh>

      {/* Left arm */}
      <group ref={leftArmRef} position={[-0.08, 0.17, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <cylinderGeometry args={[0.025, 0.02, 0.16, 5]} />
          <meshStandardMaterial color={LIMB_COLOR} />
        </mesh>
      </group>

      {/* Right arm */}
      <group ref={rightArmRef} position={[0.08, 0.17, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <cylinderGeometry args={[0.025, 0.02, 0.16, 5]} />
          <meshStandardMaterial color={LIMB_COLOR} />
        </mesh>
      </group>

      {/* Left leg */}
      <group ref={leftLegRef} position={[-0.04, -0.04, 0]}>
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.03, 0.025, 0.2, 5]} />
          <meshStandardMaterial color={LIMB_COLOR} />
        </mesh>
      </group>

      {/* Right leg */}
      <group ref={rightLegRef} position={[0.04, -0.04, 0]}>
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.03, 0.025, 0.2, 5]} />
          <meshStandardMaterial color={LIMB_COLOR} />
        </mesh>
      </group>
    </group>
  );
}

// ─── MinerCube ──────────────────────────────────────────────────────

export function MinerCube({
  agent,
  phase,
  roundIndex,
  roundId,
  position,
  onSelect,
  isSelected,
  dropDelay,
}: MinerCubeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const spawnTime = useRef<number | null>(null);

  const colors = ROUND_COLORS[roundIndex % 3] ?? ROUND_COLORS[0];
  const minerState = getMinerState(phase, agent);

  // Tier badge text
  const tierLabel = agent.tier > 0 ? `T${agent.tier}` : null;

  // Drop-in animation + subtle hover/select pulse
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // Lazy init spawn time
    if (spawnTime.current === null) spawnTime.current = t;

    const elapsed = t - spawnTime.current;
    const dropProgress = Math.min(1, Math.max(0, (elapsed - dropDelay) / 0.4));
    const eased = 1 - Math.pow(1 - dropProgress, 3);

    // Drop from above
    const startY = position[1] + 4;
    const targetY = position[1];
    groupRef.current.position.y = THREE.MathUtils.lerp(startY, targetY, eased);
    groupRef.current.position.x = position[0];
    groupRef.current.position.z = position[2];

    // Opacity: could fade in but meshStandardMaterial doesn't need it for solid cubes

    // Bounce after landing
    const landed = dropProgress >= 1;
    if (landed) {
      const sinceLand = elapsed - dropDelay - 0.4;
      if (sinceLand > 0 && sinceLand < 0.25) {
        groupRef.current.position.y += Math.sin(sinceLand * Math.PI / 0.125) * 0.03 * (1 - sinceLand / 0.25);
      }
    }

    // Selected pulse on shell
    if (shellRef.current) {
      const mat = shellRef.current.material as THREE.MeshStandardMaterial;
      if (isSelected) {
        mat.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.15;
      } else if (hovered) {
        mat.emissiveIntensity = 0.3;
      } else {
        mat.emissiveIntensity = 0.15;
      }
    }

    // Hover scale
    const targetScale = hovered || isSelected ? 1.08 : 1;
    groupRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.12,
    );
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Outer shell — colored by round */}
      <RoundedBox
        ref={shellRef as any}
        args={[0.9, 0.9, 0.9]}
        radius={0.08}
        smoothness={4}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(agent, roundId, phase);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={isSelected ? colors.accent : colors.shell}
          emissive={isSelected ? "#ffd700" : colors.shell}
          emissiveIntensity={0.15}
          roughness={0.35}
          metalness={0.2}
          transparent
          opacity={0.92}
        />
      </RoundedBox>

      {/* Selection glow ring */}
      {isSelected && (
        <RoundedBox
          args={[0.96, 0.96, 0.96]}
          radius={0.09}
          smoothness={4}
        >
          <meshStandardMaterial
            color="#ffd700"
            transparent
            opacity={0.12}
            emissive="#ffd700"
            emissiveIntensity={0.6}
          />
        </RoundedBox>
      )}

      {/* Screen face — dark inset panel on front */}
      <mesh position={[0, 0, 0.41]}>
        <planeGeometry args={[0.65, 0.65]} />
        <meshStandardMaterial
          color={SCREEN_COLOR}
          emissive={colors.accent}
          emissiveIntensity={0.03}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Bezel frame around screen */}
      <mesh position={[0, 0, 0.405]}>
        <planeGeometry args={[0.72, 0.72]} />
        <meshStandardMaterial
          color={colors.shellDark}
          emissive={colors.shell}
          emissiveIntensity={0.08}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>

      {/* Stick figure — positioned on the screen face */}
      <group position={[0, -0.02, 0.42]}>
        <StickFigure state={minerState} />
      </group>

      {/* Hover tooltip */}
      {hovered && (
        <Html
          position={[0, 0.65, 0]}
          center
          zIndexRange={[200, 100]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.92)",
              border: `1px solid ${colors.accent}`,
              padding: "4px 8px",
              fontSize: 10,
              fontFamily: "monospace",
              color: "#eee",
              whiteSpace: "nowrap",
              borderRadius: 3,
            }}
          >
            {shortAddr(agent.wallet)}
            {tierLabel && (
              <span style={{ color: colors.accent, marginLeft: 5 }}>
                {tierLabel}
              </span>
            )}
            {phase === "settled" && agent.correct === true && (
              <span style={{ color: "#4ade80", marginLeft: 5 }}>correct</span>
            )}
            {phase === "settled" && agent.correct === false && (
              <span style={{ color: "#888", marginLeft: 5 }}>wrong</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
