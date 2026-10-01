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
});
