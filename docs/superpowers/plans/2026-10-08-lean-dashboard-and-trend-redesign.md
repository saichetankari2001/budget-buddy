# Lean Dashboard & Trend-Aligned Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single, long-scrolling `/dashboard` page back into four focused pages (Dashboard, Expenses, Budgets, Cash Flow) with real route navigation, and apply a trust-coded color update — reversing an earlier over-consolidation that real 2026 fintech UX research showed was a step away from current trend.

**Architecture:** Each of the three "moved" pages (`/expenses`, `/budgets`, `/cashflow`) stops being a `redirect()` stub and becomes its own server component, assembling only the Prisma data it needs and rendering the same client components with the same unchanged props. `/dashboard` shrinks to hero + 2 stats + Coach + SpendingBreakdown + one chart + a new quick-access strip. `Header.tsx` reverts from anchor-scroll/IntersectionObserver nav to plain route links. A color-token pass (new `trust` token, reuse of the existing `success` token) shifts chart lines and the "under budget" state off the AI-coded violet.

**Tech Stack:** Next.js 14 App Router (Server Components), Prisma/Postgres, Tailwind, Vitest, Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-10-08-lean-dashboard-and-trend-redesign-design.md`

## Global Constraints

- Zero business-logic changes: expense creation/validation, budget calculation, cash-flow projection, health score, anomaly detection, Coach prompts/tool-calling are completely untouched. Any task whose diff touches logic in those areas is a red flag for extra review scrutiny.
- Zero prop-shape changes to `ExpensesClient`, `BudgetsClient`, `CashFlowClient`, `BudgetProgress`, `CategoryPieChart`, `MonthlyTrendChart`, `CoachCard`, `SpendingBreakdownCard` — only which parent renders them and what wraps them changes.
- Final page contents, exact:
  - `/dashboard` (Home): Hero (`AmbientBlobs` + `DashboardHeroOrb` + heading), 2 stat cards (Total spent this month, Financial health — **no GST stat here**), `CoachCard`, `SpendingBreakdownCard`, one chart (`CategoryPieChart`, "Spending by category this month"), a new horizontal-scroll quick-access strip linking to Expenses/Budgets/Cash Flow.
  - `/expenses`: `ExpenseFilters` + `ExpensesClient` (unchanged — CSV import/export already lives inside `ExpensesClient`), a GST-paid-this-month stat, `MonthlyTrendChart` ("6-month trend", moved here).
  - `/budgets`: `BudgetProgress` (moved here) + `BudgetsClient` (unchanged), one page.
  - `/cashflow`: `CashFlowClient` (entirely unchanged) — un-redirect only.
- `Header.tsx` reverts to real route links (Dashboard/Expenses/Budgets/Cash Flow) with `usePathname()`-based active-state highlighting. Delete the anchor-scroll `useEffect`, the `ResizeObserver` resettle logic, and the `IntersectionObserver` section-tracking logic entirely — the resulting file must be shorter than the current one, not just different.
- Colors: add `trust: '#2563EB'` to `tailwind.config.ts`. Reuse the EXISTING `success: '#34d399'` token for "positive/under-budget" states — do not add a redundant `gain` alias, `success` already means the same thing. `BudgetProgress.tsx`'s non-`overBudget` bar changes from `bg-primary` to `bg-success`. `CashFlowTrajectoryChart.tsx` and `MonthlyTrendChart.tsx`'s hardcoded `#22d3ee`/`#8b5cf6` line/gradient colors change to the new `trust` token (`rgb(37,99,235)` for inline SVG `stroke`/`stopColor` props, since Tailwind's color tokens aren't directly usable as literal SVG attribute values — see Task 1 for the exact approach). `CoachCard` and any AI-chat UI keep violet/`primary` unchanged. New `docs/design-tokens.md` documents every token's role.
- Every moved page queries strictly LESS data than the current single `/dashboard` page does for that page's own concern (e.g. `/budgets` must not run the 6-month expense aggregation query at all).
- `ExpenseFilters.tsx`'s `updateFilter` currently hardcodes `router.push(\`/dashboard?${params}#expenses\`)` — this MUST change to `router.push(\`/expenses?${params}\`)` once `/expenses` is a real page, or the filter UI will silently navigate back to `/dashboard` instead of staying on `/expenses`. Easy to miss; called out explicitly here and again in Task 4.
- Testing: every existing unit test for the eight untouched client/presentational components stays untouched. No `page.test.tsx` convention exists anywhere in this codebase today (confirmed: no test file exists for the current `app/dashboard/page.tsx`) — page-level verification for all four pages happens through Playwright, not a new unit-test convention invented for this plan. `e2e/accessibility.spec.ts` already calls `page.goto('/expenses')`, `page.goto('/budgets')`, `page.goto('/cashflow')` directly (it never relied on the old `/dashboard#section` anchors) — these need NO retargeting, they'll simply load real content once the redirects are gone. `e2e/dashboard.spec.ts`'s `'old page routes redirect to the matching section of the consolidated dashboard'` test (asserting `toHaveURL(/\/dashboard#expenses$/)` etc.) is the one test that must be fully inverted to assert direct, non-redirected navigation instead.

---

### Task 1: Color tokens + chart/BudgetProgress updates + docs

