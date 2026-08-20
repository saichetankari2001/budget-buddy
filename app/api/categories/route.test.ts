import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { GET, POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/categories', () => {
  it("returns the current user's categories", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe('POST /api/categories', () => {
  it('creates a category for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.create.mockResolvedValue({
      id: 'cat_2',
      userId: 'user_1',
      name: 'Travel',
      color: '#1a2b3c',
      createdAt: new Date(),
    });

    const res = await POST(makePostRequest({ name: 'Travel', color: '#1a2b3c' }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for an invalid payload', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    const res = await POST(makePostRequest({ name: '', color: 'not-a-color' }));
    expect(res.status).toBe(400);
  });
});
