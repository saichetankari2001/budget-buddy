'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MonthlyTotal } from '@/lib/utils/expenseAggregation';
import { formatCurrency } from '@/lib/utils/currency';

export function MonthlyTrendChart({ data }: { data: MonthlyTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No spending history yet.</p>;
  }

  return (
    <div data-testid="monthly-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E0E7FF" />
          <XAxis dataKey="month" stroke="#64748B" tick={{ fill: '#64748B', fontSize: 12 }} />
          <YAxis stroke="#64748B" tick={{ fill: '#64748B', fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E7FF', borderRadius: '0.75rem' }}
          />
          <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
