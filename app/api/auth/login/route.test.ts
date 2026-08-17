// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { hashPassword } from '@/lib/auth/password';
import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    const passwordHash = await hashPassword('correct-password');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      passwordHash,
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'correct-password' }));

    expect(res.status).toBe(200);
    expect(res.cookies.get('token')?.value).toBeTruthy();
  });

  it('returns 401 for a wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      passwordHash,
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'wrong-password' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ email: 'nobody@example.com', password: 'whatever' }));
    expect(res.status).toBe(401);
  });
});
