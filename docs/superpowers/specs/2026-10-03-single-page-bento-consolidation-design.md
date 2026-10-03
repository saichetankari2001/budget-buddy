# Single-Page Bento Consolidation — Design Spec

**Status:** Approved for planning
**Depends on:** every existing feature currently split across `/dashboard`, `/expenses`, `/budgets`, `/cashflow` — this spec is a composition and visual-layer change, not a rewrite of any feature's business logic.
**Project sequencing:** the UI-direction sub-project queued after the Smart Spending Recommendation feature (2026-10-03). Glassmorphism 2.0 (pulled back to focal elements) + a Bento Grid layout, folded into this single-page consolidation per the user's own framing.

## 1. Goal

Replace the app's four separate authenticated pages (Dashboard, Expenses, Budgets, Cash Flow) with one page at `/dashboard` that holds everything, laid out as a Bento Grid. The old routes redirect there. No feature's underlying data model, API, or business logic changes — this is entirely about how the existing pieces are composed and presented.

## 2. Current State

- **Four pages**, each a server component importing `Header`, fetching its own data, and rendering one dedicated client component:
  - `app/dashboard/page.tsx`: stats (total spent, GST paid), `CategoryPieChart`, `MonthlyTrendChart`, `BudgetProgress`, `CoachCard` (money-cycle chat + cycle controls), `SpendingBreakdownCard`. Already uses `GlassPanel`, `AmbientBlobs`, `DashboardHeroOrb` from the prior liquid-glass redesign.
  - `app/expenses/page.tsx`: `ExpenseFilters` + `ExpensesClient` (full add/edit/delete list).
  - `app/budgets/page.tsx`: `BudgetsClient` (per-category monthly limits), wrapped in one `GlassPanel`.
  - `app/cashflow/page.tsx`: `CashFlowClient` (income sources + bills + the cash-flow projection chart).
- **`components/ui/Header.tsx`**: a `NAV_LINKS` array of four real routes, highlighted via `usePathname()`, plus a logout button. Shared across all four pages (and reused as-is on this consolidated page, with the changes in Section 4).
- **`app/page.tsx`** (the bare root `/`): already just `redirect('/dashboard')` — confirms `/dashboard` as the app's intended front door today.
- **`middleware.ts`**: protects `/dashboard/:path*`, `/expenses/:path*`, `/budgets/:path*`, `/cashflow/:path*` uniformly via a JWT cookie check, redirecting to `/login` if absent.
- **Design tokens** (from the liquid-glass redesign): `bg-glass-1/2/3`, `border-border-glass`, `backdrop-blur-glass` (24px) / `backdrop-blur-hero` (40px), `backdrop-saturate-180`, `shadow-depth`. `GlassPanel` (`elevation: 1|2|3`, `hoverable`) and `AmbientBlobs` are the existing primitives this spec builds on, not replaces.

## 3. Routing

`/dashboard` becomes the single surviving authenticated route. `app/expenses/page.tsx`, `app/budgets/page.tsx`, and `app/cashflow/page.tsx` are replaced with the same one-line redirect pattern already used at the bare root (`redirect('/dashboard#expenses')`, etc.) — not a `next.config.js`-level redirect, to stay consistent with this codebase's existing convention and avoid any ordering ambiguity between config-level redirects and the auth middleware. `middleware.ts`'s matcher is unchanged: all four paths stay protected, so an unauthenticated visit to `/expenses` still bounces to `/login` before it ever reaches the redirect.

Anchor ids on the consolidated page: `#expenses`, `#budgets`, `#cashflow` (the hero/stats/coach/spending-breakdown area at the top has no anchor — it's the page's natural landing point, not a deep-linked section).

## 4. Header & In-Page Navigation

`Header`'s `NAV_LINKS` change from page routes to same-page anchors (`/dashboard#expenses` etc.), rendered as `<a>` smooth-scroll links rather than Next `<Link>` page navigations (a plain anchor is correct here — no page transition is needed, and it keeps browser back/forward and direct-link behavior native). Active-link highlighting changes from `usePathname()` (meaningless now — every link resolves to the same path) to an `IntersectionObserver` watching each section's root element, highlighting whichever section is most visible in the viewport — a self-contained addition to `Header`, not a new global scroll-tracking system. `prefers-reduced-motion` disables the smooth-scroll behavior (`scroll-behavior: auto` instead of `smooth`), matching this app's existing reduced-motion discipline from the liquid-glass redesign.

## 5. Bento Grid Layout & Component Composition

The page becomes one CSS Grid (`grid-template-columns: repeat(auto-fit-ish fixed breakpoints)` — concrete column counts specified below), with every existing feature's own client component dropped into a grid cell unchanged. No client component is rewritten; only their *container* changes.