**Files:**
- Modify: `tailwind.config.ts` (add `trust`)
- Modify: `components/ui/BudgetProgress.tsx` (`bg-primary` → `bg-success` for the non-overBudget bar)
- Modify: `components/charts/CashFlowTrajectoryChart.tsx` (replace `#22d3ee` stop colors + stroke with the trust color; leave the violet `rgba(139,92,246,0.35)` grid/tooltip-border as-is — those are neutral chrome, not a "which hue means what" semantic the spec asked to change)
- Modify: `components/charts/MonthlyTrendChart.tsx` (replace `#8b5cf6` line stroke with the trust color)
- Create: `docs/design-tokens.md`
- Test: `components/ui/BudgetProgress.test.tsx` (existing file — add one assertion)

**Interfaces:**
- Produces: the Tailwind `trust` color token, usable as `text-trust`/`bg-trust`/etc. in any later task. Recharts' `stroke`/`stopColor` SVG props don't accept Tailwind class names (they're literal HTML attributes), so the two chart files use the equivalent raw value `rgb(37,99,235)` directly, with a comment pointing at `trust` in `tailwind.config.ts` as the source of truth for that value — the same pattern this codebase already uses for `#13111f` (an already-existing literal chart-tooltip background with no token of its own).

- [ ] **Step 1: Read `components/ui/BudgetProgress.test.tsx` to see its current test style**

(No code shown here since this is a read-only step — open the file and confirm the existing test fixtures' shape, e.g. whether `items` fixtures include an under-budget case already, before adding a new assertion to one.)

- [ ] **Step 2: Add a failing assertion for the under-budget color**

Find the existing test that renders an under-budget item (there should be one testing the non-`overBudget` rendering path) and add, right after its existing assertions:

```ts
    const bar = container.querySelector('.bg-success');
    expect(bar).not.toBeNull();
```

(Adjust `container` to whatever the existing test already destructures from `render(...)` — if it uses `screen` only, change the test's `render(...)` call to also capture `container`, e.g. `const { container } = render(<BudgetProgress items={items} />);`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/ui/BudgetProgress.test.tsx`
Expected: FAIL — `.bg-success` doesn't exist yet, the bar still has `.bg-primary`.

- [ ] **Step 4: Implement the token and the two color swaps**

In `tailwind.config.ts`, inside the `colors` object, add (alongside the existing `success`, not replacing it):

```ts
        trust: '#2563EB',
```

In `components/ui/BudgetProgress.tsx`, change:

```ts
                  overBudget ? 'bg-destructive' : 'bg-primary'
```

to:

```ts
                  overBudget ? 'bg-destructive' : 'bg-success'
```

In `components/charts/MonthlyTrendChart.tsx`, change the `Line` element's `stroke="#8b5cf6"` to `stroke="rgb(37,99,235)"`.

In `components/charts/CashFlowTrajectoryChart.tsx`, change both `stopColor="#22d3ee"` occurrences (the gradient's two stops) and the `Area`'s `stroke="#22d3ee"` to `rgb(37,99,235)`. Leave `rgba(139,92,246,0.35)` (grid lines, tooltip border) and `#13111f` (tooltip background) untouched — those are neutral chrome, not the "which hue carries meaning" change this task is about.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/ui/BudgetProgress.test.tsx`
Expected: PASS.

- [ ] **Step 6: Create the design-tokens doc**

Create `docs/design-tokens.md`:

```markdown
# Design Tokens

Source of truth: `tailwind.config.ts`'s `theme.extend.colors`.

| Token | Value | Role |
|---|---|---|
| `trust` | `#2563EB` | Primary interactive/brand color: buttons, active nav state, focus rings, and neutral data (chart lines that aren't AI-generated insight — the cash-flow trajectory, the 6-month spend trend). |
| `primary` | `#8b5cf6` | Reserved **exclusively** for Money Coach / AI surfaces — chat bubbles, the Coach panel's accent, AI-generated insight callouts. Never used for plain data or ordinary UI chrome. |
| `success` | `#34d399` | Positive money states: under budget, income landing, bill paid, balance trending up. |
| `destructive` | `#f87171` | Negative money states: over budget, overdue, balance dropping. |
| `accent` | `#22d3ee` | Legacy — being phased out of new chart work in favor of `trust`; still present in older components not touched by this plan. |
| `background`, `card`, `foreground`, `muted`, `border` | — | Neutral chrome, unchanged by any color-trend work to date. |
| `glass-1`/`glass-2`/`glass-3`/`border-glass` | — | Liquid-glass elevation tiers (2026-09-29 redesign), unrelated to the money-semantic tokens above. |

**Rule:** a new chart line, button, or data point that represents real financial data (not an AI-generated suggestion) uses `trust`, `success`, or `destructive` depending on its semantic meaning — never `primary`/violet. `primary` means "this came from the AI," nothing else.
```

- [ ] **Step 7: Run the full suite + a quick visual contrast sanity check**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green. (A full axe-core contrast re-check across real pages happens in Task 7, once all pages exist again — `#2563EB` on the app's `#05050f` background is a well-known-safe combination, but Task 7 confirms it for real rather than assuming.)

- [ ] **Step 8: Commit**

```bash
git add tailwind.config.ts components/ui/BudgetProgress.tsx components/charts/MonthlyTrendChart.tsx components/charts/CashFlowTrajectoryChart.tsx docs/design-tokens.md components/ui/BudgetProgress.test.tsx
git commit -m "feat: add trust color token, shift under-budget state and chart lines off AI-violet

BudgetProgress's under-budget bar and the two neutral-data chart lines
(cash-flow trajectory, 6-month trend) move to a new trust-blue token;
primary/violet is now reserved for Money Coach / AI surfaces only."
git push
```

---

### Task 2: Un-redirect `/budgets`

**Files:**
- Modify: `app/budgets/page.tsx` (currently a one-line `redirect()` stub — becomes a real server component)
- Test: `e2e/accessibility.spec.ts` already navigates to `/budgets` directly (no change needed there — confirmed by reading the file during plan-writing)

**Interfaces:**
- Consumes: `prisma`, `getCurrentUser` (`lib/auth/session`), `BudgetProgress` (`components/ui/BudgetProgress`, exact prop shape `{ items: BudgetProgressItem[] }` — unchanged), `BudgetsClient` (`app/budgets/BudgetsClient`, exact prop shape `{ rows: BudgetRow[] }` — unchanged), `Header`, `GlassPanel`.
- Produces: a real `/budgets` page. Nothing later depends on this file's internals beyond the route existing.

- [ ] **Step 1: Read the current `app/budgets/page.tsx` and the relevant lines of `app/dashboard/page.tsx`**

Read `app/dashboard/page.tsx`'s current full content (already read once during plan-writing — re-read before editing since this is a live file other tasks also touch) to find exactly which lines produce `budgetItems` (the `BudgetProgress` input) and `budgetRows` (the `BudgetsClient` input). As of this plan's writing, those are:

```ts
  const budgets = await prisma.budget.findMany({
    where: { userId: user.userId },
    include: { category: true },
  });
  const spentByCategory = new Map(categoryTotals.map((c) => [c.categoryId, c.total]));
  const budgetItems = budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    spent: spentByCategory.get(budget.categoryId) ?? 0,
    limit: Number(budget.monthlyLimit),
  }));

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });
  // ... (categoryTotals comes from aggregateByCategory(currentMonthExpenses), which itself comes
  // from a 6-month expense query filtered down to the current month — /budgets does NOT need the
  // 6-month query, only the current month's per-category totals)

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));
  const budgetRows = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    monthlyLimit: budgetByCategory.get(category.id) ?? null,
    isGstFree: category.isGstFree,
  }));
```

`budgetItems`'s `spent` figure depends on `categoryTotals`, which on the current combined page comes from aggregating a 6-month expense query down to the current month. `/budgets` only needs the CURRENT MONTH's spend per category — it must query expenses for the current month directly, not fetch 6 months and filter, since that would violate this plan's "strictly less data" constraint.

- [ ] **Step 2: Write the new page**

Replace `app/budgets/page.tsx`'s entire content with:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory } from '@/lib/utils/expenseAggregation';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { BudgetsClient } from './BudgetsClient';

export default async function BudgetsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [budgets, categories, currentMonthExpenses] = await Promise.all([
    prisma.budget.findMany({ where: { userId: user.userId }, include: { category: true } }),
    prisma.category.findMany({ where: { userId: user.userId } }),
    prisma.expense.findMany({
      where: { userId: user.userId, date: { gte: startOfMonth } },
      include: { category: true },
    }),
  ]);

  const categoryTotals = aggregateByCategory(
    currentMonthExpenses.map((e) => ({ amount: Number(e.amount), date: e.date, category: e.category }))
  );
  const spentByCategory = new Map(categoryTotals.map((c) => [c.categoryId, c.total]));
  const budgetItems = budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    spent: spentByCategory.get(budget.categoryId) ?? 0,
    limit: Number(budget.monthlyLimit),
  }));

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));
  const budgetRows = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    monthlyLimit: budgetByCategory.get(category.id) ?? null,
    isGstFree: category.isGstFree,
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Budgets</h1>
        <div className="flex flex-col gap-6">
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">Budget progress</h2>
            <BudgetProgress items={budgetItems} />
          </GlassPanel>
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">Manage budgets</h2>
            <BudgetsClient rows={budgetRows} />
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
```

Note: `aggregateByCategory`'s own date-range filtering behavior (if any) should be checked against its current signature before assuming the `where: { date: { gte: startOfMonth } }` Prisma filter alone is sufficient — read `lib/utils/expenseAggregation.ts` if its exact contract isn't already clear from Task 2's own testing step below.

- [ ] **Step 3: Verify data correctness against the old combined page**

This step has no new automated test (no `page.test.tsx` convention exists in this codebase) — instead, start a local dev server, log into the existing throwaway test account (`nalinijarugula@gmail.com` / `Pravs@1112`), and compare the Budget progress numbers shown on `/budgets` against what the OLD consolidated `/dashboard` page showed for the same account before this task's change (or compare against the live production figures if that's more convenient) — they must match exactly, since this is a pure data-source relocation, not a calculation change.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green — `BudgetsClient.test.tsx` and `BudgetProgress.test.tsx` are untouched by this task and must still pass unmodified.

- [ ] **Step 5: Commit**

```bash
git add app/budgets/page.tsx
git commit -m "feat: restore /budgets as a real page

