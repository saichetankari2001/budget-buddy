# Budget Buddy v1.2 — Recurring Expenses

## Purpose

Second follow-on feature phase after v1 (core), the Indigo Bento redesign, and v1.1
(budgets). Lets a user mark an expense as recurring (weekly, monthly, or yearly) so
future occurrences generate automatically, without any cron job or background
infrastructure — matching the original v1 design spec's deferred scope ("mark an
expense as recurring; new instances are generated lazily on dashboard/login load
rather than via a real cron job, keeping the app 100% free with no extra
infrastructure").

## Data Model

Extends the existing `Expense` model directly, rather than introducing a separate
template model — this reuses the existing expense list, form, and CRUD API instead of
duplicating them with a parallel set of routes/pages.

```prisma
enum RecurrenceInterval {
  WEEKLY
  MONTHLY
  YEARLY
}

model Expense {
  // ...existing fields unchanged (id, userId, categoryId, amount, description, date, createdAt)...
  isRecurring        Boolean             @default(false)
  recurrenceInterval RecurrenceInterval?
  recurringSourceId  String?
  recurringSource    Expense?  @relation("RecurringInstances", fields: [recurringSourceId], references: [id], onDelete: SetNull)
  recurringInstances Expense[] @relation("RecurringInstances")
}
```

A recurring expense is a normal `Expense` row with `isRecurring: true` and a non-null
`recurrenceInterval` — it represents a real charge on its own date, not a hidden
template. Each auto-generated future occurrence is also a normal `Expense` row
(`isRecurring: false`), linked back to its source via `recurringSourceId`.

**Validation invariant:** `isRecurring: true` requires a non-null `recurrenceInterval`;
`isRecurring: false` (the default) requires `recurrenceInterval` to be omitted/null.
The Prisma schema alone doesn't enforce this pairing (both fields are independently
optional at the column level), so the Zod schema for create/update must enforce it —
a refinement requiring `recurrenceInterval` exactly when `isRecurring` is `true`.

**`onDelete: SetNull`, not `Cascade`:** deleting the original recurring expense stops
future generation (there is no source left to generate from) but must not delete
already-generated past instances — those are real historical spending. `SetNull`
detaches them into independent expenses (their `recurringSourceId` becomes `null`);
`Cascade` would silently erase legitimate spending history, a much worse failure mode
for a finance app.

## Generation Logic

A pure, unit-testable function decides what is due, kept separate from the Prisma code
that creates rows — the same separation already used for `computeCountUpValue` in the
UI redesign phase:

```ts
function computeMissingOccurrences(
  interval: RecurrenceInterval,
  lastDate: Date,
  today: Date
): Date[]
```

Advances from `lastDate` by 7 days (`WEEKLY`), one calendar month (`MONTHLY`, clamped
to the end of the month for dates like the 31st landing in a 30-day or shorter month),
or one year (`YEARLY`), returning every resulting occurrence date that is `<= today`.
This is what makes catch-up work: if a user doesn't log in for 3 months, all 3
backdated occurrences generate at once on their next visit, keeping the 6-month trend
chart and category totals accurate regardless of how often the user logs in.

The Prisma-touching wrapper, `generateDueRecurringExpenses(userId: string):
Promise<void>`, runs once per dashboard load, before the existing expense fetch:

1. Fetch all of the user's `Expense` rows where `isRecurring: true`.
2. For each one, find the latest date among {the template's own `date`, all existing
   instances' `date` where `recurringSourceId` matches it} — this is `lastDate`.
3. Call `computeMissingOccurrences(interval, lastDate, today)`.
4. Create one new `Expense` row per returned date, copying `amount`/`description`/
   `categoryId` from the template, with `isRecurring: false` and `recurringSourceId`
   set to the template's `id`.

Called from `app/dashboard/page.tsx` — since login always redirects to `/dashboard`,
this single integration point naturally covers both "login load" and "dashboard load"
from the original spec without a second call site to keep in sync.

## UI

- **Creating/editing:** `ExpenseForm` gains a "Repeat" checkbox; checking it reveals an
  interval `<select>` (Weekly / Monthly / Yearly). No new page or form — the existing
  add/edit flow on `/expenses` handles recurring expenses the same way it handles
  one-off ones.
- **Expense list:** rows where `isRecurring: true` show a small repeat icon
  (`ArrowPathIcon` from the existing Heroicons set) next to the description. Generated
  instances (`isRecurring: false`, `recurringSourceId` set) render exactly like any
  other expense — no badge, since once generated they're just historical spending.
- **Editing a recurring expense:** changing its amount or category only affects
  *future* generated instances; already-generated past instances are untouched. This
  requires no special-case code — editing the source row simply doesn't touch existing
  `Expense` rows that reference it, matching how a real subscription price change
  works (old charges stay historical at their old price).
- **Deleting a recurring expense:** stops future generation and detaches (not deletes)
  its past instances, per the `SetNull` behavior above.

## Testing

Follows the project's established TDD pattern:
- `computeMissingOccurrences` gets real unit tests covering the interesting date-math
  edge cases: month-end clamping (e.g. Jan 31 → Feb 28/29), catch-up across multiple
  missed periods, and zero occurrences when already up to date.
- `generateDueRecurringExpenses` gets tests with the project's shared Prisma mock
  (`tests/mocks/prisma.ts`), scoped to `userId` like every other query in this app.
- `ExpenseForm`'s new checkbox + interval select get covered by extending its existing
  test file (`ExpenseForm.test.tsx`), verifying the submitted payload includes
  `isRecurring`/`recurrenceInterval` when checked, and omits/nulls them when not.
- The dashboard integration (recurring expenses actually appearing after generation)
  gets curl-verified, consistent with how every other page in this app is checked —
  no page in Budget Buddy has a dedicated page-level test file.

## Out of Scope

- No recurring *budgets* — that's a separate, already-shipped feature (v1.1).
- No ability to pause or skip a single occurrence without editing/deleting the
  recurring expense itself.
- No notification/reminder when a recurring expense generates.
- v1.3 (CSV import/export), the Australian-standards scope, and the PWA pass all
  remain separate, later phases.
