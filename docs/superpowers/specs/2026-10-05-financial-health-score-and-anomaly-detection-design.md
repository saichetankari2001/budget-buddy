# Financial Health Score & Smarter Anomaly Detection — Design Spec

**Status:** Approved by user, 2026-10-05. Phase 1 of a two-phase plan (Phase 2: rolling cash-flow
forecast + savings goals — not in scope here).

## Context

The user asked for Budget Buddy to be "best compared to the current market trend" — clarified to
mean the actual financial intelligence (how the budget calculates, how well it builds the user's
awareness) and the app staying advanced for "upcoming years," not a visual/color redesign (that
request was explicitly superseded mid-brainstorm).

Market research (Oct 2026) on leading budgeting apps — WalletHub, Copilot Money, Monarch, Cleo,
PocketGuard, EveryDollar, Quicken Simplifi — surfaced four real feature gaps. This spec covers the
two prioritized for Phase 1:

1. **No financial health score.** WalletHub's signature feature is a single composite "how am I
   doing" number. Budget Buddy shows raw numbers (balance, days left, daily budget) but never
   synthesizes them into one "improving/declining and why" signal.
2. **Anomaly detection is static, not personalized.** Category alerts fire only at a fixed
   80%/100% of that category's cycle budget. Real tools (Monarch, Cleo) flag spending against the
   user's own recent baseline, catching an unusual single purchase immediately rather than only
   after a budget is mostly spent.

Deferred to Phase 2: rolling 30-90 day cash-flow forecast (current projection is cycle-bound), and
goal-based savings tracking. Explicitly rejected as out of scope for this app: net worth tracking,
investment tracking, debt/loan payoff strategies — these need new data models (assets, liabilities,
interest rates) the user has never indicated having; building them would be scope bloat for what is
a cash-flow budgeting tool, not a wealth-management app.

## Goals

- Give the user one explainable number that reflects whether their financial habits are improving,
  without introducing a black box — every point gained or lost must be traceable to a plain-language
  reason the Coach can state.
- Catch an unusually large single purchase the moment it happens, independent of how much of the
  category's budget remains — complementing (not replacing) the existing budget-threshold check.
- Reuse existing data and existing mechanisms wherever possible. No new Prisma models, no schema
  migration, no new infrastructure (no new notification pipeline, no new cron job).

## Non-goals

- No net worth, investments, or debt tracking.
- No change to the rolling-forecast window (`projectCycle.ts`'s projection stays cycle-bound; that's
  Phase 2).
- No change to the existing 80%/100% budget-threshold check's own behavior — the anomaly check is
  additive, a second independent signal, not a replacement.
- No UI redesign beyond adding one new stat cell for the score.

## Part 1: Financial Health Score

### Calculation

A pure function, computed on demand from existing data — never persisted, so it can be computed for
the active cycle *or* any past cycle identically, which is what makes a "+8 since last cycle" delta
possible without a new table.

```
healthScore(cycleId) -> { total: number (0-100), components: { budgetAdherence, pacing, billPunctuality } }
```

Three components, each independently explainable:

- **Budget adherence — 0 to 40 points.** For each category tracked by the cycle's
  `CycleCategoryBudget` rows (via the existing `computeCategoryTotalsForWindow` helper,
  `lib/moneyCycle/categoryTotals.ts`), compute `unusedFraction = max(0, 1 - actual/recommended)`
  clamped to `[0, 1]`. Average `unusedFraction` across all tracked categories (including the
  "Other" row), multiply by 40. A category with no spend yet contributes `unusedFraction = 1`
  (full marks) — not spending is not a problem to penalize.
- **Spending pace — 0 to 30 points.** Reuse `computePacingStatus` (`lib/utils/moneyCycle.ts`),
  which already derives `plannedRatePerDay = startingAmount / totalDays` and
  `actualRatePerDay = spentSoFar / max(daysElapsed, 1)` to decide `ON_TRACK` vs `OVER_PACE`. Rather
  than re-deriving those internally, extend that function (or add a sibling that returns the two
  rates alongside the status) so this score can use the continuous values instead of just the
  enum. `ON_TRACK` → 30 points. `OVER_PACE` → `30 * (plannedRatePerDay / actualRatePerDay)` clamped
  to `[0, 30]`. No divide-by-zero risk: `OVER_PACE` is only ever returned when
  `actualRatePerDay > plannedRatePerDay`, and `plannedRatePerDay` is always `> 0` for a real cycle
  (a cycle always has `totalDays >= 1` and a positive `startingAmount`), so `actualRatePerDay` is
  guaranteed positive whenever this branch runs.
