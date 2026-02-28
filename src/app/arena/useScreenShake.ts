"use client";

import { useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function useScreenShake() {
  const groupRef = useRef<THREE.Group>(null);
  const intensity = useRef(0);

  useFrame(() => {
    if (!groupRef.current) return;
    if (intensity.current > 0.001) {
      groupRef.current.position.x =
        (Math.random() - 0.5) * intensity.current * 2;
      groupRef.current.position.y =
        (Math.random() - 0.5) * intensity.current * 2;
      intensity.current *= 0.88;
    } else if (
      groupRef.current.position.x !== 0 ||
      groupRef.current.position.y !== 0
    ) {
      groupRef.current.position.x = 0;
      groupRef.current.position.y = 0;
      intensity.current = 0;
    }
  });

  const shake = useCallback((amt: number) => {
    intensity.current = Math.max(intensity.current, amt);
  }, []);

  return { groupRef, shake };
}
