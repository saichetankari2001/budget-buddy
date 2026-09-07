'use client';

import { useEffect, useRef, useState } from 'react';
import { computeCountUpValue } from '@/lib/utils/countUp';
import { formatCurrency } from '@/lib/utils/currency';

const DURATION_MS = 600;

export function CountUpStat({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    let frame: number;
    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      setDisplay(computeCountUpValue(elapsed, DURATION_MS, value));
      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <p className="bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
      {formatCurrency(display)}
    </p>
  );
}
