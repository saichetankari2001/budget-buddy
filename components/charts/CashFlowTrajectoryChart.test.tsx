import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CashFlowTrajectoryChart } from './CashFlowTrajectoryChart';

describe('CashFlowTrajectoryChart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders nothing while loading and nothing on a null (no-cycle) response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => null })
    );
    const { container } = render(<CashFlowTrajectoryChart />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders the chart and a screen-reader summary for a populated, non-shortfall projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          projection: [
            { date: '2026-10-01T00:00:00.000Z', balance: 500, events: [] },
            { date: '2026-10-02T00:00:00.000Z', balance: 480, events: [] },
          ],
        }),
      })
    );

    render(<CashFlowTrajectoryChart />);

    expect(await screen.findByTestId('cashflow-trajectory-chart')).toBeInTheDocument();
    expect(screen.getByText(/staying positive throughout/)).toBeInTheDocument();
  });

  it('flags the shortfall in the screen-reader summary when the projection dips below zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          projection: [
            { date: '2026-10-01T00:00:00.000Z', balance: 100, events: [] },
            { date: '2026-10-05T00:00:00.000Z', balance: -50, events: [{ label: 'Rent', amount: -800 }] },
          ],
        }),
      })
    );

    render(<CashFlowTrajectoryChart />);

    expect(await screen.findByText(/dipping below zero to a low of/)).toBeInTheDocument();
  });
});
