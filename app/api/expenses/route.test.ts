import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { GET, POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/expenses', () => {
  it('lists expenses for the current user with no filters', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost/api/expenses'));
    expect(res.status).toBe(200);
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });

  it('converts amount to a number in the response body', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: 'exp_1',
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: { toString: () => '42.50' } as never,
        description: 'Groceries',
        date: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date(),
      } as never,
    ]);

    const res = await GET(new NextRequest('http://localhost/api/expenses'));
    const json = await res.json();

    expect(json[0].amount).toBe(42.5);
  });

  it('applies categoryId and date range filters from the query string', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const url =
      'http://localhost/api/expenses?categoryId=cat_1&from=2026-08-01T00:00:00.000Z&to=2026-08-31T00:00:00.000Z';
    await GET(new NextRequest(url));

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user_1',
          categoryId: 'cat_1',
          date: { gte: new Date('2026-08-01T00:00:00.000Z'), lte: new Date('2026-08-31T00:00:00.000Z') },
        },
      })
    );
  });
});

describe('POST /api/expenses', () => {
  it('creates an expense for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findFirst.mockResolvedValue({
      id: 'cat_1',
      userId: 'user_1',
      name: 'Food',
      color: '#f97316',
      createdAt: new Date(),
    });
    prismaMock.expense.create.mockResolvedValue({
      id: 'exp_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: { toString: () => '42.50' } as never,
      description: 'Groceries',
      date: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date(),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          amount: 42.5,
          description: 'Groceries',
          categoryId: 'cat_1',
          date: '2026-08-01T00:00:00.000Z',
        }),
      })
    );

    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.amount).toBe(42.5);
    expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat_1', userId: 'user_1' },
    });
    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: 42.5,
        description: 'Groceries',
        date: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
  });

  it('returns 404 when the category does not belong to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findFirst.mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          amount: 42.5,
          description: 'Groceries',
          categoryId: 'cat_other_user',
          date: '2026-08-01T00:00:00.000Z',
        }),
      })
    );

    expect(res.status).toBe(404);
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });
});
