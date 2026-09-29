import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { addBill, markBillPaid } from './actions';

vi.mock('@/lib/realtime/publish', () => ({
  publishCycleUpdate: vi.fn().mockResolvedValue(undefined),
}));

describe('addBill', () => {
  it('creates a recurring bill', async () => {
    prismaMock.bill.create.mockResolvedValue({ id: 'bill_1' } as never);

    const result = await addBill('user_1', {
      name: 'Rent',
      amount: 800,
      dueDate: new Date('2026-09-30T00:00:00.000Z'),
      recurrenceInterval: 'MONTHLY',
    });

    expect(result).toEqual({ success: true, id: 'bill_1' });
    expect(prismaMock.bill.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Rent',
        amount: 800,
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        recurrenceInterval: 'MONTHLY',
        categoryId: undefined,
      },
    });
  });

  it('returns a failure result on a duplicate name for this user', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaMock.bill.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '5.0.0' })
    );

    const result = await addBill('user_1', { name: 'Rent', amount: 800, dueDate: new Date() });

    expect(result).toEqual({ success: false, error: 'You already have a bill named "Rent"' });
  });

  // The REST route Zod-parses before calling addBill, but the chat tool handler only does loose
  // typeof guards — so addBill has to enforce the rules itself for the chat path to be safe.
  it('rejects a non-positive amount even when reached directly (the chat path), without touching the DB', async () => {
    const result = await addBill('user_1', { name: 'Rent', amount: 0, dueDate: new Date('2026-09-30T00:00:00.000Z') });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeTruthy();
    expect(prismaMock.bill.create).not.toHaveBeenCalled();
  });

  it('rejects an unparseable due date (chat handlers construct Dates from free-form model text)', async () => {
    const result = await addBill('user_1', {
      name: 'Rent',
      amount: 800,
      dueDate: new Date('next tuesday'), // Invalid Date — instanceof Date, but NaN time
    });

    expect(result).toEqual({ success: false, error: 'Invalid date' });
    expect(prismaMock.bill.create).not.toHaveBeenCalled();
  });

  it('rejects a bogus recurrenceInterval the chat path would otherwise pass straight through', async () => {
    const result = await addBill('user_1', {
      name: 'Rent',
      amount: 800,
      dueDate: new Date('2026-09-30T00:00:00.000Z'),
      recurrenceInterval: 'FORTNIGHTLY' as never,
    });

    expect(result.success).toBe(false);
    expect(prismaMock.bill.create).not.toHaveBeenCalled();
  });

  it('rejects an empty name', async () => {
    const result = await addBill('user_1', { name: '', amount: 800, dueDate: new Date('2026-09-30T00:00:00.000Z') });

    expect(result.success).toBe(false);
    expect(prismaMock.bill.create).not.toHaveBeenCalled();
  });

  it('publishes a cycle-updated event after a successful create', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
    prismaMock.bill.create.mockResolvedValue({ id: 'bill_1' } as never);

    await addBill('user_1', { name: 'Rent', amount: 800, dueDate: new Date('2026-09-30T00:00:00.000Z') });

    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });
});

describe('markBillPaid', () => {
  // Local-time constructor (not a UTC ISO string) — matches the convention used throughout
  // lib/utils/recurringOccurrences.test.ts, since the underlying `advance` logic operates on
  // local-time Date getters (getMonth/getDate/etc).
  const now = new Date(2026, 8, 30); // Sept 30, 2026

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    // The Expense insert and the Bill advance now commit together, so the mock has to run the
    // callback (same convention as app/api/cycles/route.test.ts).
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a linked Expense and advances a recurring bill's due date", async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800' } as never,
      dueDate: now, recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: null,
    } as never);
    prismaMock.category.findFirst.mockResolvedValue(null);
    prismaMock.category.create.mockResolvedValue({ id: 'cat_bills' } as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_1' } as never);
    prismaMock.bill.update.mockResolvedValue({} as never);

    const result = await markBillPaid('user_1', 'Rent');

    expect(result).toEqual({ success: true, expenseId: 'exp_1' });
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1', amount: 800, categoryId: 'cat_bills' }) })
    );
    expect(prismaMock.bill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_1' },
        data: expect.objectContaining({ paidExpenseId: 'exp_1', dueDate: new Date(2026, 9, 30) }), // Oct 30, 2026
      })
    );
  });

  it('publishes a cycle-updated event after successfully marking a bill paid', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800' } as never,
      dueDate: now, recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: null,
    } as never);
    prismaMock.category.findFirst.mockResolvedValue(null);
    prismaMock.category.create.mockResolvedValue({ id: 'cat_bills' } as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_1' } as never);
    prismaMock.bill.update.mockResolvedValue({} as never);

    await markBillPaid('user_1', 'Rent');

    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });

  it('marks a one-time bill fully settled with no next due date advance beyond marking it paid', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_2', userId: 'user_1', name: 'Medical bill', amount: { toString: () => '150' } as never,
      dueDate: now, recurrenceInterval: null, categoryId: 'cat_existing', paidExpenseId: null,
    } as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_2' } as never);
    prismaMock.bill.update.mockResolvedValue({} as never);

    const result = await markBillPaid('user_1', 'Medical bill');

    expect(result).toEqual({ success: true, expenseId: 'exp_2' });
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat_existing' }) })
    );
  });

  it('commits the Expense insert and the Bill advance together, so a failed commit leaves neither behind', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800' } as never,
      dueDate: now, recurrenceInterval: 'MONTHLY', categoryId: 'cat_existing', paidExpenseId: null,
    } as never);
    prismaMock.$transaction.mockRejectedValue(new Error('commit failed'));

    // Without the transaction, a crash after expense.create would leave a committed Expense against
    // a Bill whose dueDate never advanced — and the retry, still seeing the bill as due, would
    // create a second, duplicate Expense.
    await expect(markBillPaid('user_1', 'Rent')).rejects.toThrow('commit failed');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.bill.update).not.toHaveBeenCalled();
  });

  it('rejects paying a bill that is not due yet (idempotency guard against double-payment)', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800' } as never,
      dueDate: new Date(2026, 9, 30), recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: 'exp_1', // Oct 30, 2026
    } as never);

    const result = await markBillPaid('user_1', 'Rent');

    expect(result).toEqual({ success: false, error: 'Rent is not due yet — it was already paid for this period' });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('returns a failure result when no bill with that name exists', async () => {
    prismaMock.bill.findFirst.mockResolvedValue(null);

    const result = await markBillPaid('user_1', 'Nonexistent');

    expect(result).toEqual({ success: false, error: 'No bill named "Nonexistent" found' });
  });

  it('rejects re-paying a one-time bill that was already paid (dueDate never advances for one-time bills, so paidExpenseId is the only signal)', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_2', userId: 'user_1', name: 'Medical bill', amount: { toString: () => '150' } as never,
      dueDate: now, recurrenceInterval: null, categoryId: 'cat_existing', paidExpenseId: 'exp_2',
    } as never);

    const result = await markBillPaid('user_1', 'Medical bill');

    expect(result).toEqual({ success: false, error: 'Medical bill is not due yet — it was already paid for this period' });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });
});
