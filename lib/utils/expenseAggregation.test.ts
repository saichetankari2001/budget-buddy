import { describe, it, expect } from 'vitest';
import { aggregateByCategory, aggregateByMonth, ExpenseWithCategory } from './expenseAggregation';

const food = { id: 'cat_food', name: 'Food', color: '#f97316' };
const transport = { id: 'cat_transport', name: 'Transport', color: '#3b82f6' };

const expenses: ExpenseWithCategory[] = [
  { amount: 20, date: new Date('2026-08-05'), category: food },
  { amount: 30, date: new Date('2026-08-10'), category: food },
  { amount: 15, date: new Date('2026-08-12'), category: transport },
  { amount: 40, date: new Date('2026-07-01'), category: food },
];

describe('aggregateByCategory', () => {
  it('sums amounts per category', () => {
    const result = aggregateByCategory(expenses);
    expect(result).toEqual(
      expect.arrayContaining([
        { categoryId: 'cat_food', categoryName: 'Food', color: '#f97316', total: 90 },
        { categoryId: 'cat_transport', categoryName: 'Transport', color: '#3b82f6', total: 15 },
      ])
    );
  });

  it('returns an empty array for no expenses', () => {
    expect(aggregateByCategory([])).toEqual([]);
  });
});

describe('aggregateByMonth', () => {
  it('sums amounts per month, oldest first, for the requested window', () => {
    const result = aggregateByMonth(expenses, 2);
    expect(result).toEqual([
      { month: '2026-07', total: 40 },
      { month: '2026-08', total: 65 },
    ]);
  });

  it('includes months with zero spend in the window', () => {
    const result = aggregateByMonth(
      [{ amount: 10, date: new Date('2026-08-01'), category: food }],
      3
    );
    expect(result).toEqual([
      { month: '2026-06', total: 0 },
      { month: '2026-07', total: 0 },
      { month: '2026-08', total: 10 },
    ]);
  });
});
