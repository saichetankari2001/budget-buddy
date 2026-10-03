import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    // @ts-expect-error test cleanup — not defined by default in jsdom
    delete navigator.serviceWorker;
  });

  it('renders nav links and a logout button', () => {
    render(<Header />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('calls the logout API and redirects to /login on click', async () => {
    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    );
    expect(pushMock).toHaveBeenCalledWith('/login');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('unsubscribes the browser push subscription before calling the logout endpoint, when a subscription exists', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://push.example.com/abc' }),
          },
        }),
      },
      configurable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/unsubscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com/abc' }),
      })
    );

    const unsubscribeCallIndex = fetchMock.mock.calls.findIndex(([url]) => url === '/api/push/unsubscribe');
    const logoutCallIndex = fetchMock.mock.calls.findIndex(([url]) => url === '/api/auth/logout');
    expect(unsubscribeCallIndex).toBeGreaterThanOrEqual(0);
    expect(unsubscribeCallIndex).toBeLessThan(logoutCallIndex);
  });

  it('highlights the nav link for the section currently most visible on screen', async () => {
    let observerCallback: IntersectionObserverCallback = () => {};
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    global.IntersectionObserver = vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
      observerCallback = callback;
      return { observe: observeMock, disconnect: disconnectMock };
    });

    document.body.innerHTML = '<div id="expenses"></div><div id="budgets"></div><div id="cashflow"></div>';

    render(<Header />);

    expect(observeMock).toHaveBeenCalledTimes(3);

    const expensesSection = document.getElementById('expenses')!;
    observerCallback(
      [{ target: expensesSection, intersectionRatio: 0.8 } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    await waitFor(() => {
      const expensesLink = screen.getByText('Expenses');
      expect(expensesLink.className).toContain('text-primary-hover');
    });
  });
});
