'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils/currency';

interface ProjectionDayEvent {
  label: string;
  amount: number;
}

interface ProjectionDay {
  date: string;
  balance: number;
  events: ProjectionDayEvent[];
}

interface ActiveCycleProjection {
  projection: ProjectionDay[];
}

/**
 * `refreshKey` lets the parent force a refetch: adding a bill, marking one paid, or adding an income
 * source all change the real projection, and without this the list would keep showing the numbers it
 * fetched on mount until the user manually reloaded the page.
 */
export function ProjectionList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [cycle, setCycle] = useState<ActiveCycleProjection | null | undefined | 'error'>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/cycles/active')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setCycle('error');
          return;
        }
        const json = await res.json();
        if (!cancelled) setCycle(json);
      })
      .catch(() => {
        if (!cancelled) setCycle('error');
      });
    // Guards against a slow earlier fetch resolving after a newer one and overwriting fresher data.
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (cycle === undefined) {
    return null; // loading — avoid a flash of the empty-state prompt before the fetch resolves
  }

  if (cycle === 'error') {
    return (
      <Card>
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Projection</h2>
        <p className="text-sm text-muted">Couldn&apos;t load your cash-flow projection right now. Try refreshing.</p>
      </Card>
    );
  }

  if (cycle === null) {
    return (
      <Card>
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Projection</h2>
        <p className="text-sm text-muted">
          Start a Money Cycle on the{' '}
          <Link href="/dashboard" className="text-primary-hover underline">
            dashboard
          </Link>{' '}
          to see your day-by-day cash-flow projection.
        </p>
      </Card>
    );
  }

  const { projection } = cycle;

  // The day with the lowest running balance across the whole trajectory — flagged the same way
  // BudgetProgress.tsx flags an over-budget category, using the existing destructive tokens
  // rather than introducing new colors.
  const lowestDayIndex = projection.reduce(
    (lowestIdx, day, idx) => (idx === 0 || day.balance < projection[lowestIdx].balance ? idx : lowestIdx),
    0
  );

  return (
    <Card>
      <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Projection</h2>
      {projection.length === 0 ? (
        <p className="text-sm text-muted">No projection data for this cycle yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projection.map((day, index) => {
            const isLowest = index === lowestDayIndex;
            return (
              <li
                key={day.date}
                // bg-white/[0.03] (not bg-card/50): `card` is a plain rgba() string in
                // tailwind.config.ts, which Tailwind's `/<opacity>` modifier can't decompose —
                // `bg-card/50` silently compiled to a literal 50% opaque white (found via
                // axe-core: it failed WCAG contrast against text-foreground) instead of the
                // intended ~3% tint. See the same fix in CashFlowClient.tsx's list rows.
                className={`animate-fade-slide-in flex items-center justify-between rounded-xl border px-4 py-3 text-sm motion-reduce:animate-none ${
                  isLowest ? 'border-destructive bg-destructive/10' : 'border-border bg-white/[0.03]'
                }`}
                style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              >
                <div>
                  <p className="font-medium text-foreground">
                    {new Date(day.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  {day.events.length > 0 && (
                    <p className="text-muted">
                      {day.events.map((event) => `${event.label} ${formatCurrency(event.amount)}`).join(', ')}
                    </p>
                  )}
                  {isLowest && <p className="mt-1 font-mono text-xs text-destructive">Lowest point</p>}
                </div>
                <span className={`font-mono font-medium ${isLowest ? 'text-destructive' : 'text-foreground'}`}>
                  {formatCurrency(day.balance)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
