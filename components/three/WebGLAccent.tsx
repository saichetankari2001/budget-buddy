'use client';

import { Component, ComponentType, ReactNode, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';

const NARROW_VIEWPORT_QUERY = '(max-width: 640px)'; // matches this app's existing sm: breakpoint

class WebGLErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('WebGL accent failed to render, falling back to a static gradient:', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
    setIsNarrow(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return isNarrow;
}

/**
 * Like framer-motion's own useReducedMotion(), but hydration-safe for use in a structural branch
 * (this component picks between two entirely different element trees, not just a style attribute).
 * framer-motion's hook reads the real matchMedia value synchronously on the client's first render,
 * while SSR always sees false (no window there) — branching *which JSX gets returned* on that raw
 * value made a real reduced-motion client's first paint disagree with the server-rendered markup,
 * producing a genuine "Hydration failed" error (confirmed by reproducing it, not just an inline-
 * style warning — the same underlying issue GlassPanel had, but structural here instead of
 * cosmetic). Deferring to false until after mount — matching useIsNarrowViewport's existing pattern
 * above — keeps the first client render identical to the server's, then swaps to the real value via
 * a normal post-hydration re-render.
 */
function useReducedMotionAfterMount(): boolean {
  const prefersReducedMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return hasMounted && Boolean(prefersReducedMotion);
}

interface WebGLAccentProps {
  /** Never called on a page that never renders a WebGLAccent instance at all. On a page that does,
   * this is still called once even for a reduced-motion/narrow-viewport visitor, whose first paint
   * has to match the server's (which can't know their preference) before a post-mount correction
   * swaps in the fallback — unavoidable for a value only knowable client-side without reintroducing
   * the hydration mismatch this component exists to avoid. The user still reliably ends up seeing
   * the fallback; the load is a one-time, unavoidable cost of getting there correctly. */
  loadScene: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
  sceneProps?: Record<string, unknown>;
  /** Accessible label for the fallback (the real scene is purely decorative and aria-hidden). */
  alt: string;
  className?: string;
}

/**
 * The single wrapper both scoped WebGL accents (dashboard orb, login/signup hero scene) render
 * through. Handles all three required fallback paths — prefers-reduced-motion, narrow viewport, and
 * a WebGL/context-creation failure — falling back to the same kind of static CSS-gradient shape in
 * every case, never a raster image (no new binary asset needed).
 */
export function WebGLAccent({ loadScene, sceneProps = {}, alt, className = '' }: WebGLAccentProps) {
  const prefersReducedMotion = useReducedMotionAfterMount();
  const isNarrowViewport = useIsNarrowViewport();
  // Memoized with an empty dependency array — intentionally capturing `loadScene` only from this
  // instance's first render. Callers pass an inline arrow function (`() => import(...)`), a fresh
  // reference every parent re-render; the module path it imports never changes for a given call
  // site, but calling `dynamic()` fresh on every render (as this originally did) recreates the lazy
  // component and remounts the whole WebGL context repeatedly — real GPU context churn, not just a
  // wasted render, and the root cause of a real "1 error" Next.js dev-mode toast this project's own
  // axe-core suite caught on every WebGL-accent page.
  const Scene = useMemo(() => dynamic(loadScene, { ssr: false, loading: () => null }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const staticFallback = (
    <div
      data-testid="webgl-static-fallback"
      role="img"
      aria-label={alt}
      // h-full w-full: every call site sizes an *outer* wrapper div rather than passing className
      // to WebGLAccent directly, so this element — an otherwise-empty div with no content — needs
      // to explicitly fill that parent's dimensions itself, or it collapses to zero height and
      // Playwright (correctly) reports it as hidden despite `display` never being `none`.
      className={`h-full w-full rounded-full bg-gradient-to-br from-primary/40 via-accent/30 to-transparent blur-2xl ${className}`}
    />
  );

  if (prefersReducedMotion || isNarrowViewport) {
    return staticFallback;
  }

  return (
    <WebGLErrorBoundary fallback={staticFallback}>
      <div data-testid="webgl-accent" aria-hidden="true" className={`h-full w-full ${className}`}>
        <Scene {...sceneProps} />
      </div>
    </WebGLErrorBoundary>
  );
}