No longer a redirect to /dashboard#budgets. Queries only the current
month's spend (not 6 months), since that's all BudgetProgress needs --
a real reduction in data fetched, not just a layout change."
git push
```

---

### Task 3: Un-redirect `/cashflow`

**Files:**
- Modify: `app/cashflow/page.tsx` (currently a one-line `redirect()` stub)
- Test: `e2e/accessibility.spec.ts` already navigates to `/cashflow` directly — no change needed.

**Interfaces:**
- Consumes: `prisma`, `getCurrentUser`, `CashFlowClient` (exact prop shape `{ initialIncomeSources: ..., initialBills: ... }` — unchanged, both already fully serialized shapes — see `app/dashboard/page.tsx`'s existing `serializedIncomeSources`/`serializedBills` construction, copied verbatim below).
- Produces: a real `/cashflow` page.

- [ ] **Step 1: Read the current `app/dashboard/page.tsx` lines that build `serializedIncomeSources`/`serializedBills`**

As of this plan's writing:

```ts
  const [incomeSources, bills] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId: user.userId }, orderBy: { createdAt: 'asc' } }),
    prisma.bill.findMany({ where: { userId: user.userId }, orderBy: { dueDate: 'asc' } }),
  ]);

  const serializedIncomeSources = incomeSources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    amount: s.amount ? Number(s.amount) : null,
    recurrenceInterval: s.recurrenceInterval ?? undefined,
    startDate: s.startDate.toISOString(),
  }));

  const nowForBills = new Date();
  const serializedBills = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate.toISOString(),
    recurrenceInterval: b.recurrenceInterval ?? undefined,
    isPaidThisPeriod: b.paidExpenseId !== null && b.dueDate > nowForBills,
  }));
