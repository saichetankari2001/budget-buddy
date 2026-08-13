// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { signToken, verifyToken } from './jwt';

describe('JWT sign/verify', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('signs a payload and verifies it back', async () => {
    const token = await signToken({ userId: 'user_123', email: 'a@example.com' });
    const payload = await verifyToken(token);
    expect(payload).toMatchObject({ userId: 'user_123', email: 'a@example.com' });
  });

  it('returns null for a garbage token', async () => {
    expect(await verifyToken('not-a-real-token')).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signToken({ userId: 'user_123', email: 'a@example.com' });
    process.env.JWT_SECRET = 'a-completely-different-secret-value-here';
    expect(await verifyToken(token)).toBeNull();
  });
});
