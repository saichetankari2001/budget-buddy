import type { Page } from '@playwright/test';

/**
 * Forces prefers-reduced-motion via a matchMedia stub injected before any page script runs, rather
 * than relying on Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })`/`reducedMotion`
 * context option alone: that emulation reliably reaches CSS `@media (prefers-reduced-motion)` rules
 * (the `motion-reduce:` Tailwind classes already used elsewhere in this app), but does NOT reliably
 * reach `window.matchMedia(...)` JS calls in this test environment — confirmed by reproducing the
 * same false negative against a completely bare, app-free page. Framer Motion's `useReducedMotion()`
 * (which every GlassPanel entrance animation checks) reads matchMedia directly, so without this
 * stub axe-core can scan a GlassPanel mid-fade-in (opacity still animating from 0), producing a
 * spurious color-contrast violation against a transient render state real users on an OS-level
 * reduced-motion setting never actually see (their browser's matchMedia reports the real value
 * immediately). Stubbing matchMedia directly is deterministic regardless of the underlying
 * browser/OS/CDP support, and matches the same technique already used in this project's Vitest unit
 * tests (GlassPanel.test.tsx, AmbientBlobs.test.tsx, WebGLAccent.test.tsx).
 */
export async function forceReducedMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
}
