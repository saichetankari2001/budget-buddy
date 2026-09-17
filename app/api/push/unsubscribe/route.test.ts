// app/api/push/unsubscribe/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/push/unsubscribe', () => {
  it('deletes the subscription matching the given endpoint', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      new NextRequest('http://localhost/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com/abc' }),
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example.com/abc', userId: 'user_1' },
    });
  });
});
