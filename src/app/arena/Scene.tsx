"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, Float } from "@react-three/drei";
import * as THREE from "three";
import { RoundPlatform } from "./RoundPlatform";
import type { FlightRound } from "./Arena";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";

interface SceneProps {
  flightRounds: FlightRound[];
  onSelectAgent: (agent: AgentInscription, roundId: string, phase: string) => void;
  selectedAgentWallet: string | null;
}

/** Slow-drifting ambient cube particles in the void */
function AmbientParticles() {
  const count = 120;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 28,
      y: (Math.random() - 0.5) * 16,
      z: (Math.random() - 0.5) * 28,
      speedX: (Math.random() - 0.5) * 0.003,
      speedY: (Math.random() - 0.5) * 0.002,
      speedZ: (Math.random() - 0.5) * 0.003,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      size: 0.02 + Math.random() * 0.04,
    }));
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.x += p.speedX;
      p.y += p.speedY;
      p.z += p.speedZ;

      if (Math.abs(p.x) > 14) p.x *= -0.9;
      if (Math.abs(p.y) > 8) p.y *= -0.9;
      if (Math.abs(p.z) > 14) p.z *= -0.9;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(t * p.rotSpeed, t * p.rotSpeed * 0.7, 0);
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ff5030" roughness={0.7} metalness={0.05} transparent opacity={0.35} emissive="#ff5030" emissiveIntensity={0.15} />
    </instancedMesh>
  );
}

function OracleBeam({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 3) * 0.08;
    meshRef.current.scale.y = 1 + Math.sin(t * 2) * 0.1;
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1] + 5, position[2]]}>
      <cylinderGeometry args={[0.04, 0.25, 10, 8]} />
      <meshBasicMaterial color="#22c55e" transparent opacity={0.15} />
    </mesh>
  );
}

export function Scene({ flightRounds, onSelectAgent, selectedAgentWallet }: SceneProps) {
  const platformPositions: [number, number, number][] = [[-4.5, 0, 0], [0, 0, 0], [4.5, 0, 0]];

  return (
    <>
      {/* Lighting — bright studio setup for vibrant look */}
      <ambientLight intensity={0.7} color="#2a1a14" />

      {/* Key light — strong warm from upper-right */}
      <directionalLight
        position={[5, 8, 4]}
        intensity={1.6}
        color="#fff8f0"
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

      {/* Fill light — warm from left */}
      <directionalLight position={[-4, 5, -2]} intensity={0.6} color="#ffe0d0" />

      {/* Rim/back light — warm glow */}
      <directionalLight position={[0, 4, -6]} intensity={0.5} color="#ffb090" />

      {/* Bright warm point light near towers */}
      <pointLight position={[0, 4, 2]} intensity={1.0} color="#ff6040" distance={15} decay={2} />

      {/* Secondary accent from below for dramatic uplighting */}
      <pointLight position={[0, -0.5, 0]} intensity={0.3} color="#ff4020" distance={8} decay={2} />

      {/* Camera controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={28}
        target={[0, 1.5, 0]}
      />

      {/* Platforms */}
      {flightRounds.map((round, i) => (
        <Float key={round.roundId} speed={1} rotationIntensity={0} floatIntensity={0.15} floatingRange={[-0.06, 0.06]}>
          <RoundPlatform
            position={platformPositions[i]}
            round={round}
            onSelectAgent={onSelectAgent}
            selectedAgentWallet={selectedAgentWallet}
          />
          {round.phase === "settling" && <OracleBeam position={platformPositions[i]} />}
        </Float>
      ))}

      {/* Ambient cube particles */}
      <AmbientParticles />

      {/* Ground — subtle dark plane with faint reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#080808" roughness={0.95} metalness={0.05} />
      </mesh>
    </>
  );
}
