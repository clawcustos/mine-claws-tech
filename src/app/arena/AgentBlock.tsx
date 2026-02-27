"use client";

import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Html } from "@react-three/drei";
import * as THREE from "three";
import { shortAddr } from "@/lib/utils";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

// Tier controls block size — bigger stake = bigger block in the tower
const TIER_SIZES: Record<number, number> = {
  0: 0.38,
  1: 0.42,
  2: 0.48,
  3: 0.55,
};

// Warm salmon/coral palette — matches the reference clay look
const COLORS = {
  base: "#e07852",       // warm salmon-coral
  baseDark: "#c46848",   // slightly darker variant
  correct: "#e8a84c",    // warm gold
  incorrect: "#5a4a44",  // muted dark brown
  selected: "#f09070",   // lighter highlight
};

interface AgentBlockProps {
  agent: AgentInscription;
  phase: string;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
  index: number;
  totalInStack: number;
}

export function AgentBlock({ agent, phase, position, isSelected, onClick, index, totalInStack }: AgentBlockProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const size = TIER_SIZES[agent.tier] ?? 0.42;

  // Determine color based on phase + correctness
  const { baseColor, emissiveColor, emissiveIntensity } = useMemo(() => {
    if (phase === "settled" && agent.correct === true) {
      return { baseColor: COLORS.correct, emissiveColor: COLORS.correct, emissiveIntensity: 0.15 };
    }
    if (phase === "settled" && agent.correct === false) {
      return { baseColor: COLORS.incorrect, emissiveColor: "#000000", emissiveIntensity: 0 };
    }
    // Alternate slightly between base shades for visual depth
    const color = index % 2 === 0 ? COLORS.base : COLORS.baseDark;
    return { baseColor: color, emissiveColor: COLORS.base, emissiveIntensity: 0.05 };
  }, [phase, agent.correct, index]);

  // Animation state
  const spawnTime = useRef(Date.now());
  const hasLanded = useRef(false);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const elapsed = (Date.now() - spawnTime.current) / 1000;

    // Drop-in: each block drops with staggered delay based on stack position
    const delay = index * 0.12;
    const dropProgress = Math.min(1, Math.max(0, (elapsed - delay) / 0.4));
    const eased = 1 - Math.pow(1 - dropProgress, 3);

    // Bounce on landing
    let bounce = 0;
    if (dropProgress >= 1 && !hasLanded.current) {
      hasLanded.current = true;
    }
    if (hasLanded.current) {
      const sinceLand = elapsed - delay - 0.4;
      if (sinceLand > 0 && sinceLand < 0.3) {
        bounce = Math.sin(sinceLand * Math.PI / 0.15) * 0.04 * (1 - sinceLand / 0.3);
      }
    }

    const startY = position[1] + 4;
    let y = THREE.MathUtils.lerp(startY, position[1], eased) + bounce;

    // Phase animations
    if (hasLanded.current) {
      if (phase === "reveal") {
        // Gentle breathing/pulse
        y += Math.sin(t * 2.5 + index * 0.7) * 0.02;
      } else if (phase === "settled" && agent.correct === true) {
        // Slight float
        y += 0.05 + Math.sin(t * 1.5 + index * 0.5) * 0.03;
      } else if (phase === "settled" && agent.correct === false) {
        // Sink + slight tilt
        y -= 0.02;
      } else if (phase === "commit") {
        // Subtle idle bob
        y += Math.sin(t * 1.2 + index * 1.1) * 0.01;
      }
    }

    groupRef.current.position.set(position[0], y, position[2]);

    // Hover/select scale
    const targetScale = hovered || isSelected ? 1.08 : 1;
    groupRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.12
    );

    // Slight random rotation for settled-incorrect blocks (tumbled look)
    if (phase === "settled" && agent.correct === false && hasLanded.current) {
      groupRef.current.rotation.z = THREE.MathUtils.lerp(
        groupRef.current.rotation.z,
        Math.sin(index * 2.7) * 0.15,
        0.05
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        Math.cos(index * 1.3) * 0.1,
        0.05
      );
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <RoundedBox
        args={[size, size, size]}
        radius={size * 0.12}
        smoothness={4}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={hovered || isSelected ? COLORS.selected : baseColor}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? emissiveIntensity + 0.1 : emissiveIntensity}
          roughness={0.85}
          metalness={0.02}
        />
      </RoundedBox>

      {/* Selection wireframe outline */}
      {isSelected && (
        <RoundedBox args={[size + 0.03, size + 0.03, size + 0.03]} radius={size * 0.12} smoothness={4}>
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} />
        </RoundedBox>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Html
          position={[0, size / 2 + 0.35, 0]}
          center
          distanceFactor={8}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            background: "rgba(0,0,0,0.88)",
            border: "1px solid #444",
            padding: "5px 10px",
            fontSize: 10,
            fontFamily: "monospace",
            color: "#ddd",
            whiteSpace: "nowrap",
            borderRadius: 3,
          }}>
            {shortAddr(agent.wallet)}
            {agent.tier > 0 && <span style={{ color: COLORS.base, marginLeft: 5 }}>T{agent.tier}</span>}
            {agent.correct === true && <span style={{ color: "#4ade80", marginLeft: 5 }}>correct</span>}
            {agent.correct === false && <span style={{ color: "#777", marginLeft: 5 }}>wrong</span>}
          </div>
        </Html>
      )}
    </group>
  );
}
