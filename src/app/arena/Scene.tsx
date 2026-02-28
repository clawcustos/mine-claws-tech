"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Float, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { RoundPlatform } from "./RoundPlatform";
import { useScreenShake } from "./useScreenShake";
import type { FlightRound } from "./Arena";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

// ─── Types ──────────────────────────────────────────────────────────

interface SceneProps {
  flightRounds: FlightRound[];
  onSelectAgent: (
    agent: AgentInscription,
    roundId: string,
    phase: string,
  ) => void;
  selectedAgentWallet: string | null;
}

// ─── Platform positions (3 platforms side by side) ──────────────────

const PLATFORM_POSITIONS: [number, number, number][] = [
  [-4.5, 0, 0],
  [0, 0, 0],
  [4.5, 0, 0],
];

// ─── Phase-reactive fog config ──────────────────────────────────────

const PHASE_ENV: Record<
  string,
  { fogColor: string; fogNear: number; fogFar: number }
> = {
  commit: { fogColor: "#0a0604", fogNear: 22, fogFar: 50 },
  reveal: { fogColor: "#0a0806", fogNear: 18, fogFar: 45 },
  settling: { fogColor: "#0a0608", fogNear: 16, fogFar: 42 },
  settled: { fogColor: "#080604", fogNear: 25, fogFar: 55 },
};
const DEFAULT_ENV = PHASE_ENV.commit;

// ─── OracleBeam (settling phase indicator) ──────────────────────────

function OracleBeam({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.12 + Math.sin(t * 3) * 0.08;
    meshRef.current.scale.y = 1 + Math.sin(t * 2) * 0.1;
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1] + 5, position[2]]}>
      <cylinderGeometry args={[0.04, 0.25, 10, 8]} />
      <meshBasicMaterial color="#d946ef" transparent opacity={0.15} />
    </mesh>
  );
}

// ─── AmbientParticles (drifting cubes for atmosphere) ───────────────

const PARTICLE_COUNT = 120;

function AmbientParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        x: (Math.random() - 0.5) * 24,
        y: Math.random() * 8 - 1,
        z: (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 0.02,
        vy: 0.005 + Math.random() * 0.015,
        vz: (Math.random() - 0.5) * 0.02,
        rx: Math.random() * 0.01,
        ry: Math.random() * 0.015,
        size: 0.02 + Math.random() * 0.04,
        colorIdx: Math.floor(Math.random() * 3),
      })),
    [],
  );

  const COLORS = ["#ff3b30", "#cc2920", "#ff6b5a"];

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];

      // Drift
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

      // Wrap around
      if (p.y > 8) p.y = -1;
      if (p.x > 12) p.x = -12;
      if (p.x < -12) p.x = 12;
      if (p.z > 8) p.z = -8;
      if (p.z < -8) p.z = 8;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(t * p.rx, t * p.ry, 0);
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      tempColor.set(COLORS[p.colorIdx]);
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        vertexColors
        roughness={0.6}
        metalness={0.1}
        emissive="#ff3b30"
        emissiveIntensity={0.4}
      />
    </instancedMesh>
  );
}

// ─── Main Scene ─────────────────────────────────────────────────────

export function Scene({
  flightRounds,
  onSelectAgent,
  selectedAgentWallet,
}: SceneProps) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = 1.3;
  }, [gl]);

  const { groupRef, shake } = useScreenShake();

  // Refs for phase-reactive environment
  const fogRef = useRef<THREE.Fog>(null);
  const controlsRef = useRef<any>(null);

  // Dominant phase for fog
  const dominantPhase = useMemo(() => {
    const phases = flightRounds.map((r) => r.phase);
    if (phases.includes("settling")) return "settling";
    if (phases.includes("reveal")) return "reveal";
    if (phases.includes("commit")) return "commit";
    if (phases.includes("settled")) return "settled";
    return "commit";
  }, [flightRounds]);

  // Phase-reactive fog lerp
  useFrame(() => {
    const env = PHASE_ENV[dominantPhase] ?? DEFAULT_ENV;
    if (fogRef.current) {
      const fc = new THREE.Color(env.fogColor);
      fogRef.current.color.lerp(fc, 0.025);
      fogRef.current.near += (env.fogNear - fogRef.current.near) * 0.025;
      fogRef.current.far += (env.fogFar - fogRef.current.far) * 0.025;
    }
  });

  return (
    <>
      {/* Warm fog */}
      <fog ref={fogRef} attach="fog" args={["#0a0604", 22, 50]} />

      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={28}
        target={[0, 1.5, 0]}
      />

      {/* ─── Warm lighting rig ──────────────────────────────────── */}

      {/* Ambient — warm tinted */}
      <ambientLight intensity={0.3} color="#2a1a14" />

      {/* Key light — warm white from top-front-left */}
      <directionalLight
        position={[-4, 8, 6]}
        intensity={1.8}
        color="#fff0e0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-near={0.5}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-5}
      />

      {/* Fill — warm from left */}
      <directionalLight
        position={[-5, 4, -2]}
        intensity={0.3}
        color="#cc6633"
      />

      {/* Rim — warm orange from rear-right */}
      <directionalLight
        position={[5, 3, -8]}
        intensity={0.5}
        color="#cc7744"
      />

      {/* Screen shake group */}
      <group ref={groupRef}>
        {/* ─── 3 Round Platforms ───────────────────────────────── */}
        {flightRounds.slice(0, 3).map((round, i) => (
          <Float
            key={round.roundId}
            speed={1}
            rotationIntensity={0}
            floatIntensity={0.15}
            floatingRange={[-0.06, 0.06]}
          >
            <RoundPlatform
              position={PLATFORM_POSITIONS[i]}
              round={round}
              onSelectAgent={onSelectAgent}
              selectedAgentWallet={selectedAgentWallet}
              onShake={shake}
            />
            {/* Oracle beam during settling */}
            {round.phase === "settling" && (
              <OracleBeam position={PLATFORM_POSITIONS[i]} />
            )}
          </Float>
        ))}
      </group>

      {/* ─── Ambient drifting particles ────────────────────────── */}
      <AmbientParticles />

      {/* ─── Dark ground plane ─────────────────────────────────── */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.8, 0]}
        receiveShadow
      >
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#080808" roughness={0.95} metalness={0} />
      </mesh>

      {/* Contact shadows */}
      <ContactShadows
        position={[0, -0.79, 0]}
        opacity={0.4}
        blur={2.5}
        resolution={256}
        scale={30}
      />
    </>
  );
}
