'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceDot } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { formatCurrency } from '@/lib/utils/currency';

interface ProjectionDay {
  date: string;
  balance: number;
  events: { label: string; amount: number }[];
}

interface ActiveCycleProjection {
  projection: ProjectionDay[];
}

/**
 * `refreshKey` mirrors ProjectionList's existing pattern exactly (same prop name, same effect
 * dependency, same cancellation guard) so CashFlowClient.tsx can drive both from the same state.
 */
export function CashFlowTrajectoryChart({ refreshKey = 0 }: { refreshKey?: number }) {
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
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (cycle === undefined || cycle === 'error' || cycle === null) {
    return null; // ProjectionList (rendered alongside this) already surfaces loading/error/empty states
  }

  const { projection } = cycle;
  if (projection.length === 0) {
    return null;
  }

  const chartData = projection.map((day) => ({ date: day.date, balance: day.balance }));
  const isShortfall = projection.some((day) => day.balance < 0);
  const lowestDay = projection.reduce((lowest, day) => (day.balance < lowest.balance ? day : lowest), projection[0]);

  return (
    <GlassPanel elevation={2} hoverable data-testid="cashflow-trajectory-chart">
      <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Balance trajectory</h2>
      {/* Accessible fallback matching the pattern axe-core already validates for
          MonthlyTrendChart/CategoryPieChart: a visually-hidden summary alongside the SVG chart. */}
      <p className="sr-only">
        Projected balance from {formatCurrency(projection[0].balance)} to {formatCurrency(projection[projection.length - 1].balance)}
        {isShortfall ? `, dipping below zero to a low of ${formatCurrency(lowestDay.balance)}` : ', staying positive throughout'}.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="trajectoryGradient" x1="0" y1="0" x2="0" y2="1">
              {/* stopColor: trust color from tailwind.config.ts */}
              <stop offset="0%" stopColor="rgb(37,99,235)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="rgb(37,99,235)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.35)" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
            contentStyle={{ backgroundColor: '#13111f', borderColor: 'rgba(139,92,246,0.35)', borderRadius: '0.75rem' }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
          <ReferenceLine y={0} stroke="#f87171" strokeDasharray="4 4" />
          {/* stroke: trust color from tailwind.config.ts */}
          <Area
            type="monotone"
            dataKey="balance"
            stroke="rgb(37,99,235)"
            strokeWidth={2}
            fill="url(#trajectoryGradient)"
            isAnimationActive
            animationDuration={600}
          />
          {isShortfall && (
            <ReferenceDot x={lowestDay.date} y={lowestDay.balance} r={5} fill="#f87171" stroke="#05050f" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </GlassPanel>
  );
}
