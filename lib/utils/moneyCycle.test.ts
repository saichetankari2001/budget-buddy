import { describe, it, expect } from 'vitest';
import {
  computeDaysRemaining,
  computeCommittedSpend,
  computeSafeToSpend,
  computePacingStatus,
  buildFallbackPlanMessage,
  buildFallbackCheckInMessage,
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
