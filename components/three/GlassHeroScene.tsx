'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Torus } from '@react-three/drei';
import type { Mesh } from 'three';

function FloatingGlassTorus() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.15;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.25;
  });

  return (
    <Torus ref={meshRef} args={[1.1, 0.4, 32, 100]}>
      <MeshTransmissionMaterial
        color="#8b5cf6"
        thickness={0.5}
        roughness={0.1}
        transmission={1}
        ior={1.3}
        chromaticAberration={0.03}
      />
    </Torus>
  );
}

/**
 * Purely decorative companion for the login/signup hero — never blocks, delays, or is required to
 * complete the form next to it. `export default` required for next/dynamic's expected shape.
 */
export default function GlassHeroScene() {
  return (
    <Canvas camera={{ position: [0, 0, 4] }} gl={{ alpha: true }}>
      <ambientLight intensity={0.7} />
      <pointLight position={[3, 3, 3]} intensity={1.4} />
      <FloatingGlassTorus />
    </Canvas>
  );
}
