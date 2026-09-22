import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMoneyCycleSchema } from './moneyCycle.schema';

describe('createMoneyCycleSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a valid starting amount and a near-future endDate', () => {
    const result = createMoneyCycleSchema.safeParse({
      startingAmount: 500,
      endDate: '2026-09-30T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive starting amount', () => {
    const result = createMoneyCycleSchema.safeParse({
      startingAmount: 0,
      endDate: '2026-09-30T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an endDate more than 400 days in the future', () => {
    // "now" is 2026-09-15; 401 days out lands past the 400-day cap.
    const result = createMoneyCycleSchema.safeParse({
      startingAmount: 500,
      endDate: '2027-10-21T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an endDate exactly at the 400-day boundary', () => {
    // "now" is 2026-09-15; 400 days out.
    const result = createMoneyCycleSchema.safeParse({
      startingAmount: 500,
      endDate: '2027-10-20T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an endDate in the past', () => {
    const result = createMoneyCycleSchema.safeParse({
      startingAmount: 500,
      endDate: '2026-09-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
