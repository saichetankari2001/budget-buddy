import { describe, it, expect } from 'vitest';
import { computeMissingOccurrences } from './recurringOccurrences';

describe('computeMissingOccurrences', () => {
  it('returns weekly occurrences up to today', () => {
    const source = new Date(2026, 7, 1); // Aug 1, 2026
    const today = new Date(2026, 7, 22); // Aug 22, 2026
    const result = computeMissingOccurrences('WEEKLY', source, source, today);
    expect(result).toEqual([new Date(2026, 7, 8), new Date(2026, 7, 15), new Date(2026, 7, 22)]);
  });

  it('returns monthly occurrences, catching up multiple missed months', () => {
    const source = new Date(2026, 5, 15); // June 15
    const today = new Date(2026, 8, 20); // Sep 20
    const result = computeMissingOccurrences('MONTHLY', source, source, today);
    expect(result).toEqual([new Date(2026, 6, 15), new Date(2026, 7, 15), new Date(2026, 8, 15)]);
  });

  it('clamps to month-end and recovers the anchor day once the target month is long enough', () => {
    const source = new Date(2026, 0, 31); // Jan 31, 2026 (2026 is not a leap year)
    const today = new Date(2026, 3, 1); // Apr 1
    const result = computeMissingOccurrences('MONTHLY', source, source, today);
    expect(result).toEqual([
      new Date(2026, 1, 28), // Feb 28 — clamped, Feb has 28 days
      new Date(2026, 2, 31), // Mar 31 — recovered, March has 31 days
    ]);
  });

  it('returns yearly occurrences', () => {
    const source = new Date(2024, 7, 20); // Aug 20, 2024
    const today = new Date(2026, 8, 1); // Sep 1, 2026
    const result = computeMissingOccurrences('YEARLY', source, source, today);
    expect(result).toEqual([new Date(2025, 7, 20), new Date(2026, 7, 20)]);
  });

  it('returns an empty array when already up to date', () => {
    const source = new Date(2026, 7, 1); // Aug 1
    const lastDate = new Date(2026, 7, 15); // Aug 15
    const today = new Date(2026, 7, 20); // Aug 20
    const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
    expect(result).toEqual([]);
  });

  it('resumes from lastDate, not sourceDate, when some occurrences were already generated', () => {
    const source = new Date(2026, 5, 15); // June 15
    const lastDate = new Date(2026, 6, 15); // July 15 (already generated)
    const today = new Date(2026, 8, 20); // Sep 20
    const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
    expect(result).toEqual([new Date(2026, 7, 15), new Date(2026, 8, 15)]);
  });
});

