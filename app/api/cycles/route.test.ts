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
    prismaMock.category.findMany.mockResolvedValue([]); // no categories by default — tests that need the zero-fill path set their own
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

  it('creates an even-split recommendation across the user\'s existing categories when there is no expense history yet', async () => {
    // Regression test: every signup seeds 6 DEFAULT_CATEGORIES and there's no way to delete one, so
    // a brand-new user's very first cycle has real categories but zero expenses ever — this must hit
    // computeCategoryRecommendation's "zero spend, has categories" even-split branch (top 5 + Other),
    // not its "zero categories" branch (which returns [] and used to leave the dashboard's
    // SpendingBreakdownCard permanently stuck on "log a few expenses first").
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    prismaMock.expense.findMany.mockResolvedValue([]); // no expense history at all
    prismaMock.category.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: `cat_${i + 1}`,
        userId: 'user_1',
        name: `Category ${i + 1}`,
        color: `#00000${i}`,
        isGstFree: false,
        createdAt: new Date(),
      })) as never
    );
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_zero_history', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-15T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_zero_history', cycleId: 'cycle_zero_history', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date(),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(201);
    // pool = $500 (no committed spend) split evenly across all 6 categories: top 5 individually
    // tracked (83.33 each) + the 6th folded into "Other" (83.33) — a 2-cent rounding remainder
    // lands on the first entry (83.35), per computeCategoryRecommendation's own already-tested
    // distributeRoundingRemainder logic (Task 2).
    expect(prismaMock.cycleCategoryBudget.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ cycleId: 'cycle_zero_history', categoryId: 'cat_1', categoryName: 'Category 1', recommendedAmount: 83.35 }),
        expect.objectContaining({ cycleId: 'cycle_zero_history', categoryId: 'cat_2', categoryName: 'Category 2', recommendedAmount: 83.33 }),
        expect.objectContaining({ cycleId: 'cycle_zero_history', categoryId: 'cat_3', categoryName: 'Category 3', recommendedAmount: 83.33 }),
        expect.objectContaining({ cycleId: 'cycle_zero_history', categoryId: 'cat_4', categoryName: 'Category 4', recommendedAmount: 83.33 }),
        expect.objectContaining({ cycleId: 'cycle_zero_history', categoryId: 'cat_5', categoryName: 'Category 5', recommendedAmount: 83.33 }),
        expect.objectContaining({ cycleId: 'cycle_zero_history', categoryId: null, categoryName: 'Other', recommendedAmount: 83.33 }),
      ],
    });
  });
});
