import { describe, it, expect, vi, beforeEach, afterEach, test } from 'vitest';
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

  const ROUTES = [
    { pathname: '/dashboard', label: 'Dashboard' },
    { pathname: '/expenses', label: 'Expenses' },
    { pathname: '/budgets', label: 'Budgets' },
    { pathname: '/cashflow', label: 'Cash Flow' },
  ];

  test.each(ROUTES)(
    'highlights $label as the active link and marks it aria-current when pathname is $pathname',
    ({ pathname, label }) => {
      mockPathname = pathname;
      render(<Header />);

      const activeLink = screen.getByRole('link', { name: label });
      expect(activeLink.className).toContain('text-trust');
      expect(activeLink).toHaveAttribute('aria-current', 'page');

      for (const other of ROUTES) {
        if (other.label === label) continue;
        const otherLink = screen.getByRole('link', { name: other.label });
        expect(otherLink.className).not.toContain('text-trust');
        expect(otherLink).not.toHaveAttribute('aria-current');
      }
    }
  );

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
