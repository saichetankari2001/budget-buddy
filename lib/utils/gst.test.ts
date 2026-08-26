import { describe, it, expect } from 'vitest';
import { computeGstPaid } from './gst';

describe('computeGstPaid', () => {
  it('returns 0 for an empty list', () => {
    expect(computeGstPaid([])).toBe(0);
  });

  it('sums the GST portion of taxable expenses', () => {
    const result = computeGstPaid([
      { amount: 110, categoryIsGstFree: false },
      { amount: 55, categoryIsGstFree: false },
    ]);
    expect(result).toBe(15);
  });

  it('excludes GST-free expenses entirely', () => {
    const result = computeGstPaid([
      { amount: 110, categoryIsGstFree: true },
      { amount: 55, categoryIsGstFree: true },
    ]);
    expect(result).toBe(0);
  });

  it('handles a mix of taxable and GST-free expenses', () => {
    const result = computeGstPaid([
      { amount: 110, categoryIsGstFree: false },
      { amount: 50, categoryIsGstFree: true },
    ]);
    expect(result).toBe(10);
  });

  it('rounds the final total to 2 decimal places', () => {
    const result = computeGstPaid([{ amount: 10, categoryIsGstFree: false }]);
    expect(result).toBe(0.91);
  });
});
