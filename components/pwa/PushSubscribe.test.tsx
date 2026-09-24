import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PushSubscribe } from './PushSubscribe';

// This component has no pre-existing test file/precedent to follow in this codebase; the
// mocking approach (defineProperty on navigator/window for serviceWorker/PushManager/Notification,
// plus a mocked global.fetch) mirrors how components/ui/Header.test.tsx exercises its
// fetch + navigator.serviceWorker logout flow.
function mockPushSupport({
  permission,
  subscription,
}: {
  permission: NotificationPermission;
  subscription: { endpoint: string; toJSON: () => unknown } | null;
}) {
  Object.defineProperty(window, 'Notification', {
    value: { permission },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
    },
    configurable: true,
  });
}

function clearPushSupport() {
  // @ts-expect-error test cleanup — these are not defined by default in jsdom
  delete window.Notification;
  // @ts-expect-error test cleanup
  delete window.PushManager;
  // @ts-expect-error test cleanup
  delete navigator.serviceWorker;
}

describe('PushSubscribe', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    clearPushSupport();
    vi.restoreAllMocks();
  });

  it('shows the enable button when permission has not been decided yet', async () => {
    mockPushSupport({ permission: 'default', subscription: null });

    render(<PushSubscribe />);

    expect(await screen.findByRole('button', { name: /notify me/i })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows a blocked message when permission is denied', async () => {
    mockPushSupport({ permission: 'denied', subscription: null });

    render(<PushSubscribe />);

    expect(await screen.findByText(/notifications blocked/i)).toBeInTheDocument();
  });

  it('renders nothing when push is unsupported', () => {
    clearPushSupport();

    const { container } = render(<PushSubscribe />);

    expect(container).toBeEmptyDOMElement();
  });

  it('self-heals to idle (shows the enable button) when permission is granted but there is no live browser subscription — e.g. after a logout that deleted the server-side row without revoking browser permission', async () => {
    mockPushSupport({ permission: 'granted', subscription: null });

    render(<PushSubscribe />);

    expect(await screen.findByRole('button', { name: /notify me/i })).toBeInTheDocument();
    // No live browser subscription to re-confirm, so no server call should happen.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-confirms a live browser subscription with the server and shows subscribed', async () => {
    const subscription = {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'k2' } }),
    };
    mockPushSupport({ permission: 'granted', subscription });
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);

    render(<PushSubscribe />);

    await waitFor(() => expect(screen.getByText(/you'll get a daily check-in notification/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'k2' } }),
      })
    );
  });

  it('falls back to idle when re-confirming the subscription with the server fails', async () => {
    const subscription = {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'k2' } }),
    };
    mockPushSupport({ permission: 'granted', subscription });
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);

    render(<PushSubscribe />);

    expect(await screen.findByRole('button', { name: /notify me/i })).toBeInTheDocument();
  });
});
