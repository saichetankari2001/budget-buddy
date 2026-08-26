import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { PATCH } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makePatchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/categories/cat_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/categories/[categoryId]', () => {
  it('updates isGstFree for a category the user owns', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.category.findFirst.mockResolvedValue({
      id: 'cat_1',
      userId: 'user_1',
      name: 'Groceries',
      color: '#f97316',
      isGstFree: true,
      createdAt: new Date(),
    } as never);

    const res = await PATCH(makePatchRequest({ isGstFree: true }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isGstFree).toBe(true);
    expect(prismaMock.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'cat_1', userId: 'user_1' },
      data: { isGstFree: true },
    });
  });

  it("returns 404 when the category doesn't belong to the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(makePatchRequest({ isGstFree: true }), { params: { categoryId: 'cat_foreign' } });

    expect(res.status).toBe(404);
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ isGstFree: true }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(401);
    expect(prismaMock.category.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid payload', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const res = await PATCH(makePatchRequest({ isGstFree: 'yes' }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(400);
  });
});
