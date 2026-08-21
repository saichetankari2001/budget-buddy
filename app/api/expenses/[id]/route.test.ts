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

    expect(res.status).toBe(200);
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
      data: { description: 'Updated' },
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
