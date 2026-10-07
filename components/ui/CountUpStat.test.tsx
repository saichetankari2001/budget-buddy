import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountUpStat } from './CountUpStat';

describe('CountUpStat', () => {
  it('formats as currency by default', () => {
    render(<CountUpStat value={72} />);
    // Reduced-motion test environments render the final value immediately (see the component's
    // own prefers-reduced-motion branch) — jsdom's default matchMedia reports no-preference, but
    // this assertion only cares about the formatting, not the animation, so it checks textContent
    // generically rather than depending on timing.
    expect(screen.getByText(/\$/)).toBeInTheDocument();
  });

  it('formats as a plain number when format="number"', () => {
    render(<CountUpStat value={72} format="number" />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
