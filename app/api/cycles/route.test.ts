import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/ai/coach', () => ({ generatePlanMessage: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { generatePlanMessage } from '@/lib/ai/coach';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/cycles', () => {
  it('creates a cycle and its first PLAN message', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // no active cycle
    prismaMock.expense.findMany.mockResolvedValue([]); // no recurring templates
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.moneyCycle.create.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_1',
      cycleId: 'cycle_1',
      kind: 'PLAN',
      content: 'Your plan is ready.',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.startingAmount).toBe(500);
    expect(json.messages[0].content).toBe('Your plan is ready.');
    expect(prismaMock.moneyCycle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1', startingAmount: 500 }) })
    );
  });

  it('rejects with 400 when the user already has an active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'existing_cycle',
      userId: 'user_1',
      startingAmount: { toString: () => '200.00' } as never,
      startDate: new Date(),
      endDate: new Date(),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
    expect(prismaMock.moneyCycle.create).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(401);
  });
});
