import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/ai/coach', () => ({ generatePlanMessage: vi.fn() }));
vi.mock('@/lib/realtime/publish', () => ({
  publishCycleUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { generatePlanMessage } from '@/lib/ai/coach';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/cycles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z')); // safely before the fixtures' Sep 20 endDate, within the schema's 400-day bound
    // The POST handler now derives its figures through the shared projectCycle, which also reads
    // Bill/IncomeSource/IncomeEntry rows — these are the "nothing else going on" defaults.
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.bill.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.expense.findMany.mockResolvedValue([]); // no all-time history by default
    prismaMock.cycleCategoryBudget.createMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a cycle and its first PLAN message', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // no active cycle
    prismaMock.expense.findMany.mockResolvedValue([]); // no recurring templates
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_1',
      cycleId: 'cycle_1',
      kind: 'PLAN',
      content: 'Your plan is ready.',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.startingAmount).toBe(500);
    expect(json.remainingAmount).toBe(500); // no recurring templates, so nothing committed yet
    expect(json.daysRemaining).toBe(5); // Sep 15 (fake "now") -> Sep 20
    expect(json.safeToSpend).toBe(100); // 500 / 5
    expect(json.messages[0].content).toBe('Your plan is ready.');
    expect(prismaMock.moneyCycle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1', startingAmount: 500 }) })
    );
  });

  it('publishes a cycle-updated event after successfully creating a cycle', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    prismaMock.expense.findMany.mockResolvedValue([]);
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_2',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_2', cycleId: 'cycle_2', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date(),
    } as never);

    await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });

  it("passes a real shortfallWarning into the plan message when a bill breaks the new cycle's budget", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    prismaMock.expense.findMany.mockResolvedValue([]);
    // $800 due inside a 5-day, $500 cycle — the plan message must not present this as a tidy budget.
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800.00' } as never,
        dueDate: new Date('2026-09-18T00:00:00.000Z'), recurrenceInterval: null, paidExpenseId: null,
      },
    ] as never);
    vi.mocked(generatePlanMessage).mockResolvedValue('Heads up.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-15T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_1', cycleId: 'cycle_1', kind: 'PLAN', content: 'Heads up.', createdAt: new Date(),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(201);
    // lastCall, not calls[0]: this file has no clearAllMocks between tests, so calls[0] belongs to
    // the earlier "creates a cycle" test.
    const planInput = vi.mocked(generatePlanMessage).mock.lastCall![0];
    expect(planInput.committedSpend).toBe(800); // the Bill is now visible here, not just to the dashboard
    expect(planInput.safeToSpend).toBe(0);
    expect(planInput.shortfallWarning).toBeTruthy();
    expect(planInput.shortfallWarning).toContain('short by');
    const json = await res.json();
    expect(json.safeToSpend).toBe(0);
  });

  it('rejects with 400 when the user already has an active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'existing_cycle',
      userId: 'user_1',
      startingAmount: { toString: () => '200.00' } as never,
      startDate: new Date(),
      endDate: new Date(),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
    expect(prismaMock.moneyCycle.create).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(401);
  });

  it('rejects with 400 when a concurrent request wins the race on the DB unique constraint', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // fast-path check sees no active cycle
    prismaMock.expense.findMany.mockResolvedValue([]);
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`userId`)', {
        code: 'P2002',
        clientVersion: '5.19.1',
      })
    );

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('You already have an active cycle. It will complete on its own at its end date.');
  });

  it('creates CycleCategoryBudget rows from all-time category history inside the same transaction', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: 'exp_1', userId: 'user_1', categoryId: 'cat_1',
        amount: { toString: () => '100.00' } as never, description: 'Groceries',
        date: new Date('2026-08-01T00:00:00.000Z'), createdAt: new Date(),
        category: { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', isGstFree: false, createdAt: new Date() },
      },
    ] as never);
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_1', cycleId: 'cycle_1', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date(),
    } as never);

    await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(prismaMock.cycleCategoryBudget.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ cycleId: 'cycle_1', categoryId: 'cat_1', categoryName: 'Food', recommendedAmount: 500 }),
      ],
    });
  });
});
