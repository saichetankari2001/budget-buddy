import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpenseForm } from './ExpenseForm';

const categories = [
  { id: 'cat_1', name: 'Food' },
  { id: 'cat_2', name: 'Transport' },
];

describe('ExpenseForm', () => {
  it('submits the entered values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '25.50' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Lunch' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'cat_2' } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-08-10' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25.5, description: 'Lunch', categoryId: 'cat_2' })
    );
  });

  it('pre-fills fields from initialValues when editing', () => {
    render(
      <ExpenseForm
        categories={categories}
        initialValues={{ amount: 10, description: 'Coffee', categoryId: 'cat_1', date: '2026-08-01' }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/description/i)).toHaveValue('Coffee');
  });

  it('shows the interval select only when Repeat is checked', () => {
    render(<ExpenseForm categories={categories} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText(/repeat interval/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/^repeat$/i));

    expect(screen.getByLabelText(/repeat interval/i)).toBeInTheDocument();
  });

  it('submits isRecurring and recurrenceInterval when Repeat is checked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Netflix' } });
    fireEvent.click(screen.getByLabelText(/^repeat$/i));
    fireEvent.change(screen.getByLabelText(/repeat interval/i), { target: { value: 'YEARLY' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ isRecurring: true, recurrenceInterval: 'YEARLY' })
    );
  });

  it('submits isRecurring false and no recurrenceInterval when Repeat is unchecked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ isRecurring: false, recurrenceInterval: undefined })
    );
  });
});
