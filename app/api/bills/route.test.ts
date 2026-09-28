import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/bills/actions', () => ({ addBill: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { addBill } from '@/lib/bills/actions';
import { POST, GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/bills', () => {
  it('creates a bill', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addBill).mockResolvedValue({ success: true, id: 'bill_1' });

    const res = await POST(
      new NextRequest('http://localhost/api/bills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Rent', amount: 800, dueDate: '2026-09-30T00:00:00.000Z', recurrenceInterval: 'MONTHLY' }),
      })
    );

    expect(res.status).toBe(201);
    expect(addBill).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ name: 'Rent', amount: 800, recurrenceInterval: 'MONTHLY' })
    );
  });

  it('returns 400 on a duplicate name', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addBill).mockResolvedValue({ success: false, error: 'You already have a bill named "Rent"' });

    const res = await POST(
      new NextRequest('http://localhost/api/bills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Rent', amount: 800, dueDate: '2026-09-30T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/bills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Rent', amount: 800, dueDate: '2026-09-30T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /api/bills', () => {
  it("lists the caller's own bills", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800.00' } as never, dueDate: new Date(), recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: null, createdAt: new Date() },
    ] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(prismaMock.bill.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user_1' } }));
  });

  it('reports isPaidThisPeriod: false for a recurring bill whose dueDate has advanced into the future', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    // paidExpenseId is never cleared, so on its own it reports "paid" forever after the first
    // payment. Here the bill was paid last month and dueDate has already rolled to next month's
    // occurrence — which means it IS currently due, and the UI must offer "Mark paid" again.
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800.00' } as never,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday: due now
        recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: 'exp_last_month', createdAt: new Date(),
      },
      {
        id: 'bill_2', userId: 'user_1', name: 'Internet', amount: { toString: () => '70.00' } as never,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // a week away: settled for this period
        recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: 'exp_this_month', createdAt: new Date(),
      },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(json.find((b: { id: string }) => b.id === 'bill_1').isPaidThisPeriod).toBe(false);
    expect(json.find((b: { id: string }) => b.id === 'bill_2').isPaidThisPeriod).toBe(true);
  });
});
