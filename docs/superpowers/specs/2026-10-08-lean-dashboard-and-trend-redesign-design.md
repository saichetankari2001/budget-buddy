# Lean Dashboard & Trend-Aligned Redesign — Design Spec

**Status:** User granted full authority — no approval gate on design decisions for this spec. Proceeding directly from spec to plan to execution.

## Context

The user's complaint: Budget Buddy is "confusing," has "a lot of things," and "the page keeps scrolling down." This is a direct consequence of an earlier session's "single-page bento consolidation," which merged Dashboard/Expenses/Budgets/Cash Flow into one long scrolling page at `/dashboard`.

Checked against real 2026 fintech UX research (not assumption): leading finance apps keep the home dashboard answering "how much do I have, what happened recently, is anything wrong" in under 3 seconds, with high-level metrics up front and complexity pushed into dedicated screens — not crammed into one scroll. One stat: **70% of users drop a fintech app over complex navigation**. The single-page consolidation was a step away from current trend, not toward it.

Concrete evidence this already cost real engineering complexity, not just "feels long": `components/ui/Header.tsx`'s anchor-scroll logic needs a `ResizeObserver` workaround because client components below the fold (Coach history, charts) grow the page's height *after* the browser's native on-load anchor scroll already fired — the Expenses section measured ~1300px below viewport, Budgets over 6000px, before that workaround. Reversing the consolidation deletes this complexity, it doesn't just move pixels around.

User's own framing, in full: remove unnecessary features (clarified via conversation: don't delete anything already built — demote/relocate), align with current market trend, and make it "far better than today's trend." Full authority granted — no further design approval needed.

## Goals

- A lean home dashboard that answers the three urgent questions immediately: balance/spend state, recent activity, anything wrong (health score, Coach alerts).
- Real per-concern navigation restored: Expenses, Budgets, Cash Flow each get their own focused page again.
- Nothing already built gets deleted. Secondary features move to where they're actually used, not removed.
- Keep every already-reviewed business-logic path (expense creation, budget calc, cash-flow projection, health score, anomaly detection, Coach) completely untouched — this is a layout/IA/navigation change, not a logic change.

## Information architecture — before and after

**Before (current):** one page, nine stacked sections (hero → 3 stats → Coach → Spending Breakdown → 2 charts → Budget progress → full Expenses → full Budgets → full Cash Flow), anchor-scroll nav with IntersectionObserver active-state tracking.

**After:**

