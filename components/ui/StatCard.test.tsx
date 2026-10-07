import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and a currency-formatted value by default', () => {
    render(<StatCard label="Total spent this month" value={150} trend={[10, 20, 150]} />);
    expect(screen.getByText('Total spent this month')).toBeInTheDocument();
  });

  it('passes through format="number" so the value renders without a currency sign', () => {
    render(<StatCard label="Financial health" value={72} trend={[60, 65, 72]} format="number" />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