```

This is the ENTIRE data this page needs — no 6-month expense query, no budgets, no categories. This task's page is the smallest of the three.

- [ ] **Step 2: Write the new page**

Replace `app/cashflow/page.tsx`'s entire content with:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { CashFlowClient } from './CashFlowClient';

export default async function CashFlowPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [incomeSources, bills] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId: user.userId }, orderBy: { createdAt: 'asc' } }),
    prisma.bill.findMany({ where: { userId: user.userId }, orderBy: { dueDate: 'asc' } }),
  ]);

  const serializedIncomeSources = incomeSources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    amount: s.amount ? Number(s.amount) : null,
    recurrenceInterval: s.recurrenceInterval ?? undefined,
    startDate: s.startDate.toISOString(),
  }));

  const nowForBills = new Date();
  const serializedBills = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate.toISOString(),
    recurrenceInterval: b.recurrenceInterval ?? undefined,
    isPaidThisPeriod: b.paidExpenseId !== null && b.dueDate > nowForBills,
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Cash Flow</h1>
        <GlassPanel elevation={1}>
          <CashFlowClient initialIncomeSources={serializedIncomeSources} initialBills={serializedBills} />
        </GlassPanel>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Verify data correctness**

Same manual verification approach as Task 2 Step 3 — compare `/cashflow`'s rendered income sources/bills/projection against the pre-change state for the throwaway test account.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green — `CashFlowClient.test.tsx` untouched and passing.

- [ ] **Step 5: Commit**

```bash
git add app/cashflow/page.tsx
git commit -m "feat: restore /cashflow as a real page

No longer a redirect to /dashboard#cashflow. Same data this section
always needed -- income sources and bills -- nothing extra."
git push
```

---

### Task 4: Un-redirect `/expenses`, move GST stat + 6-month trend here

**Files:**
- Modify: `app/expenses/page.tsx` (currently a one-line `redirect()` stub)
- Modify: `components/expenses/ExpenseFilters.tsx` (the `router.push` target — see Global Constraints)
- Test: `e2e/accessibility.spec.ts` already navigates to `/expenses` directly — no change needed.

**Interfaces:**
- Consumes: `prisma`, `getCurrentUser`, `ExpenseFilters` (exact prop shape `{ categories: { id, name }[] }` — unchanged), `ExpensesClient` (exact prop shape `{ categories, initialExpenses }` — unchanged), `MonthlyTrendChart` (exact prop shape — unchanged), `StatCard` (for the GST figure, `format` prop left at its default `'currency'`), `GlassPanel`.
- Produces: a real `/expenses` page with the GST stat and 6-month trend now living here instead of Home.

- [ ] **Step 1: Fix `ExpenseFilters.tsx`'s navigation target**

In `components/expenses/ExpenseFilters.tsx`, change:

```ts
    router.push(`/dashboard?${params.toString()}#expenses`);
```

to:

```ts
    router.push(`/expenses?${params.toString()}`);
