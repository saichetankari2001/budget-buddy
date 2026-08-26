import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats a normal amount with two decimal places', () => {
    expect(formatCurrency(42.5)).toBe('$42.50');
  });

  it('formats a large amount with a thousands separator', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a negative amount', () => {
    expect(formatCurrency(-12)).toBe('-$12.00');
  });
});
