# Budget Buddy — GST Tracking

## Purpose

Second of four sub-phases in the Australian-standards scope (AUD formatting
[done] → GST tracking [this one] → WCAG 2.1 AA audit → Privacy Act 1988
notes). Gives the user a personal-awareness stat — "how much GST did I pay
this month" — without turning this personal expense tracker into a
business/tax reporting tool. There is no GST-exclusive entry, no BAS-style
report, and no ATO filing support; this is purely informational.

## Data Model

`Category` gains one new field:

```prisma
model Category {
  // ...existing fields unchanged (id, userId, name, color, createdAt)...
  isGstFree Boolean @default(false)
}
```

A purely additive migration — every existing category defaults to
GST-applicable, which is correct for the large majority of everyday
spending (most retail, dining, transport, entertainment, and subscriptions
all carry GST in Australia). A user opts specific categories (e.g.
"Groceries" for fresh food, "Health") *out* of GST calculation by marking
them GST-free, rather than opting categories in — matching the fact that
GST-free spending is the exception, not the rule.

**Why category-level, not per-expense:** GST-free status is a property of
the *type* of purchase (fresh food, health, education, financial services,
residential rent are GST-free by law), not something that varies between
two instances of the same kind of purchase. A category-level flag matches
this reality, requires no new input when creating an individual expense,
and reuses the existing `/budgets` page's per-category row UI instead of
adding a decision to every expense entry.

## Calculation

A pure function in a new `lib/utils/gst.ts`:

```ts
function computeGstPaid(
  expenses: { amount: number; categoryIsGstFree: boolean }[]
): number
```

Australian retail prices are legally GST-inclusive already — what a user
records as an expense's `amount` is the total they actually paid, tax
included. The GST portion embedded in a GST-inclusive total is
`amount / 11`, because `total = basePrice × 1.10`, so
`GST = basePrice × 0.10 = total / 11`.

`computeGstPaid` sums `amount / 11` across every expense whose category is
**not** GST-free, and the caller rounds the *sum* to two decimal places once
at the end for display — not each line item individually. This is simpler
to reason about and test than accumulating individually-rounded amounts,
and is accurate enough for a personal-awareness stat (as opposed to a tax
filing, where per-line rounding rules matter).

## API

New route: `PATCH /api/categories/:categoryId`, accepting
`{ isGstFree: boolean }` (validated via an extension to the existing
category Zod schema). Follows this app's established pattern exactly: auth
check via `getCurrentUser()` → `AppError(401, ...)` if absent, the target
category looked up via a compound `{ id, userId }` where-clause (IDOR-safe,
matching every other update/delete route in this app) → `AppError(404, ...)`
if not found or not owned by the user, wrapped in try/catch with
`handleRouteError`. This is a new endpoint — currently only
`POST /api/categories` (creation) exists; there is no update route yet.

## UI

- **`/budgets` page:** the existing `BudgetsClient` component (which already
  renders one row per category with an editable monthly-limit input) gains
  a "GST-free" checkbox per row. Unlike the monthly-limit input (which has
  an explicit Save button, since it's free-text numeric entry), the
  checkbox saves immediately on toggle via `PATCH /api/categories/:categoryId`
  — no separate save step needed for a boolean control.
- **Dashboard:** a second stat card, "GST paid this month," placed next to
  the existing "Total spent this month" card, using the existing
  `CountUpStat` component (from the AUD-formatting phase, which already
  calls `formatCurrency` internally) so the two cards are visually and
  behaviorally consistent. The dashboard already computes
  `currentMonthExpenses` (used for the existing category-totals chart) with
  each expense's `amount` and joined `category` — this just needs
  `category.isGstFree` added to that existing mapping, then passed through
  `computeGstPaid`.

**Recurring expenses (v1.2) interaction, handled by construction:** a
recurring expense's auto-generated instances inherit their `categoryId`
from the template. If a user marks that category GST-free, every future
generated instance is automatically excluded from the GST stat too — no
special-case code is needed to keep this in sync with v1.2, since the GST
calculation always reads the category's *current* flag at query time, not
a value copied onto the expense.

## Testing

- `computeGstPaid` gets real unit tests: an empty list, all-taxable
  expenses, all-GST-free expenses (result `0`), a mix of both, and a
  rounding-precision case (amounts that don't divide evenly by 11, e.g.
  `$10.00` → `$0.909090...` GST, to confirm the final rounding behaves
  correctly).
- The new `PATCH /api/categories/:categoryId` route gets a route test
  following this app's existing pattern: auth check (401), category not
  found or not owned (404), and the success path.
- The `/budgets` page's new checkbox column and the dashboard's new stat
  card are curl/manual-verified, consistent with this app's convention of
  not unit-testing presentational UI.

## Out of Scope

- No GST-exclusive expense entry — this app only ever records what was
  actually paid, which is always GST-inclusive under Australian retail law.
- No BAS-style report or ATO filing support.
- No GST columns in CSV export/import (v1.3) — the CSV format stays exactly
  `date,description,category,amount`.
- No per-expense GST override — GST-free-ness is purely a category
  property, never an individual-expense one.
- The WCAG 2.1 AA audit and Privacy Act 1988 notes remain separate, later
  phases in this same Australian-standards scope.
