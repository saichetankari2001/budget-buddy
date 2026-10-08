import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const refreshMock = vi.fn();
let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => mockPathname,
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    mockPathname = '/dashboard';
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    // @ts-expect-error test cleanup — not defined by default in jsdom
    delete navigator.serviceWorker;
  });

  it('renders nav links and a logout button', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/expenses');
    expect(screen.getByRole('link', { name: 'Budgets' })).toHaveAttribute('href', '/budgets');
    expect(screen.getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('href', '/cashflow');
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('highlights the link matching the current route', () => {
    mockPathname = '/expenses';
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Expenses' }).className).toContain('text-trust');
    expect(screen.getByRole('link', { name: 'Dashboard' }).className).not.toContain('text-trust');
  });

  it('highlights Dashboard when the pathname is exactly /dashboard', () => {
    mockPathname = '/dashboard';
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Dashboard' }).className).toContain('text-trust');
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
});
