'use client';

import { HTMLAttributes, ReactNode, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

type GlassElevation = 1 | 2 | 3;

interface GlassPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  elevation?: GlassElevation;
  hoverable?: boolean;
  children: ReactNode;
}

const ELEVATION_BG: Record<GlassElevation, string> = {
  1: 'bg-glass-1',
  2: 'bg-glass-2',
  3: 'bg-glass-3',
};

const TILT_RANGE_DEG = 4;

/**
 * The shared glass surface for the liquid-glass redesign — a drop-in replacement for the existing
 * `Card` component, adding depth (blur/saturate/shadow), a subtle pointer-tracked 3D tilt on hover,
 * and a spring entrance. Every effect above the static glass look is disabled under
 * prefers-reduced-motion, matching this app's existing accessibility bar.
 *
 * `initial` and the tilt `style` prop are deliberately NOT conditioned on `prefersReducedMotion`:
 * framer-motion's useReducedMotion() reads the real matchMedia value synchronously on the client's
 * first render, but always returns false/null during SSR (no window there) — branching the inline
 * style those props produce on that value made the server-rendered markup disagree with what a real
 * reduced-motion client renders on its first paint, a genuine hydration mismatch for any real user
 * with that OS setting (confirmed by reproducing "Hydration failed" page errors, not just an
 * inline-vs-server style warning). `initial`/the tilt style stay unconditional so server and client
 * always agree; reduced motion is instead honored via `transition` (duration 0 — animates through
 * the same states, so nothing to hydrate-mismatch on, just imperceptibly fast) and by gating the
 * pointer handler itself so the tilt never actually moves for a reduced-motion user, even though the
 * style attribute that *would* hold a live rotation is present in both renders.
 */
export function GlassPanel({
  elevation = 1,
  hoverable = false,
  className = '',
  children,
  ...rest
}: GlassPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const springX = useSpring(pointerX, { damping: 20, stiffness: 90 });
  const springY = useSpring(pointerY, { damping: 20, stiffness: 90 });
  const rotateX = useTransform(springY, [0, 1], [TILT_RANGE_DEG, -TILT_RANGE_DEG]);
  const rotateY = useTransform(springX, [0, 1], [-TILT_RANGE_DEG, TILT_RANGE_DEG]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!hoverable || prefersReducedMotion || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  }

  function handlePointerLeave() {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      data-testid="glass-panel"
      className={`rounded-2xl border border-border-glass ${ELEVATION_BG[elevation]} p-6 shadow-depth backdrop-blur-glass backdrop-saturate-180 ${className}`}
      {...rest}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      whileTap={hoverable && !prefersReducedMotion ? { scale: 0.97 } : undefined}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', damping: 20, stiffness: 90 }}
      style={hoverable ? { rotateX, rotateY, transformPerspective: 800 } : undefined}
    >
      {children}
    </motion.div>
  );
}
