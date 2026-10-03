# Single-Page Bento Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the app's four separate pages (Dashboard, Expenses, Budgets, Cash Flow) into one page at `/dashboard`, laid out as a Bento Grid, with Glassmorphism 2.0 pulled back to a few focal cells rather than applied uniformly.

**Architecture:** `app/dashboard/page.tsx` becomes the single authenticated route, fetching everything the four pages currently fetch individually in one `Promise.all`, and rendering every existing client component unchanged inside a new CSS Grid. `app/expenses/page.tsx`, `app/budgets/page.tsx`, `app/cashflow/page.tsx` become one-line redirects to `/dashboard#<section>`. `Header`'s nav becomes in-page anchor links with scroll-based active-section highlighting.

**Tech Stack:** Next.js 14 App Router, Prisma, Tailwind, Framer Motion, `GlassPanel` (existing primitive, `elevation`/`hoverable` props only — no new primitive).

**Spec:** `docs/superpowers/specs/2026-10-03-single-page-bento-consolidation-design.md`

## Global Constraints

- `/dashboard` is the single surviving authenticated route. `/expenses`, `/budgets`, `/cashflow` redirect there via the same `redirect()` pattern already used at the bare root (`app/page.tsx`) — not a `next.config.js`-level redirect. `middleware.ts`'s matcher is unchanged.
- Anchor ids on the consolidated page: `#expenses`, `#budgets`, `#cashflow`. The hero/stats/coach/spending-breakdown/charts/budget-progress area at the top has no anchor.
- No client component's props, exported behavior, or internal business logic changes: `ExpensesClient`, `BudgetsClient`, `CashFlowClient`, `CategoryPieChart`, `MonthlyTrendChart`, `BudgetProgress` are consumed exactly as they are today. `CoachCard` and `SpendingBreakdownCard` each get exactly one in-place prop change to their own existing root `GlassPanel` call (`elevation={1}` → `elevation={2}`, add `hoverable`) — nothing else in either file changes. `ExpenseFilters` gets exactly one line changed (its hardcoded redirect target) — this is routing glue, not business logic.
- Work directly on `main`, no worktree/feature branch — standing project convention. **Never pass `isolation: "worktree"` to any Agent-tool dispatch for this plan** — a past mistake on this exact project, corrected once already; do not repeat it.
- Push to GitHub after each task.
- This project has a hard-won, repeated discipline: every subagent's report must be independently re-checked (diff review, real test re-runs, live browser verification) before being trusted. The most recent two plans on this project (liquid-glass redesign, Smart Spending Recommendation) each had their final whole-branch review catch a genuine, previously-missed bug — once a BLOCKING regression. The same rigor applies here. Pay special attention to: (a) Header's `IntersectionObserver` active-section logic under fast scrolling or very different section heights; (b) confirming no task's diff touches business logic inside `ExpensesClient`, `BudgetsClient`, `CashFlowClient`, `CategoryPieChart`, `MonthlyTrendChart`, or `BudgetProgress` — any such diff is a red flag for extra review scrutiny, since the entire point of this plan is zero business-logic risk.
- No business logic in expenses/budgets/cashflow/money-cycles/spending-recommendation changes. No API route under `app/api/` changes. No color/typography system change — only layout and glass-intensity.
- Rollout: directly to `main`, no feature flag.

---

### Task 1: Bento grid skeleton for today's existing dashboard content

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/coach/CoachCard.tsx`
- Modify: `components/dashboard/SpendingBreakdownCard.tsx`

**Interfaces:**
- Consumes: nothing new — every piece of data this task touches (`totalThisMonth`, `gstPaidThisMonth`, `categoryTotals`, `monthlyTotals`, `budgetItems`) is already fetched and computed by the current `app/dashboard/page.tsx`.
- Produces: the page's outer grid container (`<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">`, placed after the hero) that Tasks 2-4 add more cells into, in the same relative position (after the existing cells, before the closing `</main>`).

This task is a pure layout reflow of content already on `/dashboard` today, plus two one-line prop changes. No new Prisma query, no new client component.

- [ ] **Step 1: Promote `CoachCard` to the focal glass tier**

