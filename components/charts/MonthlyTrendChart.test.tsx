import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlyTrendChart } from './MonthlyTrendChart';

describe('MonthlyTrendChart', () => {
  it('shows an empty state when there is no data', () => {
    render(<MonthlyTrendChart data={[]} />);
    expect(screen.getByText(/no spending history yet/i)).toBeInTheDocument();
  });

  it('renders without crashing when given monthly totals', () => {
    render(
      <MonthlyTrendChart
        data={[
          { month: '2026-07', total: 100 },
          { month: '2026-08', total: 150 },
        ]}
      />
    );
    expect(screen.getByTestId('monthly-trend-chart')).toBeInTheDocument();
  });
});
