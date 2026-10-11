'use client';

import { useCallback, useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { formatCurrency } from '@/lib/utils/currency';
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';

interface ForecastDay {
  date: string;
  balance: number;
  events: { label: string; amount: number }[];
}

interface HeadsUpItem {
  name: string;
  amount: number;
  dueDate: string;
}

interface RollingForecastResponse {
  trajectory: ForecastDay[];
  headsUp: HeadsUpItem[];
}

/**
 * Self-fetching, matching CashFlowTrajectoryChart's existing pattern exactly, but reading from the
 * new rolling-forecast endpoint instead of /api/cycles/active -- a genuinely different window (90
 * days from today, not bounded by the cycle's own end date), so this is a new, separate component
 * rather than a prop added to the existing cycle-bound chart.
 */
export function RollingForecastChart() {
  const [data, setData] = useState<RollingForecastResponse | null | undefined>(undefined);

  const refetch = useCallback(() => {
    fetch('/api/cycles/active/rolling-forecast')
      .then(async (res) => {
        if (!res.ok) {
          setData(null);
          return;
        }
        setData(await res.json());
      })
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useRealtimeCycleUpdates(refetch);

  if (data === undefined || data === null) {
    return null;
  }

  const chartData = data.trajectory.map((day) => ({ date: day.date, balance: day.balance }));

  return (
    <GlassPanel elevation={1} hoverable data-testid="rolling-forecast-chart">
      <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Looking ahead</h2>
      <p className="sr-only">
        Projected balance over the next 90 days, from {formatCurrency(data.trajectory[0]?.balance ?? 0)} to{' '}
        {formatCurrency(data.trajectory[data.trajectory.length - 1]?.balance ?? 0)}.
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.35)" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
            contentStyle={{ backgroundColor: '#13111f', borderColor: 'rgba(139,92,246,0.35)', borderRadius: '0.75rem' }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
          <Area type="monotone" dataKey="balance" stroke="rgb(96,165,250)" strokeWidth={2} fill="rgb(96,165,250)" fillOpacity={0.15} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      {data.headsUp.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-foreground">Coming up after your current cycle ends:</p>
          <ul className="flex flex-col gap-1">
            {data.headsUp.map((item) => (
              <li key={item.name} className="flex items-center justify-between text-sm text-muted">
                <span>{item.name}</span>
                <span className="font-mono">
                  {formatCurrency(item.amount)} · {new Date(item.dueDate).toLocaleDateString('en-AU')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassPanel>
  );
}