Read `components/coach/CoachCard.tsx` fully first — it returns `<GlassPanel elevation={1}>...</GlassPanel>` from three separate branches (loading, no-active-cycle, active-cycle). Change all three occurrences of `<GlassPanel elevation={1}>` to `<GlassPanel elevation={2} hoverable>`. Nothing else in this file changes — no logic, no other JSX, no props passed into `CoachCard` itself (it takes none).

- [ ] **Step 2: Promote `SpendingBreakdownCard` to the focal glass tier**

Read `components/dashboard/SpendingBreakdownCard.tsx` fully first. It returns `<GlassPanel elevation={1} data-testid="spending-breakdown-card">` from two branches (the empty-categories fallback, and the full chart+table view). Change both occurrences to `<GlassPanel elevation={2} hoverable data-testid="spending-breakdown-card">`. Nothing else in this file changes.

- [ ] **Step 3: Run the full suite to confirm the two prop changes don't break anything**

Run: `npm test`
Expected: all existing tests pass unchanged — neither `CoachCard.test.tsx` nor `SpendingBreakdownCard.test.tsx` assert on the `elevation`/`hoverable` prop values (confirmed by reading both files: they assert on content/behavior, not glass styling), so this step should be a no-op confirmation, not a fix.

- [ ] **Step 4: Rebuild the dashboard page body as one bento grid**

Read `app/dashboard/page.tsx` fully first. Replace the JSX between `<h1>Dashboard</h1>` and the closing `</main>` (currently four separate `<div>`/`<GlassPanel>` blocks: the stats row, the charts row, the budget-progress panel, the `CoachCard`/`SpendingBreakdownCard` wrapper divs) with:

```tsx
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <GlassPanel elevation={2}>
            <p className="text-sm text-muted">Total spent this month</p>
            <CountUpStat value={totalThisMonth} />
          </GlassPanel>
          <GlassPanel elevation={2}>
            <p className="text-sm text-muted">GST paid this month</p>
            <CountUpStat value={gstPaidThisMonth} />
          </GlassPanel>

          <div className="sm:col-span-2">
            <CoachCard />
          </div>

          <div className="sm:col-span-2">
            <SpendingBreakdownCard />
          </div>

          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </GlassPanel>
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
            <MonthlyTrendChart data={monthlyTotals} />
          </GlassPanel>

          <div className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Budget progress</h2>
              <BudgetProgress items={budgetItems} />
            </GlassPanel>
          </div>
        </div>
```

Note the two chart panels drop the `hoverable` prop they currently have — this is intentional, matching the spec's two-tier system (data tier is not hoverable). Everything else in the file (imports, data-fetching above the `return`, the `<Header />`/`<AmbientBlobs />`/`<DashboardHeroOrb />`/`<h1>` block before this grid) is unchanged.

- [ ] **Step 5: Run the full suite, typecheck, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 6: Manually verify the reflow looks right**

Start the dev server (`npm run dev`), sign up or log in, visit `/dashboard`, and confirm: both stat cards side by side, Coach card full-width below them, Spending Breakdown full-width below that, the two charts side by side below that, Budget progress full-width at the bottom — same relative order as today, just inside one grid instead of several separate wrapper divs. Confirm Coach and Spending Breakdown now visibly have the stronger glass/hover-tilt treatment (move your cursor over them) while the charts and budget progress do not.

- [ ] **Step 7: Commit and push**

```bash
git add app/dashboard/page.tsx components/coach/CoachCard.tsx components/dashboard/SpendingBreakdownCard.tsx
git commit -m "feat: rebuild dashboard as a bento grid, promote Coach/SpendingBreakdown to focal glass tier"
git push
```

---

### Task 2: Add the Expenses cell

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/expenses/ExpenseFilters.tsx`

**Interfaces:**
- Consumes: `ExpenseFilters` (existing, prop shape `{categories: {id, name}[]}`, unchanged), `ExpensesClient` (existing, prop shape `{categories: {id,name,color}[], initialExpenses: Expense[]}`, unchanged).
- Produces: a `categories` variable (full `Category[]` rows, `prisma.category.findMany({ where: { userId } })`) that Task 4 reuses — do not have Task 4 re-fetch categories.

- [ ] **Step 1: Read `app/expenses/page.tsx` and `components/expenses/ExpenseFilters.tsx` fully**

Confirm their current exact data-fetching and routing shape before editing — this task's diff below assumes `app/expenses/page.tsx`'s current structure (as read earlier in this plan's own research); if it has changed, adapt rather than blindly pasting.

- [ ] **Step 2: Fix `ExpenseFilters`'s hardcoded redirect target**

In `components/expenses/ExpenseFilters.tsx`, change:

```ts
    router.push(`/expenses?${params.toString()}`);
