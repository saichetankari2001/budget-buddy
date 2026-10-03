import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };
const activeCycle = {
  id: 'cycle_1', userId: 'user_1', startDate: new Date('2026-09-10T00:00:00.000Z'),
  endDate: new Date('2026-09-20T00:00:00.000Z'), status: 'ACTIVE', createdAt: new Date(),
  startingAmount: { toString: () => '500.00' } as never,
};

describe('GET /api/cycles/active/category-breakdown', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns null when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET();
    expect(await res.json()).toBeNull();
  });

  it('returns an empty categories list when the cycle has no recommendation rows (zero-history fallback)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);

    const res = await GET();
    // Distinct from the "no active cycle" case above (which returns null so the card renders
    // nothing): here a cycle exists but had zero spending history to recommend from, so the
    // card should render its "log a few expenses first" empty state instead of disappearing.
    expect(await res.json()).toEqual({ categories: [], hasAnyExpenseThisCycle: false });
  });

  it('returns categories with recommended, actual, and historical amounts, and flags whether any expense exists this cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([
      {
        id: 'ccb_1', cycleId: 'cycle_1', categoryId: 'cat_1', categoryName: 'Food', categoryColor: '#f97316',
        recommendedAmount: { toString: () => '100.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date(),
      },
    ] as never);
    // First call (this-cycle actuals), second call (all-time historical) — both go through
    // prisma.expense.findMany via computeCategoryTotalsForWindow.
    prismaMock.expense.findMany
      .mockResolvedValueOnce([{ categoryId: 'cat_1', amount: { toString: () => '30.00' } as never }] as never)
      .mockResolvedValueOnce([{ categoryId: 'cat_1', amount: { toString: () => '400.00' } as never }] as never);

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({
      categories: [
        {
          categoryId: 'cat_1', categoryName: 'Food', color: '#f97316',
          recommendedAmount: 100, actualAmount: 30, historicalAmount: 400,
        },
      ],
      hasAnyExpenseThisCycle: true,
    });
  });

  it("uses the start of the cycle's own Sydney calendar day as the actual-spend window, not its exact creation timestamp", async () => {
    // Created at 23:10 UTC on the 15th, which is already the 16th in Sydney (UTC+10 in
    // September) — an expense dated "today" (the 16th) via the date picker would serialize to
    // 2026-09-16T00:00:00.000Z, which is BEFORE this exact timestamp. Regression test for the
    // bug this fixes: such a same-day expense must still count as "this cycle" spending.
    const lateCreatedCycle = {
      ...activeCycle,
      startDate: new Date('2026-09-15T23:10:00.000Z'),
    };
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(lateCreatedCycle as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([
      {
        id: 'ccb_1', cycleId: 'cycle_1', categoryId: 'cat_1', categoryName: 'Food', categoryColor: '#f97316',
        recommendedAmount: { toString: () => '100.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.expense.findMany.mockResolvedValue([]);

    await GET();

    // First call is the "this cycle" window (gte/lte); second is all-time historical (no date filter).
    const findManyMock = prismaMock.expense.findMany as unknown as { mock: { calls: unknown[][] } };
    const firstCallArgs = findManyMock.mock.calls[0][0] as { where: { date: { gte: Date } } };
    expect(firstCallArgs.where.date).toMatchObject({ gte: new Date('2026-09-16T00:00:00.000Z') });
  });

  it("excludes a same-day expense that was logged under a PRIOR cycle, not this one (cross-cycle double-count regression)", async () => {
    // Regression test for the bug startOfSydneyDay's fix introduced: if a prior cycle completed
    // or was cancelled earlier today and a new cycle started the same Sydney day, the new cycle's
    // Sydney-day-floored `date` window alone would also match an expense actually logged under
    // the OLD cycle earlier today — double-counting it as the new cycle's spend. Scoping by
    // `createdAt >= cycle.createdAt` (this cycle's own creation instant) excludes it, since it was
    // created before this cycle existed.
    const newCycleCreatedAt = new Date('2026-09-16T14:00:00.000Z');
    const newCycle = { ...activeCycle, startDate: newCycleCreatedAt, createdAt: newCycleCreatedAt };
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(newCycle as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([
      {
        id: 'ccb_1', cycleId: 'cycle_1', categoryId: 'cat_1', categoryName: 'Food', categoryColor: '#f97316',
        recommendedAmount: { toString: () => '100.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date(),
      },
    ] as never);
    // A real Prisma query scoped by `createdAt: { gte: newCycleCreatedAt }` would exclude the old
    // cycle's expense (logged before the new cycle existed), so the mock returns nothing for it —
    // standing in for that real filtering.
    prismaMock.expense.findMany.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.categories[0].actualAmount).toBe(0);
    expect(json.hasAnyExpenseThisCycle).toBe(false);

    const findManyMock = prismaMock.expense.findMany as unknown as { mock: { calls: unknown[][] } };
    const firstCallArgs = findManyMock.mock.calls[0][0] as { where: { createdAt?: { gte: Date } } };
    expect(firstCallArgs.where.createdAt).toEqual({ gte: newCycleCreatedAt });
  });
});
