import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { PATCH, DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('PATCH /api/expenses/[id]', () => {
  it('updates an expense scoped to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.expense.findFirst.mockResolvedValue({
      id: 'exp_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: { toString: () => '10.00' } as never,
      description: 'Updated',
      date: new Date(),
      createdAt: new Date(),
    });

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Updated' }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.amount).toBe(10);
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
      data: { description: 'Updated' },
    });
    expect(prismaMock.expense.findFirst).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
    });
  });

  it("returns 404 when the expense doesn't belong to the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.updateMany.mockResolvedValue({ count: 0 });

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Updated' }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(404);
  });

  it('returns 404 when the submitted categoryId does not belong to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findFirst.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      body: JSON.stringify({ categoryId: 'cat_other_user' }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(404);
    expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat_other_user', userId: 'user_1' },
    });
    expect(prismaMock.expense.updateMany).not.toHaveBeenCalled();
  });

  it('updates isRecurring and recurrenceInterval via a partial update', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.expense.findFirst.mockResolvedValue({
      id: 'exp_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: { toString: () => '15.00' } as never,
      description: 'Netflix',
      date: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date(),
      isRecurring: true,
      recurrenceInterval: 'YEARLY',
      recurringSourceId: null,
    } as never);

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      body: JSON.stringify({ isRecurring: true, recurrenceInterval: 'YEARLY' }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(200);
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
      data: { isRecurring: true, recurrenceInterval: 'YEARLY' },
    });
  });

  it('clears recurrenceInterval when isRecurring is turned off without an explicit recurrenceInterval in the body', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.expense.findFirst.mockResolvedValue({
      id: 'exp_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: { toString: () => '15.00' } as never,
      description: 'Netflix',
      date: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date(),
      isRecurring: false,
      recurrenceInterval: null,
      recurringSourceId: null,
    } as never);

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      // Simulates the UI unchecking "Repeat": recurrenceInterval is undefined
      // and dropped by JSON.stringify, so it never appears in the body.
      body: JSON.stringify({ isRecurring: false }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(200);
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
      data: { isRecurring: false, recurrenceInterval: null },
    });
  });
});

describe('DELETE /api/expenses/[id]', () => {
  it('deletes an expense scoped to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.deleteMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/expenses/exp_1', { method: 'DELETE' });
    const res = await DELETE(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(204);
    expect(prismaMock.expense.deleteMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
    });
  });
});