| Page | Contains | Removed from here |
|---|---|---|
| `/dashboard` (Home) | Hero, 2 stats (Total spent this month, Financial health), Money Coach (`CoachCard`), Spending Breakdown (cycle recommendation, `SpendingBreakdownCard` — kept paired with Coach since both are live-cycle state), ONE chart: category pie (this month) | GST stat, 6-month trend chart, Budget progress, full Expenses/Budgets/Cash Flow |
| `/expenses` (real page again) | Expense filters + list (`ExpensesClient`, unchanged — CSV import/export already lives inside it), GST paid this month stat, 6-month trend chart (moved here — it's expense-history visualization, belongs with the expense list) | — |
| `/budgets` (real page again) | Budget progress (`BudgetProgress`, monthly-limit view) + Manage budgets (`BudgetsClient`, unchanged) — consolidated onto one page since they're the same concern (view + edit) | — |
| `/cashflow` (real page again) | Income sources, Bills, Projection list, Cash-flow trajectory chart (`CashFlowClient`, entirely unchanged) | — |

Rationale for what stays on Home vs. moves: Home answers "what's happening right now" (today's spend, health score, the AI Coach's live guidance, this cycle's category recommendations) — all inherently *current-state* concerns. Everything that moved is either a longer-horizon view (6-month trend, GST which is a monthly/tax concern) or a management/CRUD surface (manage budgets, full expense list with filters) — both better served by their own focused page than competing for space on the glance-screen.

## Navigation

`Header.tsx` reverts from anchor-links-with-IntersectionObserver back to real route links: Dashboard, Expenses, Budgets, Cash Flow — `usePathname()`-based active-state highlighting (the pattern this app used before the consolidation), no scroll listeners, no `ResizeObserver` workaround. This is a net deletion of client-side complexity, not an addition.

`app/expenses/page.tsx`, `app/budgets/page.tsx`, `app/cashflow/page.tsx` stop being `redirect()` stubs and become real server components again, each assembling only the data its own section needs (a strict subset of what `app/dashboard/page.tsx` currently assembles in one giant function) and rendering the same client components with the same props they already take — **zero prop-shape changes** to `ExpensesClient`, `BudgetsClient`, `CashFlowClient`, `BudgetProgress`, `CategoryPieChart`, `MonthlyTrendChart`. This is purely about which server component calls them and what wraps them.

## Visual design — carried over from the earlier (paused) color-trend research

This session already researched current fintech visual trends before being redirected to the financial-intelligence work. That research stands and applies now: the current violet/cyan palette reads as "generic AI app," which a real design-intelligence tool flagged as something fintech specifically should avoid. Apply the previously-agreed **hybrid** direction:

- `trust` (blue, `#2563EB`) becomes the primary interactive/brand color — buttons, active nav state, focus rings, neutral chart lines (the 6-month trend line, the cash-flow trajectory line).
- `primary` (violet, `#8b5cf6`, unchanged value) stays reserved **exclusively** for Money Coach / AI surfaces — chat bubbles, Coach panel accent, AI-generated insight callouts.
- `gain` (green, extend existing `success` `#34d399`) and `destructive` (red, unchanged `#f87171`) stay the money-semantic pair: `BudgetProgress`'s "under budget" state changes from `primary` to `gain` (currently it's `destructive` for over-budget and `primary` for under — under-budget should read as a positive, not just "not red").
- Background, typography (Inter + JetBrains Mono), icon set (Heroicons) — unchanged, already confirmed current.
- New `docs/design-tokens.md` documenting each token's role, so a future chart doesn't reintroduce raw hex (the exact bug already found once in `CashFlowTrajectoryChart.tsx`/`MonthlyTrendChart.tsx`, which currently hardcode `#8b5cf6`/`#22d3ee` instead of semantic tokens).

## "Far better than today's trend" — two small, high-leverage additions beyond parity

Per the research, two near-term patterns are worth building now rather than just matching the baseline:

1. **Frequency/urgency/consequence visual weight.** The research's stated principle: high-frequency actions easy to reach, high-consequence actions get visual emphasis + confirmation. Apply concretely: the Home dashboard's two stat cards and Coach stay full-width/prominent (highest frequency — checked daily); a destructive action already has `destructive`-token styling (confirm still true post-palette-change, don't regress it).
2. **Horizontal-scroll quick-access hub for secondary actions**, per the research's "fintech apps trending toward horizontal-scrolling hubs to keep complex features accessible without cluttering the home screen." On Home, below the stat row, add a single-row horizontally-scrollable strip of quick-action links to Expenses/Budgets/Cash Flow (icon + label, `GlassPanel elevation={1}`, `overflow-x-auto` row) — gives one-tap access to the three moved sections without adding vertical scroll or a new nav paradigm. This is additive only; the `Header` nav links still work as the primary route.

## Non-goals

- No change to any business logic: expense creation/validation, budget calculation, cash-flow projection (`projectCycle.ts`), health score, anomaly detection, Coach prompts/tool-calling — all untouched.
- No deletion of any feature. GST tracking and the 6-month trend chart both remain fully functional, just relocated.
- No change to the AI chat's tool-calling surface or the push-notification system.
- No new database queries beyond re-partitioning what `app/dashboard/page.tsx` already queries across four smaller page components instead of one large one — each new page queries strictly less than the current single page did for that page's own concern (e.g. `/budgets` doesn't need the 6-month-expense query at all).

## Testing

- Every existing unit test for `ExpensesClient`, `BudgetsClient`, `CashFlowClient`, `BudgetProgress`, `CategoryPieChart`, `MonthlyTrendChart`, `CoachCard`, `SpendingBreakdownCard` stays untouched — same components, same props, different parent.
- New/updated: each of the four page-level server components gets its own data-assembly test coverage (or equivalent — check this codebase's convention for testing page-level RSCs, likely via e2e rather than unit, given no existing `page.test.tsx` convention was found for `app/dashboard/page.tsx` itself).
- `Header.tsx`'s new route-based nav needs new tests replacing the anchor/IntersectionObserver tests it had for the consolidated version.
- Every Playwright e2e spec currently navigating to `/dashboard#expenses` etc. gets retargeted to the real `/expenses` route; the three old-route-redirect regression tests get inverted (confirm `/expenses` now renders content directly, not a redirect).
- axe-core WCAG coverage extends to each of the four pages independently (each is now simpler/shorter than the one consolidated page was, so this should be a straightforward pass, not a new risk).
- Color-token changes get a contrast re-check (same discipline as the original liquid-glass redesign) since any hex value change risks a WCAG regression — verified via a real axe-core run, not assumed.

## Open implementation details (for the plan to settle)

- Exact Tailwind classes for the new horizontal-scroll quick-access hub.
- Exact query partitioning per page (which Prisma calls move to which file) — mechanical, follows directly from the table above.
- Whether `app/dashboard/page.tsx`'s current single data-assembly function gets split into four files' worth of logic via straightforward copy-and-trim, or whether a shared helper is worth extracting — default to straightforward copy-and-trim per this plan's own precedent (the health-score plan's duplicated prior-cycle lookups were explicitly accepted as reasonable for a small number of call sites).
