import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateField } from './DateField';

describe('DateField', () => {
  it('renders the input with the given aria-label and value', () => {
    render(<DateField ariaLabel="Date" value="2026-09-03" onChange={vi.fn()} className="" />);

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    expect(input).toHaveValue('2026-09-03');
    expect(input.type).toBe('date');
  });

  it('calls onChange with the new value when the input changes', () => {
    const onChange = vi.fn();
    render(<DateField ariaLabel="Date" value="" onChange={onChange} className="" />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-01-15' } });

    expect(onChange).toHaveBeenCalledWith('2026-01-15');
  });

  it('renders a calendar button that opens the native picker on click', () => {
    render(<DateField ariaLabel="Date" value="" onChange={vi.fn()} className="" />);

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    const showPicker = vi.fn();
    // jsdom doesn't implement showPicker; stub it to confirm the button calls it.
    input.showPicker = showPicker;

    fireEvent.click(screen.getByRole('button', { name: /open date calendar/i }));

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('does not throw when showPicker is unsupported', () => {
    render(<DateField ariaLabel="Date" value="" onChange={vi.fn()} className="" />);
    // jsdom's HTMLInputElement has no showPicker by default, simulating older browsers.
    expect(() => fireEvent.click(screen.getByRole('button', { name: /open date calendar/i }))).not.toThrow();
  });
});
