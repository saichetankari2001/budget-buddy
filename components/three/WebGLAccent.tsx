'use client';

import { Component, ComponentType, ReactNode, useEffect, useState } from 'react';
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

interface WebGLAccentProps {
  /** Only ever called when the accent will actually render — pages that never render a WebGLAccent
   * instance never fetch the Three.js bundle at all. */
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
  const prefersReducedMotion = useReducedMotion();
  const isNarrowViewport = useIsNarrowViewport();

  const staticFallback = (
    <div
      data-testid="webgl-static-fallback"
      role="img"
      aria-label={alt}
      className={`rounded-full bg-gradient-to-br from-primary/40 via-accent/30 to-transparent blur-2xl ${className}`}
    />
  );

  if (prefersReducedMotion || isNarrowViewport) {
    return staticFallback;
  }

  const Scene = dynamic(loadScene, { ssr: false, loading: () => null });

  return (
    <WebGLErrorBoundary fallback={staticFallback}>
      <div data-testid="webgl-accent" aria-hidden="true" className={className}>
        <Scene {...sceneProps} />
      </div>
    </WebGLErrorBoundary>
  );
}
