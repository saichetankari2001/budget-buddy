# Budget Buddy — AUD Currency Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc `` `$${amount.toFixed(2)}` `` pattern, duplicated across five files, with a single locale-correct `formatCurrency` function used everywhere a dollar amount is displayed.

**Architecture:** One new pure function, `formatCurrency(amount: number): string`, built on the JS built-in `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })` — no new dependency. Every existing display call site is updated to call it instead of hand-rolling the formatting.

**Tech Stack:** TypeScript (existing), `Intl.NumberFormat` (JS/Node built-in), Vitest (existing).

## Global Constraints

- `formatCurrency` uses the `en-AU` locale specifically (not a default/unspecified locale) — this renders AUD with a plain `$` symbol (matching the current UI), not the `A$` prefix `Intl` uses when formatting AUD from a non-Australian locale.
- CSV export/import (`lib/utils/csv.ts`, `app/api/expenses/export/route.ts`, `app/api/expenses/import/route.ts`) is completely untouched by this plan — it must keep emitting/accepting plain decimal strings like `42.50`, never a currency-formatted string.
- `ExpenseForm`'s `<input type="number">` fields are completely untouched — currency formatting applies to read-only display only.
- `CountUpStat`'s `prefix` prop is removed entirely (confirmed via `grep` that its only call site, `app/dashboard/page.tsx:70`, never passes a `prefix` prop, so removing it requires no change to that call site).
- No dedicated test files for `ExpensesClient.tsx`, `BudgetProgress.tsx`, `CategoryPieChart.tsx`, `MonthlyTrendChart.tsx`, or `CountUpStat.tsx` — matching this app's existing convention of not unit-testing presentational components. Verification for those files is manual/curl-based.

---

## File Structure

```
budget-buddy/
├── lib/
│   └── utils/
│       ├── currency.ts                       # CREATE: formatCurrency
│       └── currency.test.ts                  # CREATE
├── app/
│   └── expenses/
│       └── ExpensesClient.tsx                 # MODIFY: use formatCurrency
└── components/
    ├── ui/
    │   ├── BudgetProgress.tsx                 # MODIFY: use formatCurrency
    │   └── CountUpStat.tsx                    # MODIFY: use formatCurrency, drop `prefix` prop
    └── charts/
        ├── CategoryPieChart.tsx               # MODIFY: use formatCurrency in tooltip
        └── MonthlyTrendChart.tsx              # MODIFY: use formatCurrency in tooltip
```

---

### Task 1: `formatCurrency` Pure Function

**Files:**
- Create: `lib/utils/currency.ts`
- Test: `lib/utils/currency.test.ts`

**Interfaces:**
- Produces: `formatCurrency(amount: number): string` — consumed by Task 2's five call-site updates.

- [ ] **Step 1: Write the failing tests**

`lib/utils/currency.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats a normal amount with two decimal places', () => {
    expect(formatCurrency(42.5)).toBe('$42.50');
  });

  it('formats a large amount with a thousands separator', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a negative amount', () => {
    expect(formatCurrency(-12)).toBe('-$12.00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/utils/currency.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/utils/currency.ts`**

```ts
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/utils/currency.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 121/121 passing (117 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add lib/utils/currency.ts lib/utils/currency.test.ts
git commit -m "feat: add formatCurrency utility for AUD display formatting"
```

---

### Task 2: Replace Ad-Hoc Formatting at All Five Call Sites

**Files:**
- Modify: `app/expenses/ExpensesClient.tsx`
- Modify: `components/ui/BudgetProgress.tsx`
- Modify: `components/ui/CountUpStat.tsx`
- Modify: `components/charts/CategoryPieChart.tsx`
- Modify: `components/charts/MonthlyTrendChart.tsx`

**Interfaces:**
- Consumes: `formatCurrency` (Task 1).

- [ ] **Step 1: Modify `app/expenses/ExpensesClient.tsx`**

Add the import (alongside the existing imports at the top of the file):
```ts
import { formatCurrency } from '@/lib/utils/currency';
```

Change this line (currently renders the amount on each expense row):
```tsx
<span className="font-medium text-foreground">${expense.amount.toFixed(2)}</span>
```
to:
```tsx
<span className="font-medium text-foreground">{formatCurrency(expense.amount)}</span>
```

Nothing else in this file changes.

- [ ] **Step 2: Modify `components/ui/BudgetProgress.tsx`**

Add the import at the top of the file:
```ts
import { formatCurrency } from '@/lib/utils/currency';
```

Change this line:
```tsx
${item.spent.toFixed(2)} / ${item.limit.toFixed(2)}
```
to:
```tsx
{formatCurrency(item.spent)} / {formatCurrency(item.limit)}
```

And change this line:
```tsx
${(item.spent - item.limit).toFixed(2)} over budget
```
to:
```tsx
{formatCurrency(item.spent - item.limit)} over budget
```

Nothing else in this file changes.

- [ ] **Step 3: Modify `components/ui/CountUpStat.tsx`**

Replace the full file:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { computeCountUpValue } from '@/lib/utils/countUp';
import { formatCurrency } from '@/lib/utils/currency';

const DURATION_MS = 600;

