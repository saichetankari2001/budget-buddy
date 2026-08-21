'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MonthlyTotal } from '@/lib/utils/expenseAggregation';

export function MonthlyTrendChart({ data }: { data: MonthlyTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">No spending history yet.</p>;
  }

  return (
    <div data-testid="monthly-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
          <Line type="monotone" dataKey="total" stroke="#111827" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
