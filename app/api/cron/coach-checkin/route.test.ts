// app/api/cron/coach-checkin/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/ai/coach', () => ({ generateCheckInMessage: vi.fn() }));
vi.mock('@/lib/push/send', () => ({ sendPushNotification: vi.fn() }));

import { generateCheckInMessage } from '@/lib/ai/coach';
import { sendPushNotification } from '@/lib/push/send';
import { POST } from './route';

describe('POST /api/cron/coach-checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z')); // safely between the fixtures' Sep 10 startDate and Sep 20 endDate
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects requests without the correct secret', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('creates a check-in message and pushes it for every active cycle', async () => {
    process.env.CRON_SECRET = 'test-secret';
    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_1',
        userId: 'user_1',
        startingAmount: { toString: () => '500.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '100.00' } } } as never);
    vi.mocked(generateCheckInMessage).mockResolvedValue('Checking in!');
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_2',
      cycleId: 'cycle_1',
      kind: 'CHECK_IN',
      content: 'Checking in!',
      createdAt: new Date(),
    } as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example.com/a', p256dh: 'k1', auth: 'k2', createdAt: new Date() },
    ]);

    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleId: 'cycle_1', kind: 'CHECK_IN' }) })
    );
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('completes past-due cycles instead of checking them in', async () => {
    process.env.CRON_SECRET = 'test-secret';
    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_2',
        userId: 'user_2',
        startingAmount: { toString: () => '300.00' } as never,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-05T00:00:00.000Z'), // already in the past
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);
    prismaMock.moneyCycle.update.mockResolvedValue({} as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      })
    );

    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle_2' },
      data: { status: 'COMPLETED' },
    });
    expect(generateCheckInMessage).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.completed).toBe(1);
    expect(body.processed).toBe(0);
    expect(body.failed).toBe(0);
  });

  it('isolates one cycle failing mid-processing so the other cycle in the batch still gets checked in', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_fail',
        userId: 'user_fail',
        startingAmount: { toString: () => '200.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
      {
        id: 'cycle_ok',
        userId: 'user_ok',
        startingAmount: { toString: () => '500.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);

    prismaMock.expense.findMany.mockResolvedValue([]);

    // The first cycle's aggregate call blows up with an unexpected error;
    // the second cycle's aggregate call resolves normally.
    prismaMock.expense.aggregate.mockImplementation(((args: { where: { userId: string } }) => {
      if (args.where.userId === 'user_fail') {
        return Promise.reject(new Error('unexpected db failure'));
      }
      return Promise.resolve({ _sum: { amount: { toString: () => '100.00' } } });
    }) as never);

    vi.mocked(generateCheckInMessage).mockResolvedValue('Checking in!');
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_ok',
      cycleId: 'cycle_ok',
      kind: 'CHECK_IN',
      content: 'Checking in!',
      createdAt: new Date(),
    } as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_ok', userId: 'user_ok', endpoint: 'https://push.example.com/b', p256dh: 'k1', auth: 'k2', createdAt: new Date() },
    ]);

    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(1);

    // The failing cycle never got a message or push.
    expect(prismaMock.coachMessage.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleId: 'cycle_fail' }) })
    );
    // The other cycle in the same batch still got fully processed.
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleId: 'cycle_ok', kind: 'CHECK_IN' }) })
    );
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('isolates one push subscription failing so the cycle still notifies its other subscriptions', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_3',
        userId: 'user_3',
        startingAmount: { toString: () => '500.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '100.00' } } } as never);
    vi.mocked(generateCheckInMessage).mockResolvedValue('Checking in!');
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_3',
      cycleId: 'cycle_3',
      kind: 'CHECK_IN',
      content: 'Checking in!',
      createdAt: new Date(),
    } as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_bad', userId: 'user_3', endpoint: 'https://push.example.com/bad', p256dh: 'k1', auth: 'k2', createdAt: new Date() },
      { id: 'sub_good', userId: 'user_3', endpoint: 'https://push.example.com/good', p256dh: 'k1', auth: 'k2', createdAt: new Date() },
    ]);
    vi.mocked(sendPushNotification).mockImplementation(async (subscription) => {
      if (subscription.id === 'sub_bad') {
        throw new Error('unexpected push failure');
      }
    });

    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);
    expect(sendPushNotification).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