describe('computeMissingOccurrences with unaligned lastDate (arbitrary reference dates)', () => {
  describe('WEEKLY — current period occurrence is ahead of lastDate', () => {
    it('returns the upcoming occurrence of the same day-of-week when lastDate falls before it in the current week', () => {
      // Source: Monday (day 1)
      // lastDate: Sunday (day 0) — the day before
      // Expected: Monday of this week, which is 1 day ahead
      const source = new Date(2026, 7, 3); // Aug 3, 2026 (Monday)
      const lastDate = new Date(2026, 7, 2); // Aug 2, 2026 (Sunday)
      const today = new Date(2026, 7, 10); // Aug 10, 2026 (Sunday, end of week)
      const result = computeMissingOccurrences('WEEKLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 7, 3), new Date(2026, 7, 10)]);
    });
  });

  describe('WEEKLY — current period occurrence has already passed lastDate', () => {
    it('skips the passed occurrence and returns the next period occurrence', () => {
      // Source: Monday (day 1)
      // lastDate: Tuesday (day 2) — after this week's Monday
      // Expected: next Monday (7 days from Tuesday = 6 days, landing on next Monday)
      const source = new Date(2026, 7, 3); // Aug 3, 2026 (Monday)
      const lastDate = new Date(2026, 7, 4); // Aug 4, 2026 (Tuesday)
      const today = new Date(2026, 7, 12); // Aug 12, 2026
      const result = computeMissingOccurrences('WEEKLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 7, 10)]); // Next Monday
    });
  });

  describe('WEEKLY — exact equality boundary', () => {
    it('does not return an occurrence when lastDate equals the current period occurrence', () => {
      // Source: Monday (day 1)
      // lastDate: Monday — exactly matching
      // Expected: next Monday (not this Monday, since we want strictly after)
      const source = new Date(2026, 7, 3); // Aug 3, 2026 (Monday)
      const lastDate = new Date(2026, 7, 3); // Aug 3, 2026 (Monday) — exact match
      const today = new Date(2026, 7, 17); // Aug 17, 2026
      const result = computeMissingOccurrences('WEEKLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 7, 10), new Date(2026, 7, 17)]); // Starts from next Monday
    });
  });

  describe('MONTHLY — current period occurrence is ahead of lastDate', () => {
    it('returns the occurrence in the current month when lastDate is before the anchor day', () => {
      // Source: 15th of each month
      // lastDate: 10th — before the 15th
      // Expected: 15th of the current month
      const source = new Date(2026, 7, 15); // Aug 15
      const lastDate = new Date(2026, 7, 10); // Aug 10 — before the 15th
      const today = new Date(2026, 8, 20); // Sep 20
      const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 7, 15), new Date(2026, 8, 15)]);
    });
  });

  describe('MONTHLY — current period occurrence has already passed lastDate', () => {
    it('skips the passed occurrence and returns the next period occurrence', () => {
      // Source: 15th of each month
      // lastDate: 20th — after the 15th
      // Expected: 15th of next month
      const source = new Date(2026, 7, 15); // Aug 15
      const lastDate = new Date(2026, 7, 20); // Aug 20 — after the 15th
      const today = new Date(2026, 8, 20); // Sep 20
      const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 8, 15)]);
    });
  });

  describe('MONTHLY — exact equality boundary', () => {
    it('does not return an occurrence when lastDate equals the current period occurrence', () => {
      // Source: 15th of each month
      // lastDate: 15th — exactly matching
      // Expected: 15th of next month (not this month, since we want strictly after)
      const source = new Date(2026, 7, 15); // Aug 15
      const lastDate = new Date(2026, 7, 15); // Aug 15 — exact match
      const today = new Date(2026, 9, 20); // Oct 20
      const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 8, 15), new Date(2026, 9, 15)]); // Starts from next month
    });
  });

  describe('YEARLY — current period occurrence is ahead of lastDate', () => {
    it('returns the occurrence in the current year when lastDate is before the anchor date', () => {
      // Source: Aug 20 (yearly)
      // lastDate: Aug 1 — before Aug 20
      // Expected: Aug 20 of the current year
      const source = new Date(2024, 7, 20); // Aug 20, 2024
      const lastDate = new Date(2026, 7, 1); // Aug 1, 2026 — before Aug 20
      const today = new Date(2026, 8, 1); // Sep 1, 2026
      const result = computeMissingOccurrences('YEARLY', source, lastDate, today);
      expect(result).toEqual([new Date(2026, 7, 20)]); // Aug 20, 2026
    });
  });

  describe('YEARLY — current period occurrence has already passed lastDate', () => {
    it('skips the passed occurrence and returns the next period occurrence', () => {
      // Source: Aug 20 (yearly)
      // lastDate: Sep 1 — after Aug 20 of the current year
      // Expected: Aug 20 of next year
      const source = new Date(2024, 7, 20); // Aug 20, 2024
      const lastDate = new Date(2026, 8, 1); // Sep 1, 2026 — after Aug 20 of this year
      const today = new Date(2027, 8, 1); // Sep 1, 2027
      const result = computeMissingOccurrences('YEARLY', source, lastDate, today);
      expect(result).toEqual([new Date(2027, 7, 20)]); // Aug 20, 2027
    });
  });

  describe('YEARLY — exact equality boundary', () => {
    it('does not return an occurrence when lastDate equals the current period occurrence', () => {
      // Source: Aug 20 (yearly)
      // lastDate: Aug 20 — exactly matching
      // Expected: Aug 20 of next year (not this year, since we want strictly after)
      const source = new Date(2024, 7, 20); // Aug 20, 2024
      const lastDate = new Date(2026, 7, 20); // Aug 20, 2026 — exact match
      const today = new Date(2027, 8, 1); // Sep 1, 2027
      const result = computeMissingOccurrences('YEARLY', source, lastDate, today);
      expect(result).toEqual([new Date(2027, 7, 20)]); // Aug 20, 2027 (next year)
    });
  });
});
