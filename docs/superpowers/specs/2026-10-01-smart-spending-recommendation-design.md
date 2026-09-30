# Smart Spending Recommendation — Design Spec

**Status:** Approved for planning
**Depends on:** Money Cycle + AI Coach (2026-09-09), Cycle Chat + Deferred Fixes (2026-09-24), Income/Bills/Cash-Flow Projection (2026-09-27), Futuristic Liquid-Glass Redesign (2026-09-29)
**Project sequencing:** First sub-project of a larger request. A second sub-project — a visual redesign informed by current (2026) design trends, likely reshaping this same page into a bento-grid single-page layout — follows this one. A third, separate "sell this to companies" scope was explicitly ruled out in brainstorming: this stays a personal, single-user app; the ask is engineering rigor (testing, security, documentation), not multi-tenant product features.

## 1. Goal

When a user starts a Money Cycle (e.g. "I have $300, it needs to last 12 days"), show them — immediately, and for the life of the cycle — a category-by-category recommendation for how to spend that money, derived from their own real spending history, not a generic template. Two pie charts (their pattern vs. the recommendation) plus an exact-numbers table make the comparison concrete; live tracking against the recommendation, plus a push notification when a category runs hot, carry it through the cycle. This evolves the existing Money Cycle feature — it does not replace or duplicate its `safeToSpend`/cash-flow-projection logic, which stays the single source of truth for "how much can I spend, total."

## 2. Current State

- **Money Cycle today:** `StartCycleForm` inside `CoachCard.tsx` collects `startingAmount` + `endDate`; `POST /api/cycles` creates the cycle and computes `remainingAmount`/`daysRemaining`/`safeToSpend`/`committedSpend` via `lib/moneyCycle/projectCycle.ts` — the app's single source of truth for these figures, already reused by `GET /api/cycles/active`, `updateCycleAmount`, and the daily check-in cron. `committedSpend` is the total of upcoming bills/recurring obligations already reserved out of `remainingAmount`.
- **Category aggregation today:** `lib/utils/expenseAggregation.ts`'s `aggregateByCategory` groups a list of expenses by category — already used by the dashboard's `CategoryPieChart` (this month only). No all-time or per-cycle category aggregation exists yet.
- **Expense creation today:** `POST /api/expenses` (`app/api/expenses/route.ts`) validates via `createExpenseSchema`, confirms the category belongs to the caller, creates the `Expense` row, returns it. No side effects beyond that.
- **Push notifications today:** `lib/push/send.ts`'s `sendPushNotification` sends a single push given a subscription + `{title, body}`. Currently only called from the daily `coach-checkin` cron.
- **Schema today:** no model stores a per-cycle, per-category target. `Category`, `Expense`, `MoneyCycle` exist as read above (prisma/schema.prisma).

## 3. The Recommendation Algorithm

Pure, independently-testable function (no DB access), matching the existing convention for `computeCashFlowProjection`.

**Input:** all-time historical expenses grouped by category (`aggregateByCategory`'s existing output shape), plus the cycle's discretionary pool.

**Discretionary pool** = `Math.max(remainingAmount - committedSpend, 0)`, both already computed by `projectCycle` at cycle-creation time — not a new calculation. This is deliberate: splitting the *raw* `startingAmount` by category would double-count money already reserved for bills (once as `committedSpend`, again inside a category slice) — the exact "disagreeing numbers" bug class this project has hit and fixed three times already (documented in the cash-flow projection spec). Category amounts must sum to exactly the discretionary pool, which itself is derived from the same `projectCycle` call already made during cycle creation.

**Steps:**
1. Sum all-time historical spend per category. Sort descending by total.
2. Take the top 5 categories by historical spend. Fold everything else into a single "Other" bucket. (Pie charts become unreadable past ~5-6 slices — an established charting guideline, not a style preference.)
3. Compute each kept category's share of total historical spend (including what's folded into Other).
4. Scale: `recommendedAmount = share * discretionaryPool`, for each of the 5 categories and Other. Rounding remainder (from floating-point division) goes to the largest category, so the six amounts always sum exactly to the discretionary pool — never off by a cent.
5. **No history at all** (new account, or all-time spend is $0): fall back to an even split of the discretionary pool across the user's existing categories (capped at 5, "Other" only if they have more than 5 categories already). If the user has zero categories, return an empty recommendation set — the UI shows a "log a few expenses first" message instead of charts.
6. **Discretionary pool is $0** (a cycle already in shortfall before it starts): every recommended amount is $0. The UI shows the recommendation table with $0s rather than hiding it — seeing "$0 for everything" is itself useful information given the shortfall.

**Required test scenarios:** normal case with >5 categories (Other bucket populated correctly), exactly 5 categories (no Other bucket), fewer than 5 categories, no history, zero categories, zero discretionary pool, a discretionary pool that doesn't divide evenly (rounding-remainder correctness — amounts sum exactly).

## 4. Data Model

```prisma
model CycleCategoryBudget {
  id                String     @id @default(cuid())
  cycleId           String
  cycle             MoneyCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  categoryId        String?
  category          Category?  @relation(fields: [categoryId], references: [id])
  // Denormalized rather than joined every read: "Other" has no real Category row (categoryId is
  // null), and a category the user later renames/recolors shouldn't retroactively change what a
  // past cycle's recommendation said at the time.
  categoryName      String
  categoryColor     String
  recommendedAmount Decimal    @db.Decimal(10, 2)
  notifiedAt80      DateTime?
  notifiedAt100     DateTime?
  createdAt         DateTime   @default(now())

  @@index([cycleId])
}
```

