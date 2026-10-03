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

  it('does not add a createdAt filter when createdAtGte is omitted (all-time/no behavior change)', async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);
    const gte = new Date('2026-09-01');

    await computeCategoryTotalsForWindow('user_1', { gte }, []);

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', date: { gte } },
      select: { categoryId: true, amount: true },
    });
  });

  it('ANDs a createdAt filter with the date filter when createdAtGte is provided', async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);
    const gte = new Date('2026-09-01');
    const createdAtGte = new Date('2026-09-10T12:00:00.000Z');

    await computeCategoryTotalsForWindow('user_1', { gte, createdAtGte }, []);

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', date: { gte }, createdAt: { gte: createdAtGte } },
      select: { categoryId: true, amount: true },
    });
  });

  it('excludes an expense whose date falls in the window but whose createdAt predates createdAtGte (cross-cycle regression)', async () => {
    // Regression scenario: a prior cycle completed/was cancelled earlier today, and an expense
    // logged under THAT cycle has a `date` of today — inside a new cycle's Sydney-day-floored
    // window — but was actually created (logged) before the new cycle existed. Real Prisma would
    // filter this out via the AND'd `createdAt` condition; this test exercises the actual
    // aggregation logic with a pre-filtered result standing in for that (the mock here returns
    // only what a real `where: { date, createdAt }` query would return — i.e. nothing, since the
    // one expense that exists is excluded by `createdAt`).
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeCategoryTotalsForWindow(
      'user_1',
      { gte: new Date('2026-09-15T00:00:00.000Z'), createdAtGte: new Date('2026-09-15T10:00:00.000Z') },
      ['cat_1']
    );

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        date: { gte: new Date('2026-09-15T00:00:00.000Z') },
        createdAt: { gte: new Date('2026-09-15T10:00:00.000Z') },
      },
      select: { categoryId: true, amount: true },
    });
    expect(result).toEqual([
      { categoryId: 'cat_1', actual: 0 },
      { categoryId: null, actual: 0 },
    ]);
  });
});