```

to:

```ts
    router.push(`/dashboard?${params.toString()}#expenses`);
```

This is the only change in this file. It is routing glue (where a filter change navigates to), not a change to the filtering logic itself.

- [ ] **Step 3: Confirm no test needs updating for this change**

No test file exists for `ExpenseFilters` today (confirmed: `find . -iname "ExpenseFilters.test*"` returns nothing) — there is nothing to update in this step. This task's "Modify: `components/expenses/ExpenseFilters.test.tsx`" file listed at the top of this task is conditional on this file existing by the time this task runs; since it doesn't, skip it.

- [ ] **Step 4: Add the Expenses cell's data fetching to `app/dashboard/page.tsx`**

`app/dashboard/page.tsx`'s exported function signature changes from `DashboardPage()` to accept Next's `searchParams` prop, matching `app/expenses/page.tsx`'s current signature exactly:

```ts
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { categoryId?: string; from?: string; to?: string };
}) {
```

After the existing `budgets` fetch (and before the `return`), add:

```ts
  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const expenseWhere: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) expenseWhere.categoryId = searchParams.categoryId;
  if (searchParams.from || searchParams.to) {
    expenseWhere.date = {
      ...(searchParams.from ? { gte: new Date(searchParams.from) } : {}),
      ...(searchParams.to ? { lte: new Date(searchParams.to) } : {}),
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

Note `expenseWhere` (not `where`) and `filteredExpenses` (not `expenses`) — the existing six-month-aggregation query in this file is already named `expenses`; do not collide with it.

- [ ] **Step 5: Add the Expenses cell to the grid**

Inside the grid container Task 1 created, after the Budget progress cell, add:

```tsx
          <div id="expenses" className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Expenses</h2>
              <ExpenseFilters categories={categories} />
              <ExpensesClient categories={categories} initialExpenses={serializedExpenses} />
            </GlassPanel>
          </div>
```

Add the two new imports alongside the file's existing ones:

```ts
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from '@/app/expenses/ExpensesClient';
```

- [ ] **Step 6: Run the full suite, typecheck, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 7: Manually verify**

Visit `/dashboard`, scroll to the new Expenses cell, add an expense, confirm it appears. Apply a category filter and confirm the URL becomes `/dashboard?categoryId=...#expenses` (not `/expenses?...`) and the list filters correctly without a full page reload landing you anywhere else.

- [ ] **Step 8: Commit and push**

```bash
git add app/dashboard/page.tsx components/expenses/ExpenseFilters.tsx
git commit -m "feat: add Expenses cell to the consolidated dashboard"
git push
```

---

### Task 3: Add the Cash Flow cell

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `CashFlowClient` (existing, prop shape `{initialIncomeSources, initialBills}`, unchanged).
- Produces: nothing new consumed by a later task.

- [ ] **Step 1: Read `app/cashflow/page.tsx` fully**

Confirm its current exact data-fetching shape (as read earlier in this plan's own research) before editing.

- [ ] **Step 2: Add the Cash Flow cell's data fetching**

After Task 2's `filteredExpenses`/`serializedExpenses` block, add:

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

`nowForBills` (not `now`) — this file already declares a `now` variable earlier for the current-month expense filter; do not collide with it.

- [ ] **Step 3: Add the Cash Flow cell to the grid**

After the Expenses cell, add:

```tsx
          <div id="cashflow" className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Cash Flow</h2>
              <CashFlowClient initialIncomeSources={serializedIncomeSources} initialBills={serializedBills} />
            </GlassPanel>
          </div>
```

Add the import: `import { CashFlowClient } from '@/app/cashflow/CashFlowClient';`

- [ ] **Step 4: Run the full suite, typecheck, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Manually verify**

Visit `/dashboard`, scroll to the new Cash Flow cell, add an income source and a bill, confirm both appear and the projection chart/list below them render.

- [ ] **Step 6: Commit and push**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add Cash Flow cell to the consolidated dashboard"
git push
```

---

### Task 4: Add the Budgets management cell

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `BudgetsClient` (existing, prop shape `{rows: BudgetRow[]}`, unchanged), the `categories` variable from Task 2, the `budgets` variable already fetched earlier in this file (for `BudgetProgress`'s `budgetItems`) — do NOT add a second `prisma.budget.findMany` or `prisma.category.findMany` call.

- [ ] **Step 1: Read `app/budgets/page.tsx` fully**

Confirm its current exact row-shaping logic (as read earlier in this plan's own research) before editing.

- [ ] **Step 2: Build `BudgetsClient`'s row shape from data already in scope**

After Task 3's cash-flow block, add:

```ts
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));
  const budgetRows = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    monthlyLimit: budgetByCategory.get(category.id) ?? null,
    isGstFree: category.isGstFree,
  }));
