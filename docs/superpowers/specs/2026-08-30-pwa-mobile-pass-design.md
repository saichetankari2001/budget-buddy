# Budget Buddy — PWA Mobile Pass

## Purpose

The last item in the original scope-explosion roadmap (design → v1 core →
Indigo Bento redesign → v1.1 budgets → v1.2 recurring expenses → v1.3 CSV
import/export → Australian-standards scope → PWA mobile pass [this one,
last]). Makes Budget Buddy installable as a Progressive Web App — a
home-screen icon, a standalone (browser-chrome-free) window, and a graceful
offline experience — without pretending to solve offline data entry for a
financial app, which is a much harder and riskier problem than this phase
takes on.

## Architecture

Two pieces, both native to Next.js 14 App Router — no new dependency:

1. **`app/manifest.ts`** — Next.js's built-in manifest file convention,
   which serves a valid web app manifest at `/manifest.webmanifest`
   automatically. Requires two new icon assets (192×192 and 512×512 PNGs)
   — this app doesn't have a logo yet, so a simple one is created matching
   the existing Indigo Bento palette (`#6366F1` primary).
2. **A hand-rolled service worker** (`public/sw.js`, registered from a
   small client component mounted once in the root layout) — not a
   library like `next-pwa`. This project has consistently preferred
   understanding a mechanism from first principles over reaching for a
   library unless the problem has real hidden complexity (e.g. CSV
   *parsing* got a library in v1.3, CSV *serialization* didn't). A basic
   asset-caching service worker is well-documented and a genuinely useful
   thing to understand hands-on: the install/activate/fetch lifecycle, and
   the difference between cache-first and network-first strategies.

## Honest Scoping: What "Offline" Actually Means Here

Budget Buddy is almost entirely dynamic, authenticated, database-backed
content — the dashboard, expenses, and budgets pages all show live
financial data fetched fresh on every request. A service worker can only
safely cache *static* assets (JS/CSS bundles, fonts, icons, the
login/signup page shells) — it must **not** cache and silently replay old
financial data while offline, since showing a stale account balance is
actively misleading, not merely inconvenient, for a finance app.

So the actual offline behavior is:
- Static assets and the public login/signup pages load instantly from
  cache on repeat visits, online or off.
- An authenticated page (dashboard/expenses/budgets) that can't reach the
  network shows a clear, dedicated "You're offline" page — never stale or
  broken data, and never a silent failure.

## Caching Strategy

- **Cache-first** for static, content-hashed assets (Next.js's built JS/CSS
  bundles, fonts, icons) — these are safe to serve from cache indefinitely,
  since a new deploy produces new hashed filenames rather than mutating an
  existing one.
- **Network-first** for HTML page navigations — always attempt the network
  first, so authenticated pages always show live data when a connection
  exists; fall back to a cached offline page only when the network request
  genuinely fails (no connection, or a request timeout).

## Icon Assets

A simple SVG icon (a stylized dollar/wallet glyph on the `#6366F1` indigo
background, matching the existing brand) is created and rasterized to the
two required PNG sizes (192×192, 512×512) using whatever image tooling is
available on the development machine (checked during implementation
planning — options include ImageMagick or macOS's built-in `sips`).

## Testing

Service worker and installability behavior is inherently a browser
runtime concern, not meaningfully unit-testable. Verification is manual:
- Confirm the manifest is valid and complete via Chrome DevTools'
  Application tab (icons, name, theme color, display mode all present).
- Confirm the app is actually installable (Chrome's install prompt
  appears; installing and launching opens a standalone window with no
  browser chrome).
- Confirm the offline fallback: with DevTools' network throttling set to
  "Offline," reload an authenticated page and confirm the dedicated
  offline page appears instead of a browser error or stale data.
- Confirm static assets load instantly on a second visit (cache hit,
  visible in DevTools' Network tab).

## Out of Scope

- No offline data entry or background sync — queuing a new expense while
  offline and syncing it later is a genuinely complex problem for a
  financial app (conflict resolution, retry/failure handling, risk of
  silently losing or duplicating data), deliberately not attempted here.
- No push notifications.
- No native app wrapper (Capacitor/React Native) — this phase is a web
  PWA only, matching the original scope decision to go with PWA over
  native.
- This is the last item in the original roadmap — no further phases are
  implied after this one.
