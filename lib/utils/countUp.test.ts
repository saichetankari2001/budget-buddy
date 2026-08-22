import { describe, it, expect } from 'vitest';
import { computeCountUpValue } from './countUp';

describe('computeCountUpValue', () => {
  it('returns 0 before any time has elapsed', () => {
    expect(computeCountUpValue(0, 600, 100)).toBe(0);
  });

  it('returns the target once elapsed time reaches or exceeds the duration', () => {
    expect(computeCountUpValue(600, 600, 100)).toBe(100);
    expect(computeCountUpValue(1000, 600, 100)).toBe(100);
  });

  it('returns a value strictly between 0 and the target partway through', () => {
    const value = computeCountUpValue(300, 600, 100);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });
});