```

This is the single most important line in this task — without it, changing a filter would silently navigate the user back to `/dashboard` instead of staying on `/expenses`, since the old target assumed the consolidated single-page layout.

- [ ] **Step 2: Read the current `app/dashboard/page.tsx` lines that build the GST figures, the 6-month trend, and the filtered expense list**

As of this plan's writing, relevant extracts:

```ts
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const expenses = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: sixMonthsAgo } },
    include: { category: true },
  });

  const expensesForAggregation = expenses.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const now = new Date();
  const currentMonthExpenses = expensesForAggregation.filter(
    (e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth()
  );

  const monthlyTotals = aggregateByMonth(expensesForAggregation, 6);
  const gstPaidThisMonth = computeGstPaid(
    currentMonthExpenses.map((e) => ({ amount: e.amount, categoryIsGstFree: e.category.isGstFree }))
  );
```

(`aggregateByCategory`/`totalThisMonth`/`spendTrend`/`gstTrend` are Home-page-only concerns — they move in Task 5, not here. `/expenses` needs the 6-month query ONLY for `monthlyTotals` and `gstPaidThisMonth`'s own month-filter — it is the one page that legitimately still needs the full 6-month query, since `MonthlyTrendChart` needs that full window; this does NOT violate the "strictly less data" constraint because the OLD combined page ran this exact same 6-month query for the exact same reason — Task 4 doesn't add a new query, Tasks 2/3/5 are what shed it where it isn't needed.)

Also needed — the existing filtered-expense-list query and its searchParams handling:

```ts
  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const expenseWhere: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) expenseWhere.categoryId = searchParams.categoryId;
  const fromDate = searchParams.from ? new Date(searchParams.from) : undefined;
  const toDate = searchParams.to ? new Date(searchParams.to) : undefined;
  const validFromDate = fromDate && !isNaN(fromDate.getTime()) ? fromDate : undefined;
  const validToDate = toDate && !isNaN(toDate.getTime()) ? toDate : undefined;
  if (validFromDate || validToDate) {
    expenseWhere.date = {
      ...(validFromDate ? { gte: validFromDate } : {}),
      ...(validToDate ? { lte: validToDate } : {}),
    };
  }

  const filteredExpenses = await prisma.expense.findMany({
    where: expenseWhere,
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  const serializedExpenses = filteredExpenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    description: e.description,
    date: e.date.toISOString(),
    isRecurring: e.isRecurring,
    recurrenceInterval: e.recurrenceInterval ?? undefined,
    category: { id: e.category.id, name: e.category.name, color: e.category.color },
  }));
```

- [ ] **Step 3: Write the new page**

Replace `app/expenses/page.tsx`'s entire content with:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { computeGstPaid } from '@/lib/utils/gst';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { StatCard } from '@/components/ui/StatCard';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from './ExpensesClient';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { categoryId?: string; from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const sixMonthExpenses = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: sixMonthsAgo } },
    include: { category: true },
  });
  const expensesForAggregation = sixMonthExpenses.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const now = new Date();
  const currentMonthExpenses = expensesForAggregation.filter(
    (e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth()
  );
  const monthlyTotals = aggregateByMonth(expensesForAggregation, 6);
  const gstPaidThisMonth = computeGstPaid(
    currentMonthExpenses.map((e) => ({ amount: e.amount, categoryIsGstFree: e.category.isGstFree }))
  );

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const expenseWhere: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) expenseWhere.categoryId = searchParams.categoryId;
  const fromDate = searchParams.from ? new Date(searchParams.from) : undefined;
  const toDate = searchParams.to ? new Date(searchParams.to) : undefined;
  const validFromDate = fromDate && !isNaN(fromDate.getTime()) ? fromDate : undefined;
  const validToDate = toDate && !isNaN(toDate.getTime()) ? toDate : undefined;
  if (validFromDate || validToDate) {
    expenseWhere.date = {
      ...(validFromDate ? { gte: validFromDate } : {}),
      ...(validToDate ? { lte: validToDate } : {}),
    };
  }

  const filteredExpenses = await prisma.expense.findMany({
    where: expenseWhere,
    include: { category: true },
    orderBy: { date: 'desc' },
  });
  const serializedExpenses = filteredExpenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    description: e.description,
    date: e.date.toISOString(),
    isRecurring: e.isRecurring,
    recurrenceInterval: e.recurrenceInterval ?? undefined,
    category: { id: e.category.id, name: e.category.name, color: e.category.color },
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Expenses</h1>
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <GlassPanel elevation={1}>
              <StatCard label="GST paid this month" value={gstPaidThisMonth} trend={[]} />
            </GlassPanel>
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
              <MonthlyTrendChart data={monthlyTotals} />
            </GlassPanel>
          </div>
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">Expenses</h2>
            <ExpenseFilters categories={categories} />
            <ExpensesClient categories={categories} initialExpenses={serializedExpenses} />
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
```

Note: `StatCard`'s `trend` prop is passed `[]` here rather than a real daily-running-GST sparkline — the Home page's original `gstTrend` computation was a day-by-day cumulative array built specifically for the stat-card sparkline on a page that already computed per-day breakdowns for its OTHER stat card too; reproducing that here would mean re-adding the exact per-day-loop logic this page doesn't otherwise need just for a sparkline, which is a cosmetic nice-to-have, not a requirement from the spec. `StatCard`'s own code already handles `trend.length <= 1` by simply not rendering a sparkline (confirmed in `components/ui/StatCard.tsx`) — so this renders cleanly as a plain stat with no sparkline, not a broken one.

- [ ] **Step 4: Verify data correctness and the filter navigation fix**

