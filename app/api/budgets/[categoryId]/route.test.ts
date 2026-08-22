import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { PUT, DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makePutRequest(body: unknown) {
  return new NextRequest('http://localhost/api/budgets/cat_1', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

describe('PUT /api/budgets/[categoryId]', () => {
  it('upserts a budget for a category the user owns', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findFirst.mockResolvedValue({
      id: 'cat_1',
      userId: 'user_1',
      name: 'Food',
      color: '#f97316',
      createdAt: new Date(),
    });
    prismaMock.budget.upsert.mockResolvedValue({
      id: 'budget_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      monthlyLimit: { toString: () => '300.00' } as never,
      createdAt: new Date(),
    } as never);

    const res = await PUT(makePutRequest({ monthlyLimit: 300 }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.monthlyLimit).toBe(300);
    expect(prismaMock.budget.upsert).toHaveBeenCalledWith({
      where: { userId_categoryId: { userId: 'user_1', categoryId: 'cat_1' } },
      update: { monthlyLimit: 300 },
      create: { userId: 'user_1', categoryId: 'cat_1', monthlyLimit: 300 },
    });
  });

  it("returns 404 when the category doesn't belong to the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findFirst.mockResolvedValue(null);

    const res = await PUT(makePutRequest({ monthlyLimit: 300 }), { params: { categoryId: 'cat_foreign' } });

    expect(res.status).toBe(404);
    expect(prismaMock.budget.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-positive monthlyLimit', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const res = await PUT(makePutRequest({ monthlyLimit: 0 }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/budgets/[categoryId]', () => {
  it('deletes a budget scoped to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.budget.deleteMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/budgets/cat_1', { method: 'DELETE' });
    const res = await DELETE(req, { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(204);
    expect(prismaMock.budget.deleteMany).toHaveBeenCalledWith({
      where: { categoryId: 'cat_1', userId: 'user_1' },
    });
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/budgets/cat_1', { method: 'DELETE' });
    const res = await DELETE(req, { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(401);
    expect(prismaMock.budget.deleteMany).not.toHaveBeenCalled();
  });
});
