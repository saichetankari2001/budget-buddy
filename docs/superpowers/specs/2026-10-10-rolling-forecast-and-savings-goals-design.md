# Rolling Cash-Flow Forecast & Savings Goals — Design Spec

**Status:** Phase 2 of the financial-intelligence work started with the health score + anomaly detection plan — deferred then, built now. User confirmed proceeding with this exact scope (rolling forecast + savings goals) rather than a different feature set.

## Context

Real market research done earlier in this project (2026 budgeting-app trend survey — WalletHub, Copilot Money, Monarch, Cleo, Quicken Simplifi) identified two concrete gaps beyond what the health score + anomaly detection round closed:

1. **Forecasting is cycle-bound, not rolling.** Budget Buddy's cash-flow projection (`lib/moneyCycle/projectCycle.ts`) only looks as far as the current Money Cycle's own `endDate`. Market-standard tools forecast 30-90 days forward regardless of any specific "challenge" window, and proactively flag irregular/infrequent costs before they land.
2. **No goal-based savings tracking.** The app tracks "did you stay under budget" but has no concept of "save toward something specific," which tools like Quicken Simplifi treat as a first-class, separate feature from budget adherence.

Investigated during this round's design: `Bill` and `IncomeSource` are `userId`-scoped in the schema, not `cycleId`-scoped — they already exist independently of any Money Cycle. This means a rolling forecast doesn't need its own separate data model; it needs a new *query window* over data that already exists, decoupled from a cycle's own `endDate`.

## Goals

- Show what's coming in the next 30-90 days regardless of when the current Money Cycle happens to end — a bill due in 6 weeks shouldn't be invisible just because today's cycle ends in 10 days.
- Let the user set a named savings target and log real contributions toward it, with honest, non-inferred progress (explicit logging, matching how the app already tracks real income and expenses — not a fuzzy automatic "estimated savings" guess).
- Keep this fully separate from Money Cycle budget-adherence mechanics — savings goals are an orthogonal, parallel concept per the original market research framing, not a modification to the existing safe-to-spend math.
- Keep the newly-decluttered IA intact: no new top-level nav item. Both features live on the existing `/cashflow` page, since both are forward-looking cash-flow concerns.

## Part 1: Rolling Cash-Flow Forecast

### Calculation

A new function, `computeRollingForecast`, alongside `projectCycle.ts` (same `lib/moneyCycle/` directory, same dependencies: `computeCashFlowProjection`, `computeBillOccurrences`). Key difference from `projectCycle`: the projection window is `[now, now + windowDays]` (default 90 days), not `[cycle.startDate, cycle.endDate]` — entirely decoupled from any Money Cycle's own dates.

- **Starting balance**: reuses the active Money Cycle's live `remainingAmount` (from `projectCycle`'s own output) as the baseline — this feature only renders when there's an active cycle, since that's the only place Budget Buddy tracks a real-time balance today. No new "account balance" concept is introduced (explicitly out of scope — see Non-goals).
- **Window**: `now` to `now + 90 days`, independent of the active cycle's `endDate`. If the cycle ends in 10 days, this forecast still shows what happens in days 11-90, using the same bill/income data (which, as confirmed, isn't cycle-scoped anyway).
- **Events**: reuses the exact same bill/income-occurrence assembly logic `projectCycle.ts` already has (one-time bills, recurring bill occurrences via `computeBillOccurrences`, fixed income sources, both one-time and recurring) — just computed over the new 90-day window instead of the cycle's window.
- **"Heads up" flag**: any one-time (non-recurring) bill whose `dueDate` falls strictly AFTER the active cycle's own `endDate` but within the 90-day window — i.e., something the user would never see in their current cycle's own projection — gets flagged as "coming up after your current cycle ends," surfacing exactly the kind of invisible-until-too-late cost the market research called out.

### Where it's exposed

