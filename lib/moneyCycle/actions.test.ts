import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

import { updateCycleAmount, cancelCycle, createCycle } from './actions';

vi.mock('@/lib/realtime/publish', () => ({
  publishCycleUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/coach', () => ({ generatePlanMessage: vi.fn() }));

import { generatePlanMessage } from '@/lib/ai/coach';

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

  it('publishes a cycle-updated event after a successful update', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
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
    prismaMock.moneyCycle.update.mockResolvedValue({ id: 'cycle_1' } as never);

    await updateCycleAmount('user_1', 700);

    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
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

describe('createCycle', () => {
  const userId = 'user_1';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z')); // safely before the fixtures' Sep 20 endDate
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
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // no active cycle
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1',
      userId,
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

    const result = await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.startingAmount).toBe(500);
    expect(result.remainingAmount).toBe(500); // no recurring templates, so nothing committed yet
    expect(result.daysRemaining).toBe(5); // Sep 15 (fake "now") -> Sep 20
    expect(result.safeToSpend).toBe(100); // 500 / 5
    expect(result.message.content).toBe('Your plan is ready.');
    expect(prismaMock.moneyCycle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId, startingAmount: 500 }) })
    );
  });

  it('publishes a cycle-updated event after successfully creating a cycle', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_2',
      userId,
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_2', cycleId: 'cycle_2', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date(),
    } as never);

    await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(publishCycleUpdate).toHaveBeenCalledWith(userId);
  });

  it("passes a real shortfallWarning into the plan message when a bill breaks the new cycle's budget", async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    // $800 due inside a 5-day, $500 cycle — the plan message must not present this as a tidy budget.
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Rent', amount: { toString: () => '800.00' } as never,
        dueDate: new Date('2026-09-18T00:00:00.000Z'), recurrenceInterval: null, paidExpenseId: null,
      },
    ] as never);
    vi.mocked(generatePlanMessage).mockResolvedValue('Heads up.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1', userId, startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-15T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_1', cycleId: 'cycle_1', kind: 'PLAN', content: 'Heads up.', createdAt: new Date(),
    } as never);

    const result = await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(result.success).toBe(true);
    // lastCall, not calls[0]: this file has no clearAllMocks between tests, so calls[0] belongs to
    // an earlier test.
    const planInput = vi.mocked(generatePlanMessage).mock.lastCall![0];
    expect(planInput.committedSpend).toBe(800); // the Bill is now visible here, not just to the dashboard
    expect(planInput.safeToSpend).toBe(0);
    expect(planInput.shortfallWarning).toBeTruthy();
    expect(planInput.shortfallWarning).toContain('short by');
    if (!result.success) throw new Error('expected success');
    expect(result.safeToSpend).toBe(0);
  });

  it('returns success:false when the user already has an active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'existing_cycle',
      userId,
      startingAmount: { toString: () => '200.00' } as never,
      startDate: new Date(),
      endDate: new Date(),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);

    const result = await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(result).toEqual({ success: false, error: 'You already have an active cycle. It will complete on its own at its end date.' });
    expect(prismaMock.moneyCycle.create).not.toHaveBeenCalled();
  });

  it('returns success:false when a concurrent request wins the race on the DB unique constraint', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // fast-path check sees no active cycle
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`userId`)', {
        code: 'P2002',
        clientVersion: '5.19.1',
      })
    );

    const result = await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(result).toEqual({ success: false, error: 'You already have an active cycle. It will complete on its own at its end date.' });
  });

  it('creates CycleCategoryBudget rows from all-time category history inside the same transaction', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: 'exp_1', userId, categoryId: 'cat_1',
        amount: { toString: () => '100.00' } as never, description: 'Groceries',
        date: new Date('2026-08-01T00:00:00.000Z'), createdAt: new Date(),
        category: { id: 'cat_1', userId, name: 'Food', color: '#f97316', isGstFree: false, createdAt: new Date() },
      },
    ] as never);
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1', userId, startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_1', cycleId: 'cycle_1', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date(),
    } as never);

    await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(prismaMock.cycleCategoryBudget.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ cycleId: 'cycle_1', categoryId: 'cat_1', categoryName: 'Food', recommendedAmount: 500 }),
      ],
    });
  });

  it("creates an even-split recommendation across the user's existing categories when there is no expense history yet", async () => {
    // Regression test: every signup seeds 6 DEFAULT_CATEGORIES and there's no way to delete one, so
    // a brand-new user's very first cycle has real categories but zero expenses ever — this must hit
    // computeCategoryRecommendation's "zero spend, has categories" even-split branch (top 5 + Other),
    // not its "zero categories" branch (which returns [] and used to leave the dashboard's
    // SpendingBreakdownCard permanently stuck on "log a few expenses first").
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);
    prismaMock.expense.findMany.mockResolvedValue([]); // no expense history at all
    prismaMock.category.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: `cat_${i + 1}`,
        userId,
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
      id: 'cycle_zero_history', userId, startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-15T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_zero_history', cycleId: 'cycle_zero_history', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date(),
    } as never);

    const result = await createCycle(userId, { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(result.success).toBe(true);
    // pool = $500 (no committed spend) split evenly across all 6 categories: top 5 individually
    // tracked (83.33 each) + the 6th folded into "Other" (83.33) — a 2-cent rounding remainder
    // lands on the first entry (83.35), per computeCategoryRecommendation's own already-tested
    // distributeRoundingRemainder logic.
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
