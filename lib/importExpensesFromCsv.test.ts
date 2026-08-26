import { describe, it, expect } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { importExpensesFromCsv } from './importExpensesFromCsv';

describe('importExpensesFromCsv', () => {
  it('matches an existing category case-insensitively and creates the expense', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
    ]);
    prismaMock.expense.create.mockResolvedValue({} as never);

    const csv = 'date,description,category,amount\n2026-08-01,Groceries,food,42.50';
    const result = await importExpensesFromCsv('user_1', csv);

    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: 42.5,
        description: 'Groceries',
        date: new Date('2026-08-01'),
      },
    });
  });

  it('auto-creates a missing category once and reuses it across multiple rows', async () => {
    prismaMock.category.findMany.mockResolvedValue([]);
    prismaMock.category.create.mockResolvedValue({
      id: 'cat_new',
      userId: 'user_1',
      name: 'Subscriptions',
      color: '#f97316',
      createdAt: new Date(),
    });
    prismaMock.expense.create.mockResolvedValue({} as never);

    const csv =
      'date,description,category,amount\n2026-08-01,Netflix,Subscriptions,15.00\n2026-08-02,Spotify,Subscriptions,10.00';
    const result = await importExpensesFromCsv('user_1', csv);

    expect(result.imported).toBe(2);
    expect(prismaMock.category.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', name: 'Subscriptions', color: '#f97316' },
    });
    expect(prismaMock.expense.create).toHaveBeenCalledTimes(2);
  });

  it('reports skipped rows from validation alongside successfully imported ones', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
    ]);
    prismaMock.expense.create.mockResolvedValue({} as never);

    const csv =
      'date,description,category,amount\n2026-08-01,Groceries,Food,42.50\nnot-a-date,Bad Row,Food,10.00';
    const result = await importExpensesFromCsv('user_1', csv);

    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual([
      { row: 2, reason: 'date "not-a-date" is not a valid YYYY-MM-DD date' },
    ]);
  });
});
