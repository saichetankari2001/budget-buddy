'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { CountUpStat } from './CountUpStat';

export function StatCard({ label, value, trend }: { label: string; value: number; trend: number[] }) {
  const chartData = trend.map((v, i) => ({ i, v }));

  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <CountUpStat value={value} />
      {trend.length > 1 && (
        // Decorative: the headline number above is the real, accessible value — this sparkline
        // only shows the shape of the trend, nothing a screen reader needs separately.
        <div aria-hidden="true" className="-mx-1 mt-1 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
              <Area
                type="monotone"
                dataKey="v"
                stroke="rgb(139,92,246)"
                fill="rgb(139,92,246)"
                fillOpacity={0.15}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
