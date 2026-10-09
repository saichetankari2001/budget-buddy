import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { computeRollingForecast } from './rollingForecast';

const userId = 'user_1';
const rawNow = new Date('2026-10-10T08:00:00.000Z'); // a Saturday; Sydney is UTC+11 in October (DST)

describe('computeRollingForecast', () => {
  it('projects 90 days forward from today regardless of the cycle end date', async () => {
    prismaMock.bill.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    // Cycle ends in just 5 days, but the forecast must still run the full 90.
    const cycleEndDate = new Date('2026-10-15T00:00:00.000Z');
    const result = await computeRollingForecast(userId, { remainingAmount: 100, cycleEndDate }, rawNow);

    expect(result.trajectory.length).toBe(91); // day 0 through day 90 inclusive
    expect(result.trajectory[0].balance).toBe(100);
    expect(result.trajectory[90].balance).toBe(100); // no events anywhere in the window
  });

  it('flags a one-time bill due after the cycle ends but inside the 90-day window as heads-up', async () => {
    const cycleEndDate = new Date('2026-10-20T00:00:00.000Z'); // 10 days out
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Car registration', amount: { toString: () => '450.00' } as never,
        dueDate: new Date('2026-11-15T00:00:00.000Z'), // 36 days out: after cycle end, inside window
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([
      { name: 'Car registration', amount: 450, dueDate: new Date('2026-11-15T00:00:00.000Z').toISOString() },
    ]);
    // And it also appears in the trajectory itself as a real event, not just the heads-up list.
    const dayOfBill = result.trajectory.find((d) => d.date === new Date('2026-11-15T00:00:00.000Z').toISOString());
    expect(dayOfBill?.events).toContainEqual({ label: 'Car registration', amount: -450 });
  });

  it('does NOT flag a one-time bill due before the cycle ends, even though it is also inside the window', async () => {
    const cycleEndDate = new Date('2026-10-30T00:00:00.000Z'); // 20 days out
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Phone', amount: { toString: () => '50.00' } as never,
        dueDate: new Date('2026-10-18T00:00:00.000Z'), // 8 days out: BEFORE cycle end
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
  });

  it('does NOT flag a one-time bill due exactly on the cycle end date (not "strictly after")', async () => {
    const cycleEndDate = new Date('2026-10-20T00:00:00.000Z');
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Rent', amount: { toString: () => '800.00' } as never,
        dueDate: new Date('2026-10-20T00:00:00.000Z'), // exactly the cycle end date
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
  });

  it('never flags a RECURRING bill, even one whose next occurrence falls after the cycle ends', async () => {
    const cycleEndDate = new Date('2026-10-15T00:00:00.000Z');
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Netflix', amount: { toString: () => '15.00' } as never,
        dueDate: new Date('2026-10-25T00:00:00.000Z'), recurrenceInterval: 'MONTHLY',
        categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
  });

  it('excludes a bill due beyond the 90-day window entirely', async () => {
    const cycleEndDate = new Date('2026-10-15T00:00:00.000Z');
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Far future bill', amount: { toString: () => '100.00' } as never,
        dueDate: new Date('2027-03-01T00:00:00.000Z'), // well beyond 90 days from Oct 10
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
    expect(result.trajectory.every((d) => d.events.length === 0)).toBe(true);
  });
});
