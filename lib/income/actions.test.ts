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

  // The REST route Zod-parses before calling addIncomeSource, but the chat tool handler only does
  // loose typeof guards — so the same rules have to be enforced here for the chat path to be safe.
  it('rejects a FIXED source with no amount or recurrence, even when reached directly (the chat path)', async () => {
    const result = await addIncomeSource('user_1', {
      name: 'Casual job',
      type: 'FIXED',
      startDate: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result).toEqual({
      success: false,
      error: 'FIXED income sources require an amount and a recurrence interval',
    });
    // Otherwise this becomes a phantom "$0.00" income event in the projection and a
    // "Fixed · repeats " (trailing space) row in the cash-flow UI.
    expect(prismaMock.incomeSource.create).not.toHaveBeenCalled();
  });

  it('rejects a FIXED source whose amount and recurrence arrive as explicit nulls', async () => {
    const result = await addIncomeSource('user_1', {
      name: 'Casual job',
      type: 'FIXED',
      amount: null,
      recurrenceInterval: null,
      startDate: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result).toEqual({
      success: false,
      error: 'FIXED income sources require an amount and a recurrence interval',
    });
    expect(prismaMock.incomeSource.create).not.toHaveBeenCalled();
  });

  it('rejects a FIXED source with an amount but no recurrence interval', async () => {
    const result = await addIncomeSource('user_1', {
      name: 'Casual job',
      type: 'FIXED',
      amount: 151.2,
      startDate: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result.success).toBe(false);
    expect(prismaMock.incomeSource.create).not.toHaveBeenCalled();
  });

  it('rejects an unparseable start date (chat handlers construct Dates from free-form model text)', async () => {
    const result = await addIncomeSource('user_1', {
      name: 'Uber',
      type: 'IRREGULAR',
      startDate: new Date('sometime next week'), // Invalid Date — instanceof Date, but NaN time
    });

    expect(result).toEqual({ success: false, error: 'Invalid date' });
    expect(prismaMock.incomeSource.create).not.toHaveBeenCalled();
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
