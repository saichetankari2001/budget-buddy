import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryPieChart } from './CategoryPieChart';

describe('CategoryPieChart', () => {
  it('shows an empty state when there is no data', () => {
    render(<CategoryPieChart data={[]} />);
    expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
  });

  it('renders a legend entry per category', () => {
    render(
      <CategoryPieChart
        data={[
          { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 90 },
          { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', total: 15 },
        ]}
      />
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });
});
