# Budget Buddy — AUD Currency Formatting

## Purpose

First of four sub-phases in the Australian-standards scope (AUD formatting →
GST tracking → WCAG 2.1 AA audit → Privacy Act 1988 notes), following v1.3
(CSV import/export). Every monetary amount in the app is currently displayed
via an ad-hoc `` `$${amount.toFixed(2)}` `` pattern, duplicated across five
files, with no thousands separators and no locale awareness. This phase
replaces that with a single, correctly locale-formatted currency display,
consistent everywhere in the app.

## Architecture

A single pure function, `formatCurrency(amount: number): string`, in a new
`lib/utils/currency.ts`, built on the JavaScript built-in
`Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })` — no new
dependency; `Intl` is available natively in every modern browser and in
Node.js.

**Why `en-AU` specifically, not just `currency: 'AUD'` in a default locale:**
formatting AUD *within* the `en-AU` locale renders the plain `$` symbol —
matching the current UI exactly. `Intl` only prepends the disambiguating
`A$` prefix when formatting AUD from a *different* locale (e.g. `en-US`,
where `$` alone would be ambiguous with USD). Using `en-AU` means this is a
pure upgrade — thousands separators and correct negative-number formatting
— with zero visual change to the currency symbol itself.

## Call Sites

`formatCurrency` replaces the existing `` `$${x.toFixed(2)}` `` pattern in
these five files:

- `app/expenses/ExpensesClient.tsx` — the amount shown on each expense row.
- `components/ui/BudgetProgress.tsx` — spent/limit amounts and the
  "over budget" amount.
- `components/charts/CategoryPieChart.tsx` — the tooltip formatter.
- `components/charts/MonthlyTrendChart.tsx` — the tooltip formatter.
- `components/ui/CountUpStat.tsx` — the dashboard's animated "total spent
  this month" stat. This component currently takes a `prefix` prop
  (defaulting to `'$'`) that it concatenates with a manually-`.toFixed(2)`'d
  number; that prop is removed and the component calls `formatCurrency`
  directly on its animated `display` value on every frame. `Intl.NumberFormat`
  is cheap enough to call once per animation frame (60fps for ~600ms is a few
  dozen calls, not a hot loop), so no memoization is needed.

## Scope Boundary (Deliberately Excluded)

- **CSV export/import is untouched.** `serializeExpensesToCsv` and
  `parseAndValidateCsvRows` (from v1.3) keep using plain decimal strings
  like `42.50` — no currency symbol, no thousands separator. CSV is a
  data-interchange format, not a display surface; injecting `$1,234.56`
  into an exported file would break re-importing it, since the importer's
  amount validation expects a plain positive number.
- **Input fields are untouched.** The `<input type="number">` fields in
  `ExpenseForm` (for entering an expense's amount) keep their current plain
  numeric behavior — currency symbols belong in read-only display, not
  inside an editable numeric input.
- **GST is out of scope for this phase** — that's the very next phase
  (GST tracking), kept deliberately separate so this phase is a pure
  display-formatting change with no calculation changes at all.

## Testing

`formatCurrency` is a pure function, so it gets straightforward unit tests
in `lib/utils/currency.test.ts`:
- A normal amount: `42.5` → `"$42.50"`.
- An amount large enough to prove the thousands separator: `1234.5` →
  `"$1,234.50"`.
- Zero: `0` → `"$0.00"`.
- A negative amount (the "over budget" case in `BudgetProgress`): `-12` →
  `"-$12.00"`.

The five call sites get curl/manual verification (loading each affected
page and confirming the formatted output looks correct), consistent with
how this app already verifies UI-only changes — no new test files needed
for the call sites themselves, since each one is a mechanical substitution
of an already-tested, already-verified display value.

## Out of Scope

- GST tracking, the WCAG 2.1 AA accessibility audit, and Privacy Act 1988
  compliance notes remain separate, later phases in this same
  Australian-standards scope.
- No currency selector or multi-currency support — this app is AUD-only,
  matching its target audience.