Manual verification against the throwaway test account: confirm the expense list, GST figure, and 6-month trend chart match pre-change values, AND confirm clicking a category filter on `/expenses` updates the URL to `/expenses?categoryId=...` (not `/dashboard?...`) and the page stays on `/expenses` showing the filtered list.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green — `ExpensesClient.test.tsx`, `ExpenseFilters.test.tsx` (if it exists — check), `MonthlyTrendChart.test.tsx` all untouched and passing.

- [ ] **Step 6: Commit**

```bash
git add app/expenses/page.tsx components/expenses/ExpenseFilters.tsx
git commit -m "feat: restore /expenses as a real page, move GST stat + 6-month trend here

No longer a redirect to /dashboard#expenses. Fixes ExpenseFilters'
navigation target, which previously pushed back to /dashboard -- a
real bug that would have silently broken category/date filtering
once the redirect was removed."
git push
```

---

### Task 5: Rebuild `/dashboard` as the lean Home + quick-access strip

**Files:**
- Modify: `app/dashboard/page.tsx` (the big one — strips out everything that moved in Tasks 2-4)

**Interfaces:**
- Consumes: everything it already consumes today, minus what Tasks 2-4 relocated. `CoachCard`, `SpendingBreakdownCard` consumed with zero prop changes (both are self-contained client components with their own `fetch`-based data loading — confirmed by reading both files during this plan's research; neither takes props from this page today).
- Produces: the final lean Home page. Nothing later depends on this file beyond the route existing and rendering the specified sections.

- [ ] **Step 1: Re-read the CURRENT `app/dashboard/page.tsx` in full before editing**

This file has already been modified by Tasks 2-4's research but NOT by their actual diffs (those tasks only touch their own target files) — so this file is still in its ORIGINAL, fully-consolidated state when this task starts. Read it fresh to confirm nothing unexpected changed.

- [ ] **Step 2: Write the new Home page**

Replace `app/dashboard/page.tsx`'s entire content with:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { aggregateByCategory } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { StatCard } from '@/components/ui/StatCard';
import { CoachCard } from '@/components/coach/CoachCard';
import { SpendingBreakdownCard } from '@/components/dashboard/SpendingBreakdownCard';
import { DashboardHeroOrb } from '@/components/dashboard/DashboardHeroOrb';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';
import Link from 'next/link';
import {
  BanknotesIcon,
  ChartPieIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

const QUICK_LINKS = [
  { href: '/expenses', label: 'Expenses', Icon: BanknotesIcon },
  { href: '/budgets', label: 'Budgets', Icon: ChartPieIcon },
  { href: '/cashflow', label: 'Cash Flow', Icon: ArrowsRightLeftIcon },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    await generateDueRecurringExpenses(user.userId);
  } catch (error) {
    console.error('Failed to generate recurring expenses:', error);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const currentMonthExpensesRaw = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: startOfMonth } },
    include: { category: true },
  });
  const currentMonthExpenses = currentMonthExpensesRaw.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const categoryTotals = aggregateByCategory(currentMonthExpenses);
  const totalThisMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const dayOfMonth = now.getDate();
  const dailySpendTotals = Array.from({ length: dayOfMonth }, () => 0);
  for (const e of currentMonthExpenses) {
    const day = e.date.getDate();
    if (day >= 1 && day <= dayOfMonth) {
      dailySpendTotals[day - 1] += e.amount;
    }
  }
  let runningSpend = 0;
  const spendTrend = dailySpendTotals.map((d) => (runningSpend += d));

  let healthScoreValue = 0;
  let healthScoreTrend: number[] = [];
  let hasHealthScore = false;
  const activeCycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
  if (activeCycle) {
    const currentScore = await computeHealthScore(
      user.userId,
      {
        id: activeCycle.id,
        startDate: activeCycle.startDate,
        endDate: activeCycle.endDate,
        createdAt: activeCycle.createdAt,
        status: activeCycle.status,
        startingAmount: Number(activeCycle.startingAmount),
      },
      new Date()
    );
    const recentPastCycles = await prisma.moneyCycle.findMany({
      where: { userId: user.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    const pastScores = await Promise.all(
      recentPastCycles
        .slice()
        .reverse()
        .map((c) =>
          computeHealthScore(
            user.userId,
            {
              id: c.id,
              startDate: c.startDate,
              endDate: c.endDate,
              createdAt: c.createdAt,
              status: c.status,
              startingAmount: Number(c.startingAmount),
            },
            c.endDate
          )
        )
    );
    healthScoreValue = currentScore.total;
    healthScoreTrend = [...pastScores.map((s) => s.total), currentScore.total];
    hasHealthScore = true;
  }

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <DashboardHeroOrb />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Dashboard</h1>

        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <GlassPanel elevation={2}>
              <StatCard label="Total spent this month" value={totalThisMonth} trend={spendTrend} />
            </GlassPanel>
            <GlassPanel elevation={2}>
              {hasHealthScore ? (
                <StatCard label="Financial health" value={healthScoreValue} trend={healthScoreTrend} format="number" />
              ) : (
                <div>
                  <p className="text-sm text-muted">Financial health</p>
                  <p className="inline-block bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
                    —
                  </p>
                </div>
              )}
            </GlassPanel>
          </div>

          <nav
            aria-label="Quick access"
            className="flex gap-4 overflow-x-auto pb-2"
          >
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="flex-shrink-0">
                <GlassPanel elevation={1} hoverable className="flex items-center gap-2 px-4 py-3">
                  <Icon className="h-5 w-5 text-trust" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </GlassPanel>
              </Link>
            ))}
          </nav>

          <CoachCard />

          <SpendingBreakdownCard />

          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
