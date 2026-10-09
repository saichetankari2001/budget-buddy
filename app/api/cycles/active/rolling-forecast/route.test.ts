import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/cycles/active/rolling-forecast', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns null when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET();
    expect(await res.json()).toBeNull();
  });

  it('returns a trajectory and headsUp list when there is an active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-10-01T00:00:00.000Z'), endDate: new Date('2026-10-15T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date('2026-10-01T00:00:00.000Z'),
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.trajectory).toBeInstanceOf(Array);
    expect(json.headsUp).toEqual([]);
  });
});
