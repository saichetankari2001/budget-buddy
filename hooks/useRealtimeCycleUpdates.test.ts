import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const subscribeMock = vi.fn();
const channelsGetMock = vi.fn(() => ({ subscribe: subscribeMock }));
const authorizeMock = vi.fn();
const closeMock = vi.fn();

vi.mock('ably/promises', () => ({
  Realtime: vi.fn().mockImplementation(() => ({
    auth: { authorize: authorizeMock },
    channels: { get: channelsGetMock },
    close: closeMock,
  })),
}));

import * as Ably from 'ably/promises';
import { useRealtimeCycleUpdates } from './useRealtimeCycleUpdates';

describe('useRealtimeCycleUpdates', () => {
  it('authenticates via the token endpoint and subscribes to the granted channel', async () => {
    authorizeMock.mockResolvedValue({
      capability: JSON.stringify({ 'user:user-123:cycle-updates': ['subscribe'] }),
    });
    const onUpdate = vi.fn();

    renderHook(() => useRealtimeCycleUpdates(onUpdate));

    await waitFor(() => {
      expect(Ably.Realtime).toHaveBeenCalledWith({ authUrl: '/api/realtime/token' });
      expect(channelsGetMock).toHaveBeenCalledWith('user:user-123:cycle-updates');
    });

    expect(subscribeMock).toHaveBeenCalledWith('cycle-updated', expect.any(Function));
    const handler = subscribeMock.mock.calls[0][1];
    handler();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('closes the client on unmount', async () => {
    authorizeMock.mockResolvedValue({ capability: JSON.stringify({}) });
    const { unmount } = renderHook(() => useRealtimeCycleUpdates(() => {}));
    unmount();
    expect(closeMock).toHaveBeenCalled();
  });
});
