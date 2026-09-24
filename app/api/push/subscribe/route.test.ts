// app/api/push/subscribe/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/push/subscribe', () => {
  it('saves a new push subscription for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pushSubscription.create.mockResolvedValue({
      id: 'sub_1',
      userId: 'user_1',
      endpoint: 'https://push.example.com/abc',
      p256dh: 'key1',
      auth: 'key2',
      createdAt: new Date(),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'key1', auth: 'key2' } }),
      })
    );

    expect(res.status).toBe(201);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example.com/abc' },
    });
    expect(prismaMock.pushSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        endpoint: 'https://push.example.com/abc',
        p256dh: 'key1',
        auth: 'key2',
      }),
    });
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'key1', auth: 'key2' } }),
      })
    );

    expect(res.status).toBe(401);
  });
});
