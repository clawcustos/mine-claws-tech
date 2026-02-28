"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface VoxelPickaxeProps {
  active: boolean;
  position: [number, number, number];
}

// The left tip of the pickaxe head relative to the pivot origin
const TIP_OFFSET_X = -0.42;
const TIP_OFFSET_Y = 0.72;

// Mining shards — small cubes that burst from the strike point on each impact
function MiningShards({ tipRef, active }: { tipRef: React.RefObject<THREE.Vector3 | null>; active: boolean }) {
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
  // Track swing to detect the peak (tip closest to tower = positive rotation peak)
  const prevSwing = useRef(0);
  const wasIncreasing = useRef(false);
  // Snapshot tip position at impact so shards don't drift with the swing
  const impactOrigin = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const dt = 1 / 60;

    // Detect impact at swing peak: positive rotation.z swings the tip toward the tower
    const swing = Math.sin(t * 4);
    const isIncreasing = swing > prevSwing.current;
    const hitPeak = wasIncreasing.current && !isIncreasing;
    wasIncreasing.current = isIncreasing;
    prevSwing.current = swing;

    const tip = tipRef.current;

    if (active && hitPeak && tip) {
      // Snapshot the tip position at the moment of impact
      impactOrigin.current.copy(tip);
      // Respawn all shards from the contact point
      for (let i = 0; i < count; i++) {
        const s = shards.current[i];
        s.x = 0;
        s.y = 0;
        s.z = 0;
        // Spray outward from contact face (away from tower center) + upward
        const angle = (Math.random() - 0.5) * Math.PI * 0.6; // ±54° spread
        const speed = 1.5 + Math.random() * 2.0;
        s.vx = Math.cos(angle) * speed; // away from tower (positive X = away)
        s.vy = Math.sin(angle) * speed + 1.0 + Math.random() * 1.5; // upward bias
        s.vz = (Math.random() - 0.5) * 2.0;
        s.life = 1.0;
        s.size = 0.03 + Math.random() * 0.05;
      }
    }

    // Update shards — use snapshotted impact origin, not the live tip
    const ox = impactOrigin.current.x;
    const oy = impactOrigin.current.y;
    const oz = impactOrigin.current.z;

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

      dummy.position.set(ox + s.x, oy + s.y, oz + s.z);
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
  const tipWorldPos = useRef<THREE.Vector3>(new THREE.Vector3());

  useFrame(({ clock }) => {
    if (!pivotRef.current || !groupRef.current) return;
    const t = clock.getElapsedTime();
    if (active) {
      const rot = Math.sin(t * 4) * 0.5; // reduced from 0.7 to 0.5
      pivotRef.current.rotation.z = rot;
      groupRef.current.position.y = position[1] + Math.sin(t * 4) * 0.05;

      // Compute actual tip world position from pivot rotation
      const tipX = Math.cos(rot) * TIP_OFFSET_X - Math.sin(rot) * TIP_OFFSET_Y;
      const tipY = Math.sin(rot) * TIP_OFFSET_X + Math.cos(rot) * TIP_OFFSET_Y;
      tipWorldPos.current.set(
        position[0] + tipX,
        groupRef.current.position.y + tipY,
        position[2],
      );
    } else {
      pivotRef.current.rotation.z *= 0.9;
    }
  });

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

      {/* Shards burst from the dynamic tip position */}
      {active && <MiningShards tipRef={tipWorldPos} active={active} />}
    </>
  );
}
