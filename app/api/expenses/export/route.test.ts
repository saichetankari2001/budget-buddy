import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

vi.mock('@/lib/auth/session');

const mockUser = { userId: 'user_1', email: 'test@example.com' };

describe('GET /api/expenses/export', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns a CSV file with the correct headers and content', async () => {
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
        isRecurring: false,
        recurrenceInterval: null,
        recurringSourceId: null,
        category: { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
      },
    ] as never);

    const res = await GET();
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="expenses.csv"');
    expect(text).toBe('date,description,category,amount\n2026-08-01,Groceries,Food,42.50');
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      include: { category: true },
      orderBy: { date: 'asc' },
    });
  });
});
