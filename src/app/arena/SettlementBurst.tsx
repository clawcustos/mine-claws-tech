"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 60;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  isCorrect: boolean;
}

interface SettlementBurstProps {
  trigger: boolean;
  position: [number, number, number];
  correctCount: number;
  totalCount: number;
}

export function SettlementBurst({
  trigger,
  position,
  correctCount,
  totalCount,
}: SettlementBurstProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const particles = useRef<Particle[]>([]);
  const active = useRef(false);
  const prevTrigger = useRef(false);

  useFrame((_, delta) => {
    // Detect rising edge of trigger
    if (trigger && !prevTrigger.current) {
      active.current = true;
      const correctRatio = totalCount > 0 ? correctCount / totalCount : 0.5;
      particles.current = Array.from({ length: PARTICLE_COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const elevation = (Math.random() - 0.3) * Math.PI;
        const speed = 1.5 + Math.random() * 3;
        return {
          x: 0,
          y: 0,
          z: 0,
          vx: Math.cos(angle) * Math.cos(elevation) * speed,
          vy: Math.sin(elevation) * speed + 2,
          vz: Math.sin(angle) * Math.cos(elevation) * speed,
          life: 1,
          maxLife: 0.6 + Math.random() * 0.8,
          size: 0.03 + Math.random() * 0.06,
          isCorrect: Math.random() < correctRatio,
        };
      });
    }
    prevTrigger.current = trigger;

    if (!active.current || !meshRef.current) {
      if (meshRef.current) meshRef.current.count = 0;
      return;
    }

    const dt = Math.min(delta, 0.05);
    let anyAlive = false;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles.current[i];
      if (!p || p.life <= 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      anyAlive = true;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 6 * dt;
      p.life -= dt / p.maxLife;

      const alpha = Math.max(0, p.life);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.size * alpha);
      dummy.rotation.set(p.x * 3, p.y * 2, p.z);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      tempColor.set(p.isCorrect ? "#4ade80" : "#71717a");
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.count = PARTICLE_COUNT;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;

    if (!anyAlive) active.current = false;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      position={position}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        vertexColors
        roughness={0.4}
        emissive="#ffffff"
        emissiveIntensity={1.0}
      />
    </instancedMesh>
  );
}
