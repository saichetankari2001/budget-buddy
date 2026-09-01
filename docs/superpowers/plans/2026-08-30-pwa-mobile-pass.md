# Budget Buddy — PWA Mobile Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Budget Buddy installable as a Progressive Web App with a home-screen icon, standalone window, and a graceful offline shell — without caching or replaying stale financial data.

**Architecture:** A Next.js-native `app/manifest.ts` (with two new PNG icon assets), a hand-rolled service worker (`public/sw.js`) implementing cache-first for static assets and network-first-with-offline-fallback for page navigations, a small client component that registers it, and a dedicated offline fallback page.

**Tech Stack:** Next.js 14 App Router (native `manifest.ts`, `MetadataRoute.Manifest` type), the Service Worker Web API (no library), `rsvg-convert` for icon rasterization (build-time tooling only, not a runtime dependency).

**Spec:** `docs/superpowers/specs/2026-08-30-pwa-mobile-pass-design.md`

## Global Constraints

- The service worker must **never** intercept or cache anything under `/api/` — every API request always goes straight to the network. Financial data must never be served stale or from cache; this is the single most important constraint in this plan.
- Cache-first applies only to Next.js's content-hashed static build output (`/_next/static/...`) — safe to cache indefinitely since a new deploy produces new filenames rather than mutating existing ones.
- Page navigations (`request.mode === 'navigate'`) are network-first: always try the network, fall back to the cached `/offline` page only on a genuine network failure.
- No offline data entry, no background sync, no push notifications — explicitly out of scope per the spec.
- No dedicated Vitest unit tests for the manifest, service worker, or offline page — these are browser-runtime concerns, not meaningfully unit-testable. Verification is curl-based (files are served correctly) plus manual DevTools verification (installability, offline behavior) as detailed in the spec.
- Manual verification steps in this plan run against a production build (`npm run build && npm run start`), not `npm run dev` — matching this project's established convention (from the WCAG phase) of verifying against the same build mode CI actually uses, and avoiding `next dev`'s fast-refresh/HMR artifacts from confusing service-worker caching behavior during verification.

---

## File Structure

```
budget-buddy/
├── public/
│   ├── icon.svg                                    # CREATE: source icon
│   ├── icon-192.png                                 # CREATE: generated from icon.svg
│   ├── icon-512.png                                 # CREATE: generated from icon.svg
│   └── sw.js                                        # CREATE: service worker
├── app/
│   ├── manifest.ts                                  # CREATE: Next.js native manifest route
│   ├── layout.tsx                                   # MODIFY: register the service worker
│   └── offline/
│       └── page.tsx                                  # CREATE: offline fallback page
└── components/
    └── pwa/
        └── ServiceWorkerRegistration.tsx              # CREATE
```

---

### Task 1: Icon Assets and Web App Manifest

**Files:**
- Create: `public/icon.svg`
- Create: `public/icon-192.png` (generated, not hand-written)
- Create: `public/icon-512.png` (generated, not hand-written)
- Create: `app/manifest.ts`

