import { describe, it, expect } from 'vitest';
import { computeCashFlowProjection } from './cashFlowProjection';

const DAY = 24 * 60 * 60 * 1000;

describe('computeCashFlowProjection', () => {
  it('finds no dip when a fixed paycheck lands before a bill is due', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-10-03T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 100,
      today,
      endDate,
      fixedIncomeOccurrences: [{ date: new Date('2026-09-26T00:00:00.000Z'), amount: 400, label: 'Job' }],
      billOccurrences: [{ date: new Date('2026-09-30T00:00:00.000Z'), amount: 300, label: 'Rent' }],
    });

    expect(result.minFutureBalance).toBe(200); // 100 + 400 - 300
    expect(result.isShortfall).toBe(false);
    expect(result.trajectory.find((d) => d.date.getTime() === new Date('2026-09-30T00:00:00.000Z').getTime())!.balance).toBe(200);
  });

  it('finds the real dip when a bill lands before the fixed income that would cover it (the motivating scenario)', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-10-05T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 100,
      today,
      endDate,
      fixedIncomeOccurrences: [{ date: new Date('2026-09-29T00:00:00.000Z'), amount: 400, label: 'Job' }],
      billOccurrences: [{ date: new Date('2026-09-30T00:00:00.000Z'), amount: 735, label: 'Rent + Subscription' }],
    });

    // Sep 29: 100 + 400 = 500. Sep 30: 500 - 735 = -235.
    expect(result.minFutureBalance).toBe(-235);
    expect(result.isShortfall).toBe(true);
  });

  it('ignores irregular income for future days but counts a logged actual entry on its real date', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-27T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 50,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [],
      // An irregular source's future occurrence contributes nothing — it simply isn't passed in
      // as a fixedIncomeOccurrence at all (the caller is responsible for that filtering; this
      // function only ever sees confirmed, known amounts). A logged actual entry for TODAY is
      // folded into currentBalance by the caller before this function runs, so the trajectory
      // itself has nothing irregular-specific to special-case — this test documents that
      // omitting an irregular source from the inputs is sufficient, not a separate code path.
    });

    expect(result.trajectory.every((d) => d.balance === 50)).toBe(true);
  });

  it('produces multiple occurrences for a recurring bill within the window', () => {
    const today = new Date('2026-09-01T00:00:00.000Z');
    const endDate = new Date('2026-09-20T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 1000,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [
        { date: new Date('2026-09-08T00:00:00.000Z'), amount: 50, label: 'Weekly bill' },
        { date: new Date('2026-09-15T00:00:00.000Z'), amount: 50, label: 'Weekly bill' },
      ],
    });

    expect(result.minFutureBalance).toBe(900); // 1000 - 50 - 50
  });

  it('reports a shortfall day even when it falls on the cycle end date itself (boundary)', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-26T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 10,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: new Date('2026-09-26T00:00:00.000Z'), amount: 20, label: 'Last-day bill' }],
    });

    expect(result.minFutureBalance).toBe(-10);
    expect(result.isShortfall).toBe(true);
    expect(result.trajectory[result.trajectory.length - 1].balance).toBe(-10);
  });

  it('floors the safe-to-spend day count at 1 when the lowest point is today', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-30T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 100,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: today, amount: 40, label: 'Due today' }],
    });

    // minFutureBalance = 60, occurring on day 0 (today) — dividing by a floored day count of 1
    // must not throw or divide by zero, and must yield the full 60 for today specifically.
    expect(result.minFutureBalance).toBe(60);
    expect(result.safeToSpendPerDay).toBe(60);
  });

  it('clamps safe-to-spend to 0 on a shortfall rather than returning a negative daily figure', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-30T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 10,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: new Date('2026-09-25T00:00:00.000Z'), amount: 50, label: 'Bill' }],
    });

    expect(result.isShortfall).toBe(true);
    expect(result.safeToSpendPerDay).toBe(0);
  });

  it('does not mask an already-negative starting balance when a later, purely-positive income event exists', () => {
    // Regression: the event-gated minimum tracker must not erase an existing shortfall just
    // because some later event (with nothing negative in between) happens to be income. The
    // account is $50 overdrawn TODAY — that must surface as a shortfall regardless of what
    // happens three days from now.
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-30T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: -50,
      today,
      endDate,
      fixedIncomeOccurrences: [{ date: new Date('2026-09-27T00:00:00.000Z'), amount: 400, label: 'Job' }],
      billOccurrences: [],
    });

    expect(result.isShortfall).toBe(true);
    expect(result.safeToSpendPerDay).toBe(0);
  });

  it('folds a past-dated event into day 0 rather than dropping it', () => {
    // An overdue, still-unpaid bill is money that still has to come out of today's balance. Dropping
    // it (the old `dayOffset < 0` guard) made the projection look healthier than reality.
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-28T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 300,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: new Date('2026-09-20T00:00:00.000Z'), amount: 200, label: 'Overdue rates' }],
    });

    expect(result.trajectory[0].events).toContainEqual({ label: 'Overdue rates', amount: -200 });
    expect(result.trajectory[0].balance).toBe(100); // 300 - 200, charged today
    expect(result.trajectory.every((d) => d.balance === 100)).toBe(true);
    expect(result.minFutureBalance).toBe(100);
  });

  it('still drops an event beyond the window end (only the negative half of the old guard changed)', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-26T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 300,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: new Date('2026-10-15T00:00:00.000Z'), amount: 200, label: 'Next cycle bill' }],
    });

    expect(result.trajectory.every((d) => d.events.length === 0)).toBe(true);
    expect(result.trajectory.every((d) => d.balance === 300)).toBe(true);
  });

  it('spreads the whole balance across the window when no event fires anywhere in it', () => {
    // The "no events at all" fallback anchors the min at the window END, not today, so this reads as
    // a daily allowance (400 / 5 = 80) instead of handing the user the entire 400 as "today's" budget.
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-29T00:00:00.000Z'); // 5 days out
    const result = computeCashFlowProjection({
      currentBalance: 400,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [],
    });

    expect(result.isShortfall).toBe(false);
    expect(result.minFutureBalance).toBe(400);
    expect(result.safeToSpendPerDay).toBe(80);
    expect(result.safeToSpendPerDay).not.toBe(400);
  });
});