```

Notes on what was deliberately dropped from this file versus the original: `gstPaidThisMonth`/`gstTrend`/`dailyGstExpenses`/`computeGstPaid` import (moved to `/expenses` in Task 4), the 6-month expense query and `monthlyTotals`/`aggregateByMonth` (moved to `/expenses`), `budgets`/`budgetItems`/`budgetByCategory`/`budgetRows`/`BudgetProgress` import (moved to `/budgets`), `categories` query and the filtered-expense/`ExpenseFilters`/`ExpensesClient` block (moved to `/expenses`), `incomeSources`/`bills`/serialization and `CashFlowClient` (moved to `/cashflow`), the `searchParams` prop (no longer needed — Home has no filterable list), `MonthlyTrendChart` import (moved).

- [ ] **Step 3: Verify data correctness and the quick-access strip**

Manual verification against the throwaway test account: confirm Home shows the Total-spent and Financial-health stats matching pre-change values, the category pie chart renders, Coach and Spending Breakdown still work exactly as before (they're unchanged components), and the three quick-access links navigate to real `/expenses`, `/budgets`, `/cashflow` pages.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: rebuild /dashboard as a lean home screen

Hero, 2 key stats, Money Coach, Spending Breakdown, one chart, and a
new quick-access strip to Expenses/Budgets/Cash Flow -- replacing the
9-section single scrolling page. GST, 6-month trend, budget management,
and the full expense/cashflow detail views now live on their own pages."
git push
```

---

### Task 6: Rewrite `Header.tsx` for route-based navigation

**Files:**
- Modify: `components/ui/Header.tsx`
- Modify: `components/ui/Header.test.tsx`

**Interfaces:**
- Produces: nothing new consumed elsewhere — `Header` takes no props today and continues to take none.

- [ ] **Step 1: Write the failing tests**

Replace `components/ui/Header.test.tsx`'s entire content with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const refreshMock = vi.fn();
let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => mockPathname,
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    mockPathname = '/dashboard';
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    // @ts-expect-error test cleanup — not defined by default in jsdom
    delete navigator.serviceWorker;
  });

  it('renders nav links and a logout button', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/expenses');
    expect(screen.getByRole('link', { name: 'Budgets' })).toHaveAttribute('href', '/budgets');
    expect(screen.getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('href', '/cashflow');
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('highlights the link matching the current route', () => {
    mockPathname = '/expenses';
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Expenses' }).className).toContain('text-trust');
    expect(screen.getByRole('link', { name: 'Dashboard' }).className).not.toContain('text-trust');
  });

  it('highlights Dashboard when the pathname is exactly /dashboard', () => {
    mockPathname = '/dashboard';
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Dashboard' }).className).toContain('text-trust');
  });

  it('calls the logout API and redirects to /login on click', async () => {
    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    );
    expect(pushMock).toHaveBeenCalledWith('/login');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('unsubscribes the browser push subscription before calling the logout endpoint, when a subscription exists', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://push.example.com/abc' }),
          },
        }),
      },
      configurable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/unsubscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://push.example.com/abc' }),
      })
    );

    const unsubscribeCallIndex = fetchMock.mock.calls.findIndex(([url]) => url === '/api/push/unsubscribe');
    const logoutCallIndex = fetchMock.mock.calls.findIndex(([url]) => url === '/api/auth/logout');
    expect(unsubscribeCallIndex).toBeGreaterThanOrEqual(0);
    expect(unsubscribeCallIndex).toBeLessThan(logoutCallIndex);
  });
});
```

This drops the old anchor-scroll test and the IntersectionObserver test entirely (that machinery no longer exists) and adds two new route-based highlighting tests in their place.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/Header.test.tsx`
Expected: FAIL — `usePathname` isn't imported/used yet, nav links are still anchors (`<a href="#...">`), not real `<Link>`s with real hrefs, so `getByRole('link', { name: ... })` won't resolve the way the test expects.

- [ ] **Step 3: Write the new implementation**

