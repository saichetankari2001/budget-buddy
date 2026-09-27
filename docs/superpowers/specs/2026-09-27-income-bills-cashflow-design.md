# Income, Bills & Cash-Flow Projection — Design Spec

**Status:** Approved
**Spec 4 of the Money Coach line** (builds on Spec 2 — Money Cycle + AI Coach,
and Spec 3 — Cycle Chat + Deferred Fixes)

## Summary

The Money Cycle feature currently reduces a user's finances to a single flat
number: "I have $X for the next N days," averaged evenly across those days.
This was never going to work for the scenario that originally motivated this
whole project phase: irregular gig income (Uber, $40-70 a shift, no fixed
amount), a new job starting on a specific date, and multiple bills — rent,
a subscription, a phone bill — landing on different specific days, not
evenly spread. A flat average tells you nothing about the fact that rent
clears three days before your first paycheck.

This spec adds two new concepts (`IncomeSource`/`IncomeEntry` for money
coming in, `Bill` for money owed on a specific date) and replaces the flat
daily-average calculation with a real day-by-day cash-flow projection that
finds the actual constraint — the lowest point your balance would hit given
everything already known — rather than pretending the future is smooth.

## Part 1: Data model

### Income

```prisma
enum IncomeSourceType {
  FIXED
  IRREGULAR
}

model IncomeSource {
  id                 String              @id @default(cuid())
  userId             String
  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  name               String
  type               IncomeSourceType
  amount             Decimal?            @db.Decimal(10, 2)
  recurrenceInterval RecurrenceInterval?
  startDate          DateTime
  createdAt          DateTime            @default(now())
  entries            IncomeEntry[]

  @@unique([userId, name])
}

model IncomeEntry {
  id             String       @id @default(cuid())
  incomeSourceId String
  incomeSource   IncomeSource @relation(fields: [incomeSourceId], references: [id], onDelete: Cascade)
  amount         Decimal      @db.Decimal(10, 2)
  date           DateTime
  createdAt      DateTime     @default(now())

  @@index([incomeSourceId, date])
}
```

`FIXED` sources carry `amount` + `recurrenceInterval` (reusing the existing
`WEEKLY`/`MONTHLY`/`YEARLY` enum already used by recurring `Expense` rows) —
a predictable paycheck. `IRREGULAR` sources carry neither; they exist purely
as a name to log actual `IncomeEntry` rows against (Uber, casual shifts).
`startDate` lets "my new job starts Sept 29" be represented directly — no
occurrences are projected before it.

An `IncomeEntry` is the ground truth for what actually landed — it always
counts toward a user's real running balance, regardless of source type.
The distinction between `FIXED`/`IRREGULAR` only matters for the *forward*
projection (Part 2): a `FIXED` source's future occurrences are assumed to
happen; an `IRREGULAR` source's future occurrences are assumed to be zero
until logged.

### Bills

```prisma
model Bill {
  id                 String              @id @default(cuid())
  userId             String
  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  name               String
  amount             Decimal             @db.Decimal(10, 2)
  dueDate            DateTime
  recurrenceInterval RecurrenceInterval?
  paidExpenseId      String?             @unique
  paidExpense        Expense?            @relation(fields: [paidExpenseId], references: [id], onDelete: SetNull)
  createdAt          DateTime            @default(now())

  @@index([userId, dueDate])
}
```

`recurrenceInterval` null means a one-time bill (e.g. a specific medical
bill); set means a recurring obligation (rent, a subscription). Marking the
*next upcoming occurrence* of a bill paid creates a real `Expense` (in a
default or user-chosen category) and links it via `paidExpenseId` — this
keeps existing spending history and category budgets accurate rather than
having paid bills live in a shadow ledger the rest of the app can't see.
A recurring bill's *next* occurrence after the paid one becomes due again
automatically (computed on the fly, not stored) — the same
`computeMissingOccurrences` utility already used for recurring `Expense`
projections in `lib/utils/moneyCycle.ts`'s `computeCommittedSpend` is reused
here, generalized to accept a `Bill`-shaped template instead of only an
`Expense`-shaped one.

**Deliberate compatibility decision:** the existing "recurring expense" flag
on `Expense` already lets users represent a future known obligation (that's
exactly what `computeCommittedSpend` uses today). This spec does not
migrate or deprecate that mechanism — the projection (Part 2) reads *both*
existing recurring `Expense` rows and new `Bill` rows as future obligations.
Existing users' pre-existing recurring expenses keep working with zero
migration; `Bill` is the new, more explicit, payment-tracked way to
represent an obligation going forward, recommended in the UI but not
mandatory.

## Part 2: The projection algorithm

The core problem with the current `safeToSpend` calculation
(`discretionary / daysRemaining`, a flat average) is that it treats a bill
due tomorrow the same as a bill due in three weeks. This spec replaces it
with a real walk-forward simulation that finds the actual constraint.

### Step 1 — Current real balance

Unchanged from today: the cycle's tracked balance as of now, i.e. its
starting balance plus every `IncomeEntry` logged since the cycle began,
minus every actual `Expense` since it began. (See "Known limitation" below
— this app does not track a live bank balance; "starting balance" is still
a number the user provides once, at cycle-start time.)

### Step 2 — Walk forward day-by-day to the cycle's end date

For each day between today and the cycle's end date, starting from the
Step 1 balance, apply (in date order) every *known* event for that day:

- **Add**: any `FIXED` `IncomeSource`'s occurrence for that day (computed
  via the same occurrence-expansion logic as recurring expenses/bills),
  respecting the source's `startDate`.
- **Subtract**: any `Bill` occurrence (recurring or one-time) or legacy
  recurring-`Expense` occurrence due that day.
