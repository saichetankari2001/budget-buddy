import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/realtime/publish', () => ({ publishCycleUpdate: vi.fn().mockResolvedValue(undefined) }));

import { getCurrentUser } from '@/lib/auth/session';
import { DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('DELETE /api/savings-goals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost/api/savings-goals/goal_1', { method: 'DELETE' }), { params: { id: 'goal_1' } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when no goal with that id is owned by this user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.savingsGoal.findFirst.mockResolvedValue(null);

    const res = await DELETE(new NextRequest('http://localhost/api/savings-goals/goal_1', { method: 'DELETE' }), { params: { id: 'goal_1' } });

    expect(res.status).toBe(404);
    expect(prismaMock.savingsGoal.delete).not.toHaveBeenCalled();
  });

  it('deletes the goal directly via Prisma, scoped by id AND userId (not via the name-based deleteSavingsGoal action)', async () => {
    // This route intentionally does NOT call deleteSavingsGoal (Task 3) -- that action resolves a
    // goal by NAME, matching the chat tool's own lookup convention, since chat only ever has a name
    // from the conversation. This REST route gets a real id from its own URL, so it looks the goal
    // up by id+userId directly (ownership check) and deletes by id -- a deliberate divergence, not
    // an inconsistency to unify.
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsGoal.delete.mockResolvedValue({ id: 'goal_1' } as never);

    const res = await DELETE(new NextRequest('http://localhost/api/savings-goals/goal_1', { method: 'DELETE' }), { params: { id: 'goal_1' } });

    expect(res.status).toBe(204);
    expect(prismaMock.savingsGoal.findFirst).toHaveBeenCalledWith({ where: { id: 'goal_1', userId: 'user_1' } });
    expect(prismaMock.savingsGoal.delete).toHaveBeenCalledWith({ where: { id: 'goal_1' } });
  });
});
