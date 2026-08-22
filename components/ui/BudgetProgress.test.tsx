import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetProgress } from './BudgetProgress';

describe('BudgetProgress', () => {
  it('shows an empty state when there are no budgeted categories', () => {
    render(<BudgetProgress items={[]} />);
    expect(screen.getByText(/no budgets set yet/i)).toBeInTheDocument();
  });

  it('renders a progress row with spent/limit for each item', () => {
    render(
      <BudgetProgress
        items={[{ categoryId: 'cat_1', categoryName: 'Food', spent: 40, limit: 100 }]}
      />
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('$40.00 / $100.00')).toBeInTheDocument();
  });

  it('shows an over-budget label and styling when spent exceeds limit', () => {
    render(
      <BudgetProgress
        items={[{ categoryId: 'cat_1', categoryName: 'Food', spent: 120, limit: 100 }]}
      />
    );
    expect(screen.getByText('$20.00 over budget')).toBeInTheDocument();
  });
});
