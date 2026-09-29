import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHeroOrb } from './DashboardHeroOrb';

vi.mock('@/hooks/useRealtimeCycleUpdates', () => ({
  useRealtimeCycleUpdates: vi.fn(),
}));

describe('DashboardHeroOrb', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the WebGL accent container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projection: [] }) })
    );

    render(<DashboardHeroOrb />);

    expect(await screen.findByTestId('dashboard-hero-orb')).toBeInTheDocument();
  });

  it('does not crash when the projection fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    render(<DashboardHeroOrb />);

    expect(await screen.findByTestId('dashboard-hero-orb')).toBeInTheDocument();
  });
});
