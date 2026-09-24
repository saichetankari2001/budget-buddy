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
    process.env.CRON_SECRET = 'test-secret';
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

  it('skips a cycle whose last check-in was recent (idempotency guard)', async () => {
    process.env.CRON_SECRET = 'test-secret';
    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_recent',
        userId: 'user_recent',
        startingAmount: { toString: () => '500.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);
    // "now" is 2026-09-15T00:00:00.000Z; last message was 1 hour ago — well within the 20h guard.
    prismaMock.coachMessage.findFirst.mockResolvedValue({
      id: 'msg_recent',
      cycleId: 'cycle_recent',
      kind: 'CHECK_IN',
      content: 'Checking in!',
      createdAt: new Date('2026-09-14T23:00:00.000Z'),
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.completed).toBe(0);
    expect(body.failed).toBe(0);
    expect(generateCheckInMessage).not.toHaveBeenCalled();
    expect(prismaMock.coachMessage.create).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('still processes a cycle whose last check-in was 25 hours ago', async () => {
    process.env.CRON_SECRET = 'test-secret';
    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_stale',
        userId: 'user_stale',
        startingAmount: { toString: () => '500.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);
    // "now" is 2026-09-15T00:00:00.000Z; last message was 25 hours ago — outside the 20h guard.
    prismaMock.coachMessage.findFirst.mockResolvedValue({
      id: 'msg_stale',
      cycleId: 'cycle_stale',
      kind: 'CHECK_IN',
      content: 'Checking in yesterday!',
      createdAt: new Date('2026-09-13T23:00:00.000Z'),
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '100.00' } } } as never);
    vi.mocked(generateCheckInMessage).mockResolvedValue('Checking in!');
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_new',
      cycleId: 'cycle_stale',
      kind: 'CHECK_IN',
      content: 'Checking in!',
      createdAt: new Date(),
    } as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_stale', userId: 'user_stale', endpoint: 'https://push.example.com/c', p256dh: 'k1', auth: 'k2', createdAt: new Date() },
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
    expect(body.failed).toBe(0);
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleId: 'cycle_stale', kind: 'CHECK_IN' }) })
    );
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('still checks in a cycle whose most recent message is a fresh USER/CHAT-kind chat turn (only PLAN/CHECK_IN count toward the cooldown)', async () => {
    process.env.CRON_SECRET = 'test-secret';
    prismaMock.moneyCycle.findMany.mockResolvedValue([
      {
        id: 'cycle_chat',
        userId: 'user_chat',
        startingAmount: { toString: () => '500.00' } as never,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        endDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date(),
      } as never,
    ]);
    // The query itself is mocked to reflect the fixed `kind: { in: ['PLAN', 'CHECK_IN'] } }` filter:
    // a USER/CHAT message from 5 minutes ago exists in the DB but must not satisfy this lookup,
    // so it correctly resolves to null (no PLAN/CHECK_IN message exists yet for this cycle).
    prismaMock.coachMessage.findFirst.mockImplementation(((args: { where: { kind?: { in?: string[] } } }) => {
      if (args.where.kind?.in?.includes('PLAN') && args.where.kind?.in?.includes('CHECK_IN')) {
        return Promise.resolve(null);
      }
      // A lookup without the kind filter (the pre-fix behavior) would have found the fresh chat message.
      return Promise.resolve({
        id: 'msg_chat',
        cycleId: 'cycle_chat',
        kind: 'CHAT',
        content: 'Sure thing!',
        createdAt: new Date('2026-09-14T23:55:00.000Z'), // 5 minutes before "now"
      });
    }) as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '100.00' } } } as never);
    vi.mocked(generateCheckInMessage).mockResolvedValue('Checking in!');
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_checkin',
      cycleId: 'cycle_chat',
      kind: 'CHECK_IN',
      content: 'Checking in!',
      createdAt: new Date(),
    } as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_chat', userId: 'user_chat', endpoint: 'https://push.example.com/chat', p256dh: 'k1', auth: 'k2', createdAt: new Date() },
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
    expect(body.failed).toBe(0);
    expect(prismaMock.coachMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ kind: { in: ['PLAN', 'CHECK_IN'] } }) })
    );
    expect(generateCheckInMessage).toHaveBeenCalled();
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleId: 'cycle_chat', kind: 'CHECK_IN' }) })
    );
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('rejects requests when CRON_SECRET is not configured instead of matching "Bearer undefined"', async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    const res = await POST(
      new NextRequest('http://localhost/api/cron/coach-checkin', {
        method: 'POST',
        headers: { authorization: 'Bearer undefined' },
      })
    );

    expect(res.status).toBe(500);
    process.env.CRON_SECRET = original;
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
