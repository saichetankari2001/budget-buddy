import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z')); // safely between Oct 1 and Oct 15
    try {
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
    } finally {
      vi.useRealTimers();
    }
  });

  it('lazily completes a past-due cycle and returns null instead of stale forecast data', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T00:00:00.000Z')); // after Oct 15 end date
    try {
      prismaMock.moneyCycle.findFirst.mockResolvedValue({
        id: 'cycle_2',
        userId: 'user_1',
        startingAmount: { toString: () => '300.00' } as never,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-15T00:00:00.000Z'), // already in the past relative to Oct 20
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never);
      prismaMock.moneyCycle.update.mockResolvedValue({} as never);

      const res = await GET();

      expect(await res.json()).toBeNull();
      expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith({
        where: { id: 'cycle_2' },
        data: { status: 'COMPLETED' },
      });
      // Ensure we never call projectCycle or computeRollingForecast on a stale cycle
      expect(prismaMock.expense.aggregate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
