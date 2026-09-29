'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import type { Mesh } from 'three';

const ON_TRACK_COLOR = '#22d3ee'; // accent token
// A softer amber heads-up, not the app's `destructive` token — the orb's shortfall state is a
// gentle nudge, not an error state, so it intentionally doesn't reuse the destructive red.
const SHORTFALL_COLOR = '#f59e0b';

function AnimatedOrb({ isShortfall }: { isShortfall: boolean }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const speed = isShortfall ? 0.6 : 0.3;
    meshRef.current.rotation.x = state.clock.elapsedTime * speed * 0.2;
    meshRef.current.rotation.y = state.clock.elapsedTime * speed * 0.15;
  });

  return (
    <Sphere ref={meshRef} args={[1.4, 64, 64]}>
      <MeshDistortMaterial
        color={isShortfall ? SHORTFALL_COLOR : ON_TRACK_COLOR}
        distort={isShortfall ? 0.5 : 0.3}
        speed={isShortfall ? 2.5 : 1.2}
        roughness={0.2}
        metalness={0.1}
        transparent
        opacity={0.75}
      />
    </Sphere>
  );
}

/**
 * The dashboard hero accent — motion that means something, not pure decoration: color/intensity
 * reflect whether the signed-in user's cash-flow projection currently shows a shortfall.
 * `export default` is required here (not a named export) because WebGLAccent's `loadScene` calls
 * `next/dynamic(() => import('./LiquidOrb'))`, which expects a default export.
 */
export default function LiquidOrb({ isShortfall = false }: { isShortfall?: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0, 4] }} gl={{ alpha: true }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 3]} intensity={1.2} />
      <AnimatedOrb isShortfall={isShortfall} />
    </Canvas>
  );
}
