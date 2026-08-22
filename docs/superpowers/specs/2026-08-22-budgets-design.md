# Budget Buddy v1.1 — Budgets

## Purpose

First follow-on feature phase after v1 (auth, categories, expense CRUD, dashboard, UI
redesign). Lets a user set a monthly spending limit per category and see progress
toward it on the dashboard, per the original v1 design spec's deferred scope
("v1.1 = budgets — set a monthly limit per category, dashboard shows progress bars and
over-budget warnings").

## Data Model

One `Budget` row per category, holding an ongoing monthly limit (not a row per specific
month — evaluated against whatever the current month's actual spend is, same pattern
already used for `Expense` aggregation). Rows are created lazily: no `Budget` exists for
a category until the user explicitly sets a limit for it.

```prisma
model Budget {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId   String
  category     Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  monthlyLimit Decimal  @db.Decimal(10, 2)
  createdAt    DateTime @default(now())

  @@unique([userId, categoryId])
}
```

`monthlyLimit` is `Decimal(10,2)`, matching `Expense.amount` — money is never `Float`,
per the project's existing global constraint. `onDelete: Cascade` on both relations
means deleting a user or a category cleans up its budget automatically, no orphaned
rows.

## API

Three routes, all scoped to `userId`, all Zod-validated, all errors through the
existing `AppError`/`handleRouteError` pattern — same shape as every other route in
this app.

- **`GET /api/budgets`** — list the current user's budgets, each including its
  category (`{ id, categoryId, monthlyLimit, category: { id, name, color } }`).
- **`PUT /api/budgets/:categoryId`** — upsert: set or update the limit for a category.
  Body: `{ monthlyLimit: number }` (positive, via Zod). First verifies the category
  belongs to the current user (same ownership-check pattern as `POST /api/expenses`
  verifying `categoryId` ownership) before upserting — a user must not be able to set a
  budget against another user's category ID.
- **`DELETE /api/budgets/:categoryId`** — remove a budget for a category (reverts it to
  "no budget set"). Scoped via a compound `deleteMany({ where: { categoryId, userId } })`
  — the same IDOR-safe pattern already used for expense delete.

## `/budgets` Page

New page at `app/budgets/page.tsx`, added to `Header`'s nav (alongside Dashboard,
Expenses). Server Component: fetches the user's categories and existing budgets,
renders one row per category — category name/color swatch, a number input pre-filled
with the existing limit (empty if none set), and a Save button per row. No per-category
sub-page or modal; with ~6 categories, one page with inline editable rows is simpler
than any alternative. Saving calls `PUT /api/budgets/:categoryId`. Rows with an existing budget also show a
distinct "Remove" action (separate from Save) that calls `DELETE /api/budgets/:categoryId`
and clears the row back to "no budget set" — the input field itself only ever submits a
positive number via Save, it never doubles as a delete trigger.

## Dashboard Integration

The existing "Spending by category (this month)" section gains a progress bar per
**budgeted** category only — categories with no budget set show no bar (per design
decision: keeps the dashboard clean, avoids meaningless "$0 of $0" rows for categories
the user hasn't budgeted yet). Progress is computed server-side in
`app/dashboard/page.tsx` by joining the already-computed `aggregateByCategory` totals
(from the existing `lib/utils/expenseAggregation.ts`, unchanged) with the fetched
budgets — no new aggregation utility needed, just a merge by `categoryId`.

Bar fill = `min(spent / limit, 1) * 100%`. Past 100%, the bar turns `destructive` red
(the existing design-system token) and a label reads e.g. "$12.50 over budget". Under
100%, the bar uses the `primary` token, consistent with the rest of the Indigo Bento
system.

## Testing

Follows the project's established TDD pattern:
- Zod schema tests (`lib/validation/budget.schema.test.ts`)
- Route handler tests with `vitest-mock-extended`'s Prisma mock, reusing
  `tests/mocks/prisma.ts` (GET/PUT/DELETE, including the category-ownership check and
  the userId-scoped delete)
- A component test for the new progress-bar UI (renders correct fill %, renders
  over-budget state)
- The `/budgets` page itself, like the other pages, gets curl-based manual verification
  rather than a dedicated test file (no existing page in this app has one)

## Out of Scope

- No budget history/trends (e.g. "you were under budget 3 months in a row") — just
  current-month progress.
- No budget notifications/alerts (email, push) — visual-only on the dashboard.
- No per-week or per-year budgets — monthly only, matching the existing dashboard's
  monthly framing.
- v1.2 (recurring expenses), v1.3 (CSV import/export), the Australian-standards scope,
  and the PWA pass all remain separate, later phases.
