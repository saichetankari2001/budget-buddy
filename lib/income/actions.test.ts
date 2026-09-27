import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { addIncomeSource, logIncomeEntry } from './actions';

describe('addIncomeSource', () => {
  it('creates a FIXED source with amount and recurrence', async () => {
    prismaMock.incomeSource.create.mockResolvedValue({ id: 'inc_1' } as never);

    const result = await addIncomeSource('user_1', {
      name: 'Casual job',
      type: 'FIXED',
      amount: 151.2,
      recurrenceInterval: 'WEEKLY',
      startDate: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result).toEqual({ success: true, id: 'inc_1' });
    expect(prismaMock.incomeSource.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Casual job',
        type: 'FIXED',
        amount: 151.2,
        recurrenceInterval: 'WEEKLY',
        startDate: new Date('2026-09-29T00:00:00.000Z'),
      },
    });
  });

  it('creates an IRREGULAR source with no amount/recurrence', async () => {
    prismaMock.incomeSource.create.mockResolvedValue({ id: 'inc_2' } as never);

    const result = await addIncomeSource('user_1', {
      name: 'Uber',
      type: 'IRREGULAR',
      startDate: new Date('2026-09-24T00:00:00.000Z'),
    });

    expect(result).toEqual({ success: true, id: 'inc_2' });
    expect(prismaMock.incomeSource.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Uber',
        type: 'IRREGULAR',
        amount: undefined,
        recurrenceInterval: undefined,
        startDate: new Date('2026-09-24T00:00:00.000Z'),
      },
    });
  });

  it('returns a failure result on a duplicate name for this user', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaMock.incomeSource.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '5.0.0' })
    );

    const result = await addIncomeSource('user_1', {
      name: 'Uber',
      type: 'IRREGULAR',
      startDate: new Date(),
    });

    expect(result).toEqual({ success: false, error: 'You already have an income source named "Uber"' });
  });
});

describe('logIncomeEntry', () => {
  it('logs an entry against an existing source by name', async () => {
    prismaMock.incomeSource.findFirst.mockResolvedValue({ id: 'inc_1', userId: 'user_1', name: 'Uber' } as never);
    prismaMock.incomeEntry.create.mockResolvedValue({ id: 'entry_1' } as never);

    const result = await logIncomeEntry('user_1', { sourceName: 'Uber', amount: 52 });

    expect(result.success).toBe(true);
    expect(prismaMock.incomeSource.findFirst).toHaveBeenCalledWith({ where: { userId: 'user_1', name: 'Uber' } });
    expect(prismaMock.incomeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ incomeSourceId: 'inc_1', amount: 52 }) })
    );
  });

  it('returns a failure result when no source with that name exists', async () => {
    prismaMock.incomeSource.findFirst.mockResolvedValue(null);

    const result = await logIncomeEntry('user_1', { sourceName: 'Nonexistent', amount: 52 });

    expect(result).toEqual({ success: false, error: 'No income source named "Nonexistent" found' });
    expect(prismaMock.incomeEntry.create).not.toHaveBeenCalled();
  });
});
