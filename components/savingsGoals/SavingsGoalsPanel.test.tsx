import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SavingsGoalsPanel } from './SavingsGoalsPanel';

describe('SavingsGoalsPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows an empty state when there are no goals yet', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<SavingsGoalsPanel />);
    await waitFor(() => expect(screen.getByText(/no savings goals yet/i)).toBeInTheDocument());
  });

  it('renders a goal with its progress toward the target', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'goal_1', name: 'Laptop fund', targetAmount: 1500, targetDate: null, contributedAmount: 50 },
      ],
    } as Response);

    render(<SavingsGoalsPanel />);

    await waitFor(() => expect(screen.getByText('Laptop fund')).toBeInTheDocument());
    expect(screen.getByText(/\$50\.00.*\$1,500\.00|\$1,500\.00.*\$50\.00/)).toBeInTheDocument();
  });

  it('logs a contribution and refetches the goal list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'goal_1', name: 'Laptop fund', targetAmount: 1500, targetDate: null, contributedAmount: 50 }] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'contrib_1' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'goal_1', name: 'Laptop fund', targetAmount: 1500, targetDate: null, contributedAmount: 100 }] } as Response);

    render(<SavingsGoalsPanel />);
    await waitFor(() => expect(screen.getByText('Laptop fund')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add contribution/i }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/savings-goals/goal_1/contributions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ goalName: 'Laptop fund', amount: 50 }) })
    ));
  });
});