Replace `components/ui/Header.tsx`'s entire content with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/cashflow', label: 'Cash Flow' },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
      }
    } catch {
      // Best-effort — a failed unsubscribe shouldn't block logout. The stale
      // subscription self-cleans the next time a push to it 410s or 404s.
    }

    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <span className="font-heading text-lg font-semibold text-foreground">Budget Buddy</span>
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium ${
                pathname === link.href ? 'text-trust' : 'text-muted hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm font-medium text-muted hover:text-destructive"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
```

This file drops the anchor-scroll `useEffect`, the `ResizeObserver` resettle logic, and the `IntersectionObserver` section-tracking `useEffect` entirely — confirm the new file is meaningfully shorter than the original (it should be roughly half the length).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/Header.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Header.tsx components/ui/Header.test.tsx
git commit -m "feat: revert Header to route-based navigation

Deletes the anchor-scroll useEffect, the ResizeObserver resettle hack,
and the IntersectionObserver section-tracking logic -- all made
necessary only by the single-page consolidation this plan reverses.
Active-state highlighting is now a plain usePathname() comparison."
git push
```

---

### Task 7: e2e retargeting, whole-feature live verification, final contrast check

**Files:**
- Modify: `e2e/dashboard.spec.ts` (invert the one old-route-redirect test)
- Modify: `e2e/accessibility.spec.ts` (update the one stale comment about the `/cashflow` redirect noted during Task 3's research; re-check whether this file's `test.setTimeout()` headroom, added when the consolidated page was heavier, is still needed now that pages are lighter — leave it in place unless it's clearly unnecessary and removing it is risk-free, since extra headroom on a passing test costs nothing and this plan's goal isn't to chase every possible cleanup)

**Interfaces:**
- Consumes: nothing new — this task verifies Tasks 1-6's work holds together as a whole feature.

- [ ] **Step 1: Invert the old-route-redirect test in `e2e/dashboard.spec.ts`**

Read the current test named `'old page routes redirect to the matching section of the consolidated dashboard'` in full (it signs up, starts a cycle, then does three hard navigations asserting `toHaveURL(/\/dashboard#expenses$/)` etc.). Replace it with a test confirming the OPPOSITE — that these routes now render their own real content directly, with no redirect:

```ts
test('expenses, budgets, and cash flow are real pages, not redirects to the dashboard', async ({ page }) => {
  test.setTimeout(60_000);

  const email = `test-real-routes-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('longenough123');
  await page.getByRole('button', { name: /sign up/i }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto('/expenses');
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/budgets$/);
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();

  await page.goto('/cashflow');
  await expect(page).toHaveURL(/\/cashflow$/);
  await expect(page.getByRole('heading', { name: 'Cash Flow' })).toBeVisible();
});
```

(`expect`/`test` imports should already exist at the top of this file from its pre-existing tests — don't duplicate the import.)

- [ ] **Step 2: Fix the stale comment in `e2e/accessibility.spec.ts`**

Find the comment (noted during Task 3's research) that reads something like `// ... once via the /cashflow -> /dashboard#cashflow redirect ...` and update it to reflect that `/cashflow` is now a direct real page, not a redirect — the test logic itself (`page.goto('/cashflow')`) needs no change, only the comment's accuracy.

- [ ] **Step 3: Run the full e2e suite locally**

Run: `set -a && source .env && set +a && npx playwright test`

If any test fails on a timeout, apply this project's own established diagnostic standard before concluding it's a real regression: re-run that specific test in isolation at least twice. This plan's whole point is that pages are now LIGHTER than before (each page queries less data than the old combined page did for that concern), so if anything, existing timeout headroom added for the heavier consolidated page should have MORE margin now, not less — a new timeout failure here would be a genuine signal worth investigating carefully, not dismissing as the known flaky pattern.

- [ ] **Step 4: Extend axe-core WCAG coverage and the contrast re-check**

`e2e/accessibility.spec.ts` already runs an axe-core scan against `/expenses`, `/budgets`, `/cashflow`, and the dashboard — confirm (by reading the file) that each of these scans still passes against the NEW page structure, and that the new `trust` color token's actual rendered contrast (the `text-trust` nav-link active state, the `rgb(37,99,235)` chart lines against this app's dark background) doesn't trip any `color-contrast` violation axe-core would catch. If any test needs updating to account for new/changed DOM structure (e.g. the Home page's new quick-access `<nav>` strip), update it — but do not add a speculative new test for the quick-access strip's accessibility beyond what the existing full-page axe-core scan already covers, since that scan already exercises every interactive element on the page including new ones.

- [ ] **Step 5: Live verification against the throwaway test account**

Using `nalinijarugula@gmail.com` / `Pravs@1112` (never any other account), start a local dev server (or use the deployed preview if Vercel has already built this branch) and confirm, reporting the actual observed result for each:
1. `/dashboard` loads a visibly shorter page than before — hero, 2 stats, quick-access strip, Coach, Spending Breakdown, one chart, nothing else.
2. Each of the three quick-access links navigates to a real, distinct page (not a redirect, not an anchor-scroll).
3. The top nav (`Header`) correctly highlights whichever page is currently active.
4. `/expenses`'s category/date filters update the URL and the list without navigating away from `/expenses`.
5. `/budgets`' numbers and `/cashflow`'s income/bills/projection match what they showed before this plan (spot-check against figures noted during Tasks 2-4's own manual verification steps, or against the live production site's pre-change state if still recorded anywhere).
6. Mobile-width layout (resize the browser or use device emulation) still looks reasonable on all four pages — no lingering `sm:col-span-2`-style classes left over from the old grid that now orphan content on a page that no longer has the sibling they were spanning next to.

- [ ] **Step 6: Final check and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

```bash
git add e2e/dashboard.spec.ts e2e/accessibility.spec.ts
git commit -m "test: retarget e2e for the restored multi-page navigation

Inverts the old redirect-regression test to confirm /expenses, /budgets,
and /cashflow are now real, directly-rendered pages. Live-verified the
whole restructured navigation against the throwaway test account."
git push
```