export function CountUpStat({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    let frame: number;
    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      setDisplay(computeCountUpValue(elapsed, DURATION_MS, value));
      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <p className="font-heading text-3xl font-semibold text-foreground">
      {formatCurrency(display)}
    </p>
  );
}
```

The `prefix` prop is removed (it was only ever used with its default `'$'` value — its one call site, `app/dashboard/page.tsx:70`, is `<CountUpStat value={totalThisMonth} />` with no `prefix` passed, so no change is needed there).

- [ ] **Step 4: Modify `components/charts/CategoryPieChart.tsx`**

Add the import:
```ts
import { formatCurrency } from '@/lib/utils/currency';
```

Change this line:
```tsx
formatter={(value: number) => `$${value.toFixed(2)}`}
```
to:
```tsx
formatter={(value: number) => formatCurrency(value)}
```

Nothing else in this file changes.

- [ ] **Step 5: Modify `components/charts/MonthlyTrendChart.tsx`**

Add the import:
```ts
import { formatCurrency } from '@/lib/utils/currency';
```

Change this line:
```tsx
formatter={(value: number) => `$${value.toFixed(2)}`}
```
to:
```tsx
formatter={(value: number) => formatCurrency(value)}
```

Nothing else in this file changes.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 121/121 passing (unchanged from Task 1 — no new automated tests in this task, per this app's convention for presentational components).

- [ ] **Step 7: Verify via curl/manual check — dashboard, expenses list, and budgets page all show correctly formatted amounts**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/currency-verify-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"currency-verify-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

CATEGORY_ID=$(curl -s -b /tmp/currency-verify-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

echo "--- create an expense large enough to prove the thousands separator ---"
curl -s -b /tmp/currency-verify-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":1234.5,\"description\":\"Big Purchase\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}" \
  -o /dev/null -w "create status: %{http_code}\n"

echo "--- create a budget under the spent amount, to exercise the over-budget formatting path ---"
curl -s -b /tmp/currency-verify-cookies.txt -X PUT "http://localhost:3000/api/budgets/$CATEGORY_ID" \
  -H "Content-Type: application/json" \
  -d "{\"monthlyLimit\":100}" \
  -o /dev/null -w "budget status: %{http_code}\n"

echo "--- expenses page should show \$1,234.50 ---"
curl -s -b /tmp/currency-verify-cookies.txt http://localhost:3000/expenses -o /tmp/currency-expenses.html \
  -w "expenses page status: %{http_code}\n"
grep -o '\$1,234.50' /tmp/currency-expenses.html && echo "PASS: expenses list shows thousands separator"

echo "--- dashboard should show \$1,234.50 in the CountUpStat and the over-budget line ---"
curl -s -b /tmp/currency-verify-cookies.txt http://localhost:3000/dashboard -o /tmp/currency-dashboard.html \
  -w "dashboard status: %{http_code}\n"
grep -o '\$1,234.50' /tmp/currency-dashboard.html && echo "PASS: dashboard total shows thousands separator"
grep -o '\$1,134.50 over budget' /tmp/currency-dashboard.html && echo "PASS: over-budget amount is correctly formatted"

# POST-SHIP CORRECTION (discovered during the later GST-tracking phase's final review):
# the "dashboard total" grep above targets CountUpStat's output, but CountUpStat is a
# client component that starts at `useState(0)` and only reaches its real value via a
# client-side requestAnimationFrame animation — curl fetches pre-animation SSR HTML, so
# that specific grep can never actually match `$1,234.50` and silently prints nothing
# (no error, since this script has no `set -e`). This does NOT mean the feature was
# broken: formatCurrency has its own unit tests, and a retroactive live check via a real
# browser (Playwright) confirmed the dashboard genuinely renders "$1,399.50" correctly
# with the thousands separator once the animation completes. The over-budget grep above
# is unaffected — BudgetProgress is a plain server-rendered component with no animation.
# Lesson for future plans: verify any CountUpStat-rendered value with a real browser
# (e.g. Playwright), never with curl+grep against raw SSR HTML.

rm -f /tmp/currency-verify-cookies.txt /tmp/currency-expenses.html /tmp/currency-dashboard.html
kill %1
```

Expected: all status codes `200`/`201`, and all three `PASS` lines print. (`1234.50 - 100 = 1134.50`, confirming the over-budget calculation still uses the correct pre-formatting subtraction.)

- [ ] **Step 8: Commit**

```bash
git add app/expenses/ExpensesClient.tsx components/ui/BudgetProgress.tsx components/ui/CountUpStat.tsx components/charts/CategoryPieChart.tsx components/charts/MonthlyTrendChart.tsx
git commit -m "feat: use formatCurrency for all displayed dollar amounts"
```

---

### Task 3: Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: 121/121 passing, pristine output.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either. (This project treats a clean `tsc --noEmit` as a hard requirement — a past feature phase shipped a typecheck-only bug that Vitest alone didn't catch.)

- [ ] **Step 3: Confirm CSV export is completely unaffected (plain decimals, no currency formatting leaked in)**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/currency-csv-check-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"currency-csv-check-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

CATEGORY_ID=$(curl -s -b /tmp/currency-csv-check-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

curl -s -b /tmp/currency-csv-check-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":1234.5,\"description\":\"Big Purchase\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}" \
  -o /dev/null -w "create status: %{http_code}\n"

curl -s -b /tmp/currency-csv-check-cookies.txt http://localhost:3000/api/expenses/export | python3 -c "
import sys
csv = sys.stdin.read()
print(csv)
assert '1234.50' in csv, 'expected plain decimal 1234.50 in the export'
assert '\$' not in csv, 'CSV export must never contain a currency symbol'
assert ',234.50' not in csv or 'category,amount' in csv.split(chr(10))[0], 'thousands separator must not leak into the amount column'
print('PASS: CSV export still uses plain decimals, untouched by currency formatting')
"

rm -f /tmp/currency-csv-check-cookies.txt
kill %1
```

Expected: `200`/`201` statuses, and the script prints "PASS".

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## End of AUD Currency Formatting

At this point: every dollar amount displayed in the app — the dashboard total, expense list, budget progress, and both chart tooltips — is formatted consistently via `Intl.NumberFormat('en-AU', ...)`, with correct thousands separators and negative-amount formatting, while CSV import/export and form inputs remain untouched. GST tracking is next, as its own spec → plan → build cycle.
