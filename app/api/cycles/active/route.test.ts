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
    // the current balance. computeCashFlowProjection spreads that balance evenly across the full
    // remaining window in this case (not floored to a single day), matching the old flat-average
    // behavior: 400 / 5 = 80.
    expect(json.safeToSpend).toBe(80);
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
    // The motivating scenario: the job's one-off start-date income (modeled here as a non-recurring
    // FIXED source with no recurrenceInterval, contributing on startDate only) actually lands FIRST
    // on Sep 29, one day before rent is due on Sep 30 — but rent is large enough to still push the
    // balance negative afterwards. Confirm safeToSpend reflects the real dip, not
    // (100+400-735)/daysRemaining as a flat average.
    expect(json.safeToSpend).toBe(0); // shortfall case: minFutureBalance goes negative

    // Pin the exact trajectory shape: Sep 29's income lands first (balance rises to 500), then
    // Sep 30's rent pushes it to the real dip (-235). This locks in the signed-amount convention
    // (income positive, bills negative) and event-label plumbing that Task 8's UI will render.
    const sep29 = json.projection.find((d: { date: string }) => d.date === new Date('2026-09-29T00:00:00.000Z').toISOString());
    const sep30 = json.projection.find((d: { date: string }) => d.date === new Date('2026-09-30T00:00:00.000Z').toISOString());
    expect(sep29.balance).toBe(500); // 100 + 400
    expect(sep29.events).toContainEqual({ label: 'Job', amount: 400 });
    expect(sep30.balance).toBe(-235); // 500 - 735
    expect(sep30.events).toContainEqual({ label: 'Rent + Subscription', amount: -735 });
  });

  it('includes real logged IncomeEntry amounts in remainingAmount, not just startingAmount minus spending', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', messages: [],
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '100.00' } } } as never);
    prismaMock.bill.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    // A real Uber payment already logged this cycle — must be added on top of startingAmount,
    // not silently dropped.
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '52.00' } } } as never);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.remainingAmount).toBe(452); // 500 - 100 spent + 52 logged income
    expect(json.safeToSpend).toBe(452 / 5); // no other events in window, spread evenly over 5 days
  });

  it('feeds a legacy recurring Expense template into the projection as a negative event, not just a query', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', messages: [],
    } as never);
    // An old-style recurring Expense template (isRecurring: true), predating the Bill model —
    // must still show up as a real obligation in the projection, not be silently dropped now that
    // Bill exists as the new way to model recurring obligations.
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: 'exp_1', userId: 'user_1', amount: { toString: () => '50.00' } as never,
        description: 'Gym membership', date: new Date('2026-09-16T00:00:00.000Z'),
        recurrenceInterval: 'MONTHLY', isRecurring: true,
      },
    ] as never);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.bill.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

    expect(res.status).toBe(200);
    const json = await res.json();
    const sep16 = json.projection.find((d: { date: string }) => d.date === new Date('2026-09-16T00:00:00.000Z').toISOString());
    expect(sep16.events).toContainEqual({ label: 'Gym membership', amount: -50 });
    expect(sep16.balance).toBe(450); // 500 - 50
    // The dip on Sep 16 is the true minimum for the rest of the window (nothing else moves the
    // balance), so safeToSpend must reflect the post-gym balance, not the pre-gym 500.
    expect(json.safeToSpend).toBeLessThan(500);
  });
});
