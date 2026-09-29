import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassPanel } from './GlassPanel';

describe('GlassPanel', () => {
  it('renders its children', () => {
    render(<GlassPanel>Hello</GlassPanel>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies the requested elevation background class', () => {
    render(<GlassPanel elevation={3}>Content</GlassPanel>);
    expect(screen.getByTestId('glass-panel')).toHaveClass('bg-glass-3');
  });

  it('defaults to elevation 1', () => {
    render(<GlassPanel>Content</GlassPanel>);
    expect(screen.getByTestId('glass-panel')).toHaveClass('bg-glass-1');
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

    render(<GlassPanel hoverable>Reduced motion content</GlassPanel>);
    expect(screen.getByText('Reduced motion content')).toBeInTheDocument();

    window.matchMedia = original;
  });
});
