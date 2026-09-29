import { describe, it, expect, vi, beforeEach } from 'vitest';

const createTokenRequestMock = vi.fn();

vi.mock('ably', () => ({
  Rest: vi.fn().mockImplementation(() => ({
    auth: { createTokenRequest: createTokenRequestMock },
  })),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth/session';

describe('GET /api/realtime/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ABLY_API_KEY = 'test-key';
    createTokenRequestMock.mockResolvedValue({ keyName: 'test', mac: 'x' });
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("requests a token scoped only to the caller's own channel, resolved server-side", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-123', email: 'a@example.com' });
    await GET();
    expect(createTokenRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'user-123',
        capability: { 'user:user-123:cycle-updates': ['subscribe'] },
      })
    );
  });

  it("never grants capability on a channel other than the caller's own, even implicitly", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'attacker-999', email: 'b@example.com' });
    await GET();
    const call = createTokenRequestMock.mock.calls[0][0];
    expect(Object.keys(call.capability)).toEqual(['user:attacker-999:cycle-updates']);
  });
});