- **Add nothing** for `IRREGULAR` income sources on future days — per the
  earlier decision, an irregular source's future contribution is
  conservatively assumed to be $0 until an actual `IncomeEntry` exists for
  that day.

This produces a full day-by-day "obligated-only" balance trajectory — the
balance the user would have on each future day if they spent nothing
further and only counted the income that's actually predictable. This
trajectory is exactly what the vertical-list UI (Part 4) renders.

### Step 3 — Find the lowest point

Scan the trajectory for its minimum value, `minFutureBalance`, and the day
it occurs on. This is the real constraint a flat average hides: if rent
clears three days before the first paycheck, the lowest point falls right
after rent, not at some arbitrary midpoint.

### Step 4 — Derive safe-to-spend

- If `minFutureBalance >= 0`: that amount is genuinely free to spend
  *in total* between today and the day it occurs, without ever risking a
  shortfall on a known obligation. Divide it evenly across the days from
  today until that lowest-point day for a daily figure, with the day count
  floored at 1 (matching the existing `computeDaysRemaining` convention in
  `lib/utils/moneyCycle.ts`) — if the lowest point falls on today itself
  (e.g. a bill is due today), the full `minFutureBalance` is today's
  figure, not divided by zero. (After that day passes, the calculation
  naturally re-runs fresh next time the cycle is viewed — there is no
  separate "reset" step; recomputing live on every read is the existing
  pattern this app already follows for `safeToSpend`.)
- If `minFutureBalance < 0`: obligations alone — with **zero** further
  discretionary spending — would put the user into shortfall before that
  day. This is a real warning state. The coach should say so plainly
  (e.g. "even without spending anything else, you're $X short before rent
  clears on the 30th") rather than clamping to `$0/day` and implying
  everything is merely tight.

This entire calculation re-runs on every read (matching the existing
`GET /api/cycles/active` pattern) — it is not persisted or cached, so it
always reflects the latest logged income/expenses and the current date.

### Known limitation (accepted, not solved by this spec)

The app has no live bank-balance integration. "Current real balance" at
cycle-start is still a number the user enters once; this spec automates
everything projected *forward* from that point (future income timing, bill
timing, the resulting safe-to-spend figure), not the act of knowing today's
literal balance. A future spec could explore bank-account linking; out of
scope here.

## Part 3: Money Cycle integration

- **Starting a cycle**: the existing "how much do you have" + end-date form
  stays (per the known limitation above), but `POST /api/cycles` no longer
  needs a manually-entered `safeToSpend` guess — it's computed immediately
  via Part 2's algorithm using the newly-created cycle's starting balance
  and end date.
- **`GET /api/cycles/active`**: same response shape as today
  (`remainingAmount`, `daysRemaining`, `safeToSpend`), with `safeToSpend`
  now sourced from Part 2 instead of a flat average, plus a new
  `projection: { date: string; balance: number; events: { label: string;
  amount: number }[] }[]` array — one entry per day from today to the
  cycle's end date — for the list view.
- **Chat integration**: the existing `update_cycle_amount`/`cancel_cycle`
  tools are unaffected. `generatePlanMessage`/`generateCheckInMessage`
  (`lib/ai/coach.ts`) should be updated to describe the *shape* of the
  projection when relevant ("you're fine until the 30th, then it's tight
  until your paycheck on the 29th clears") rather than only a flat number —
  a prompt-wording change, not a new mechanism.

## Part 4: Chat tools & UI

### New chat tools

Extending the existing Gemini function-calling chat (Spec 3) with four new
tools, following the identical security model already established — every
handler resolves the caller's own data server-side via `getCurrentUser()`;
no tool ever receives or trusts a user/entity ID from the model:

- `add_income_source(name, type, amount?, recurrenceInterval?, startDate)`
- `log_income(sourceName, amount, date?)` — defaults `date` to today
- `add_bill(name, amount, dueDate, recurrenceInterval?)`
- `mark_bill_paid(billName)` — resolves the caller's own next-due
  occurrence of the named bill, creates the linked `Expense`

### Manual UI

- Forms for adding/editing `IncomeSource` and `Bill` rows live alongside
  the existing recurring-expense management UI, for consistency with how
  users already manage recurring obligations in this app.
- The day-by-day projection renders as its **own page** (linked from the
  dashboard), using the **vertical list** layout validated during
  brainstorming: one row per day (or per day with an event), running
  balance on the right, income/bill events labeled inline, the lowest
  point visually flagged (e.g. the existing destructive-red treatment
  already used elsewhere in the Neon Glass design system).

## Testing

- **Data model**: standard Prisma-mock unit tests for `IncomeSource`/
  `IncomeEntry`/`Bill` CRUD, following this project's established patterns.
- **Projection algorithm**: the core value of this spec — needs thorough
  unit testing as a pure function (no DB, no HTTP) covering: a `FIXED`
  source landing before a `Bill`'s due date (safe), a `Bill` landing before
  a `FIXED` source clears (the real motivating scenario — lowest point
  found correctly), an `IRREGULAR` source contributing $0 to the
  projection but its logged `IncomeEntry` counting fully in the real
  balance, a recurring `Bill` producing multiple occurrences within the
  window, the `minFutureBalance < 0` warning path, and a boundary case
  where the lowest point falls on the cycle's last day.
- **Chat tools**: mocked-Gemini tests matching Spec 3's established
  pattern (a tool call that succeeds, one that fails with `{success:false}`
  relayed to Gemini, one where the named source/bill doesn't exist).
- **UI**: axe-core WCAG 2.1 AA coverage added for the new projection page,
  matching every other page in this app.

## Rollout

Directly to `main`, no feature flag, consistent with every prior phase of
this project.
