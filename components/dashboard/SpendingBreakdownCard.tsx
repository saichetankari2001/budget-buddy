'use client';

import { useCallback, useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency } from '@/lib/utils/currency';
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';

interface CategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  color: string;
  recommendedAmount: number;
  actualAmount: number;
  historicalAmount: number;
}

interface BreakdownResponse {
  categories: CategoryBreakdown[];
  hasAnyExpenseThisCycle: boolean;
}

export function SpendingBreakdownCard() {
  const [data, setData] = useState<BreakdownResponse | null | undefined>(undefined);

  const refetch = useCallback(() => {
    fetch('/api/cycles/active/category-breakdown')
      .then(async (res) => {
        if (!res.ok) return;
        setData(await res.json());
      })
      .catch(() => {
        // Best-effort — the card simply doesn't render on a failed fetch.
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useRealtimeCycleUpdates(refetch);

  if (data === undefined) {
    return (
      <GlassPanel elevation={2} hoverable>
        <Skeleton className="mb-1 h-5 w-40" />
        <Skeleton className="mb-4 h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </GlassPanel>
    );
  }

  if (data === null) {
    return null; // no active cycle — nothing to show, not a loading state
  }

  if (data.categories.length === 0) {
    return (
      <GlassPanel elevation={2} hoverable data-testid="spending-breakdown-card">
        <h2 className="mb-3 font-heading font-medium text-foreground">Spending breakdown</h2>
        <p className="text-sm text-muted">
          Log a few expenses first — recommendations need some spending history to work from.
        </p>
      </GlassPanel>
    );
  }

  const leftPieData = data.categories.map((c) => ({
    key: c.categoryId ?? 'other',
    categoryName: c.categoryName,
    color: c.color,
    total: data.hasAnyExpenseThisCycle ? c.actualAmount : c.historicalAmount,
  }));
  const rightPieData = data.categories.map((c) => ({
    key: c.categoryId ?? 'other',
    categoryName: c.categoryName,
    color: c.color,
    total: c.recommendedAmount,
  }));

  return (
    <GlassPanel elevation={2} hoverable data-testid="spending-breakdown-card">
      <h2 className="mb-1 font-heading font-medium text-foreground">Spending breakdown</h2>
      <p className="mb-4 text-sm text-muted">
        {data.hasAnyExpenseThisCycle
          ? "What you've actually spent this cycle vs. the plan."
          : 'Your usual spending pattern vs. the recommended split for this cycle.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-center text-sm text-muted">
            {data.hasAnyExpenseThisCycle ? 'Actual so far' : 'Your usual pattern'}
          </p>
          {/* aria-hidden: recharts renders each pie slice as an SVG <path role="img"> with no
              accessible name, which axe correctly flags (svg-img-alt/non-empty-title) — there is
              nothing meaningful to label a slice with that isn't already in the real <table>
              below, which is this card's actual accessible data source (per Task 7's own review:
              "a stronger pattern than the existing CategoryPieChart"). Hiding the decorative chart
              from the accessibility tree, rather than inventing redundant per-slice labels, is the
              correct fix — sighted/mouse users keep the visual + hover tooltip unaffected.
              rootTabIndex={-1}: recharts' Pie defaults its root <g> to tabIndex 0 for keyboard
              users to tab into the chart — inside an aria-hidden container that becomes a second,
              separate violation (aria-hidden-focus: a focusable element hidden from assistive tech
              but still reachable by keyboard). Removing it from the tab order here is correct: the
              chart has nothing keyboard-reachable worth exposing once the table already carries
              the real data. */}
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={leftPieData}
                  dataKey="total"
                  nameKey="categoryName"
                  innerRadius={40}
                  outerRadius={80}
                  rootTabIndex={-1}
                >
                  {leftPieData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="mb-2 text-center text-sm text-muted">Recommended</p>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={rightPieData}
                  dataKey="total"
                  nameKey="categoryName"
                  innerRadius={40}
                  outerRadius={80}
                  rootTabIndex={-1}
                >
                  {rightPieData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <table className="mt-4 w-full text-left text-sm">
        <caption className="sr-only">Recommended vs. actual spending by category for this cycle</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-2">
              Category
            </th>
            <th scope="col" className="pb-2 text-right">
              Recommended
            </th>
            <th scope="col" className="pb-2 text-right">
              Actual
            </th>
            <th scope="col" className="pb-2 text-right">
              % used
            </th>
          </tr>
        </thead>
        <tbody>
          {data.categories.map((c) => {
            const percentUsed = c.recommendedAmount > 0 ? Math.round((c.actualAmount / c.recommendedAmount) * 100) : 0;
            return (
              <tr key={c.categoryId ?? 'other'} className="border-t border-border-glass">
                <td className="py-2 text-foreground">{c.categoryName}</td>
                <td className="py-2 text-right font-mono text-foreground">{formatCurrency(c.recommendedAmount)}</td>
                <td className="py-2 text-right font-mono text-foreground">{formatCurrency(c.actualAmount)}</td>
                <td className={`py-2 text-right font-mono ${percentUsed >= 100 ? 'text-destructive' : 'text-foreground'}`}>
                  {percentUsed}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassPanel>
  );
}
