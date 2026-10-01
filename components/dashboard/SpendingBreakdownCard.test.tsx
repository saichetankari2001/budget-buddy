import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SpendingBreakdownCard } from './SpendingBreakdownCard';

vi.mock('@/hooks/useRealtimeCycleUpdates', () => ({
  useRealtimeCycleUpdates: vi.fn(),
}));

describe('SpendingBreakdownCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders nothing when there is no active cycle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
    const { container } = render(<SpendingBreakdownCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows a "log some expenses first" message when there is no category history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [], hasAnyExpenseThisCycle: false }) })
    );
    render(<SpendingBreakdownCard />);
    expect(await screen.findByText(/log a few expenses first/i)).toBeInTheDocument();
  });

  it('labels the left pie "Your usual pattern" before any expense has been logged this cycle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          categories: [
            { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', recommendedAmount: 100, actualAmount: 0, historicalAmount: 400 },
          ],
          hasAnyExpenseThisCycle: false,
        }),
      })
    );
    render(<SpendingBreakdownCard />);
    expect(await screen.findByText(/your usual pattern/i)).toBeInTheDocument();
  });

  it('labels the left pie "Actual so far" once at least one expense has been logged this cycle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          categories: [
            { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', recommendedAmount: 100, actualAmount: 30, historicalAmount: 400 },
          ],
          hasAnyExpenseThisCycle: true,
        }),
      })
    );
    render(<SpendingBreakdownCard />);
    expect(await screen.findByText(/actual so far/i)).toBeInTheDocument();
  });

  it('shows the table with recommended, actual, and % used per category', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          categories: [
            { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', recommendedAmount: 100, actualAmount: 85, historicalAmount: 400 },
          ],
          hasAnyExpenseThisCycle: true,
        }),
      })
    );
    render(<SpendingBreakdownCard />);
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });
});
