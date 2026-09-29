import { describe, it, expect, vi, beforeEach } from 'vitest';

const publishMock = vi.fn();
const channelsGetMock = vi.fn(() => ({ publish: publishMock }));

vi.mock('ably', () => ({
  Rest: vi.fn().mockImplementation(() => ({
    channels: { get: channelsGetMock },
  })),
}));

import { publishCycleUpdate, channelNameForUser } from './publish';

describe('channelNameForUser', () => {
  it('scopes the channel name to the given user id', () => {
    expect(channelNameForUser('user-123')).toBe('user:user-123:cycle-updates');
  });
});

describe('publishCycleUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ABLY_API_KEY = 'test-key';
    publishMock.mockResolvedValue(undefined);
  });

  it("publishes a cycle-updated event to the caller's own channel", async () => {
    await publishCycleUpdate('user-123');
    expect(channelsGetMock).toHaveBeenCalledWith('user:user-123:cycle-updates');
    expect(publishMock).toHaveBeenCalledWith('cycle-updated', {});
  });

  it('never throws when the underlying publish call fails', async () => {
    publishMock.mockRejectedValueOnce(new Error('Ably unreachable'));
    await expect(publishCycleUpdate('user-123')).resolves.toBeUndefined();
  });
});
