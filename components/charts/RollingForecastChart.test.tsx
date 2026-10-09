import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RollingForecastChart } from './RollingForecastChart';

describe('RollingForecastChart', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders nothing while loading, nothing on no active cycle', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => null } as Response);
    const { container } = render(<RollingForecastChart />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders the heads-up list when the forecast includes one', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        trajectory: [{ date: '2026-10-10T00:00:00.000Z', balance: 100, events: [] }],
        headsUp: [{ name: 'Car registration', amount: 450, dueDate: '2026-11-15T00:00:00.000Z' }],
      }),
    } as Response);

    render(<RollingForecastChart />);

    await waitFor(() => expect(screen.getByText(/Car registration/)).toBeInTheDocument());
    expect(screen.getByText(/\$450\.00/)).toBeInTheDocument();
  });

  it('renders no heads-up section when the list is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ trajectory: [{ date: '2026-10-10T00:00:00.000Z', balance: 100, events: [] }], headsUp: [] }),
    } as Response);

    render(<RollingForecastChart />);

    await waitFor(() => expect(screen.getByText('Looking ahead')).toBeInTheDocument());
    expect(screen.queryByText(/heads up/i)).not.toBeInTheDocument();
  });
});
