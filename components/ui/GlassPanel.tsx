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

  const tiltEnabled = hoverable && !prefersReducedMotion;

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!tiltEnabled || !ref.current) return;
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
      whileTap={tiltEnabled ? { scale: 0.97 } : undefined}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 90 }}
      style={tiltEnabled ? { rotateX, rotateY, transformPerspective: 800 } : undefined}
    >
      {children}
    </motion.div>
  );
}