```

`budgets` and `categories` here are the SAME variables already fetched earlier in this file (`budgets` for `BudgetProgress`'s `budgetItems`, from the original dashboard code; `categories` from Task 2) — this step adds zero new Prisma queries, only a new derived shape.

- [ ] **Step 3: Add the Budgets management cell to the grid**

After the Budget progress cell (from Task 1) — keep it visually close to its management counterpart — but before the Expenses cell, OR directly after the Cash Flow cell at the end; either position is acceptable as long as it has its own `id="budgets"` anchor and doesn't duplicate the existing Budget Progress cell. Add:

```tsx
          <div id="budgets" className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Manage budgets</h2>
              <BudgetsClient rows={budgetRows} />
            </GlassPanel>
          </div>
```

Use the heading "Manage budgets" (not "Budget progress", which is the OTHER, already-existing cell from Task 1) so the two are clearly distinct in the UI. Add the import: `import { BudgetsClient } from '@/app/budgets/BudgetsClient';`

- [ ] **Step 4: Run the full suite, typecheck, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Manually verify both budget cells coexist correctly**

Visit `/dashboard`. In the new "Manage budgets" cell, set a monthly limit for a category. Confirm the EARLIER "Budget progress" cell (from Task 1, showing this month's spend against limits) reflects it after a page reload. Confirm the two cells are visually distinct and both present — this task must not have removed or replaced the Task 1 "Budget progress" cell.

- [ ] **Step 6: Commit and push**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add Manage Budgets cell to the consolidated dashboard"
git push
```

---

### Task 5: Redirect the three old pages

**Files:**
- Modify: `app/expenses/page.tsx`
- Modify: `app/budgets/page.tsx`
- Modify: `app/cashflow/page.tsx`

**Interfaces:**
- Consumes: nothing — `ExpensesClient`/`BudgetsClient`/`CashFlowClient` are now imported by `app/dashboard/page.tsx` directly (Tasks 2-4), not by these three files.
- Produces: nothing consumed by a later task.

**Do NOT delete `app/expenses/ExpensesClient.tsx`, `app/budgets/BudgetsClient.tsx`, or `app/cashflow/CashFlowClient.tsx`** — Tasks 2-4 already import them directly from their current locations (`@/app/expenses/ExpensesClient` etc.); only each directory's `page.tsx` changes in this task.

- [ ] **Step 1: Replace `app/expenses/page.tsx`'s entire contents**

```tsx
import { redirect } from 'next/navigation';

export default function ExpensesPage() {
  redirect('/dashboard#expenses');
}
```

- [ ] **Step 2: Replace `app/budgets/page.tsx`'s entire contents**

```tsx
import { redirect } from 'next/navigation';

export default function BudgetsPage() {
  redirect('/dashboard#budgets');
}
```

- [ ] **Step 3: Replace `app/cashflow/page.tsx`'s entire contents**

```tsx
import { redirect } from 'next/navigation';

export default function CashFlowPage() {
  redirect('/dashboard#cashflow');
}
```

- [ ] **Step 4: Run the full suite, typecheck, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green. (The e2e suite is NOT expected to be green yet at this point in the plan — Task 8 retargets it. Do not attempt to fix e2e failures in this task; `npm test` is the Vitest unit suite only and is unaffected by this change.)

