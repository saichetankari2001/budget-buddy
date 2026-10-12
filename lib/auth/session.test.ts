// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import { signToken } from './jwt';
import { getCurrentUser } from './session';

describe('getCurrentUser', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('returns the payload for a valid cookie token', async () => {
    const token = await signToken({ userId: 'user_1', email: 'a@example.com' });
    vi.mocked(cookies).mockReturnValue({
      get: () => ({ value: token }),
    } as never);

    const user = await getCurrentUser();
    expect(user).toEqual({ userId: 'user_1', email: 'a@example.com' });
  });

  it('returns null when there is no cookie', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);

    expect(await getCurrentUser()).toBeNull();
  });

  it('falls back to the Authorization Bearer header when there is no cookie and a request is passed', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);
    const token = await signToken({ userId: 'user_2', email: 'b@example.com' });
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getCurrentUser(request);
    expect(user).toEqual({ userId: 'user_2', email: 'b@example.com' });
  });

  it('prefers the cookie over the Bearer header when both are present', async () => {
    const cookieToken = await signToken({ userId: 'cookie_user', email: 'cookie@example.com' });
    const headerToken = await signToken({ userId: 'header_user', email: 'header@example.com' });
    vi.mocked(cookies).mockReturnValue({
      get: () => ({ value: cookieToken }),
    } as never);
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: `Bearer ${headerToken}` },
    });

    const user = await getCurrentUser(request);
    expect(user).toEqual({ userId: 'cookie_user', email: 'cookie@example.com' });
  });

  it('returns null when there is no cookie and no request is passed at all (every existing call site)', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);

    expect(await getCurrentUser()).toBeNull();
  });

  it('returns null for a malformed Authorization header (no Bearer prefix)', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: 'not-a-bearer-token' },
    });

    expect(await getCurrentUser(request)).toBeNull();
  });

  it('returns null for a well-formed but invalid/expired Bearer token', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: 'Bearer this-is-not-a-real-jwt' },
    });

    expect(await getCurrentUser(request)).toBeNull();
  });
});
