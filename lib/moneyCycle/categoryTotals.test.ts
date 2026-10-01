import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { computeCategoryTotalsForWindow } from './categoryTotals';

describe('computeCategoryTotalsForWindow', () => {
  it('sums each tracked category and folds the rest into Other', async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_1', amount: { toString: () => '50.00' } as never },
      { categoryId: 'cat_1', amount: { toString: () => '20.00' } as never },
      { categoryId: 'cat_2', amount: { toString: () => '10.00' } as never },
      { categoryId: 'cat_untracked', amount: { toString: () => '5.00' } as never },
    ] as never);

    const result = await computeCategoryTotalsForWindow('user_1', { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') }, [
      'cat_1',
      'cat_2',
    ]);

    expect(result).toEqual([
      { categoryId: 'cat_1', actual: 70 },
      { categoryId: 'cat_2', actual: 10 },
      { categoryId: null, actual: 5 },
    ]);
  });

  it('returns 0 for a tracked category with no expenses in the window', async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeCategoryTotalsForWindow('user_1', {}, ['cat_1']);

    expect(result).toEqual([
      { categoryId: 'cat_1', actual: 0 },
      { categoryId: null, actual: 0 },
    ]);
  });

  it('queries with no date filter when the window is empty (all-time)', async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);

    await computeCategoryTotalsForWindow('user_1', {}, []);

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: { categoryId: true, amount: true },
    });
  });

  it('queries with a gte/lte date filter when the window is provided', async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);
    const gte = new Date('2026-09-01');
    const lte = new Date('2026-09-30');

    await computeCategoryTotalsForWindow('user_1', { gte, lte }, []);

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', date: { gte, lte } },
      select: { categoryId: true, amount: true },
    });
  });
});
