'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface Blob {
  color: string;
  size: number;
  top: string;
  left: string;
  duration: number;
}

const BLOBS: Blob[] = [
  { color: 'rgba(139,92,246,0.35)', size: 420, top: '-10%', left: '5%', duration: 22 },
  { color: 'rgba(34,211,238,0.25)', size: 360, top: '30%', left: '60%', duration: 26 },
  { color: 'rgba(139,92,246,0.2)', size: 300, top: '65%', left: '15%', duration: 30 },
];

/**
 * A decorative, slowly-drifting blurred gradient background for hero sections. Purely CSS/Framer
 * Motion (no WebGL) — this is the "liquid" ambient layer every full-treatment page gets, distinct
 * from the two scoped WebGL accents (dashboard orb, login/signup hero scene). Always aria-hidden:
 * it carries no information, only mood.
 */
export function AmbientBlobs({ className = '' }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      data-testid="ambient-blobs"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      {BLOBS.map((blob, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full blur-3xl"
          style={{ width: blob.size, height: blob.size, top: blob.top, left: blob.left, background: blob.color }}
          animate={prefersReducedMotion ? undefined : { x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
          transition={prefersReducedMotion ? undefined : { duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
