'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CategoryTotal } from '@/lib/utils/expenseAggregation';

export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">No expenses yet this month.</p>;
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
          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-3 text-sm">
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
