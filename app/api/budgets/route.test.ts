import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/budgets', () => {
  it("returns the current user's budgets with category info", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.budget.findMany.mockResolvedValue([
      {
        id: 'budget_1',
        userId: 'user_1',
        categoryId: 'cat_1',
        monthlyLimit: { toString: () => '250.00' } as never,
        createdAt: new Date(),
        category: { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
      } as never,
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].monthlyLimit).toBe(250);
    expect(prismaMock.budget.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      include: { category: true },
    });
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
