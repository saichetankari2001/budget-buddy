# Budget Buddy — WCAG 2.1 AA Accessibility Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every page to zero WCAG 2.1 A/AA violations (per `@axe-core/playwright`), lock that in as a permanent Playwright test suite, and wire it into CI so a future regression fails the build.

**Architecture:** One new Playwright spec (`e2e/accessibility.spec.ts`) scans six page/states with `AxeBuilder`. Each of the real violations it finds (already run once during planning — see Global Constraints) gets its own fix task. A final task wires `test:e2e` into CI.

**Tech Stack:** `@axe-core/playwright` (new dev dependency, free/open-source), `@playwright/test` (existing), Next.js 14 + TypeScript (existing).

## Global Constraints

- **The exact violations below were captured by actually running `@axe-core/playwright` against this app during planning — this is not a guessed list.** Every fix in this plan has already been applied once, verified to bring the relevant violation(s) to zero via a live re-scan, verified against the full Vitest suite (133/133, no regressions), and then reverted so the work could go through the normal task-by-task build. Implementers should expect their fix to work exactly as specified.
  - `color-contrast` (serious) on `.text-primary` text (`#6366F1` on `#FFFFFF`, ratio 4.46, needs 4.5): the "Log in"/"Sign up" auth-page links, and the Header nav's active-link styling. Fix: use `text-primary-hover` (already defined in `tailwind.config.ts` as `#4F46E5`, currently unused — verified to give a ratio of ~6.3, comfortably passing) instead of `text-primary` for these specific text usages.
  - `label`/`select-name` (critical) in `ExpenseFilters.tsx`: the category `<select>` and the two `<input type="date">` filters have no accessible name at all (no wrapping/associated `<label>`, no `aria-label`). Fix: add `aria-label` to each (a visible `<label>` would change the compact filter-bar's layout — `aria-label` is the appropriate fix here, matching how icon-only buttons elsewhere in this app already use `aria-label`/`label` props rather than visible text).
  - `list` (serious) in `ExpensesClient.tsx`: the empty-state message (`<p>No expenses match these filters.</p>`) is rendered as a direct child of the `<ul>`, alongside `<li>` elements — invalid, since a `<ul>` may only directly contain `<li>`, `<script>`, or `<template>`.
  - `color-contrast` (serious) on that same empty-state `<p>` (`text-muted` `#64748B` on the page's `background` `#F5F3FF`, ratio 4.33, needs 4.5): this only fails because the paragraph sits directly on the page background — the identical color combination passes (4.76:1) against the white `Card` background used everywhere else in this app for similar empty-state messages (`BudgetProgress.tsx`'s "No budgets set yet.", `CategoryPieChart.tsx`'s "No expenses yet this month."). Fix: wrap the empty-state message in a `<Card>`, matching that existing pattern — this single change fixes both the list-nesting and the contrast violation together, since it moves the paragraph both outside the `<ul>` and onto a passing background.
- `test:e2e` is not currently run in CI (only `npm test`, the Vitest suite, is) — this plan adds it.
- No visual redesign beyond what's needed to fix the violations above — no other styling changes.

---

## File Structure

```
budget-buddy/
├── package.json                                   # MODIFY: add @axe-core/playwright devDependency
├── e2e/
│   └── accessibility.spec.ts                       # CREATE
├── components/
│   ├── ui/
│   │   └── Header.tsx                               # MODIFY: active nav-link color
│   └── expenses/
│       └── ExpenseFilters.tsx                       # MODIFY: aria-labels
├── app/
│   ├── signup/
│   │   └── page.tsx                                  # MODIFY: link color
│   ├── login/
│   │   └── page.tsx                                  # MODIFY: link color
│   └── expenses/
│       └── ExpensesClient.tsx                        # MODIFY: empty-state markup
└── .github/
    └── workflows/
        └── ci.yml                                     # MODIFY: add Playwright + e2e step
```

---

### Task 1: Accessibility Test Suite (Initially Failing)

**Files:**
- Modify: `package.json` (add `@axe-core/playwright`)
- Create: `e2e/accessibility.spec.ts`

**Interfaces:**
- Produces: `e2e/accessibility.spec.ts` — six Playwright tests, one per page/state, each asserting zero `AxeBuilder` violations. Consumed by every later task in this plan (each fix task re-runs the relevant subset of these tests to confirm its fix worked) and by Task 6 (final verification, all six green together).

- [ ] **Step 1: Add the dependency**

```bash
npm install --save-dev @axe-core/playwright
```

- [ ] **Step 2: Create `e2e/accessibility.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function signUp(page: import('@playwright/test').Page, emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('longenough123');
  await page.getByRole('button', { name: /sign up/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test('signup page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/signup');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('login page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-dashboard');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('expenses page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-expenses');
  await page.goto('/expenses');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('expenses page with the add-expense form open has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-expenses-form');
  await page.goto('/expenses');
  await page.getByRole('button', { name: /add expense/i }).click();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('budgets page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-budgets');
  await page.goto('/budgets');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 3: Run the suite to confirm it fails exactly as expected**

```bash
npm run dev &
sleep 4
npx playwright test e2e/accessibility.spec.ts --reporter=list
kill %1
```

Expected: 4 of the 6 tests FAIL (signup, login, dashboard, expenses, expenses-with-form, budgets — every page except none, since every page currently has at least the nav/link contrast issue). Specifically: `signup`, `login`, `dashboard`, `budgets` fail with exactly one `color-contrast` violation each (the `.text-primary` issue); `expenses` and `expenses page with the add-expense form open` fail with four violations each (`color-contrast` ×2, `label`, `list`, `select-name` — matching the Global Constraints list above). This confirms the test suite correctly detects the real, already-identified issues before any fix is applied.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json e2e/accessibility.spec.ts
git commit -m "test: add WCAG 2.1 A/AA accessibility test suite (failing, documents real violations)"
```

---

### Task 2: Fix Color Contrast on Primary-Colored Text Links

**Files:**
- Modify: `components/ui/Header.tsx`
- Modify: `app/signup/page.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `e2e/accessibility.spec.ts` (Task 1).

- [ ] **Step 1: Modify `components/ui/Header.tsx`**

Change this line (the active nav-link ternary):
```tsx
                pathname === link.href ? 'text-primary' : 'text-muted hover:text-foreground'
```
to:
```tsx
                pathname === link.href ? 'text-primary-hover' : 'text-muted hover:text-foreground'
```
Nothing else in this file changes.

- [ ] **Step 2: Modify `app/signup/page.tsx`**

Change this line:
```tsx
          <a href="/login" className="text-primary underline">
```
to:
```tsx
          <a href="/login" className="text-primary-hover underline">
```
Nothing else in this file changes.

- [ ] **Step 3: Modify `app/login/page.tsx`**

Change this line:
```tsx
          <a href="/signup" className="text-primary underline">
```
to:
```tsx
          <a href="/signup" className="text-primary-hover underline">
```
Nothing else in this file changes.

**Rationale:** `tailwind.config.ts` already defines `primary: { DEFAULT: '#6366F1', hover: '#4F46E5' }`, which means Tailwind auto-generates both `text-primary` and `text-primary-hover` utility classes — no config change is needed. `text-primary-hover` is currently unused anywhere in the codebase (confirmed by grep during planning), so repurposing it here as a static (non-`:hover`) accessible text color doesn't conflict with any existing `:hover` styling. The name is slightly misleading for this static usage, but it's the same brand color, just a shade darker, and introducing a whole new color token for one contrast fix would be more than this fix needs.

- [ ] **Step 4: Run the relevant subset of the accessibility suite to confirm these three pages now pass**

```bash
npm run dev &
sleep 4
npx playwright test e2e/accessibility.spec.ts -g "signup page|login page|dashboard has" --reporter=list
kill %1
```

Expected: all 3 tests PASS now (signup, login, dashboard — the only violation on each was this exact contrast issue).

- [ ] **Step 5: Run the full Vitest suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (unchanged — this task touches no code that has unit tests).

- [ ] **Step 6: Commit**

```bash
git add components/ui/Header.tsx app/signup/page.tsx app/login/page.tsx
git commit -m "fix: use accessible-contrast color for primary-colored text links"
```

---

### Task 3: Add Accessible Names to Expense Filter Controls

**Files:**
- Modify: `components/expenses/ExpenseFilters.tsx`

**Interfaces:**
- Consumes: `e2e/accessibility.spec.ts` (Task 1).

- [ ] **Step 1: Modify `components/expenses/ExpenseFilters.tsx`**

Add `aria-label` to the category `<select>` and both date `<input>`s (three attributes added, nothing else changes):

```tsx
      <select
        aria-label="Filter by category"
        value={searchParams.get('categoryId') ?? ''}
        onChange={(e) => updateFilter('categoryId', e.target.value)}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label="From date"
        value={searchParams.get('from') ?? ''}
        onChange={(e) => updateFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <input
        type="date"
        aria-label="To date"
        value={searchParams.get('to') ?? ''}
        onChange={(e) => updateFilter('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      />
```

- [ ] **Step 2: Run the full Vitest suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (this component has no dedicated test file, matching this app's convention for presentational components).

- [ ] **Step 3: Commit**

```bash
git add components/expenses/ExpenseFilters.tsx
git commit -m "fix: add accessible names to expense filter controls"
```

(The `expenses`/`expenses-with-form` accessibility tests will still fail after this task — they also need Task 4's fix. Both are verified together at the end of Task 4.)

---

### Task 4: Fix Expense List Empty-State Markup

**Files:**
- Modify: `app/expenses/ExpensesClient.tsx`

**Interfaces:**
- Consumes: `e2e/accessibility.spec.ts` (Task 1), `Card` (`components/ui/Card.tsx`, existing).

- [ ] **Step 1: Modify `app/expenses/ExpensesClient.tsx`**

The `.map()` call between the `<ul>` opening tag and the empty-state line is long (it renders both the inline-edit form and the normal row for each expense) and stays completely unchanged — leave every line of it exactly as it is. Only two edits are needed:

1. Immediately before the line `<ul className="flex flex-col gap-2">`, insert:
```tsx
      {expenses.length === 0 && (
        <Card>
          <p className="text-sm text-muted">No expenses match these filters.</p>
        </Card>
      )}

```
2. Delete this line, which currently sits as the last line inside the `<ul>...</ul>`, immediately after the closing `)}` of the `.map()` call and before the `</ul>` tag:
```tsx
        {expenses.length === 0 && <p className="text-sm text-muted">No expenses match these filters.</p>}
```

`Card` is already imported in this file (used elsewhere for the add-expense form and each expense row) — no new import needed. Everything else in the file, including the `.map()` logic, stays exactly as-is.

**Rationale:** this fixes two violations from the same root cause. The `<ul>` no longer has any non-`<li>` direct child (fixing the `list` violation), and the message now renders on a white `Card` background instead of the page's lavender background, which passes the same `text-muted` contrast check that already passes for the identical empty-state pattern used in `BudgetProgress.tsx` ("No budgets set yet.") and `CategoryPieChart.tsx` ("No expenses yet this month.") — both already `Card`-wrapped, which is why axe never flagged them.

- [ ] **Step 2: Run the full accessibility suite to confirm all 6 tests now pass**

```bash
npm run dev &
sleep 4
npx playwright test e2e/accessibility.spec.ts --reporter=list
kill %1
```

Expected: all 6 tests PASS.

- [ ] **Step 3: Run the full Vitest suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing.

- [ ] **Step 4: Commit**

```bash
git add app/expenses/ExpensesClient.tsx
git commit -m "fix: move expense list empty-state message out of the ul into a Card"
```

---

### Task 5: Wire End-to-End Tests Into CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `e2e/accessibility.spec.ts` (Task 1), `e2e/dashboard.spec.ts` (existing) — both now run in CI via this task.

- [ ] **Step 1: Modify `.github/workflows/ci.yml`**

Add two new steps after the existing `npm test` step (everything above stays unchanged):

```yaml
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

The full file after this change:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      JWT_SECRET: ${{ secrets.JWT_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run prisma:generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

**Rationale:** `test:e2e` (Playwright, including both the existing `e2e/dashboard.spec.ts` and this plan's new `e2e/accessibility.spec.ts`) was never run in CI before this — only the Vitest unit suite was. `playwright.config.ts`'s `webServer` block already handles starting `npm run dev` and waiting for it to be ready, so no extra server-startup step is needed in the workflow itself. This does mean every CI run signs up a couple of throwaway users against the real Neon database (`DATABASE_URL` is already a configured CI secret) — an accepted, known trade-off for genuine end-to-end testing at this project's free-tier scale, per the design spec.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run Playwright end-to-end tests, including the accessibility suite"
```

- [ ] **Step 3: Push and confirm the workflow runs successfully on GitHub**

```bash
git push origin main
```

After pushing, check the Actions tab (or `gh run watch` if the `gh` CLI is available) to confirm the new `test:e2e` step passes in the real CI environment, not just locally — CI's environment (fresh checkout, `npm ci`, GitHub-hosted runner) can behave differently from a local dev machine.

---

### Task 6: Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full Vitest suite**

```bash
npx vitest run
```

Expected: 133/133 passing.

- [ ] **Step 2: Run the full Playwright suite (both existing and new specs)**

```bash
npm run dev &
sleep 4
npx playwright test --reporter=list
kill %1
```

Expected: all tests pass, including the pre-existing `e2e/dashboard.spec.ts` test and all 6 new `e2e/accessibility.spec.ts` tests.

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either. This project treats a clean `tsc --noEmit` as a hard, non-negotiable gate.

- [ ] **Step 4: Confirm the CI workflow is green on GitHub**

```bash
git log --oneline -1
git log origin/main --oneline -1
```

Confirm both match (everything already pushed by Task 5), then check that the most recent GitHub Actions run for this commit succeeded, including its new `test:e2e` step.

- [ ] **Step 5: Push**

```bash
git push origin main
```

(Likely a no-op if Task 5 already pushed everything — this step exists to confirm the final state is on `origin/main`, not to imply new changes are expected.)

---

## End of WCAG 2.1 AA Accessibility Audit

At this point: every page in the app passes an automated WCAG 2.1 A/AA scan with zero violations, and that scan runs on every future push via CI — so a future change that reintroduces a contrast issue, an unlabeled form control, or invalid list markup will fail the build the same way a broken feature test would. Privacy Act 1988 notes are next and last in the Australian-standards scope, as their own spec → plan → build cycle.
