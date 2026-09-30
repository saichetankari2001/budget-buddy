'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface Blob {
  color: string;
  size: number;
  top: string;
  left: string;
  duration: number;
}

// Kept dim deliberately: a GlassPanel sitting over a blob composites its color into the panel's
// effective background (that's the intended "liquid glass" look). axe-core caught this twice —
// first the original 0.35/0.25/0.2 pushing text-muted's contrast on elevation-1 panels to 4.42:1,
// then, after dimming to 0.16/0.12/0.1, text-primary-hover's contrast on the stronger elevation-2
// panel (used on login/signup) still only reaching 4.34:1 — both just under the 4.5:1 WCAG AA
// threshold. These lower values were chosen to keep every text token this app uses (not just the
// one axe-core happened to catch) comfortably clear of that line on every elevation, while still
// being visibly present as ambient color.
// `top` is a fixed pixel offset, not a percentage: a percentage `top` is relative to this
// component's absolutely-positioned parent (`main`), whose height changes as async content below
// (e.g. CoachCard's own data fetch) finishes loading and mounts more content. A real Lighthouse
// audit caught the blob visibly shifting position as `main` grew — a genuine CLS regression
// (0.154, "needs improvement") — traced to exactly this. `left` stays a percentage: it's relative
// to width, which this app's fixed-max-width containers don't change asynchronously.
const BLOBS: Blob[] = [
  { color: 'rgba(139,92,246,0.1)', size: 420, top: '-40px', left: '5%', duration: 22 },
  { color: 'rgba(34,211,238,0.07)', size: 360, top: '220px', left: '60%', duration: 26 },
  { color: 'rgba(139,92,246,0.06)', size: 300, top: '480px', left: '15%', duration: 30 },
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
