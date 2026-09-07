'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CategoryTotal } from '@/lib/utils/expenseAggregation';
import { formatCurrency } from '@/lib/utils/currency';

export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No expenses yet this month.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="categoryName" innerRadius={50} outerRadius={90}>
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: '#13111f',
              borderColor: 'rgba(139,92,246,0.35)',
              borderRadius: '0.75rem',
            }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-3 text-sm text-foreground">
        {data.map((entry) => (
          <li key={entry.categoryId} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.categoryName}
          </li>
        ))}
      </ul>
    </div>
  );
}
