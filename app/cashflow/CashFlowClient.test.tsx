import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { CashFlowClient } from './CashFlowClient';

let realtimeOnUpdate: (() => void) | undefined;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/hooks/useRealtimeCycleUpdates', () => ({
  useRealtimeCycleUpdates: (onUpdate: () => void) => {
    realtimeOnUpdate = onUpdate;
  },
}));

vi.mock('@/components/cashflow/ProjectionList', () => ({
  ProjectionList: () => null,
}));

vi.mock('@/components/charts/CashFlowTrajectoryChart', () => ({
  CashFlowTrajectoryChart: () => null,
}));

describe('CashFlowClient realtime sync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    realtimeOnUpdate = undefined;
  });

  it('refetches both income sources and bills (not just the projection) on a realtime update', async () => {
    // A live two-tab test caught this: the original wiring only bumped projectionRefreshKey on a
    // realtime event, which the "Income sources"/"Bills" list sections below don't consume at all —
    // they render from their own separate incomeSources/bills state. The Ably message genuinely
    // arrived, but a bill added in one tab never appeared in the other tab's visible bill list.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CashFlowClient initialIncomeSources={[]} initialBills={[]} />);

    expect(realtimeOnUpdate).toBeDefined();
    fetchMock.mockClear();

    act(() => {
      realtimeOnUpdate!();
    });

    await waitFor(() => {
      const calledUrls = fetchMock.mock.calls.map((call) => call[0]);
      expect(calledUrls).toEqual(expect.arrayContaining(['/api/income-sources', '/api/bills']));
    });
  });

  it('renders the income sources and bills list sections', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(<CashFlowClient initialIncomeSources={[]} initialBills={[]} />);

    expect(screen.getByText('No income sources yet.')).toBeInTheDocument();
    expect(screen.getByText('No bills yet.')).toBeInTheDocument();
  });
});
