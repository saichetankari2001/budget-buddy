import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/ai/chat', () => ({ generateChatReply: vi.fn() }));
vi.mock('@/lib/moneyCycle/actions', () => ({ updateCycleAmount: vi.fn(), cancelCycle: vi.fn() }));
vi.mock('@/lib/income/actions', () => ({ addIncomeSource: vi.fn(), logIncomeEntry: vi.fn() }));
vi.mock('@/lib/bills/actions', () => ({ addBill: vi.fn(), markBillPaid: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { generateChatReply } from '@/lib/ai/chat';
import { addIncomeSource, logIncomeEntry } from '@/lib/income/actions';
import { addBill, markBillPaid } from '@/lib/bills/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/cycles/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the user message, generates a reply, and saves the reply', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Done — updated to $700.');

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'change it to 700' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply).toBe('Done — updated to $700.');
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'USER', content: 'change it to 700' }) })
    );
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'CHAT', content: 'Done — updated to $700.' }) })
    );
  });

  it('excludes the just-saved user message from the history passed to generateChatReply', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.create
      .mockResolvedValueOnce({
        id: 'msg_new',
        cycleId: 'cycle_1',
        kind: 'USER',
        content: 'change it to 700',
        createdAt: new Date(),
      } as never)
      .mockResolvedValueOnce({} as never);
    // Simulate the DB correctly filtering out msg_new (the where clause under test) —
    // only an older, unrelated message comes back as history.
    prismaMock.coachMessage.findMany.mockResolvedValue([
      { id: 'msg_prior', cycleId: 'cycle_1', kind: 'CHAT', content: 'Hi there', createdAt: new Date() },
    ] as never);
    vi.mocked(generateChatReply).mockResolvedValue('Sure thing.');

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'change it to 700' }),
      })
    );

    expect(res.status).toBe(200);
    // The findMany query must exclude the row it just created.
    expect(prismaMock.coachMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cycleId: 'cycle_1', id: { not: 'msg_new' } }) })
    );
    // And the history handed to generateChatReply must not contain the current turn a second time.
    const historyArg = vi.mocked(generateChatReply).mock.calls[0][1];
    expect(historyArg).not.toContainEqual({ role: 'user', content: 'change it to 700' });
    expect(historyArg).toEqual([{ role: 'model', content: 'Hi there' }]);
  });

  it('binds the addIncomeSource handler to user.userId and converts startDate to a Date', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Added your new income source.');
    vi.mocked(addIncomeSource).mockResolvedValue({ success: true } as never);

    await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'I have a new casual job' }),
      })
    );

    const handlers = vi.mocked(generateChatReply).mock.calls[0][2];
    await handlers.addIncomeSource({
      name: 'Casual job',
      type: 'FIXED',
      amount: 30,
      recurrenceInterval: 'WEEKLY',
      startDate: '2026-10-05T00:00:00.000Z',
    });

    expect(addIncomeSource).toHaveBeenCalledWith('user_1', {
      name: 'Casual job',
      type: 'FIXED',
      amount: 30,
      recurrenceInterval: 'WEEKLY',
      startDate: new Date('2026-10-05T00:00:00.000Z'),
    });
  });

  it('binds the logIncome handler to user.userId via logIncomeEntry', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Logged $50 from Uber.');
    vi.mocked(logIncomeEntry).mockResolvedValue({ success: true } as never);

    await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'I got $50 from Uber' }),
      })
    );

    const handlers = vi.mocked(generateChatReply).mock.calls[0][2];
    await handlers.logIncome({ sourceName: 'Uber', amount: 50 });

    expect(logIncomeEntry).toHaveBeenCalledWith('user_1', { sourceName: 'Uber', amount: 50 });
  });

  it('binds the addBill handler to user.userId and converts dueDate to a Date', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Added your $30 phone bill.');
    vi.mocked(addBill).mockResolvedValue({ success: true } as never);

    await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'add a phone bill, $30, due Oct 2' }),
      })
    );

    const handlers = vi.mocked(generateChatReply).mock.calls[0][2];
    await handlers.addBill({ name: 'Phone', amount: 30, dueDate: '2026-10-02T00:00:00.000Z' });

    expect(addBill).toHaveBeenCalledWith('user_1', {
      name: 'Phone',
      amount: 30,
      dueDate: new Date('2026-10-02T00:00:00.000Z'),
    });
  });

  it('binds the markBillPaid handler to user.userId', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Marked the phone bill as paid.');
    vi.mocked(markBillPaid).mockResolvedValue({ success: true } as never);

    await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'I paid the phone bill' }),
      })
    );

    const handlers = vi.mocked(generateChatReply).mock.calls[0][2];
    await handlers.markBillPaid('Phone');

    expect(markBillPaid).toHaveBeenCalledWith('user_1', 'Phone');
  });

  it('returns 400 when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
      })
    );

    expect(res.status).toBe(400);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
      })
    );

    expect(res.status).toBe(401);
  });
});
