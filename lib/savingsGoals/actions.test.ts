import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/realtime/publish', () => ({ publishCycleUpdate: vi.fn().mockResolvedValue(undefined) }));

import { publishCycleUpdate } from '@/lib/realtime/publish';
import { addSavingsGoal, logSavingsContribution, deleteSavingsGoal } from './actions';

describe('addSavingsGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a goal with a target amount and no target date', async () => {
    prismaMock.savingsGoal.create.mockResolvedValue({ id: 'goal_1' } as never);

    const result = await addSavingsGoal('user_1', { name: 'Laptop fund', targetAmount: 1500 });

    expect(result).toEqual({ success: true, id: 'goal_1' });
    expect(prismaMock.savingsGoal.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', name: 'Laptop fund', targetAmount: 1500, targetDate: undefined },
    });
    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });

  it('rejects a non-positive target amount without touching the database', async () => {
    const result = await addSavingsGoal('user_1', { name: 'Laptop fund', targetAmount: 0 });

    expect(result).toEqual({ success: false, error: expect.any(String) });
    expect(prismaMock.savingsGoal.create).not.toHaveBeenCalled();
  });

  it('returns a friendly error when a goal with the same name already exists', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaMock.savingsGoal.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' })
    );

    const result = await addSavingsGoal('user_1', { name: 'Laptop fund', targetAmount: 1500 });

    expect(result).toEqual({ success: false, error: 'You already have a savings goal named "Laptop fund"' });
  });
});

describe('logSavingsContribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs a contribution against an existing goal, resolved case-insensitively', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsContribution.create.mockResolvedValue({ id: 'contrib_1' } as never);

    const result = await logSavingsContribution('user_1', { goalName: 'laptop fund', amount: 50 });

    expect(result).toEqual({ success: true, id: 'contrib_1' });
    expect(prismaMock.savingsGoal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', name: { equals: 'laptop fund', mode: 'insensitive' } },
    });
    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });

  it('returns an error with no fallback when no goal matches the given name', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue(null);

    const result = await logSavingsContribution('user_1', { goalName: 'Nonexistent goal', amount: 50 });

    expect(result).toEqual({
      success: false,
      error: 'No savings goal named "Nonexistent goal" found — create it first.',
    });
    expect(prismaMock.savingsContribution.create).not.toHaveBeenCalled();
  });

  it('defaults the contribution date to now when none is given', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsContribution.create.mockResolvedValue({ id: 'contrib_1' } as never);

    await logSavingsContribution('user_1', { goalName: 'Laptop fund', amount: 50 });

    expect(prismaMock.savingsContribution.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ date: expect.any(Date) }) })
    );
  });
});

describe('deleteSavingsGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a goal owned by the user', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsGoal.delete.mockResolvedValue({ id: 'goal_1' } as never);

    const result = await deleteSavingsGoal('user_1', 'Laptop fund');

    expect(result).toEqual({ success: true });
    expect(prismaMock.savingsGoal.delete).toHaveBeenCalledWith({ where: { id: 'goal_1' } });
  });

  it('returns an error when no goal matches', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue(null);

    const result = await deleteSavingsGoal('user_1', 'Nonexistent');

    expect(result).toEqual({ success: false, error: 'No savings goal named "Nonexistent" found' });
    expect(prismaMock.savingsGoal.delete).not.toHaveBeenCalled();
  });
});
