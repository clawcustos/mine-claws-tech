"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface VoxelPickaxeProps {
  active: boolean;
  position: [number, number, number];
}

// Mining shards — small cubes that burst from the strike point on each impact
function MiningShards({ position, active }: { position: [number, number, number]; active: boolean }) {
  const count = 12;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Each shard has a velocity, lifetime, etc. Reset on each "impact"
  const shards = useRef(
    Array.from({ length: count }, () => ({
      vx: 0, vy: 0, vz: 0,
      x: 0, y: 0, z: 0,
      life: 0,
      size: 0,
    }))
  );
  const prevSwingSign = useRef(1);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const dt = 1 / 60;

    // Detect impact: swing crosses from positive to negative (forward strike)
    const swing = Math.sin(t * 4);
    const crossed = prevSwingSign.current >= 0 && swing < 0;
    prevSwingSign.current = swing >= 0 ? 1 : -1;

    if (active && crossed) {
      // Respawn all shards from the strike point
      for (let i = 0; i < count; i++) {
        const s = shards.current[i];
        s.x = 0;
        s.y = 0;
        s.z = 0;
        // Spray outward — mostly away from pickaxe (negative X) and upward
        s.vx = -1.5 - Math.random() * 2.5;
        s.vy = 1.0 + Math.random() * 2.5;
        s.vz = (Math.random() - 0.5) * 2.0;
        s.life = 1.0;
        s.size = 0.03 + Math.random() * 0.05;
      }
    }

    // Update shards
    for (let i = 0; i < count; i++) {
      const s = shards.current[i];
      if (s.life <= 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      s.life -= dt * 1.8;
      s.vy -= 6.0 * dt; // gravity
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;

      dummy.position.set(
        position[0] + s.x,
        position[1] + s.y,
        position[2] + s.z,
      );
      dummy.rotation.set(t * 3 + i, t * 2 + i * 0.5, 0);
      const scale = s.size * Math.max(0, s.life);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Alternate colors: Custos red palette
      tempColor.set(i % 3 === 0 ? "#dc2626" : i % 3 === 1 ? "#ef4444" : "#b91c1c");
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        vertexColors
        roughness={0.6}
        metalness={0.1}
        emissive="#dc2626"
        emissiveIntensity={0.8}
      />
    </instancedMesh>
  );
}

export function VoxelPickaxe({ active, position }: VoxelPickaxeProps) {
  const pivotRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!pivotRef.current || !groupRef.current) return;
    const t = clock.getElapsedTime();
    if (active) {
      pivotRef.current.rotation.z = Math.sin(t * 4) * 0.7;
      groupRef.current.position.y = position[1] + Math.sin(t * 4) * 0.05;
    } else {
      pivotRef.current.rotation.z *= 0.9;
    }
  });

  // Strike point — where the pickaxe tip meets the tower
  const strikePoint: [number, number, number] = [
    position[0] - 0.6,
    position[1] + 0.72,
    position[2],
  ];

  return (
    <>
      <group ref={groupRef} position={position}>
        {/* Pivot at the "wrist" — bottom of handle */}
        <group ref={pivotRef}>
          {/* Handle — brown wood */}
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.1, 0.7, 0.1]} />
            <meshStandardMaterial color="#8B4513" roughness={0.9} metalness={0.0} />
          </mesh>
          {/* Head — grey metallic (right side) */}
          <mesh position={[0.18, 0.72, 0]}>
            <boxGeometry args={[0.45, 0.15, 0.1]} />
            <meshStandardMaterial color="#777777" roughness={0.35} metalness={0.7} />
          </mesh>
          {/* Head — grey metallic (left spike) */}
          <mesh position={[-0.18, 0.72, 0]}>
            <boxGeometry args={[0.45, 0.15, 0.1]} />
            <meshStandardMaterial color="#777777" roughness={0.35} metalness={0.7} />
          </mesh>
          {/* Tip — right accent */}
          <mesh position={[0.42, 0.72, 0]}>
            <boxGeometry args={[0.12, 0.12, 0.1]} />
            <meshStandardMaterial
              color="#ffffff"
              roughness={0.3}
              metalness={0.4}
              emissive="#ffffff"
              emissiveIntensity={1.5}
            />
          </mesh>
          {/* Tip — left accent */}
          <mesh position={[-0.42, 0.72, 0]}>
            <boxGeometry args={[0.12, 0.12, 0.1]} />
            <meshStandardMaterial
              color="#ffffff"
              roughness={0.3}
              metalness={0.4}
              emissive="#ffffff"
              emissiveIntensity={1.5}
            />
          </mesh>
        </group>
      </group>

      {/* Shards burst from the strike point */}
      {active && <MiningShards position={strikePoint} active={active} />}
    </>
  );
}
