'use client';

import { useCallback, useEffect, useState } from 'react';
import { WebGLAccent } from '@/components/three/WebGLAccent';
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';

interface ProjectionDay {
  balance: number;
}

/** Self-contained: fetches its own copy of the active cycle's projection (same endpoint
 * ProjectionList/CoachCard/CashFlowTrajectoryChart each already fetch independently — matching this
 * app's existing per-component-fetch convention rather than introducing new shared state for this
 * one boolean) and re-fetches on realtime events, deriving `isShortfall` from the projection array
 * that's already returned today (no backend response-shape change needed for this). */
export function DashboardHeroOrb() {
  const [isShortfall, setIsShortfall] = useState(false);

  const refetch = useCallback(() => {
    fetch('/api/cycles/active')
      .then(async (res) => {
        if (!res.ok) return;
        const json: { projection?: ProjectionDay[] } | null = await res.json();
        setIsShortfall(Boolean(json?.projection?.some((day) => day.balance < 0)));
      })
      .catch(() => {
        // Best-effort — the orb simply stays in its default "on track" appearance on a failed fetch.
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useRealtimeCycleUpdates(refetch);

  return (
    <div className="absolute inset-0 -z-10 flex items-center justify-end pr-8" data-testid="dashboard-hero-orb">
      <div className="h-64 w-64">
        <WebGLAccent
          loadScene={() => import('@/components/three/LiquidOrb')}
          sceneProps={{ isShortfall }}
          alt="Decorative animated glass orb reflecting your cash-flow status"
        />
      </div>
    </div>
  );
}