**Interfaces:**
- Produces: `GET /manifest.webmanifest` (Next.js's automatic route for `app/manifest.ts`), `GET /icon-192.png`, `GET /icon-512.png` — consumed by nothing else in this plan directly, but this is the piece that makes the app installable, verified manually in Task 3.

- [ ] **Step 1: Create the source icon**

`public/icon.svg`:
```svg
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="96" fill="#6366F1"/>
  <circle cx="256" cy="256" r="140" fill="none" stroke="#FFFFFF" stroke-width="28"/>
  <line x1="256" y1="90" x2="256" y2="422" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round"/>
</svg>
```

This is a rounded-square badge in the app's `primary` indigo (`#6366F1`, matching `tailwind.config.ts`), with a white ring-and-line "coin" glyph. It's built from pure geometric primitives (`rect`, `circle`, `line`) rather than text, so it rasterizes identically regardless of which fonts are installed on the machine doing the conversion.

- [ ] **Step 2: Generate the two required PNG sizes**

```bash
rsvg-convert -w 192 -h 192 public/icon.svg -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/icon.svg -o public/icon-512.png
```

- [ ] **Step 3: Verify the generated PNGs are valid and correctly sized**

```bash
sips -g pixelWidth -g pixelHeight public/icon-192.png
sips -g pixelWidth -g pixelHeight public/icon-512.png
```

Expected: the first command reports `pixelWidth: 192` / `pixelHeight: 192`; the second reports `pixelWidth: 512` / `pixelHeight: 512`.

- [ ] **Step 4: Create `app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Budget Buddy',
    short_name: 'Budget Buddy',
    description: 'Track expenses, categories, budgets, and spending trends.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F5F3FF',
    theme_color: '#6366F1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

`start_url` points at `/dashboard` rather than `/` — the root route (`app/page.tsx`) already just redirects there, so this saves a redirect hop when launching the installed app. `background_color` and `theme_color` reuse the app's existing `background` and `primary` design tokens from `tailwind.config.ts`, so the install/splash experience matches the app's actual visual identity rather than arbitrary colors.

- [ ] **Step 5: Verify via curl that the manifest and icons are served correctly**

```bash
pkill -f "next start" 2>/dev/null; pkill -f "next dev" 2>/dev/null; sleep 1; lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
npm run build
npm run start &
sleep 4

echo "--- manifest should be valid JSON with the expected fields ---"
curl -s http://localhost:3000/manifest.webmanifest -o /tmp/manifest-check.json -w "manifest status: %{http_code}\n"
python3 -c "
import json
with open('/tmp/manifest-check.json') as f:
    data = json.load(f)
assert data['name'] == 'Budget Buddy'
assert data['display'] == 'standalone'
assert data['start_url'] == '/dashboard'
assert len(data['icons']) == 2
assert data['icons'][0]['sizes'] == '192x192'
assert data['icons'][1]['sizes'] == '512x512'
print('PASS: manifest content is correct')
"

echo "--- both icons should be served with a 200 and image content-type ---"
curl -s -o /dev/null -w "icon-192.png status: %{http_code}, content-type: %{content_type}\n" http://localhost:3000/icon-192.png
curl -s -o /dev/null -w "icon-512.png status: %{http_code}, content-type: %{content_type}\n" http://localhost:3000/icon-512.png

rm -f /tmp/manifest-check.json
kill %1
```

Expected: manifest status `200`, the PASS line prints, both icons return status `200` with a `content_type` of `image/png`.

- [ ] **Step 6: Commit**

```bash
git add public/icon.svg public/icon-192.png public/icon-512.png app/manifest.ts
git commit -m "feat: add web app manifest and icon assets"
```

---

### Task 2: Service Worker and Offline Fallback Page

**Files:**
- Create: `public/sw.js`
- Create: `app/offline/page.tsx`

**Interfaces:**
- Produces: `GET /sw.js` (the service worker script, unregistered until Task 3), `GET /offline` (a real, navigable page) — consumed by Task 3's registration component and by the service worker's own navigation-fallback logic.

- [ ] **Step 1: Create `app/offline/page.tsx`**

```tsx
import { Card } from '@/components/ui/Card';

export default function OfflinePage() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card>
        <h1 className="mb-2 font-heading text-2xl font-semibold text-foreground">
          You&apos;re offline
        </h1>
        <p className="text-sm text-muted">
          Budget Buddy needs an internet connection to show your up-to-date expenses, budgets, and
          balances. Reconnect and try again.
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Create `public/sw.js`**

```js
const CACHE_NAME = 'budget-buddy-v1';
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests — let POST/PATCH/DELETE (all of this app's mutations) pass through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch API routes. Financial data must always come straight from the network, never from cache.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: network-first, falling back to the cached offline page only if the network fails.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Next.js's content-hashed static build output: cache-first, since a new deploy means new filenames.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else (images, fonts, API-adjacent assets not already excluded above): pass through to the network as normal.
});
```

**Rationale:** the `/api/` bypass is checked before any caching logic, so it's structurally impossible for this service worker to ever serve a cached API response — that check runs first and returns early, regardless of what other logic exists below it. `request.mode === 'navigate'` is the standard way a service worker distinguishes a top-level page load from any other fetch (an image, a script, an API call).

- [ ] **Step 3: Verify via curl that both new routes are served correctly**

```bash
pkill -f "next start" 2>/dev/null; pkill -f "next dev" 2>/dev/null; sleep 1; lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
npm run build
npm run start &
sleep 4

echo "--- offline page should render ---"
curl -s http://localhost:3000/offline -o /tmp/offline-check.html -w "offline page status: %{http_code}\n"
grep -q "You're offline" /tmp/offline-check.html && echo "PASS: offline page renders its message"

echo "--- service worker script should be served as JavaScript ---"
curl -s -o /dev/null -w "sw.js status: %{http_code}, content-type: %{content_type}\n" http://localhost:3000/sw.js

rm -f /tmp/offline-check.html
kill %1
```

Expected: offline page status `200`, PASS line prints, `sw.js` status `200` with a JavaScript content type.

- [ ] **Step 4: Run the full Vitest suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (unchanged — no unit tests in this task).

- [ ] **Step 5: Commit**

```bash
git add public/sw.js app/offline/page.tsx
git commit -m "feat: add service worker and offline fallback page"
```

---

### Task 3: Service Worker Registration, Layout Wiring, and Manual Verification

**Files:**
- Create: `components/pwa/ServiceWorkerRegistration.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `public/sw.js` (Task 2).
- Produces: an active, registered service worker on every page load — the final piece that makes Tasks 1 and 2 actually function together as a real PWA, verified manually in this task's Step 3.

- [ ] **Step 1: Create `components/pwa/ServiceWorkerRegistration.tsx`**

```tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker registration failed:', error);
      });
    }
  }, []);

  return null;
}
```

This is a client component that renders nothing (`return null`) — its only job is the `useEffect` side effect of registering the service worker once, on mount, in every browser that supports the API. The `'serviceWorker' in navigator` check means this is a no-op (not an error) in any environment without service worker support.

- [ ] **Step 2: Modify `app/layout.tsx`**

Add the import:
```ts
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
```

Add `<ServiceWorkerRegistration />` as the first child inside `<body>`, before the existing content div:
```tsx
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
```

The full file after this change:

```tsx
import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import { Footer } from '@/components/ui/Footer';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';

