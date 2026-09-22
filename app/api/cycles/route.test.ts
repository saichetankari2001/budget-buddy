import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/ai/coach', () => ({ generatePlanMessage: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { generatePlanMessage } from '@/lib/ai/coach';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/cycles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z')); // safely before the fixtures' Sep 20 endDate, within the schema's 400-day bound
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a cycle and its first PLAN message', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // no active cycle
    prismaMock.expense.findMany.mockResolvedValue([]); // no recurring templates
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
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
    expect(json.remainingAmount).toBe(500); // no recurring templates, so nothing committed yet
    expect(json.daysRemaining).toBe(5); // Sep 15 (fake "now") -> Sep 20
    expect(json.safeToSpend).toBe(100); // 500 / 5
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

  it('rejects with 400 when a concurrent request wins the race on the DB unique constraint', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null); // fast-path check sees no active cycle
    prismaMock.expense.findMany.mockResolvedValue([]);
    vi.mocked(generatePlanMessage).mockResolvedValue('Your plan is ready.');
    prismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`userId`)', {
        code: 'P2002',
        clientVersion: '5.19.1',
      })
    );

    const res = await POST(
      new NextRequest('http://localhost/api/cycles', {
        method: 'POST',
        body: JSON.stringify({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('You already have an active cycle. It will complete on its own at its end date.');
  });
});
