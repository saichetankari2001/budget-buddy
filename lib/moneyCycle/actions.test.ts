import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/ai/coach', () => ({ generatePlanMessage: vi.fn() }));

import { generatePlanMessage } from '@/lib/ai/coach';
import { updateCycleAmount, cancelCycle } from './actions';

describe('updateCycleAmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the amount, regenerates the plan message, and returns the new figures', async () => {
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
    vi.mocked(generatePlanMessage).mockResolvedValue('Updated to $700.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.update.mockResolvedValue({
      id: 'cycle_1',
      startingAmount: { toString: () => '700.00' } as never,
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_2',
      cycleId: 'cycle_1',
      kind: 'PLAN',
      content: 'Updated to $700.',
      createdAt: new Date(),
    } as never);

    const result = await updateCycleAmount('user_1', 700);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.remainingAmount).toBe(700);
      expect(result.message).toBe('Updated to $700.');
    }
    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cycle_1' }, data: { startingAmount: 700 } })
    );
  });

  it('returns a failure result when the user has no active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const result = await updateCycleAmount('user_1', 700);

    expect(result).toEqual({ success: false, error: 'No active cycle found' });
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
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
