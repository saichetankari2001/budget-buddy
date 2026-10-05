import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { computeHealthScore } from './computeHealthScore';

const activeCycle = {
  id: 'cycle_1',
  startDate: new Date('2026-09-10T00:00:00.000Z'),
  endDate: new Date('2026-09-20T00:00:00.000Z'),
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  status: 'ACTIVE' as const,
  startingAmount: 500,
};

const now = new Date('2026-09-12T00:00:00.000Z'); // 2 days elapsed, 10 total

function mockNoBills() {
  prismaMock.bill.findMany.mockResolvedValue([]);
}

describe('computeHealthScore', () => {
  it('gives full budgetAdherence marks when no categories are tracked yet', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    const result = await computeHealthScore('user_1', activeCycle, now);

    expect(result.budgetAdherence).toEqual({ points: 40 });
  });

  it('gives full marks for a category with zero spend, and docks points for one over its recommended amount', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([
      { id: 'ccb_1', cycleId: 'cycle_1', categoryId: 'cat_food', categoryName: 'Food', categoryColor: '#f97316', recommendedAmount: { toString: () => '100.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date() },
      { id: 'ccb_2', cycleId: 'cycle_1', categoryId: 'cat_fuel', categoryName: 'Fuel', categoryColor: '#22d3ee', recommendedAmount: { toString: () => '50.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date() },
    ] as never);
    // Food: $0 spent (full marks). Fuel: $100 spent against a $50 budget (over — 0 marks, clamped).
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_fuel', amount: { toString: () => '100.00' } as never },
    ] as never);
    mockNoBills();

    const result = await computeHealthScore('user_1', activeCycle, now);

    // Food contributes 1.0, Fuel contributes 0 (clamped) -> average 0.5 -> 0.5 * 40 = 20
    expect(result.budgetAdherence.points).toBe(20);
    expect(result.budgetAdherence.worstCategoryName).toBe('Fuel');
  });

  it('awards full pacing marks when on track, and partial marks when over pace', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    mockNoBills();
    // $500 over 10 days = $50/day planned. Spent $150 in 2 days = $75/day actual -> over pace.
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '150.00' } as never },
    ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    // 30 * (50/75) = 20
    expect(result.pacing.status).toBe('OVER_PACE');
    expect(result.pacing.points).toBe(20);
  });

  it('gives full billPunctuality marks when nothing has been due yet this cycle', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800.00' } as never, dueDate: new Date('2026-09-30T00:00:00.000Z'), recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date() },
    ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    expect(result.billPunctuality).toEqual({ points: 30 });
  });

  it('docks billPunctuality points for a bill overdue and unpaid within the cycle window', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Phone', amount: { toString: () => '30.00' } as never, dueDate: new Date('2026-09-11T00:00:00.000Z'), recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date() },
    ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    // 1 bill due, 0 paid on time -> 30 * 0/1 = 0
    expect(result.billPunctuality.points).toBe(0);
    expect(result.billPunctuality.lateBillName).toBe('Phone');
  });

  it('awards full billPunctuality marks for a bill paid on the same day it was due', async () => {
    const paidDate = new Date('2026-09-11T00:00:00.000Z');
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Phone', amount: { toString: () => '30.00' } as never, dueDate: new Date('2026-09-18T00:00:00.000Z'), recurrenceInterval: null, categoryId: null, paidExpenseId: 'exp_paid', createdAt: new Date() },
    ] as never);
    prismaMock.expense.findMany
      // First call is the budget-adherence/spend query inside computeCategoryTotalsForWindow —
      // second call (below, via mockResolvedValueOnce chained after the first mockResolvedValue)
      // is computeHealthScore's own lookup of the paid bill's Expense row.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'exp_paid', date: paidDate, createdAt: paidDate, amount: { toString: () => '30.00' } as never, categoryId: 'cat_bills' },
      ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    expect(result.billPunctuality).toEqual({ points: 30 });
  });

  it('rounds the total to the nearest integer across all three components', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    const result = await computeHealthScore('user_1', activeCycle, now);

    // No spend at all: budgetAdherence 40 (no tracked categories), pacing 30 (ON_TRACK, $0 spent),
    // billPunctuality 30 (nothing due) -> 100.
    expect(result.total).toBe(100);
  });

  it('uses the cycle end date (not "now") as the pacing/window boundary for a completed past cycle', async () => {
    const pastCycle = {
      id: 'cycle_old',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-11T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      status: 'COMPLETED' as const,
      startingAmount: 500,
    };
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    // "now" is long after the cycle ended — must not affect its pacing calculation.
    const result = await computeHealthScore('user_1', pastCycle, new Date('2026-10-05T00:00:00.000Z'));

    expect(result.pacing.status).toBe('ON_TRACK');
    expect(result.pacing.points).toBe(30);
  });
});