`Header` and `AmbientBlobs` currently render once per page (so four times total across the app, one per visit). On the consolidated page they render exactly once each, at the top of the single `app/dashboard/page.tsx`, same as `Header` already does today on any one of the four pages — not once per former-page-worth-of-content.

Cell → component mapping, roughly top to bottom:
1. **Hero row** (full width): `AmbientBlobs` + `DashboardHeroOrb` behind a heading, same as today.
2. **Stat pair** (2 cells side by side on desktop, stacked on mobile): "Total spent this month", "GST paid this month" — unchanged `CountUpStat` usage.
3. **Coach / Money Cycle** (large cell, roughly 2/3 width on desktop): `CoachCard`, unchanged.
4. **Spending breakdown** (remaining 1/3, or full width below on narrower desktop breakpoints): `SpendingBreakdownCard`, unchanged.
5. **id="expenses"** (large cell, full width or 2/3): `ExpenseFilters` + `ExpensesClient`, unchanged.
6. **Category pie + trend chart** (2 cells side by side): `CategoryPieChart`, `MonthlyTrendChart`, unchanged.
7. **id="budgets"**: `BudgetsClient`, unchanged.
8. **id="cashflow"**: `CashFlowClient`, unchanged.

Exact column span numbers (e.g. `grid-column: span 2`) are an implementation-plan-level detail, not re-litigated here — the binding requirement is: every existing component above appears exactly once, in this relative order, as its own grid cell, with its own anchor id where listed.

## 6. Visual System: Glassmorphism 2.0, Pulled Back

Four pages' worth of content on one screen is a lot of density — uniform heavy blur everywhere would hurt legibility, the opposite of "more advanced," not more of it. Two visual tiers, both still `GlassPanel`-based (no new primitive needed):

- **Focal tier** (hero row, Coach/Money Cycle cell, Spending Breakdown cell): `GlassPanel elevation={2 or 3}`, `hoverable`, full existing blur/saturate/depth treatment — these are the cells meant to draw the eye first.
- **Data tier** (everything else — expenses, budgets, cash flow, the two charts): `GlassPanel elevation={1}`, not hoverable, same border/background tokens but without the heavier shadow-depth/hover-tilt interaction, so dense tabular/list content stays calm and readable. This is a prop-level distinction on the existing `GlassPanel`, not a new component.

## 7. Data Flow

`app/dashboard/page.tsx` (replacing its current body) fetches, in one `Promise.all`, every query the four pages currently run individually — `prisma.expense.findMany` (two different windows: six-month for aggregation, filtered list for the expenses cell), `prisma.budget.findMany`, `prisma.category.findMany`, `prisma.incomeSource.findMany`, `prisma.bill.findMany` — then passes each slice to the same client components that already consume that exact shape today. `ExpenseFilters`/`ExpensesClient`'s existing `searchParams`-based filtering (currently read from the page's own `searchParams` prop) continues to work identically, since it's still the same route handling the same query-string shape.

## 8. Responsive Behavior

Grid collapses to a single stacked column below the desktop breakpoint — every cell still renders, in the same top-to-bottom order as Section 5, just without the side-by-side pairing. No tabs, no hidden/collapsed sections, no new interaction paradigm: this matches the existing mobile-first discipline already used throughout this app (e.g. `CashFlowClient`'s existing responsive behavior is untouched).

## 9. Testing

- Existing unit tests for every client component (`ExpensesClient.test.tsx`, `BudgetsClient.test.tsx`, `CashFlowClient.test.tsx`, `CoachCard.test.tsx`, `SpendingBreakdownCard.test.tsx`, the two chart tests) are untouched — same components, new parent, no prop-shape change.
- New/updated tests: the consolidated `app/dashboard/page.tsx`'s data-fetching (a new or extended `page.test.tsx`-style test, matching how this app already tests server-component data assembly where it does), the three redirect pages (`redirect()` called with the right target), `Header`'s new anchor-link + `IntersectionObserver` active-state logic.
- Playwright: every existing spec that currently navigates to `/expenses`, `/budgets`, or `/cashflow` gets its navigation step changed to an anchor-scroll-then-assert on `/dashboard`, or a direct `/dashboard#section` visit — no spec is deleted, each is retargeted. axe-core coverage extends to the full consolidated page given its much higher element density per screen.

## 10. Explicitly Out of Scope

- **Any business-logic change** to expenses, budgets, cash flow, money cycles, or the spending recommendation — this spec is presentation/composition only.
- **A new design primitive beyond `GlassPanel`'s existing `elevation`/`hoverable` props** — the two-tier glass treatment in Section 6 uses what already exists.
- **Removing or renaming any existing API route** — only the four *page* routes change; nothing under `app/api/` is touched.
- **A broader rebrand** (new color palette, new typography) — this is layout and glass-intensity, not the color/type system itself.

## 11. Rollout

Directly to `main`, no feature flag — matching this project's standing convention.