Requires adding the reverse-relation fields Prisma needs on both existing models: `MoneyCycle` gains `categoryBudgets CycleCategoryBudget[]`, `Category` gains `cycleBudgets CycleCategoryBudget[]`.

Rows are written once, atomically, inside the same `$transaction` that already creates the `MoneyCycle` row in `POST /api/cycles` — never updated incrementally, so no unique constraint is needed to prevent duplicate "Other" rows; the write pattern itself guarantees at most one.

`notifiedAt80`/`notifiedAt100`: set the first time a threshold is crossed, checked before sending another alert for the same category in the same cycle — one push per threshold per category per cycle, not one per expense.

**Actual spend per category, live, during the cycle:** computed on read, not stored. For each of the (at most 5) explicitly-tracked categories, actual = sum of that cycle's `Expense` rows in that category. For "Other", actual = (sum of *all* the cycle's expenses) minus (sum of the 5 tracked categories' actual) — this correctly folds in any category the user creates *after* the cycle started (it was never one of the original top 5, so it was never going to have its own slice), without needing to store which categories map to Other at creation time.

## 5. Where It Lives, and What It Shows Over Time

New component `SpendingBreakdownCard`, rendered on the dashboard below `CoachCard` whenever an active cycle exists (mirrors how `DashboardHeroOrb` and other cycle-aware pieces already check for cycle existence). `CoachCard` itself is unchanged — it already does a lot (chat, start-cycle form, cycle stats); this is a separate, focused unit.

Two pie charts, built on the existing `CategoryPieChart` pattern (Recharts `PieChart`/`Pie`/`Cell`), plus a table beneath with exact numbers (category, recommended $, actual $ so far, % used) — charts show proportion, the table gives precision, matching this app's existing chart-accessibility convention (a real data table alongside the SVG, not color-only).

The left pie chart's meaning changes once the cycle is running:
- **Immediately after cycle creation** (before any expense has been logged in the new cycle): left pie = all-time historical pattern (what the recommendation was computed from), right pie = the recommendation. This answers "why this split?"
- **Once the cycle has at least one expense logged**: left pie switches to *actual spend this cycle, by category*, right pie stays the recommendation (static for the cycle's duration). This is the more useful comparison during the cycle — what you're actually doing against the plan, not against old history.

## 6. Reminder: Immediate, Event-Driven Category Alerts

Checked inside `POST /api/expenses`'s handler, immediately after the `Expense` row is created — not in the daily cron, per explicit approval, to match the "found out the moment it happens" feel of the reference behavior discussed in brainstorming.

After creating the expense: if there is an active cycle, find the `CycleCategoryBudget` row matching the expense's category (or the "Other" row, if the expense's category isn't one of the 5 tracked ones), compute actual-so-far for that row, and:
- If actual ≥ 100% of `recommendedAmount` and `notifiedAt100` is unset: send a push ("You've used all of your $X [category] budget for this cycle, with N days left"), set `notifiedAt100`.
- Else if actual ≥ 80% and `notifiedAt80` is unset: send a push ("You've used 85% of your $X [category] budget..."), set `notifiedAt80`.
- Otherwise: no push.

This is a fire-and-forget addition to an existing, frequently-hit write path — matching `publishCycleUpdate`'s own established contract elsewhere in this app, a failure here must never fail the expense creation itself. Wrapped in its own try/catch, logged on failure, never re-thrown.

**IDOR safety:** the `CycleCategoryBudget` lookup is scoped through `cycle.userId` (join through `MoneyCycle`, which is already scoped to `getCurrentUser()`'s `userId` the same way every other cycle-owned query in this app is) — never trusts a client-supplied cycle or category id beyond what the authenticated request's own expense creation already resolved.

## 7. Testing

- The recommendation algorithm: pure-function unit tests covering every scenario listed in Section 3.
- `POST /api/cycles`: existing tests extended to assert the `CycleCategoryBudget` rows are created correctly (categories, amounts, Other bucket) inside the same transaction.
- `POST /api/expenses`: new tests for the threshold-check side effect — fires at 80%, fires at 100%, does not re-fire once already notified, does not fire with no active cycle, never fails the expense creation if the push itself throws.
- `SpendingBreakdownCard`: unit tests for both pie-chart-meaning states (pre-expense vs. post-expense), the no-history fallback message, and the $0-discretionary-pool case.
- Playwright: a real live flow (start a cycle, log an expense that crosses 80% in a category, confirm the card updates) plus axe-core WCAG 2.1 AA coverage matching every other chart in this app.

## 8. Explicitly Out of Scope

- **Bank-account sync / ML auto-categorization** — researched and deliberately not pursued: auto-categorization in competitor apps depends on transaction data from bank sync (Plaid-style), which this app doesn't have (manual entry only). Out of scope for this spec; a bank-sync integration would be its own, much larger spec.
- **Multi-tenant / enterprise product features** (SSO, admin dashboards, billing) — explicitly ruled out in brainstorming. This stays a personal single-user app; only the engineering rigor changes.
- **The visual redesign** (Glassmorphism 2.0, bento grid, single-page consolidation) — a separate, later sub-project. This spec's new `SpendingBreakdownCard` follows the *current* design system (GlassPanel, existing chart styling) rather than pre-empting a redesign that hasn't been designed yet.
- **Changing `safeToSpend`/`projectCycle`'s existing behavior** — untouched. This spec only adds a category-level breakdown *of* the discretionary pool `projectCycle` already computes; the top-line daily-budget number shown elsewhere in the app does not change.

## 9. Rollout

Directly to `main`, no feature flag — matching this project's standing convention.
