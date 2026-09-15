import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/cycles/active', () => {
  it('returns the active cycle with its messages, newest first', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
      messages: [
        { id: 'msg_2', cycleId: 'cycle_1', kind: 'CHECK_IN', content: 'Still on track.', createdAt: new Date('2026-09-11') },
        { id: 'msg_1', cycleId: 'cycle_1', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date('2026-09-10') },
      ],
    } as never);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.messages).toHaveLength(2);
    expect(prismaMock.moneyCycle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', status: 'ACTIVE' },
        include: { messages: { orderBy: { createdAt: 'desc' } } },
      })
    );
  });

  it('returns null when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/cycles/active'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toBeNull();
  });
});
