// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('creates a user with default categories and sets a session cookie', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      passwordHash: 'hashed',
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'longenough' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 'user_1', email: 'a@example.com' });
    expect(res.cookies.get('token')?.value).toBeTruthy();
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'a@example.com',
          categories: { create: expect.arrayContaining([{ name: 'Food', color: '#f97316' }]) },
        }),
      })
    );
  });

  it('returns 409 when the email is already taken', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'existing',
      email: 'a@example.com',
      passwordHash: 'x',
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'longenough' }));

    expect(res.status).toBe(409);
  });

  it('returns 400 for an invalid payload', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', password: 'short' }));
    expect(res.status).toBe(400);
  });
});
