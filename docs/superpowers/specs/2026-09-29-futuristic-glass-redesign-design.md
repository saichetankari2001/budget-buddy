# Futuristic Liquid-Glass Redesign — Design Spec

**Status:** Approved for planning
**Depends on:** Neon Glass Redesign (2026-09-05), all shipped features through Income/Bills/Cash-Flow Projection (2026-09-27)
**Project sequencing:** This is the first of two planned sub-projects for the "futuristic advanced budget buddy" request. This spec covers the **website only** (evolving the existing repo). A second, later spec will cover a **new mobile repo**, built after this design system is proven here. AWS/hosting/infrastructure is an explicitly separate, later conversation — out of scope for this spec.

## 1. Goal

Evolve Budget Buddy's existing "Neon Glass" visual layer into a more advanced, futuristic "liquid glass" aesthetic — depth, motion, frosted glass panels, and two scoped 3D accents — while keeping every page understandable to non-technical users and maintaining the app's existing WCAG 2.1 AA compliance. This is primarily a **visual-layer change**, plus one scoped backend addition: live data sync (Section 9), so the new animated charts and dashboard orb update in real time as data changes rather than only on page load. No database schema changes, and no change to any existing endpoint's validation, business logic, or response shape — the sync feature is additive (a new publish call alongside each existing write). Every existing feature (auth, expenses, budgets, Money Cycle, AI coach chat, cash-flow projection) keeps working exactly as it does today.

## 2. Current State

- **Design system today:** dark palette defined in `tailwind.config.ts` — `primary #8b5cf6`, `accent #22d3ee`, `background #05050f`, `card rgba(255,255,255,0.06)`, `foreground #e5e7ff`, `muted #94a3b8`, `border rgba(139,92,246,0.35)`, `destructive #f87171`, `success #34d399`. One custom keyframe (`fadeSlideIn`). No motion library, no 3D library.
- **Charts today:** Recharts (`^2.12.7`) powers `components/charts/MonthlyTrendChart.tsx` (dashboard trend) and `components/charts/CategoryPieChart.tsx` (dashboard category breakdown). Both have existing unit tests. The cash-flow projection page (`app/cashflow/`) shows a day-by-day vertical list (`ProjectionList.tsx`), not a chart — a deliberate choice from the prior spec.
- **Pages:** `app/dashboard`, `app/budgets`, `app/cashflow`, `app/expenses`, `app/login`, `app/signup`, `app/offline`, `app/privacy` — 8 top-level routes, all currently on the Neon Glass system.
- **Testing:** Vitest (unit), Playwright + axe-core (WCAG 2.1 AA, CI-enforced) covering dashboard and accessibility specs today.

## 3. Design System Extension

The existing token set is **extended**, not replaced — `primary`, `accent`, `background`, `foreground`, `destructive`, `success` all keep their current values and meaning.

