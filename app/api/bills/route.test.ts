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
});
