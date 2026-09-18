import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StartCycleForm } from './StartCycleForm';

describe('StartCycleForm', () => {
  it('submits the entered amount and end date', () => {
    const onSubmit = vi.fn();
    render(<StartCycleForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/how much do you have/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Until when'), { target: { value: '2026-09-20' } });
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(onSubmit).toHaveBeenCalledWith({ startingAmount: 500, endDate: '2026-09-20' });
  });
});