- **Bill punctuality — 0 to 30 points.** Of the cycle's `Bill` rows whose `dueDate` has already
  passed (relative to "now"), what fraction were paid (`paidExpenseId` set) with the paid
  `Expense.date <= dueDate`. `points = 30 * (paidOnTime / totalDue)`. If no bills were due yet,
  this component is full marks (30) — nothing to be punctual about yet is not a failure.

Total = sum of the three components, rounded to the nearest integer, range 0-100.

**Trend delta:** when displaying the score for the *active* cycle, also compute the score for the
most recently completed (or cancelled) cycle before it, using the same pure function against that
cycle's own historical data, and show the difference ("+8 since last cycle"). If there is no prior
cycle, show the score with no delta.

### Explaining the score

The Coach must be able to state, in plain language, which component is dragging the score down —
this is the actual point (awareness, not a vanity number). Each component's point value, plus which
categories/bills specifically caused the loss (e.g., "the Transport category" or "the phone bill
paid 3 days late"), is returned alongside the score so the Plan/Check-in prompts (`lib/ai/coach.ts`)
can reference it directly, the same way they currently reference `shortfallWarning`.

### Where it's exposed

- New field on the existing `GET /api/cycles/active` response: `healthScore: { total, delta,
  components }`. No new route.
- New dashboard stat cell using the existing `StatCard` component (trend-sparkline support already
  built) — the sparkline shows the score trajectory across the last few completed cycles plus the
  current one.
- Folded into `generatePlanMessage`/`generateCheckInMessage` prompts as additional context, the
  same way `shortfallWarning` already is, so the Coach can mention it without a separate chat tool.

## Part 2: Smarter (baseline-aware) anomaly detection

### Calculation

A new check, additive to the existing `checkCategoryThresholdAndNotify`
(`lib/moneyCycle/categoryThresholdNotifications.ts`), triggered from the exact same call sites
(`POST /api/expenses` and `logExpense` in `lib/expenses/actions.ts`) immediately after an expense is
created — both the web form and the AI chat's `log_expense` tool get this automatically, since both
already call the existing threshold check from the same place.

```
checkExpenseAnomalyAndNotify(userId, categoryId, newExpense: { amount, id }) -> void
```

- Fetch the user's last 10 `Expense` rows in that category (`orderBy: { date: 'desc' }`,
  `take: 10`), excluding the just-created one.
- Require at least 3 prior expenses in that category — below that, skip (not enough history to call
  anything "unusual"; avoids false positives on a brand-new category).
- Compute `baseline = average(amount)` of those prior expenses.
- If `newExpense.amount >= 2.5 * baseline`, send a push notification: `"This $X {description} is
  well above your usual ${baseline} {category} spend."` Distinct message, fired independently of
  (and possibly alongside) the existing budget-threshold message — the two signals answer different
  questions ("is this one purchase unusual" vs. "is this category near its budget") and should not
  suppress each other.
- Like the existing threshold check, this is fire-and-forget: wrapped in try/catch, never throws,
  never blocks or fails the expense creation that triggered it — matching the established contract
  every other notification path in this codebase follows.
- No re-notification dedupe field needed (unlike `notifiedAt80`/`notifiedAt100`, which dedupe against
  a budget state that persists across multiple expenses) — each anomaly check only ever concerns the
  one expense that triggered it, so there's nothing to dedupe.

## Data model impact

**None.** No new Prisma models, no new columns, no migration. Both features are pure functions over
existing `Expense`, `Bill`, `CycleCategoryBudget`, and `MoneyCycle` rows.

## Testing

- `lib/health/computeHealthScore.ts` (new): pure-function unit tests — deterministic inputs for
  each component (all-under-budget, all-over-budget, mixed; on-time bills, late bills, no bills due
  yet; on-pace, over-pace), plus a test for the trend-delta lookup against a prior completed cycle.
- `lib/moneyCycle/expenseAnomalyNotifications.ts` (new, sibling to
  `categoryThresholdNotifications.ts`): unit tests mirroring that file's existing test style —
  fewer-than-3-prior-expenses skips, a normal expense doesn't fire, a ≥2.5x expense fires with the
  correct message, a failure in the push send doesn't throw.
- Integration: extend the existing `POST /api/expenses` route test and `lib/expenses/actions.test.ts`
  to assert the new anomaly check is called alongside the existing threshold check.
- `app/api/cycles/active/route.test.ts`: assert the response now includes `healthScore`.
- New dashboard stat cell: a component test for the `StatCard` usage (score + sparkline), and an
  e2e/axe-core pass since this adds a new element to an already-audited page.

## Open implementation details (for the plan to settle, not architectural)

- Exact file/function names beyond what's specified above.
- Whether the health-score stat cell sits in the existing stat-pair row (making it a trio) or gets
  its own row — a layout detail, not a design decision.
- Exact push-notification copy wording (the spec gives the substance, not final copy).