- New section on `/cashflow` (not the dashboard — keeps the lean home screen intact): "Looking ahead" — a new chart (reusing the existing `CashFlowTrajectoryChart` component's visual style, but as a second, separate chart instance for the 90-day window, not a modification to the existing cycle-bound one) plus a short list of any "heads up" flagged bills.
- Not added to `GET /api/cycles/active` (that route is specifically the active-cycle shape); instead a new route, `GET /api/cycles/active/rolling-forecast`, returns `{ trajectory, headsUp: [{ name, amount, dueDate }] }` or `null` if there's no active cycle (mirroring the existing `/api/cycles/active/category-breakdown` pattern — same directory shape, same null-when-no-cycle convention).

## Part 2: Savings Goals

### Data model (this phase DOES require a schema migration, unlike the health-score round)

```prisma
model SavingsGoal {
  id            String                @id @default(cuid())
  userId        String
  user          User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  name          String
  targetAmount  Decimal               @db.Decimal(10, 2)
  targetDate    DateTime?
  createdAt     DateTime              @default(now())
  contributions SavingsContribution[]

  @@unique([userId, name])
}

model SavingsContribution {
  id            String      @id @default(cuid())
  savingsGoalId String
  savingsGoal   SavingsGoal @relation(fields: [savingsGoalId], references: [id], onDelete: Cascade)
  amount        Decimal     @db.Decimal(10, 2)
  date          DateTime
  createdAt     DateTime    @default(now())

  @@index([savingsGoalId, date])
}
```

Progress for a goal is always `sum(contributions.amount) / targetAmount` computed on read (same "derive, don't duplicate" discipline as the health score) — no stored running-total column to keep in sync.

### Operations

- Create a goal: name, target amount, optional target date. `@@unique([userId, name])` matches the existing `Bill`/`IncomeSource` convention for this app's other named, user-scoped entities.
- Log a contribution: goal + amount + date (defaults to now, matching `logExpense`'s existing convention).
- Delete a goal: allowed (no "settled forever" concept needed here, unlike `Bill` — a savings goal is just abandoned or completed, not something with recurring future obligations to protect).

### AI chat integration

Two new tools, following the EXACT existing pattern in `lib/ai/chat.ts` (same file, same `TOOLS` array, same dispatch-branch style as `add_bill`/`log_income`):

- `add_savings_goal(name, targetAmount, targetDate?)` — "I want to save $500 for a laptop by December."
- `log_savings_contribution(goalName, amount)` — "I put $50 toward my laptop fund." Resolves `goalName` against the user's own goals the same case-insensitive way `logExpense` resolves category names, but with no "Other" fallback (if the name doesn't match an existing goal, the tool reports an error asking the user to create the goal first — unlike expense categories, a savings goal can't sensibly default to a generic bucket).

### Where it's exposed

New "Savings goals" section on `/cashflow`, below the existing Income sources/Bills lists: each goal shown with name, progress bar (contributed / target), and target date countdown if set. A simple create-goal form and a "log a contribution" action per goal, matching this app's existing inline-form patterns (`IncomeSourceForm`, `BillForm`).

## Non-goals

- No new "account balance" concept — the rolling forecast still requires an active Money Cycle to have a baseline. A user with no active cycle sees neither feature's data (same `null`-when-no-cycle convention `SpendingBreakdownCard` already uses).
- No automatic/inferred savings tracking (e.g., "leftover safe-to-spend money automatically counts toward your goal") — explicit logging only, for the same reason the health score and anomaly detection stayed explainable rather than black-box.
- No linkage between savings goals and the Money Cycle's safe-to-spend calculation — a goal doesn't reduce your daily budget or get factored into `projectCycle`'s math. They're parallel, not integrated, matching the original market-research framing.
- No new top-level navigation — both features live on the existing `/cashflow` page.
- No change to any already-shipped business logic: `projectCycle`, `computeHealthScore`, anomaly detection, Coach prompts are untouched.

## Testing

- `computeRollingForecast`: pure-function unit tests mirroring `projectCycle.test.ts`'s existing style — a bill inside the 90-day window but after cycle end gets flagged "heads up"; a bill within the cycle's own window is NOT flagged (already visible there); no active cycle returns null at the route level.
- `SavingsGoal`/`SavingsContribution` CRUD actions: unit tests for create/contribute/delete, matching `lib/bills/actions.test.ts`'s existing style (including the chat-tool dispatch validation tests, matching `lib/ai/chat.test.ts`'s existing per-tool test blocks).
- New Prisma migration: standard `prisma migrate dev` flow, verified against the existing test-mock setup (`tests/mocks/prisma.ts` needs the two new models added to its mock surface).
- e2e: one new accessibility scan for `/cashflow`'s expanded content (the page already has WCAG coverage; extend it to cover the two new sections, don't duplicate the whole page's existing scan).
