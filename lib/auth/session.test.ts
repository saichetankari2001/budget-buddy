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
});
