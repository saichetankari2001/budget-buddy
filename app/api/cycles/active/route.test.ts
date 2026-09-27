import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/cycles/active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z')); // safely between the fixtures' Sep 10 startDate and Sep 20 endDate
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(401);
  });

  it('returns null when the user has no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('computes remainingAmount/daysRemaining/safeToSpend for an active, non-past-due cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
      messages: [
        { id: 'msg_2', kind: 'CHECK_IN', content: 'Still on track.', createdAt: new Date('2026-09-11') },
        { id: 'msg_1', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date('2026-09-10') },
      ],
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]); // no recurring templates
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '100.00' } } } as never);
    prismaMock.bill.findMany.mockResolvedValue([]); // no bills
    prismaMock.incomeSource.findMany.mockResolvedValue([]); // no fixed income sources
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('cycle_1');
    expect(json.startingAmount).toBe(500);
    expect(json.remainingAmount).toBe(400); // 500 - 100 spent + 0 income entries
    expect(json.daysRemaining).toBe(5); // Sep 15 -> Sep 20
    // No income/bill events fall inside the window at all, so the projection never dips below
    // the current balance — computeCashFlowProjection's documented behavior in that case is to
    // treat the (unchanging) current balance itself as safe to spend, rather than smearing it
    // across the remaining days as a flat average.
    expect(json.safeToSpend).toBe(400);
    expect(json.projection).toBeInstanceOf(Array);
    expect(json.messages).toHaveLength(2);
    expect(prismaMock.moneyCycle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', status: 'ACTIVE' },
        include: { messages: { orderBy: { createdAt: 'desc' } } },
      })
    );
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
  });

  it('lazily completes a past-due cycle and returns null instead of stale data', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_2',
      userId: 'user_1',
      startingAmount: { toString: () => '300.00' } as never,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-05T00:00:00.000Z'), // already in the past relative to Sep 15
      status: 'ACTIVE',
      createdAt: new Date(),
      messages: [],
    } as never);
    prismaMock.moneyCycle.update.mockResolvedValue({} as never);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle_2' },
      data: { status: 'COMPLETED' },
    });
    expect(prismaMock.expense.aggregate).not.toHaveBeenCalled();
  });

  it('includes a day-by-day projection and derives safeToSpend from it, not the flat average', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z')); // pinned so the hardcoded cycle/bill/income
    // dates below stay within the projection window regardless of the real calendar date this test
    // runs on — matches this file's and Spec 3's established fake-timer convention. Remember to
    // restore real timers (vi.useRealTimers()) in this test's own cleanup or the file's existing
    // afterEach if one already exists — check the file's current structure before adding a new one.
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '100.00' } as never,
      startDate: new Date('2026-09-24T00:00:00.000Z'), endDate: new Date('2026-10-05T00:00:00.000Z'),
      status: 'ACTIVE', messages: [],
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]); // no legacy recurring-expense obligations
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      { id: 'inc_1', userId: 'user_1', type: 'FIXED', amount: { toString: () => '400.00' } as never, recurrenceInterval: null, startDate: new Date('2026-09-29T00:00:00.000Z'), name: 'Job' },
    ] as never);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', amount: { toString: () => '735.00' } as never, dueDate: new Date('2026-09-30T00:00:00.000Z'), recurrenceInterval: null, name: 'Rent + Subscription' },
    ] as never);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projection).toBeInstanceOf(Array);
    expect(json.projection.length).toBeGreaterThan(0);
    // The motivating scenario: rent lands before the job's one-off start-date income is modeled
    // here as a non-recurring FIXED source with no recurrenceInterval, contributing on startDate only —
    // confirm safeToSpend reflects the real dip, not (100+400-735)/daysRemaining as a flat average.
    expect(json.safeToSpend).toBe(0); // shortfall case: minFutureBalance goes negative
  });
});
