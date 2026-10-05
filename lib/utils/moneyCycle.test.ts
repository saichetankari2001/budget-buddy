import { describe, it, expect } from 'vitest';
import {
  computeDaysRemaining,
  computeCommittedSpend,
  computeBillOccurrences,
  computeSafeToSpend,
  computePacingStatus,
  computePacingRates,
  buildFallbackPlanMessage,
  buildFallbackCheckInMessage,
  startOfSydneyDay,
} from './moneyCycle';

describe('computeDaysRemaining', () => {
  it('counts whole days between today and the end date', () => {
    expect(computeDaysRemaining(new Date('2026-09-15'), new Date('2026-09-10'))).toBe(5);
  });

  it('floors at 1 so safe-to-spend never divides by zero, even on the end date itself', () => {
    expect(computeDaysRemaining(new Date('2026-09-10'), new Date('2026-09-10'))).toBe(1);
    expect(computeDaysRemaining(new Date('2026-09-09'), new Date('2026-09-10'))).toBe(1);
  });
});

describe('startOfSydneyDay', () => {
  it('floors a late-day instant to UTC midnight of the same Sydney calendar day', () => {
    // 2026-09-15T23:10:00Z is 2026-09-16 09:10 AEST (Sydney, UTC+10 in September) — a cycle
    // created at this instant should floor to 2026-09-16T00:00:00Z, not the 15th.
    const result = startOfSydneyDay(new Date('2026-09-15T23:10:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('is idempotent on an instant already at Sydney midnight', () => {
    const result = startOfSydneyDay(new Date('2026-09-16T00:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('floors an early-morning instant to the same Sydney calendar day, not the previous one', () => {
    // 2026-09-16T01:00:00Z is still 2026-09-16 11:00 AEST — same Sydney day.
    const result = startOfSydneyDay(new Date('2026-09-16T01:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });
});

describe('computeCommittedSpend', () => {
  it('sums occurrences of a monthly template landing inside the window', () => {
    const templates = [
      { amount: 100, recurrenceInterval: 'MONTHLY' as const, date: new Date('2026-08-15') },
    ];
    // Window Sep 10 -> Oct 20: the Sep 15 occurrence falls inside, so does Oct 15
    const result = computeCommittedSpend(templates, new Date('2026-09-10'), new Date('2026-10-20'));
    expect(result).toBe(200);
  });

  it('returns 0 for an empty template list', () => {
    expect(computeCommittedSpend([], new Date('2026-09-10'), new Date('2026-09-20'))).toBe(0);
  });

  it('sums across multiple templates', () => {
    const templates = [
      { amount: 50, recurrenceInterval: 'WEEKLY' as const, date: new Date('2026-09-08') },
      { amount: 30, recurrenceInterval: 'WEEKLY' as const, date: new Date('2026-09-08') },
    ];
    // Window Sep 10 -> Sep 16: one weekly occurrence (Sep 15) per template
    const result = computeCommittedSpend(templates, new Date('2026-09-10'), new Date('2026-09-16'));
    expect(result).toBe(80);
  });
});

describe('computeBillOccurrences', () => {
  it('anchors each occurrence to the UTC calendar day it was actually meant for, regardless of host timezone', () => {
    // Regression: computeMissingOccurrences (unchanged) builds its occurrence dates in LOCAL
    // time. computeBillOccurrences feeds computeCashFlowProjection, which buckets by UTC
    // calendar day — so without re-anchoring at this boundary, a host running in a non-UTC
    // timezone could silently shift a bill onto the wrong day. Using local-time constructors for
    // the template/window (matching this file's and recurringOccurrences.test.ts's existing
    // convention) keeps computeMissingOccurrences' own behavior timezone-neutral for this test;
    // asserting via UTC getters on the *output* is what actually proves the re-anchoring works,
    // independent of whatever timezone this suite happens to run in.
    const templates = [
      { amount: 100, recurrenceInterval: 'MONTHLY' as const, date: new Date(2026, 7, 15), label: 'Rent' }, // Aug 15
    ];
    const windowStart = new Date(2026, 8, 1); // Sep 1
    const windowEnd = new Date(2026, 8, 30); // Sep 30

    const result = computeBillOccurrences(templates, windowStart, windowEnd);

    expect(result).toHaveLength(1);
    expect(result[0].date.getUTCFullYear()).toBe(2026);
    expect(result[0].date.getUTCMonth()).toBe(8); // September (0-indexed)
    expect(result[0].date.getUTCDate()).toBe(15);
    expect(result[0].amount).toBe(100);
    expect(result[0].label).toBe('Rent');
  });

  it('returns one dated occurrence per template match, across multiple templates', () => {
    const templates = [
      { amount: 50, recurrenceInterval: 'WEEKLY' as const, date: new Date(2026, 8, 8), label: 'Streaming' },
      { amount: 30, recurrenceInterval: 'WEEKLY' as const, date: new Date(2026, 8, 8), label: 'Gym' },
    ];
    // Window Sep 10 -> Sep 16: one weekly occurrence (Sep 15) per template
    const result = computeBillOccurrences(templates, new Date(2026, 8, 10), new Date(2026, 8, 16));

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.label).sort()).toEqual(['Gym', 'Streaming']);
    result.forEach((occurrence) => {
      expect(occurrence.date.getUTCFullYear()).toBe(2026);
      expect(occurrence.date.getUTCMonth()).toBe(8);
      expect(occurrence.date.getUTCDate()).toBe(15);
    });
  });

  it('returns an empty array for an empty template list', () => {
    expect(computeBillOccurrences([], new Date(2026, 8, 10), new Date(2026, 8, 20))).toEqual([]);
  });
});

describe('computeSafeToSpend', () => {
  it('divides the discretionary remainder evenly across remaining days', () => {
    const result = computeSafeToSpend({ startingAmount: 500, committedSpend: 200, daysRemaining: 10 });
    expect(result).toBe(30);
  });

  it('floors at 0 when committed spend exceeds the starting amount', () => {
    const result = computeSafeToSpend({ startingAmount: 100, committedSpend: 200, daysRemaining: 5 });
    expect(result).toBe(0);
  });
});

describe('computePacingStatus', () => {
  it('reports ON_TRACK when spend-per-day-so-far is at or below the planned rate', () => {
    // Plan: $500 over 10 days = $50/day. Spent $100 in 2 days = $50/day exactly.
    const result = computePacingStatus({ startingAmount: 500, spentSoFar: 100, daysElapsed: 2, totalDays: 10 });
    expect(result).toBe('ON_TRACK');
  });

  it('reports OVER_PACE when spend-per-day-so-far exceeds the planned rate', () => {
    // Plan: $500 over 10 days = $50/day. Spent $150 in 2 days = $75/day.
    const result = computePacingStatus({ startingAmount: 500, spentSoFar: 150, daysElapsed: 2, totalDays: 10 });
    expect(result).toBe('OVER_PACE');
  });

  it('treats daysElapsed of 0 as day 1 to avoid divide-by-zero on the cycle-start day', () => {
    const result = computePacingStatus({ startingAmount: 500, spentSoFar: 10, daysElapsed: 0, totalDays: 10 });
    expect(result).toBe('ON_TRACK');
  });
});

describe('computePacingRates', () => {
  it('returns the planned and actual per-day rates alongside the status', () => {
    const result = computePacingRates({ startingAmount: 500, spentSoFar: 150, daysElapsed: 2, totalDays: 10 });
    expect(result.plannedRatePerDay).toBe(50);
    expect(result.actualRatePerDay).toBe(75);
    expect(result.status).toBe('OVER_PACE');
  });

  it('reports ON_TRACK with matching rates when spend is exactly at the planned pace', () => {
    const result = computePacingRates({ startingAmount: 500, spentSoFar: 100, daysElapsed: 2, totalDays: 10 });
    expect(result.plannedRatePerDay).toBe(50);
    expect(result.actualRatePerDay).toBe(50);
    expect(result.status).toBe('ON_TRACK');
  });

  it('treats daysElapsed of 0 as day 1 to avoid divide-by-zero on the cycle-start day', () => {
    const result = computePacingRates({ startingAmount: 500, spentSoFar: 10, daysElapsed: 0, totalDays: 10 });
    expect(result.actualRatePerDay).toBe(10);
    expect(result.status).toBe('ON_TRACK');
  });
});

describe('buildFallbackPlanMessage', () => {
  it('includes the starting amount, committed spend, days remaining, and safe-to-spend figure', () => {
    const message = buildFallbackPlanMessage({
      startingAmount: 500,
      committedSpend: 200,
      daysRemaining: 10,
      safeToSpend: 30,
    });
    expect(message).toContain('$500.00');
    expect(message).toContain('$200.00');
    expect(message).toContain('10 days');
    expect(message).toContain('$30.00');
  });
});

describe('buildFallbackCheckInMessage', () => {
  it('mentions being over pace when pacingStatus is OVER_PACE', () => {
    const message = buildFallbackCheckInMessage({
      spentSoFar: 150,
      remainingAmount: 350,
      daysRemaining: 8,
      safeToSpend: 43.75,
      pacingStatus: 'OVER_PACE',
    });
    expect(message.toLowerCase()).toContain('over');
  });

  it('mentions being on track when pacingStatus is ON_TRACK', () => {
    const message = buildFallbackCheckInMessage({
      spentSoFar: 100,
      remainingAmount: 400,
      daysRemaining: 8,
      safeToSpend: 50,
      pacingStatus: 'ON_TRACK',
    });
    expect(message.toLowerCase()).toContain('track');
  });
});
