import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AmbientBlobs } from './AmbientBlobs';

describe('AmbientBlobs', () => {
  it('renders as a decorative, non-interactive background', () => {
    render(<AmbientBlobs />);
    const el = screen.getByTestId('ambient-blobs');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('pointer-events-none');
  });

  it('renders without crashing when prefers-reduced-motion is set', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    render(<AmbientBlobs />);
    expect(screen.getByTestId('ambient-blobs')).toBeInTheDocument();

    window.matchMedia = original;
  });
});
