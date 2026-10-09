import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/savingsGoals/actions', () => ({ addSavingsGoal: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { addSavingsGoal } from '@/lib/savingsGoals/actions';
import { GET, POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/savings-goals', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns goals with computed progress (sum of contributions / target), not a stored total', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.savingsGoal.findMany.mockResolvedValue([
      {
        id: 'goal_1', userId: 'user_1', name: 'Laptop fund', targetAmount: { toString: () => '1500.00' } as never,
        targetDate: new Date('2026-12-25T00:00:00.000Z'), createdAt: new Date(),
        contributions: [
          { id: 'c1', savingsGoalId: 'goal_1', amount: { toString: () => '50.00' } as never, date: new Date(), createdAt: new Date() },
          { id: 'c2', savingsGoalId: 'goal_1', amount: { toString: () => '30.00' } as never, date: new Date(), createdAt: new Date() },
        ],
      },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual([
      {
        id: 'goal_1', name: 'Laptop fund', targetAmount: 1500,
        targetDate: '2026-12-25T00:00:00.000Z', contributedAmount: 80,
      },
    ]);
  });
});

describe('POST /api/savings-goals', () => {
  it('creates a goal via the shared action', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addSavingsGoal).mockResolvedValue({ success: true, id: 'goal_1' } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals', {
        method: 'POST',
        body: JSON.stringify({ name: 'Laptop fund', targetAmount: 1500 }),
      })
    );

    expect(res.status).toBe(201);
    expect(addSavingsGoal).toHaveBeenCalledWith('user_1', expect.objectContaining({ name: 'Laptop fund', targetAmount: 1500 }));
  });

  it('returns 400 with the action error on failure', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addSavingsGoal).mockResolvedValue({ success: false, error: 'You already have a savings goal named "Laptop fund"' } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals', {
        method: 'POST',
        body: JSON.stringify({ name: 'Laptop fund', targetAmount: 1500 }),
      })
    );

    expect(res.status).toBe(400);
  });
});
