import { describe, it, expect } from 'vitest';
import { getCurrentMonthRange } from './dateRange';

describe('getCurrentMonthRange', () => {
  it('returns the 1st of the given month as start, at midnight', () => {
    const { start } = getCurrentMonthRange(new Date(2026, 9, 15, 13, 45));
    expect(start).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });

  it('returns the 1st of the NEXT month as an exclusive upper bound', () => {
    const { end } = getCurrentMonthRange(new Date(2026, 9, 15));
    expect(end).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0));
  });

  it('rolls over the year when the current month is December', () => {
    const { end } = getCurrentMonthRange(new Date(2026, 11, 31));
    expect(end).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });

  it('excludes a future-dated expense from the current month range (regression)', () => {
    // This is the exact bug: a dashboard query that only applied `gte: start` with no upper
    // bound would count an expense dated in a future month as part of "this month".
    const now = new Date(2026, 9, 15);
    const { start, end } = getCurrentMonthRange(now);
    const futureExpenseDate = new Date(2026, 11, 5); // two months ahead

    const isWithinRange = futureExpenseDate >= start && futureExpenseDate < end;
    expect(isWithinRange).toBe(false);
  });

  it('includes an expense dated on the last instant of the current month', () => {
    const now = new Date(2026, 9, 15);
    const { start, end } = getCurrentMonthRange(now);
    const lastMomentOfMonth = new Date(2026, 9, 31, 23, 59, 59, 999);

    const isWithinRange = lastMomentOfMonth >= start && lastMomentOfMonth < end;
    expect(isWithinRange).toBe(true);
  });
});