- [ ] **Step 5: Manually verify the redirects**

Visit `/expenses`, `/budgets`, `/cashflow` directly in the browser (while logged in) and confirm each lands on `/dashboard` scrolled to the matching section. Visit each again while logged OUT and confirm `middleware.ts` still sends you to `/login` first (not straight through to the redirect).

- [ ] **Step 6: Commit and push**

```bash
git add app/expenses/page.tsx app/budgets/page.tsx app/cashflow/page.tsx
git commit -m "feat: redirect the old Expenses/Budgets/Cash Flow pages to the consolidated dashboard"
git push
```

---

### Task 6: Header becomes in-page navigation

**Files:**
- Modify: `components/ui/Header.tsx`
- Modify: `components/ui/Header.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Read `components/ui/Header.tsx` and `components/ui/Header.test.tsx` fully**

Confirm their current exact shape (as read earlier in this plan's own research) before editing.

- [ ] **Step 2: Add reduced-motion-aware smooth scroll globally**

In `app/globals.css`, add after the existing `:root` block:

```css
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}
```

This is the ONLY change to this file. Without the media query, `scroll-behavior` defaults to `auto` (instant jump) — exactly the reduced-motion-safe behavior — so no explicit `auto` rule is needed for that case.

- [ ] **Step 3: Rewrite `Header`'s nav links as anchors with scroll-based active-section highlighting**

Replace the entire contents of `components/ui/Header.tsx` with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const NAV_LINKS = [
  { href: '#', label: 'Dashboard' },
  { href: '#expenses', label: 'Expenses' },
  { href: '#budgets', label: 'Budgets' },
  { href: '#cashflow', label: 'Cash Flow' },
];

const SECTION_IDS = ['expenses', 'budgets', 'cashflow'];

export function Header() {
  const router = useRouter();
  const [activeHref, setActiveHref] = useState('#');
  const activeHrefRef = useRef(activeHref);
  activeHrefRef.current = activeHref;

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    // Tracks which observed section is most visible right now, keyed by element id, so the
    // callback (which only ever hears about the sections whose visibility just changed, not
    // every section's current state) can still pick the single most-visible one on every firing —
    // comparing only the sections that fired would wrongly ignore a still-mostly-visible section
    // that simply didn't cross a threshold on this particular callback.
    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        const nextHref = bestRatio > 0.1 && bestId ? `#${bestId}` : '#';
        if (nextHref !== activeHrefRef.current) {
          setActiveHref(nextHref);
        }
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

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
            <a
              key={link.href}
              href={link.href === '#' ? '/dashboard' : `/dashboard${link.href}`}
              className={`text-sm font-medium ${
                activeHref === link.href ? 'text-primary-hover' : 'text-muted hover:text-foreground'
              }`}
            >
              {link.label}
            </a>
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

Each link's `href` is the full `/dashboard#section` path (not a bare `#section` fragment) so `Header` works correctly from any page that still renders it mid-redirect-transition, and so right-click "open in new tab" resolves correctly. `usePathname` is no longer imported or used — active-state now comes entirely from the `IntersectionObserver`, not the route.

- [ ] **Step 4: Update `Header.test.tsx` for the removed `usePathname` dependency and add coverage for the new active-section logic**

Read the existing file fully, then: remove `usePathname: () => '/dashboard'` from the `vi.mock('next/navigation', ...)` call (keep `useRouter`, still needed for logout) — the mock becomes `vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))`. The three existing tests (nav links render, logout click, push-unsubscribe-before-logout) need no other changes — none of them asserted on `usePathname`'s return value directly.

Add a new test. `IntersectionObserver` doesn't exist in jsdom by default; stub it before rendering:

```tsx
  it('highlights the nav link for the section currently most visible on screen', async () => {
    let observerCallback: IntersectionObserverCallback = () => {};
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    // @ts-expect-error minimal IntersectionObserver stub — jsdom doesn't implement it
    global.IntersectionObserver = vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
      observerCallback = callback;
      return { observe: observeMock, disconnect: disconnectMock };
    });

    document.body.innerHTML = '<div id="expenses"></div><div id="budgets"></div><div id="cashflow"></div>';

    render(<Header />);

    expect(observeMock).toHaveBeenCalledTimes(3);

    const expensesSection = document.getElementById('expenses')!;
    observerCallback(
      [{ target: expensesSection, intersectionRatio: 0.8 } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    await waitFor(() => {
      const expensesLink = screen.getByText('Expenses');
      expect(expensesLink.className).toContain('text-primary-hover');
    });
  });
```

