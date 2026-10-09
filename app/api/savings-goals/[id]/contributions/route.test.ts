import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/savingsGoals/actions', () => ({ logSavingsContribution: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { logSavingsContribution } from '@/lib/savingsGoals/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/savings-goals/[id]/contributions', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals/goal_1/contributions', { method: 'POST', body: JSON.stringify({ amount: 50, goalName: 'Laptop fund' }) }),
      { params: { id: 'goal_1' } }
    );
    expect(res.status).toBe(401);
  });

  it('logs a contribution via the shared action and returns 201', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(logSavingsContribution).mockResolvedValue({ success: true, id: 'contrib_1' } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals/goal_1/contributions', { method: 'POST', body: JSON.stringify({ amount: 50, goalName: 'Laptop fund' }) }),
      { params: { id: 'goal_1' } }
    );

    expect(res.status).toBe(201);
    expect(logSavingsContribution).toHaveBeenCalledWith('user_1', { goalName: 'Laptop fund', amount: 50 });
  });
});
