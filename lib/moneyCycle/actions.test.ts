import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

import { updateCycleAmount, cancelCycle } from './actions';

describe('updateCycleAmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
    // updateCycleAmount now derives its figures through the shared projectCycle, which reads Bill and
    // IncomeSource rows too — these are the "nothing else going on" defaults individual tests override.
    prismaMock.bill.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
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

  it('quotes a safeToSpend that accounts for Bill rows, matching the dashboard instead of a flat average', async () => {
    // The contradiction this fixes: the dashboard (GET /api/cycles/active) saw this bill and quoted
    // the real dip, while the chat's reply to "change it to $700" quoted 700/5 = $140/day, because
    // the flat-average path here was blind to the Bill table.
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
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '600.00' } as never,
        dueDate: new Date('2026-09-18T00:00:00.000Z'), recurrenceInterval: null, paidExpenseId: null,
      },
    ] as never);
    prismaMock.moneyCycle.update.mockResolvedValue({ id: 'cycle_1' } as never);

    const result = await updateCycleAmount('user_1', 700);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.remainingAmount).toBe(700);
      expect(result.daysRemaining).toBe(5);
      // Sep 18 (day 3) is the real low point: 700 - 600 = 100, spread over the 3 days up to it.
      expect(result.safeToSpend).toBeCloseTo(100 / 3, 10);
      expect(result.safeToSpend).not.toBe(140); // the old flat average, 700 / 5
    }
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