Add `waitFor` to the existing `import { render, screen, fireEvent, waitFor } from '@testing-library/react';` line if it isn't already imported (it already is, per the file's current logout test).

- [ ] **Step 5: Run the full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green, including the new test.

- [ ] **Step 6: Manually verify**

Visit `/dashboard`, scroll down past the Expenses section, confirm the "Expenses" nav link highlights (and un-highlights as you scroll past it to Budgets). Click a nav link and confirm the page smooth-scrolls to that section. In your OS/browser's reduced-motion setting, confirm the scroll jumps instantly instead.

- [ ] **Step 7: Commit and push**

```bash
git add components/ui/Header.tsx components/ui/Header.test.tsx app/globals.css
git commit -m "feat: turn Header into in-page nav with scroll-based active-section highlighting"
git push
```

---

### Task 7: Responsive and two-tier-glass audit pass

**Files:**
- Modify: `app/dashboard/page.tsx` (only if the audit below finds a discrepancy — read first, don't assume a diff is needed)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by a later task.

This task has no prescribed diff — it is a verification pass. Only edit `app/dashboard/page.tsx` if Step 1 or Step 2 below finds a real discrepancy from what Tasks 1-4 were supposed to produce.

- [ ] **Step 1: Audit every cell against the two-tier glass mapping**

Read the current full `app/dashboard/page.tsx`. Confirm exactly these cells use `elevation={1}`, not hoverable: the two chart panels, Budget progress, Expenses, Manage budgets, Cash Flow. Confirm `CoachCard`/`SpendingBreakdownCard` (now `elevation={2} hoverable` inside their own files, from Task 1) are rendered as plain `<div className="sm:col-span-2">` wrappers in the grid — NOT wrapped in a second `GlassPanel` by the page itself (that would double-wrap; see spec Section 6). If any cell doesn't match, fix it.

- [ ] **Step 2: Audit the responsive collapse order**

With the dev server running, resize the browser below the `sm:` breakpoint (640px) and confirm every cell still renders, in this exact top-to-bottom order, as a single column: Stat 1, Stat 2, Coach, Spending Breakdown, Category chart, Trend chart, Budget progress, (Manage budgets and Expenses and Cash Flow, in whatever relative order Tasks 2-4 placed them). Confirm nothing is clipped, hidden, or requires horizontal scrolling. If anything is out of order relative to the spec's Section 5 list, reorder the JSX (not the CSS) to fix it — the grid's DOM order IS its collapse order at `grid-cols-1`.

- [ ] **Step 3: Run the full suite, typecheck, lint, build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 4: Commit and push (only if Step 1 or 2 required a fix)**

```bash
git add app/dashboard/page.tsx
git commit -m "fix: correct glass-tier/responsive-order discrepancy found in bento audit"
git push
```

If no discrepancy was found, skip this step — there is nothing to commit, and that is a valid, complete outcome for this task.

---

### Task 8: Retarget Playwright specs, extend axe-core, whole-feature live verification

**Files:**
- Modify: `e2e/dashboard.spec.ts`
- Modify: `e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: everything built in Tasks 1-7.

- [ ] **Step 1: Read both files fully**

Confirm their current exact content (as read earlier in this plan's own research) before editing — several of these specs' `page.goto('/expenses')` etc. calls do NOT need to change at all, since those routes now redirect transparently to `/dashboard` and the assertions that follow only check for visible text/buttons, not the URL. Only change a `page.goto()` call if a step explicitly says to below.

- [ ] **Step 2: Simplify the redundant navigation in `e2e/dashboard.spec.ts`**

The first test currently does `await page.goto('/expenses')`, adds an expense, then `await page.goto('/dashboard')` to check the total updated. Since both URLs now resolve to the same page, change the second call from:

```ts
  await page.goto('/dashboard');
  await expect(page.getByText('$42.50')).toBeVisible();
```

to:

```ts
  await expect(page.getByText('$42.50')).toBeVisible();
```

(No navigation needed — the expense was just added on the same page `page.goto('/expenses')` redirected to.) Leave the `cashflow hydration` describe block in this same file entirely unchanged — its two `page.goto('/cashflow')` calls deliberately rely on a full server round-trip to test SSR/hydration consistency, and a redirect-driven navigation still performs that full round-trip, so the test's mechanism is unaffected.

- [ ] **Step 3: Add a redirect-and-anchor regression test to `e2e/dashboard.spec.ts`**

Add:

```ts
test('old page routes redirect to the matching section of the consolidated dashboard', async ({ page }) => {
  const email = `test-redirects-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  await page.goto('/expenses');
  await expect(page).toHaveURL(/\/dashboard#expenses$/);

  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/dashboard#budgets$/);

  await page.goto('/cashflow');
  await expect(page).toHaveURL(/\/dashboard#cashflow$/);
});
```

- [ ] **Step 4: Update `e2e/accessibility.spec.ts`'s page-identity assertions**

None of the `page.goto('/expenses')` / `page.goto('/budgets')` / `page.goto('/cashflow')` calls in this file need to change — each redirects to the equivalent dashboard section and the axe scan runs against whatever actually rendered, same as before. Two specific assertions DO need updating because they check for a heading that was unique to the old single-purpose page and may now collide with a same-named heading elsewhere on the consolidated page:

In the `'dashboard with a saved budget renders progress bars...'` test, the line `const budgetCard = page.getByRole('heading', { name: 'Budget progress' }).locator('..');` still resolves correctly IF Task 1 kept that exact heading text — confirm this by reading the current file state rather than assuming; if the heading text changed, update this line's string to match.

In the `'budgets page has no WCAG 2.1 A/AA violations'` test, after `await page.goto('/budgets')`, add a wait for the section to actually be in view before scanning (axe can scan correctly even off-screen, so this is for test clarity/stability, not correctness): `await page.waitForSelector('#budgets');`.

- [ ] **Step 5: Run the full Playwright suite**

Run: `npm run test:e2e`
Expected: every test passes, including the new redirect test.

- [ ] **Step 6: Whole-feature live verification (do not skip — the prior two plans on this project both found real bugs here, including once a blocking regression)**

Using a real browser or a scripted temporary Playwright check against a real running dev server, walk through, in order, and report the actual outcome of each:

1. Sign up fresh. Confirm the consolidated dashboard renders every section: hero, stats, Coach, Spending Breakdown, charts, Budget progress, Manage budgets, Expenses, Cash Flow — nothing from any of the four original pages is missing.
2. Click each of the four `Header` nav links in turn. Confirm each one scrolls to the right section and that section's link highlights while it's the most visible one on screen.
3. Visit `/expenses`, `/budgets`, `/cashflow` directly (typed URL, not an in-app click) while logged in. Confirm each redirects to the matching `/dashboard#section` and the browser is actually scrolled to that section on load (not just the URL hash being present with no visible scroll).
4. Visit the same three URLs while logged out. Confirm `middleware.ts` still sends you to `/login` first.
5. Add an expense via the Expenses cell, apply a category filter, confirm the URL and the filtered list are both correct and you're still on the one page.
6. Add an income source and a bill via the Cash Flow cell, confirm the projection list/chart updates.
7. Set a budget limit via the Manage Budgets cell, reload the page, confirm the separate Budget Progress cell reflects it.
8. Resize to a mobile viewport width and confirm every section still renders, stacked, in the spec's order, with no horizontal scroll and no clipped content.
9. Run `npx playwright test e2e/accessibility.spec.ts` one more time at this final state and confirm zero violations across every test in the file.

Report the actual outcome of each numbered step — including anything that didn't work as expected — rather than a blanket "verified" claim. If any step reveals a real bug, fix it, add a regression test if appropriate, and re-verify before reporting done.

- [ ] **Step 7: Commit and push**

```bash
git add e2e/dashboard.spec.ts e2e/accessibility.spec.ts
git commit -m "test: retarget e2e specs for the consolidated dashboard, add redirect regression coverage"
git push
```
