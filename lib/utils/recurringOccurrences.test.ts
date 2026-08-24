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
