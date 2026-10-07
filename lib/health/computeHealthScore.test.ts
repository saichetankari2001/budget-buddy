import { describe, it, expect } from 'vitest';
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

  it('passes the cycle end date as the lte bound when computing category totals for a non-active (completed) cycle', async () => {
    const completedCycle = {
      id: 'cycle_done',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-11T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      status: 'COMPLETED' as const,
      startingAmount: 500,
    };
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    await computeHealthScore('user_1', completedCycle, new Date('2026-10-05T00:00:00.000Z'));

    // Mutation check: deleting the `lte` bound entirely for a non-active cycle leaves every
    // existing test passing (no mock asserts on call args) — this test would catch that.
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ lte: completedCycle.endDate }),
        }),
      })
    );
  });

  it('passes the cycle createdAt as createdAtGte when computing category totals', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    await computeHealthScore('user_1', activeCycle, now);

    // Mutation check: deleting `createdAtGte` entirely leaves every existing test passing — this
    // test would catch that (see categoryTotals.test.ts's cross-cycle regression for why it matters).
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: activeCycle.createdAt },
        }),
      })
    );
  });

  it('rounds the total once from the unrounded components, not by summing already-rounded component points', async () => {
    // One tracked category: recommended $800, actual spend $530 -> unusedFraction = 1 - 530/800 =
    // 0.3375 -> budgetAdherence.points = 40 * 0.3375 = 13.5 (unrounded).
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([
      {
        id: 'ccb_1',
        cycleId: 'cycle_fraction',
        categoryId: 'cat_x',
        categoryName: 'Everything',
        categoryColor: '#000000',
        recommendedAmount: { toString: () => '800.00' } as never,
        notifiedAt80: null,
        notifiedAt100: null,
        createdAt: new Date(),
      },
    ] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_x', amount: { toString: () => '530.00' } as never },
    ] as never);
    mockNoBills(); // billPunctuality.points = 30 (clean, nothing due)

    const fractionCycle = {
      id: 'cycle_fraction',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-11T00:00:00.000Z'), // totalDays = 10
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      status: 'ACTIVE' as const,
      startingAmount: 477, // plannedRatePerDay = 47.7
    };
    const fractionNow = new Date('2026-09-06T00:00:00.000Z'); // daysElapsed = 5

    // spentSoFar = 530 (the only expense), actualRatePerDay = 530 / 5 = 106.
    // pacingPoints = 30 * (47.7 / 106) = 30 * 0.45 = 13.5 (unrounded), status OVER_PACE.
    const result = await computeHealthScore('user_1', fractionCycle, fractionNow);

    expect(result.pacing.status).toBe('OVER_PACE');
    // Each component is rounded for display...
    expect(result.budgetAdherence.points).toBe(14); // Math.round(13.5)
    expect(result.pacing.points).toBe(14); // Math.round(13.5)
    expect(result.billPunctuality.points).toBe(30);
    // ...but the total is rounded ONCE from the unrounded sum: 13.5 + 13.5 + 30 = 57 -> round -> 57.
    // Summing the already-rounded components instead would give 14 + 14 + 30 = 58 — a different,
    // not-spec'd number this test would catch.
    expect(result.total).toBe(57);
  });

  it("keeps a CANCELLED cycle's bill-punctuality score identical no matter how much later it is recomputed, even past a stale future endDate", async () => {
    // cancelCycle never advances endDate when flipping status to CANCELLED, so a cancelled cycle
    // can be left with an endDate still in the future relative to when it's actually looked at.
    const cancelledCycle = {
      id: 'cycle_cancelled',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'), // stale future endDate, never advanced
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      status: 'CANCELLED' as const,
      startingAmount: 500,
    };
    const unpaidBill = {
      id: 'bill_1',
      userId: 'user_1',
      name: 'Internet',
      amount: { toString: () => '60.00' } as never,
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      recurrenceInterval: null,
      categoryId: null,
      paidExpenseId: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([unpaidBill] as never);

    // Before the Critical fix: comparing the bill's dueDate against the live `now` meant a bill
    // due AFTER the first "now" but BEFORE the second "now" would flip from "not yet due" (score
    // 30) to "overdue" (score 0) purely because real time passed — even though this cycle is
    // CANCELLED and nothing about it changed.
    const soonAfter = await computeHealthScore('user_1', cancelledCycle, new Date('2026-10-05T00:00:00.000Z'));
    const muchLater = await computeHealthScore('user_1', cancelledCycle, new Date('2026-12-25T00:00:00.000Z'));

    expect(soonAfter.billPunctuality).toEqual(muchLater.billPunctuality);
    expect(soonAfter.total).toBe(muchLater.total);
    expect(soonAfter.billPunctuality.points).toBe(0);
    expect(soonAfter.billPunctuality.lateBillName).toBe('Internet');
  });
});
