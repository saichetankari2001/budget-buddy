import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

import { updateCycleAmount, cancelCycle } from './actions';

describe('updateCycleAmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the amount and returns figures that account for spend so far mid-cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    // $150 already spent this cycle — the corrected remainingAmount must subtract this.
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '150.00' } } } as never);
    prismaMock.moneyCycle.update.mockResolvedValue({
      id: 'cycle_1',
      startingAmount: { toString: () => '700.00' } as never,
    } as never);

    const result = await updateCycleAmount('user_1', 700);

    expect(result.success).toBe(true);
    if (result.success) {
      // 700 (new amount) - 150 (spentSoFar) - 0 (committedSpend) = 550
      expect(result.remainingAmount).toBe(550);
    }
    expect(prismaMock.expense.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', date: { gte: new Date('2026-09-10T00:00:00.000Z'), lte: new Date('2026-09-15T00:00:00.000Z') } },
        _sum: { amount: true },
      })
    );
    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle_1' },
      data: { startingAmount: 700 },
    });
    // The redundant PLAN coachMessage write and its Gemini call are gone from this path —
    // the chat route's own CHAT-kind reply is now the sole user-facing message for a chat-initiated change.
    expect(prismaMock.coachMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns a failure result when the user has no active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const result = await updateCycleAmount('user_1', 700);

    expect(result).toEqual({ success: false, error: 'No active cycle found' });
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
  });

  it('rejects a negative amount without touching the database', async () => {
    const result = await updateCycleAmount('user_1', -50);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR');
    }
    expect(prismaMock.moneyCycle.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
  });

  it('rejects a zero amount', async () => {
    const result = await updateCycleAmount('user_1', 0);

    expect(result).toEqual({
      success: false,
      error: 'Amount must be a positive number under $100,000,000',
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.moneyCycle.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an absurdly large amount', async () => {
    const result = await updateCycleAmount('user_1', 999_999_999_999);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR');
    }
    expect(prismaMock.moneyCycle.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a non-finite amount (NaN/Infinity)', async () => {
    const result = await updateCycleAmount('user_1', Number.NaN);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR');
    }
    expect(prismaMock.moneyCycle.findFirst).not.toHaveBeenCalled();
  });
});

describe('cancelCycle', () => {
  it('marks the active cycle CANCELLED', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      status: 'ACTIVE',
    } as never);
    prismaMock.moneyCycle.update.mockResolvedValue({} as never);

    const result = await cancelCycle('user_1');

    expect(result).toEqual({ success: true });
    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle_1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('returns a failure result when the user has no active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const result = await cancelCycle('user_1');

    expect(result).toEqual({ success: false, error: 'No active cycle found' });
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
  });
});