**New/extended tokens in `tailwind.config.ts`:**
- Glass panel fills: existing `card` (`rgba(255,255,255,0.06)`) gains sibling tokens for stronger glass at different elevations — `glass-1: rgba(255,255,255,0.06)` (existing card level), `glass-2: rgba(255,255,255,0.1)`, `glass-3: rgba(255,255,255,0.15)` (higher-elevation panels, hero cards).
- Backdrop blur: `blur-glass: 24px` (standard panels), `blur-hero: 40px` (hero/spatial panels), both paired with `saturate(180%)` in the utility class that uses them (Tailwind's `backdrop-blur` + a small `backdrop-saturate-[1.8]` utility — no new plugin needed).
- Depth shadow: `shadow-depth: 0 8px 32px rgba(0,0,0,0.28)`.
- Border: existing `border` token stays for accent-colored borders; add `border-glass: rgba(255,255,255,0.18)` for the neutral glass edge.
- Motion durations (used by Framer Motion, not Tailwind): micro-interactions 150–300ms, glass morph/panel transitions 400–600ms, both using a spring easing (`type: 'spring', damping: 20, stiffness: 90` — matches Framer Motion's recommended feel for premium glass UI, avoids the mechanical feel of linear/cubic-bezier timing).

**New dependencies:**
- `framer-motion` — panel entrance/morph transitions, hover tilt, press scale, ambient blob drift.
- `three`, `@react-three/fiber`, `@react-three/drei` — the two scoped WebGL accents only (Section 5). Both are dynamically imported (`next/dynamic`, `ssr: false`) so no page that doesn't use them ships the ~600KB+ Three.js bundle.

**Interaction patterns (applied via Framer Motion, consistently across all glass panels/cards):**
- Hover: subtle 3D tilt (`perspective(800px) rotateX/rotateY` clamped to ±4deg, tracking pointer position) + shadow deepens.
- Press: scale 0.97 → 1.0 on release.
- Panel entrance: fade + 8px translateY + slight scale (0.98 → 1), staggered 30–50ms per item in lists (matches existing `fadeSlideIn` intent, upgraded to spring physics).
- Ambient background: 2–3 large, heavily blurred, slowly drifting gradient "blobs" behind hero sections (dashboard, login/signup) using the `primary`/`accent` colors at low opacity — pure CSS/Framer Motion, no WebGL.
- **`prefers-reduced-motion: reduce`** disables all of the above (tilt, drift, spring transitions) in favor of instant/static states — this is a hard requirement, not a nice-to-have, given this app's existing accessibility bar.

**Typography and iconography are unchanged.** Financial data read by non-technical users needs maximum scannability; a display-futuristic typeface actively works against that. The existing `font-mono` convention for money/dates stays.

## 4. WebGL Accents (Scoped to Exactly Two)

Per the approved approach, real 3D/WebGL is used only in two specific, non-data spots — never for the numbers themselves:

1. **Dashboard hero** (`app/dashboard/page.tsx`): an ambient animated glass/liquid orb (`@react-three/drei`'s distorted sphere + custom shader, or an equivalent low-poly liquid blob) rendered behind/beside the summary cards. Its color and motion intensity respond to the user's current cash-flow state (calmer blue-green drift when on track, a warmer amber pulse when `isShortfall` is true, sourced from data the dashboard already fetches) — motion that means something, not pure decoration.
2. **Login/signup hero** (`app/login/page.tsx`, `app/signup/page.tsx`): a 3D glass scene rendered alongside the auth form. The form itself remains plain, fully accessible HTML — the 3D scene is a decorative companion that never blocks, delays, or is required to complete login/signup.

**Fallback behavior (required for both):**
- `prefers-reduced-motion: reduce` → static gradient-blur PNG/SVG in place of the WebGL canvas.
- Narrow viewport (mobile breakpoint, matching this app's existing responsive breakpoints) → same static fallback, to protect mobile performance and battery.
- WebGL context creation failure (old browser, disabled GPU) → same static fallback, caught via a React error boundary around the canvas — the rest of the page must render normally regardless.

No other page gets a WebGL element. This keeps the "3D" promise real and deliberate rather than diluted across 8 pages.

## 5. Cash-Flow Trajectory Chart (New)

The cashflow page (`app/cashflow/`) gains a new animated line/area chart showing the balance trajectory over the projection window, rendered above the existing day-by-day `ProjectionList`. The list stays as the detail view; the chart becomes the at-a-glance read.

**No backend change required.** `GET /api/cycles/active` already returns a `projection` array (`{date, balance, events}[]`, one entry per day) via `lib/moneyCycle/projectCycle.ts` — this is the exact shape a line chart needs. The new `CashFlowTrajectoryChart` component consumes the same response `CashFlowClient.tsx` already fetches; no new endpoint, no new query.

**Chart spec** (per the chart-type guidance for trend/time-series data): Recharts `AreaChart` (already the project's charting library), single series, glass-styled — glowing gradient fill under the line (`accent` color, fading to transparent), animated draw-in on mount (respecting `prefers-reduced-motion`), a reference line/marker at $0 to make a shortfall visually obvious without relying on color alone (the line crosses below the marker), and a highlighted point + label at `minFutureBalanceDate` (the existing "lowest point" concept from the projection algorithm, already surfaced in the list view today). Tooltip on hover shows exact balance + date. Accessible per this app's existing chart pattern: a visually-hidden data table or `aria-label` summary alongside the SVG chart, matching how `MonthlyTrendChart`/`CategoryPieChart` are already tested for axe-core compliance.

## 6. Page-by-Page Application

All 8 pages move to the extended glass system for visual consistency (a partial redesign would read as unfinished and contradicts this project's own "same style across all pages" convention). Scope per page:

| Page | Glass/motion treatment | WebGL |
|---|---|---|
| `dashboard` | Full — hero panel, tilt cards, restyled `MonthlyTrendChart`/`CategoryPieChart` in glass frames | Yes (orb) |
| `cashflow` | Full — new trajectory chart (Section 5) + restyled list | No |
| `budgets` | Full — glass progress cards | No |
| `expenses` | Full — glass list/table, forms | No |
| `login` / `signup` | Full — glass form panel | Yes (hero scene) |
| `offline` | Restyled only (glass panel), no new motion — this is a fallback page, keep it minimal/fast | No |
| `privacy` | Restyled only — long-form text page, motion would hurt readability | No |

Coach chat UI (`components/coach/CoachCard.tsx`) and all forms (income source, bill, expense, budget) get the same glass panel/motion treatment as their host page, following existing component boundaries — no new pages are introduced.

## 7. Testing & Accessibility

- Extend the existing Playwright + axe-core suite (`e2e/accessibility.spec.ts`) to cover every page in the table above post-redesign — this project's standing WCAG 2.1 AA bar does not lower for this spec.
- New test: a `prefers-reduced-motion: reduce` pass over the dashboard and login/signup pages, asserting the WebGL canvas is absent and the static fallback renders instead.
- New test: `CashFlowTrajectoryChart` unit tests (matching the existing pattern from `MonthlyTrendChart.test.tsx`) — renders correctly from a `projection` array fixture, handles the empty/no-cycle state, renders the shortfall marker when `isShortfall` is true.
- Existing chart/component tests (`CategoryPieChart.test.tsx`, `MonthlyTrendChart.test.tsx`, dashboard/accessibility Playwright specs) get updated for the new glass markup, not rewritten from scratch.
- Manual/live verification (per this project's established practice of never trusting a report at face value): real browser check of both WebGL accents rendering, both fallback paths (reduced-motion + narrow viewport), and a full-suite axe-core pass on every touched page.
- New tests for live sync: `app/api/realtime/token/route.ts` returns a token scoped only to the caller's own channel (IDOR check — a token minted for user A must not grant access to user B's channel); each of the five mutation paths' publish call is verified to fire on success and to never throw/fail the mutation if the publish itself errors (e.g. Ably temporarily unreachable). Live two-tab verification (same account open in two browser tabs, mutate in one, confirm the other updates) as part of the manual verification pass.

## 8. Performance Guardrails

- `three`/`@react-three/fiber`/`@react-three/drei` are dynamically imported with `next/dynamic({ ssr: false })` — only the dashboard and login/signup bundles include them.
- Backdrop-blur panels are capped in count per view (no more than ~4–5 simultaneously blurred layers on screen at once) to avoid the compositing cost stacking up on lower-end devices — a known real cost of glassmorphism at scale, not a hypothetical.
- The ambient CSS blobs (Section 3) use `transform`/`opacity` only, per this app's existing animation performance convention — never animate `width`/`height`/`top`/`left`.
- Lighthouse performance pass on `dashboard` and `login` (the two heaviest pages) before considering this spec done, comparing against current production baseline.

## 9. Backend: Live Data Sync

The dashboard orb and the new cash-flow trajectory chart (Section 5) are meant to feel alive — this section adds the minimum backend needed for that, without pulling in general-purpose infrastructure.

**New dependency:** [Ably](https://ably.com) (`ably` npm package, free-tier account) — a managed realtime pub/sub service. **Not raw Redis pub/sub**: Redis pub/sub still requires something to hold an open subscribing connection to relay messages onward to the browser, and Vercel's serverless functions aren't designed to hold a connection open indefinitely between invocations. Ably (and equivalents like Pusher) solve the actual shape of this problem: the serverless backend does a simple REST call to publish an event, and Ably's own infrastructure maintains the realtime connection to the browser. Free tier: 6M messages/month, 200 concurrent connections — well beyond what a personal-use app needs, and consistent with this project's standing free-tier-only constraint.

**Architecture:**
- Each authenticated user gets a private Ably channel scoped to their own `userId` (e.g. `user:{userId}:cycle-updates`), authorized via a short-lived token minted by a new `app/api/realtime/token/route.ts` endpoint. That endpoint resolves the caller's own `userId` server-side via `getCurrentUser()` — the same IDOR-safe pattern every existing route in this app already follows; it never trusts a client-supplied user ID, and a token for one user's channel can never be issued to another user.
- The dashboard and cashflow pages connect directly to Ably using that token via the `ably` client SDK (a new `useRealtimeCycleUpdates(userId)` hook) — no custom SSE proxy route is needed; Ably's client library owns the realtime connection.
- Every existing mutation that changes cash-flow-relevant data — `markBillPaid` (`lib/bills/actions.ts`), `updateCycleAmount` (`lib/moneyCycle/actions.ts`), income actions (`lib/income/actions.ts`), `POST /api/cycles`, and the four chat tool handlers in `app/api/cycles/chat/route.ts` — publishes a small `{ type: 'cycle-updated' }` event to that user's channel immediately after its existing database write succeeds, via a new thin wrapper `lib/realtime/publish.ts` (`publishCycleUpdate(userId)`). The publish is fire-and-forget: a failed publish is logged and never fails the underlying mutation — the UI already reflects the change locally from the mutation's own response; live sync to *other* open tabs/devices is additive, not load-bearing.
- On receiving an event, the client re-fetches the existing `GET /api/cycles/active` endpoint — same data, same endpoint, no new read logic — and animates the chart/orb from the old values to the new ones.

**What this changes in existing files:** one additional line (the publish call) in each of the five write paths listed above. No existing validation, business logic, or response shape changes in any of them.

**New files:** `lib/realtime/publish.ts`, `app/api/realtime/token/route.ts`, `hooks/useRealtimeCycleUpdates.ts`.

**Secrets:** `ABLY_API_KEY` is server-only, following this project's existing secret-handling convention (`CRON_SECRET`, the Gemini key) — only the short-lived, per-user scoped token ever reaches the client.

## 10. Explicitly Out of Scope

- **Mobile app** — separate repo, separate spec, built after this one ships and the visual language is proven.
- **AWS / hosting / infrastructure** — the user has explicitly deferred this to a later, separate conversation. (Ably is a standalone realtime service, not part of that later infrastructure discussion.)
- **Database schema changes** — no new tables/columns; `prisma/schema.prisma` is unmodified.
- **Changes to existing validation, business logic, or response shapes** — every mutation's existing behavior is preserved exactly; live sync (Section 9) is strictly additive.
- **New pages/screens** — the user explicitly left screen count open; this spec's answer is "the 8 pages that already exist," not a new set of screens invented for the redesign.

## 11. Rollout

Directly to `main`, no feature flag — matching this project's standing convention across every prior spec.