const lexend = Lexend({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const sourceSans = Source_Sans_3({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lexend.variable} ${sourceSans.variable}`}>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
```

Nothing else in this file changes — the existing `Footer` and sticky-footer flex layout from the Privacy Act phase are untouched.

- [ ] **Step 3: Manual verification — this is the real test of this whole plan**

Everything up to this point has been curl-verified structure; this step is where the actual PWA behavior gets checked in a real browser, following the spec's Testing section exactly.

```bash
pkill -f "next start" 2>/dev/null; pkill -f "next dev" 2>/dev/null; sleep 1; lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
npm run build
npm run start &
sleep 4
```

Then, in Chrome (or another Chromium-based browser):

1. **Registration and manifest validity:** open `http://localhost:3000`, open DevTools → Application tab → Manifest. Confirm: name is "Budget Buddy", icons for both 192×192 and 512×512 are shown with no broken-image icon, theme color and background color match the app's indigo/lavender palette, and there are no manifest errors listed.
2. **Service worker active:** in the same Application tab → Service Workers. Confirm a worker for `sw.js` is listed with status "activated and is running".
3. **Installability:** in Chrome's address bar, confirm an install icon appears (or use the "⋮" menu → "Install Budget Buddy…"). Install it, then launch the installed app and confirm it opens in a standalone window with no browser address bar or tabs.
4. **Offline fallback:** with the app open and logged in, go to DevTools → Network tab → set throttling to "Offline". Navigate to a different page within the app (e.g. click "Expenses" in the nav). Confirm the dedicated "You're offline" page appears — not a browser error page, and not stale expense data.
5. **Cache hit on static assets:** still in DevTools → Network tab, set throttling back to "Online", reload the page, and confirm at least some `/_next/static/...` requests show "(from ServiceWorker)" or a similar cache-hit indicator in the Size column, rather than a full network transfer.

Expected: all 5 checks pass as described.

- [ ] **Step 4: Run the full Vitest suite and the existing Playwright suites one more time to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing.

```bash
npx playwright test --reporter=list
```

Expected: all 8 existing tests pass (`e2e/dashboard.spec.ts` plus the 7 tests in `e2e/accessibility.spec.ts`) — the new service worker and manifest must not interfere with any existing page's rendering or accessibility.

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either.

- [ ] **Step 6: Commit**

```bash
git add components/pwa/ServiceWorkerRegistration.tsx app/layout.tsx
git commit -m "feat: register service worker for PWA installability and offline shell"
```

- [ ] **Step 7: Push and confirm CI is green**

```bash
git push origin main
```

After pushing, confirm the GitHub Actions run for this commit succeeds (`gh run watch` or check the Actions tab). This is the last commit in the entire original project roadmap — a green CI run here closes out the whole build.

---

## End of PWA Mobile Pass

At this point: Budget Buddy is installable as a standalone app with a home-screen icon on any device with a Chromium-based browser, static assets load instantly on repeat visits, and losing connectivity while using the app shows a clear, honest offline message instead of a browser error or (worse) silently stale financial data. This is the last phase in the original project roadmap — v1 core through the PWA mobile pass are all shipped.
