# Financial Health Score & Smarter Anomaly Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Budget Buddy a single explainable 0-100 financial health score (with a cycle-over-cycle trend) and a second, baseline-aware anomaly check that flags an unusually large single purchase the moment it happens — both computed from data the app already stores, with zero schema changes.

**Architecture:** Two independent pure-function subsystems layered onto existing infrastructure: `computeHealthScore` (a deterministic function over `Expense`/`Bill`/`CycleCategoryBudget`/`MoneyCycle` rows, callable for any cycle past or present) feeds a new dashboard stat cell and extra Coach-prompt context; `checkExpenseAnomalyAndNotify` is a new sibling to the existing `checkCategoryThresholdAndNotify`, triggered from the exact same two call sites, reusing the existing push-notification pipeline.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres (no migration needed), Vitest, Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-10-05-financial-health-score-and-anomaly-detection-design.md`

## Global Constraints

- Zero Prisma schema changes, zero migrations. Both features are pure functions over existing `Expense`/`Bill`/`CycleCategoryBudget`/`MoneyCycle` rows.
- Health score formula, exact: `budgetAdherence` 0-40 pts (average of per-tracked-category `max(0, min(1, 1 - actual/recommended))`, including the "Other" row; zero recommended or zero spend contributes full 1.0) + `pacing` 0-30 pts (`ON_TRACK` = 30; `OVER_PACE` = `30 * (plannedRatePerDay/actualRatePerDay)` clamped `[0,30]`) + `billPunctuality` 0-30 pts (`30 * onTimeCount/dueCount`; zero bills due = full 30). Total = `round(sum)`, range 0-100.
- The score must be computable for ANY cycle (active or a past completed/cancelled one) from the same function — no new history table. The trend delta compares the active cycle's live score against the most recently completed/cancelled prior cycle's score (same function, called with that cycle's own data).
- Anomaly detection fires from the same two call sites as the existing threshold check (`POST /api/expenses`, `logExpense`), needs ≥3 prior expenses in that category (last 10, excluding the new one) before it can fire at all, fires at `newAmount >= 2.5 * average(priors)`, is fire-and-forget (never throws into its caller), and has no dedupe field — it only ever concerns the one expense that triggered it, and can fire alongside the existing threshold notification.
- Out of scope: net worth/investment/debt tracking, the rolling-forecast window in `projectCycle.ts`, any change to the existing 80%/100% threshold check's own behavior, any UI change beyond the one new stat cell.
- TDD throughout: failing test first for every new function, then minimal implementation, then green. Push to GitHub after each task (standing project convention — work happens directly on `main`, no worktree/feature branch; **never pass `isolation: "worktree"`** to any Agent-tool dispatch on this repo).
- Independent verification is mandatory, not optional: re-check every subagent's diff and re-run tests yourself before trusting a task done. Past sessions on this exact project found real bugs (a stale e2e fixture, a cross-component wiring gap, hydration issues) that automated suites alone missed. Apply extra scrutiny to the health-score formula's edge cases (zero categories, zero bills, no prior cycle) and to a live check of the anomaly threshold against realistic data — use the existing throwaway test account `nalinijarugula@gmail.com` for any live check, never the user's real `karisaichetan@gmail.com` account.

---

### Task 1: Continuous pacing rates in `lib/utils/moneyCycle.ts`

**Files:**
- Modify: `lib/utils/moneyCycle.ts` (add `computePacingRates`, refactor `computePacingStatus` to use it)
- Test: `lib/utils/moneyCycle.test.ts`

**Interfaces:**
- Produces: `computePacingRates(input: { startingAmount: number; spentSoFar: number; daysElapsed: number; totalDays: number }): { plannedRatePerDay: number; actualRatePerDay: number; status: 'ON_TRACK' | 'OVER_PACE' }` — Task 2 depends on this for the continuous pacing-score component.
- `computePacingStatus`'s existing signature and behavior are unchanged (it becomes a thin wrapper returning `.status`), so every existing caller/test keeps passing untouched.

- [ ] **Step 1: Write the failing test**

Add to `lib/utils/moneyCycle.test.ts`, after the existing `describe('computePacingStatus', ...)` block:

```ts
describe('computePacingRates', () => {
  it('returns the planned and actual per-day rates alongside the status', () => {
    const result = computePacingRates({ startingAmount: 500, spentSoFar: 150, daysElapsed: 2, totalDays: 10 });
    expect(result.plannedRatePerDay).toBe(50);
    expect(result.actualRatePerDay).toBe(75);
    expect(result.status).toBe('OVER_PACE');
  });

  it('reports ON_TRACK with matching rates when spend is exactly at the planned pace', () => {
    const result = computePacingRates({ startingAmount: 500, spentSoFar: 100, daysElapsed: 2, totalDays: 10 });
    expect(result.plannedRatePerDay).toBe(50);
    expect(result.actualRatePerDay).toBe(50);
    expect(result.status).toBe('ON_TRACK');
  });

  it('treats daysElapsed of 0 as day 1 to avoid divide-by-zero on the cycle-start day', () => {
    const result = computePacingRates({ startingAmount: 500, spentSoFar: 10, daysElapsed: 0, totalDays: 10 });
    expect(result.actualRatePerDay).toBe(10);
    expect(result.status).toBe('ON_TRACK');
  });
});
```

Also add this import to the top of the same test file's existing import block from `./moneyCycle`: `computePacingRates`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/utils/moneyCycle.test.ts`
Expected: FAIL — `computePacingRates` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `lib/utils/moneyCycle.ts`, replace the existing `computePacingStatus` function with:

```ts
export function computePacingRates(input: {
  startingAmount: number;
  spentSoFar: number;
  daysElapsed: number;
  totalDays: number;
}): { plannedRatePerDay: number; actualRatePerDay: number; status: 'ON_TRACK' | 'OVER_PACE' } {
  const plannedRatePerDay = input.startingAmount / input.totalDays;
  const effectiveDaysElapsed = Math.max(input.daysElapsed, 1);
  const actualRatePerDay = input.spentSoFar / effectiveDaysElapsed;
  const status = actualRatePerDay > plannedRatePerDay ? 'OVER_PACE' : 'ON_TRACK';
  return { plannedRatePerDay, actualRatePerDay, status };
}

export function computePacingStatus(input: {
  startingAmount: number;
  spentSoFar: number;
  daysElapsed: number;
  totalDays: number;
}): 'ON_TRACK' | 'OVER_PACE' {
  return computePacingRates(input).status;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/utils/moneyCycle.test.ts`
Expected: PASS, including every pre-existing `computePacingStatus` test (unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/moneyCycle.ts lib/utils/moneyCycle.test.ts
git commit -m "feat: add computePacingRates for continuous pacing values

computePacingStatus becomes a thin wrapper over it — same behavior, same
tests — so the health score's pacing component can use the real rates
instead of just the ON_TRACK/OVER_PACE enum."
git push
```

---

### Task 2: Pure health-score calculation — `lib/health/computeHealthScore.ts`

**Files:**
- Create: `lib/health/computeHealthScore.ts`
- Test: `lib/health/computeHealthScore.test.ts`

**Interfaces:**
- Consumes: `computeCategoryTotalsForWindow` (`lib/moneyCycle/categoryTotals.ts`), `computePacingRates`, `startOfSydneyDay`, `computeDaysRemaining` (all from `lib/utils/moneyCycle.ts`), `prisma` (`lib/prisma`).
- Produces:
  ```ts
  export interface HealthScoreResult {
    total: number;
    budgetAdherence: { points: number; worstCategoryName?: string };
    pacing: { points: number; status: 'ON_TRACK' | 'OVER_PACE' };
    billPunctuality: { points: number; lateBillName?: string };
  }
  export function computeHealthScore(
    userId: string,
    cycle: {
      id: string;
      startDate: Date;
      endDate: Date;
      createdAt: Date;
      status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      startingAmount: number;
    },
    now: Date
  ): Promise<HealthScoreResult>
  ```
  Tasks 5 and 7 call this directly; both also independently look up a prior cycle (via `prisma.moneyCycle.findFirst({ where: { userId, status: { in: ['COMPLETED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' } })`) and call this same function again with that cycle's own row — there is no separate "trend" function, callers compute both scores and subtract.

- [ ] **Step 1: Write the failing test**

Create `lib/health/computeHealthScore.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { computeHealthScore } from './computeHealthScore';

const activeCycle = {
  id: 'cycle_1',
  startDate: new Date('2026-09-10T00:00:00.000Z'),
  endDate: new Date('2026-09-20T00:00:00.000Z'),
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  status: 'ACTIVE' as const,
  startingAmount: 500,
};

const now = new Date('2026-09-12T00:00:00.000Z'); // 2 days elapsed, 10 total

function mockNoBills() {
  prismaMock.bill.findMany.mockResolvedValue([]);
}

describe('computeHealthScore', () => {
  it('gives full budgetAdherence marks when no categories are tracked yet', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    const result = await computeHealthScore('user_1', activeCycle, now);

    expect(result.budgetAdherence).toEqual({ points: 40 });
  });

  it('gives full marks for a category with zero spend, and docks points for one over its recommended amount', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([
      { id: 'ccb_1', cycleId: 'cycle_1', categoryId: 'cat_food', categoryName: 'Food', categoryColor: '#f97316', recommendedAmount: { toString: () => '100.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date() },
      { id: 'ccb_2', cycleId: 'cycle_1', categoryId: 'cat_fuel', categoryName: 'Fuel', categoryColor: '#22d3ee', recommendedAmount: { toString: () => '50.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date() },
    ] as never);
    // Food: $0 spent (full marks). Fuel: $100 spent against a $50 budget (over — 0 marks, clamped).
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_fuel', amount: { toString: () => '100.00' } as never },
    ] as never);
    mockNoBills();

    const result = await computeHealthScore('user_1', activeCycle, now);

    // Food contributes 1.0, Fuel contributes 0 (clamped) -> average 0.5 -> 0.5 * 40 = 20
    expect(result.budgetAdherence.points).toBe(20);
    expect(result.budgetAdherence.worstCategoryName).toBe('Fuel');
  });

  it('awards full pacing marks when on track, and partial marks when over pace', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    mockNoBills();
    // $500 over 10 days = $50/day planned. Spent $150 in 2 days = $75/day actual -> over pace.
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '150.00' } as never },
    ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    // 30 * (50/75) = 20
    expect(result.pacing.status).toBe('OVER_PACE');
    expect(result.pacing.points).toBe(20);
  });

  it('gives full billPunctuality marks when nothing has been due yet this cycle', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800.00' } as never, dueDate: new Date('2026-09-30T00:00:00.000Z'), recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date() },
    ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    expect(result.billPunctuality).toEqual({ points: 30 });
  });

  it('docks billPunctuality points for a bill overdue and unpaid within the cycle window', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Phone', amount: { toString: () => '30.00' } as never, dueDate: new Date('2026-09-11T00:00:00.000Z'), recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date() },
    ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    // 1 bill due, 0 paid on time -> 30 * 0/1 = 0
    expect(result.billPunctuality.points).toBe(0);
    expect(result.billPunctuality.lateBillName).toBe('Phone');
  });

  it('awards full billPunctuality marks for a bill paid on the same day it was due', async () => {
    const paidDate = new Date('2026-09-11T00:00:00.000Z');
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Phone', amount: { toString: () => '30.00' } as never, dueDate: new Date('2026-09-18T00:00:00.000Z'), recurrenceInterval: null, categoryId: null, paidExpenseId: 'exp_paid', createdAt: new Date() },
    ] as never);
    prismaMock.expense.findMany
      // First call is the budget-adherence/spend query inside computeCategoryTotalsForWindow —
      // second call (below, via mockResolvedValueOnce chained after the first mockResolvedValue)
      // is computeHealthScore's own lookup of the paid bill's Expense row.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'exp_paid', date: paidDate, createdAt: paidDate, amount: { toString: () => '30.00' } as never, categoryId: 'cat_bills' },
      ] as never);

    const result = await computeHealthScore('user_1', activeCycle, now);

    expect(result.billPunctuality).toEqual({ points: 30 });
  });

  it('rounds the total to the nearest integer across all three components', async () => {
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    const result = await computeHealthScore('user_1', activeCycle, now);

    // No spend at all: budgetAdherence 40 (no tracked categories), pacing 30 (ON_TRACK, $0 spent),
    // billPunctuality 30 (nothing due) -> 100.
    expect(result.total).toBe(100);
  });

  it('uses the cycle end date (not "now") as the pacing/window boundary for a completed past cycle', async () => {
    const pastCycle = {
      id: 'cycle_old',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-11T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      status: 'COMPLETED' as const,
      startingAmount: 500,
    };
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    mockNoBills();

    // "now" is long after the cycle ended — must not affect its pacing calculation.
    const result = await computeHealthScore('user_1', pastCycle, new Date('2026-10-05T00:00:00.000Z'));

    expect(result.pacing.status).toBe('ON_TRACK');
    expect(result.pacing.points).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/health/computeHealthScore.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `lib/health/computeHealthScore.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { computeCategoryTotalsForWindow } from '@/lib/moneyCycle/categoryTotals';
import { computePacingRates, startOfSydneyDay, computeDaysRemaining } from '@/lib/utils/moneyCycle';

export interface HealthScoreResult {
  total: number;
  budgetAdherence: { points: number; worstCategoryName?: string };
  pacing: { points: number; status: 'ON_TRACK' | 'OVER_PACE' };
  billPunctuality: { points: number; lateBillName?: string };
}

interface CycleInput {
  id: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startingAmount: number;
}

/**
 * Computable for ANY cycle — active, or a past completed/cancelled one — from the same inputs,
 * which is what lets callers show a "+N since last cycle" trend without a stored history table:
 * they just call this twice (once for the active cycle, once for the most recent completed/
 * cancelled one) and subtract. For a past cycle, `now` is ignored in favor of the cycle's own
 * `endDate` as the window/pacing boundary — a cycle that ended weeks ago shouldn't have its score
 * change depending on when someone happens to look at it.
 */
export async function computeHealthScore(
  userId: string,
  cycle: CycleInput,
  now: Date
): Promise<HealthScoreResult> {
  const isActive = cycle.status === 'ACTIVE';
  const windowEnd = isActive ? now : cycle.endDate;
  const windowStart = startOfSydneyDay(cycle.startDate);

  const trackedRows = await prisma.cycleCategoryBudget.findMany({ where: { cycleId: cycle.id } });
  const trackedCategoryIds = trackedRows
    .map((r) => r.categoryId)
    .filter((id): id is string => id !== null);

  const actuals = await computeCategoryTotalsForWindow(
    userId,
    {
      gte: windowStart,
      ...(isActive ? {} : { lte: windowEnd }),
      createdAtGte: cycle.createdAt,
    },
    trackedCategoryIds
  );

  const budgetAdherence = computeBudgetAdherencePoints(trackedRows, actuals);

  const spentSoFar = actuals.reduce((sum, a) => sum + a.actual, 0);
  const totalDays = computeDaysRemaining(cycle.endDate, cycle.startDate);
  const daysElapsed = isActive ? computeDaysRemaining(now, cycle.startDate) : totalDays;
  const { plannedRatePerDay, actualRatePerDay, status } = computePacingRates({
    startingAmount: cycle.startingAmount,
    spentSoFar,
    daysElapsed,
    totalDays,
  });
  const pacingPoints =
    status === 'ON_TRACK' ? 30 : Math.max(0, Math.min(30, 30 * (plannedRatePerDay / actualRatePerDay)));

  const billPunctuality = await computeBillPunctualityPoints(userId, windowStart, windowEnd, now);

  const total = Math.round(budgetAdherence.points + pacingPoints + billPunctuality.points);

  return {
    total,
    budgetAdherence,
    pacing: { points: Math.round(pacingPoints), status },
    billPunctuality,
  };
}

function computeBudgetAdherencePoints(
  trackedRows: { categoryId: string | null; categoryName: string; recommendedAmount: unknown }[],
  actuals: { categoryId: string | null; actual: number }[]
): { points: number; worstCategoryName?: string } {
  if (trackedRows.length === 0) {
    return { points: 40 };
  }

  let worstFraction = 1;
  let worstCategoryName: string | undefined;
  let sumFraction = 0;

  for (const row of trackedRows) {
    const recommended = Number(row.recommendedAmount);
    const actual = actuals.find((a) => a.categoryId === row.categoryId)?.actual ?? 0;
    const unusedFraction = recommended > 0 ? Math.max(0, Math.min(1, 1 - actual / recommended)) : 1;
    sumFraction += unusedFraction;
    if (unusedFraction < worstFraction) {
      worstFraction = unusedFraction;
      worstCategoryName = row.categoryName;
    }
  }

  const points = 40 * (sumFraction / trackedRows.length);
  // Only surface a "worst category" when something actually dragged the score down — not
  // whichever tracked category happens to be numerically lowest in an otherwise-healthy cycle.
  return { points, worstCategoryName: worstFraction < 1 ? worstCategoryName : undefined };
}

async function computeBillPunctualityPoints(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
  now: Date
): Promise<{ points: number; lateBillName?: string }> {
  const bills = await prisma.bill.findMany({ where: { userId } });

  const paidExpenseIds = bills
    .map((b) => b.paidExpenseId)
    .filter((id): id is string => id !== null);
  const paidExpenses = paidExpenseIds.length
    ? await prisma.expense.findMany({ where: { id: { in: paidExpenseIds } } })
    : [];
  const paidExpenseById = new Map(paidExpenses.map((e) => [e.id, e]));

  let dueCount = 0;
  let onTimeCount = 0;
  let lateBillName: string | undefined;

  for (const bill of bills) {
    const paidExpense = bill.paidExpenseId ? paidExpenseById.get(bill.paidExpenseId) : undefined;

    // Paid, and the payment landed inside this cycle's window: count it, and judge punctuality by
    // comparing when it was actually paid (createdAt) against the due date it was paying for
    // (date) — markBillPaid always stamps the Expense's `date` with the due date, regardless of
    // when the user actually clicked "mark paid", so `createdAt` is the only signal of lateness.
    if (paidExpense && paidExpense.date >= windowStart && paidExpense.date <= windowEnd) {
      dueCount += 1;
      const paidOnTime =
        startOfSydneyDay(paidExpense.createdAt).getTime() <= startOfSydneyDay(paidExpense.date).getTime();
      if (paidOnTime) {
        onTimeCount += 1;
      } else {
        lateBillName = bill.name;
      }
      continue;
    }

    // Not paid (or paid outside this window) — does it have an occurrence overdue right now,
    // inside this cycle's window? That counts as "due and not on time" until it's paid.
    if (bill.dueDate >= windowStart && bill.dueDate <= windowEnd && bill.dueDate.getTime() <= now.getTime()) {
      dueCount += 1;
      lateBillName = bill.name;
    }
  }

  if (dueCount === 0) {
    return { points: 30 };
  }
  return { points: 30 * (onTimeCount / dueCount), lateBillName };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/health/computeHealthScore.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/health/computeHealthScore.ts lib/health/computeHealthScore.test.ts
git commit -m "feat: add computeHealthScore — pure 0-100 financial health score

Three explainable components (budget adherence, pacing, bill punctuality),
computable for any cycle (active or past) from existing data — no schema
change, no stored history table."
git push
```

---

### Task 3: Baseline-aware anomaly detection — `lib/moneyCycle/expenseAnomalyNotifications.ts`

**Files:**
- Create: `lib/moneyCycle/expenseAnomalyNotifications.ts`
- Test: `lib/moneyCycle/expenseAnomalyNotifications.test.ts`

**Interfaces:**
- Consumes: `prisma`, `sendPushNotification` (`lib/push/send.ts`), `formatCurrency` (`lib/utils/currency.ts`) — same imports `categoryThresholdNotifications.ts` already uses.
- Produces: `checkExpenseAnomalyAndNotify(userId: string, categoryId: string, newExpense: { id: string; amount: number; description: string }): Promise<void>` — Task 4 calls this from both existing call sites, alongside (not instead of) `checkCategoryThresholdAndNotify`.

- [ ] **Step 1: Write the failing test**

Create `lib/moneyCycle/expenseAnomalyNotifications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/push/send', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { sendPushNotification } from '@/lib/push/send';
import { checkExpenseAnomalyAndNotify } from './expenseAnomalyNotifications';

const foodCategory = { id: 'cat_food', userId: 'user_1', name: 'Food', color: '#f97316', isGstFree: false, createdAt: new Date() };

function priorExpenses(amounts: number[]) {
  return amounts.map((amount, i) => ({
    id: `exp_prior_${i}`,
    categoryId: 'cat_food',
    amount: { toString: () => amount.toFixed(2) } as never,
  }));
}

describe('checkExpenseAnomalyAndNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.category.findFirst.mockResolvedValue(foodCategory as never);
  });

  it('does nothing with fewer than 3 prior expenses in the category', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25]) as never);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 200, description: 'Dinner' });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('does not fire for a normal-sized expense close to the baseline', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never); // avg 25
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 30, description: 'Groceries' });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('fires with the baseline and category in the message when the new expense is >= 2.5x the average', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never); // avg 25, threshold 62.50
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' });

    expect(sendPushNotification).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(sendPushNotification).mock.calls[0];
    expect(payload.body).toContain('Fancy dinner');
    expect(payload.body).toContain('Food');
    expect(payload.body).toContain('$85.00');
    expect(payload.body).toContain('$25.00');
  });

  it('excludes the new expense itself from the prior-expenses query', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' });

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'exp_new' } }) })
    );
  });

  it('never throws, even if sendPushNotification itself rejects', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);
    vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('push service down'));

    await expect(
      checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' })
    ).resolves.toBeUndefined();
  });

  it('never throws if the category lookup itself fails', async () => {
    prismaMock.category.findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/moneyCycle/expenseAnomalyNotifications.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `lib/moneyCycle/expenseAnomalyNotifications.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push/send';
import { formatCurrency } from '@/lib/utils/currency';

const MIN_PRIOR_EXPENSES = 3;
const ANOMALY_MULTIPLIER = 2.5;
const PRIOR_EXPENSES_WINDOW = 10;

/**
 * A second, independent signal from checkCategoryThresholdAndNotify: that one compares against a
 * fixed budget, so it's blind to a single large purchase early in a cycle when the category is
 * nowhere near its budget yet. This compares a new expense against the user's own recent average
 * in that category instead, catching the purchase itself, not just the category running hot.
 * Fire-and-forget, matching that sibling function's exact contract: never throws into its caller.
 */
export async function checkExpenseAnomalyAndNotify(
  userId: string,
  categoryId: string,
  newExpense: { id: string; amount: number; description: string }
): Promise<void> {
  try {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) return;

    const priorExpenses = await prisma.expense.findMany({
      where: { userId, categoryId, id: { not: newExpense.id } },
      orderBy: { date: 'desc' },
      take: PRIOR_EXPENSES_WINDOW,
    });
    if (priorExpenses.length < MIN_PRIOR_EXPENSES) return;

    const baseline = priorExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / priorExpenses.length;
    if (baseline <= 0 || newExpense.amount < ANOMALY_MULTIPLIER * baseline) return;

    const message =
      `This ${formatCurrency(newExpense.amount)} ${newExpense.description} is well above your usual ` +
      `${formatCurrency(baseline)} ${category.name} spend.`;

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, { title: 'Budget Buddy', body: message });
      } catch (pushError) {
        console.error(`Failed to send anomaly push for subscription ${subscription.id}:`, pushError);
      }
    }
  } catch (error) {
    console.error(`Failed to check expense anomaly for user ${userId}:`, error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/moneyCycle/expenseAnomalyNotifications.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/moneyCycle/expenseAnomalyNotifications.ts lib/moneyCycle/expenseAnomalyNotifications.test.ts
git commit -m "feat: add baseline-aware expense anomaly detection

Flags a single purchase >=2.5x the user's own recent average in that
category, independent of how much of the category's budget remains —
complements the existing fixed-budget threshold check, doesn't replace it."
git push
```

---

### Task 4: Wire anomaly detection into both expense-creation call sites

**Files:**
- Modify: `app/api/expenses/route.ts:72` (after the existing `checkCategoryThresholdAndNotify` call)
- Modify: `lib/expenses/actions.ts:48` (after the existing `checkCategoryThresholdAndNotify` call)
- Test: `app/api/expenses/route.test.ts`
- Test: `lib/expenses/actions.test.ts`

**Interfaces:**
- Consumes: `checkExpenseAnomalyAndNotify` from Task 3.

- [ ] **Step 1: Write the failing tests**

In `app/api/expenses/route.test.ts`, add the mock and a new test. First, add near the top (alongside any existing `vi.mock` calls for this file — check the file's current top for where these belong):

```ts
vi.mock('@/lib/moneyCycle/categoryThresholdNotifications', () => ({ checkCategoryThresholdAndNotify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/moneyCycle/expenseAnomalyNotifications', () => ({ checkExpenseAnomalyAndNotify: vi.fn().mockResolvedValue(undefined) }));
```

Then add this test inside the `describe('POST /api/expenses', ...)` or equivalent block (match whatever the file's existing POST describe block is actually named):

```ts
it('calls checkExpenseAnomalyAndNotify with the new expense after creating it', async () => {
  const { checkExpenseAnomalyAndNotify } = await import('@/lib/moneyCycle/expenseAnomalyNotifications');
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.category.findFirst.mockResolvedValue({ id: 'cat_1', userId: 'user_1' } as never);
  prismaMock.expense.create.mockResolvedValue({
    id: 'exp_1', amount: { toString: () => '20.00' } as never, description: 'Groceries', categoryId: 'cat_1', date: new Date(),
  } as never);

  await POST(
    new NextRequest('http://localhost/api/expenses', {
      method: 'POST',
      body: JSON.stringify({ amount: 20, description: 'Groceries', categoryId: 'cat_1', date: '2026-09-15' }),
    })
  );

  expect(checkExpenseAnomalyAndNotify).toHaveBeenCalledWith('user_1', 'cat_1', {
    id: 'exp_1',
    amount: 20,
    description: 'Groceries',
  });
});
```

If the file already mocks `getCurrentUser`/`prisma` differently (check its actual current imports/mocks before adding), adapt the mock setup to match the file's existing convention rather than introducing a second one.

In `lib/expenses/actions.test.ts`, add after the existing `vi.mock('@/lib/moneyCycle/categoryThresholdNotifications', ...)` line:

```ts
vi.mock('@/lib/moneyCycle/expenseAnomalyNotifications', () => ({
  checkExpenseAnomalyAndNotify: vi.fn().mockResolvedValue(undefined),
}));
```

Then add this test inside `describe('logExpense', ...)`:

```ts
it('calls checkExpenseAnomalyAndNotify with the new expense after creating it', async () => {
  const { checkExpenseAnomalyAndNotify } = await import('@/lib/moneyCycle/expenseAnomalyNotifications');
  prismaMock.category.findMany.mockResolvedValue(categories as never);
  prismaMock.expense.create.mockResolvedValue({ id: 'exp_1' } as never);

  await logExpense('user_1', { amount: 20, description: 'Groceries', categoryName: 'Food' });

  expect(checkExpenseAnomalyAndNotify).toHaveBeenCalledWith('user_1', 'cat_food', {
    id: 'exp_1',
    amount: 20,
    description: 'Groceries',
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/expenses/route.test.ts lib/expenses/actions.test.ts`
Expected: FAIL — `checkExpenseAnomalyAndNotify` is never called yet.

- [ ] **Step 3: Write minimal implementation**

In `app/api/expenses/route.ts`, add the import alongside the existing one and call it right after the existing threshold check:

```ts
import { checkCategoryThresholdAndNotify } from '@/lib/moneyCycle/categoryThresholdNotifications';
import { checkExpenseAnomalyAndNotify } from '@/lib/moneyCycle/expenseAnomalyNotifications';
```

```ts
    await checkCategoryThresholdAndNotify(user.userId, categoryId);
    await checkExpenseAnomalyAndNotify(user.userId, categoryId, {
      id: expense.id,
      amount: Number(expense.amount),
      description: expense.description,
    });
```

In `lib/expenses/actions.ts`, add the import and call it right after the existing threshold check:

```ts
import { checkCategoryThresholdAndNotify } from '@/lib/moneyCycle/categoryThresholdNotifications';
import { checkExpenseAnomalyAndNotify } from '@/lib/moneyCycle/expenseAnomalyNotifications';
```

```ts
  await checkCategoryThresholdAndNotify(userId, matched.id);
  await checkExpenseAnomalyAndNotify(userId, matched.id, {
    id: expense.id,
    amount: input.amount,
    description: expense.description,
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/expenses/route.test.ts lib/expenses/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/expenses/route.ts lib/expenses/actions.ts app/api/expenses/route.test.ts lib/expenses/actions.test.ts
git commit -m "feat: wire baseline-aware anomaly detection into both expense-creation paths

Fires from the exact same two call sites as the existing budget-threshold
check, so both the web form and the AI chat's log_expense get it for free."
git push
```

---

### Task 5: Expose `healthScore` on `GET /api/cycles/active`

**Files:**
- Modify: `app/api/cycles/active/route.ts`
- Test: `app/api/cycles/active/route.test.ts`

**Interfaces:**
- Consumes: `computeHealthScore` from Task 2.
- Produces: the route's JSON response gains a `healthScore: { total: number; delta: number | null; components: HealthScoreResult['budgetAdherence' | 'pacing' | 'billPunctuality'] }` field — Task 6 (dashboard cell) and Task 7 (Coach prompts for the check-in path) read this same shape. Exact shape: `{ total, delta, budgetAdherence, pacing, billPunctuality }` (flattened, not nested under a `components` key — simpler for both consumers).

- [ ] **Step 1: Write the failing test**

Add to `app/api/cycles/active/route.test.ts`, inside the existing `describe('GET /api/cycles/active', ...)` block, after the "computes remainingAmount..." test:

```ts
it('includes a healthScore with a null delta when there is no prior completed cycle', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.moneyCycle.findFirst
    .mockResolvedValueOnce({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date('2026-09-10T00:00:00.000Z'), messages: [],
    } as never)
    .mockResolvedValueOnce(null); // no prior completed/cancelled cycle
  prismaMock.expense.findMany.mockResolvedValue([]);
  prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.bill.findMany.mockResolvedValue([]);
  prismaMock.incomeSource.findMany.mockResolvedValue([]);
  prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);

  const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

  const json = await res.json();
  expect(json.healthScore.total).toBe(100); // nothing spent, nothing due yet
  expect(json.healthScore.delta).toBeNull();
});

it('includes a healthScore delta against the most recently completed cycle', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  const priorCycle = {
    id: 'cycle_old', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
    startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-11T00:00:00.000Z'),
    status: 'COMPLETED', createdAt: new Date('2026-08-01T00:00:00.000Z'),
  };
  prismaMock.moneyCycle.findFirst
    .mockResolvedValueOnce({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date('2026-09-10T00:00:00.000Z'), messages: [],
    } as never)
    .mockResolvedValueOnce(priorCycle as never);
  prismaMock.expense.findMany.mockResolvedValue([]);
  prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.bill.findMany.mockResolvedValue([]);
  prismaMock.incomeSource.findMany.mockResolvedValue([]);
  prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([]);

  const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

  const json = await res.json();
  // Both cycles score 100 under these empty fixtures -> delta 0, not null.
  expect(json.healthScore.total).toBe(100);
  expect(json.healthScore.delta).toBe(0);
});
```

Note: these two new tests each call `prismaMock.moneyCycle.findFirst` twice (the active-cycle lookup the route already does, then the new prior-cycle lookup) — using `.mockResolvedValueOnce` chains, matching this file's existing convention elsewhere (see the "excludes the just-saved user message" test in `app/api/cycles/chat/route.test.ts` for the same pattern in this codebase).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cycles/active/route.test.ts`
Expected: FAIL — `json.healthScore` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `app/api/cycles/active/route.ts`, add the import:

```ts
import { computeHealthScore } from '@/lib/health/computeHealthScore';
```

Replace the body from `const now = new Date();` through the final `return NextResponse.json({...})` with:

```ts
    const now = new Date();

    if (cycle.endDate.getTime() <= now.getTime()) {
      await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED' } });
      return NextResponse.json(null);
    }

    const { remainingAmount, daysRemaining, safeToSpend, projection } = await projectCycle(
      user.userId,
      { startingAmount: Number(cycle.startingAmount), startDate: cycle.startDate, endDate: cycle.endDate },
      now
    );

    const currentScore = await computeHealthScore(
      user.userId,
      {
        id: cycle.id,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        createdAt: cycle.createdAt,
        status: cycle.status,
        startingAmount: Number(cycle.startingAmount),
      },
      now
    );
    const priorCycle = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
    });
    const priorScore = priorCycle
      ? await computeHealthScore(
          user.userId,
          {
            id: priorCycle.id,
            startDate: priorCycle.startDate,
            endDate: priorCycle.endDate,
            createdAt: priorCycle.createdAt,
            status: priorCycle.status,
            startingAmount: Number(priorCycle.startingAmount),
          },
          priorCycle.endDate
        )
      : null;

    return NextResponse.json({
      id: cycle.id,
      startingAmount: Number(cycle.startingAmount),
      remainingAmount,
      daysRemaining,
      safeToSpend,
      projection,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      messages: cycle.messages.map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt })),
      healthScore: {
        total: currentScore.total,
        delta: priorScore ? currentScore.total - priorScore.total : null,
        budgetAdherence: currentScore.budgetAdherence,
        pacing: currentScore.pacing,
        billPunctuality: currentScore.billPunctuality,
      },
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/cycles/active/route.test.ts`
Expected: PASS, including every pre-existing test in this file (the new fields are additive, no existing assertion checks for the ABSENCE of extra response fields).

- [ ] **Step 5: Commit**

```bash
git add app/api/cycles/active/route.ts app/api/cycles/active/route.test.ts
git commit -m "feat: expose healthScore (with trend delta) on GET /api/cycles/active

No new route — the active cycle's score plus a delta against the most
recently completed/cancelled cycle, both from the same pure function."
git push
```

---

### Task 6: Dashboard health-score stat cell

**Files:**
- Modify: `components/ui/CountUpStat.tsx` (add an optional `format` prop; default unchanged)
- Modify: `components/ui/StatCard.tsx` (thread the new prop through)
- Modify: `app/dashboard/page.tsx` (fetch + render the new cell)
- Test: `components/ui/CountUpStat.test.tsx` (new file — none existed before)
- Test: `components/ui/StatCard.test.tsx` (new file — none existed before)

**Interfaces:**
- Consumes: the `healthScore` field from Task 5's `GET /api/cycles/active` response — but `app/dashboard/page.tsx` is a server component that already fetches the active cycle's data directly via Prisma (not by calling its own API route), so it calls `computeHealthScore` (Task 2) directly, the same way it already assembles other dashboard figures server-side.
- Produces: `CountUpStat`'s and `StatCard`'s prop shapes gain an optional `format?: 'currency' | 'number'` (default `'currency'`) — no existing caller passes this prop, so every existing usage is unaffected.

- [ ] **Step 1: Write the failing tests**

Create `components/ui/CountUpStat.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountUpStat } from './CountUpStat';

describe('CountUpStat', () => {
  it('formats as currency by default', () => {
    render(<CountUpStat value={72} />);
    // Reduced-motion test environments render the final value immediately (see the component's
    // own prefers-reduced-motion branch) — jsdom's default matchMedia reports no-preference, but
    // this assertion only cares about the formatting, not the animation, so it checks textContent
    // generically rather than depending on timing.
    expect(screen.getByText(/\$/)).toBeInTheDocument();
  });

  it('formats as a plain number when format="number"', () => {
    render(<CountUpStat value={72} format="number" />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
```

Create `components/ui/StatCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and a currency-formatted value by default', () => {
    render(<StatCard label="Total spent this month" value={150} trend={[10, 20, 150]} />);
    expect(screen.getByText('Total spent this month')).toBeInTheDocument();
  });

  it('passes through format="number" so the value renders without a currency sign', () => {
    render(<StatCard label="Financial health" value={72} trend={[60, 65, 72]} format="number" />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
```

Check this project's existing component-test setup (e.g. open any current `components/ui/*.test.tsx` such as `Button.test.tsx`) for the exact `render`/`screen` import source and any required test-setup file before assuming `@testing-library/react` is the right import path — match whatever the codebase's existing component tests actually use.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/CountUpStat.test.tsx components/ui/StatCard.test.tsx`
Expected: FAIL — `format` prop doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `components/ui/CountUpStat.tsx`, change the import and component to:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { computeCountUpValue } from '@/lib/utils/countUp';
import { formatCurrency } from '@/lib/utils/currency';

const DURATION_MS = 600;

export function CountUpStat({ value, format = 'currency' }: { value: number; format?: 'currency' | 'number' }) {
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
    <p className="inline-block bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
      {format === 'currency' ? formatCurrency(display) : Math.round(display)}
    </p>
  );
}
```

In `components/ui/StatCard.tsx`, thread the prop through:

```tsx
'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { CountUpStat } from './CountUpStat';

export function StatCard({
  label,
  value,
  trend,
  format = 'currency',
}: {
  label: string;
  value: number;
  trend: number[];
  format?: 'currency' | 'number';
}) {
  const chartData = trend.map((v, i) => ({ i, v }));

  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <CountUpStat value={value} format={format} />
      {trend.length > 1 && (
        <div aria-hidden="true" className="-mx-1 mt-1 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
              <Area
                type="monotone"
                dataKey="v"
                stroke="rgb(139,92,246)"
                fill="rgb(139,92,246)"
                fillOpacity={0.15}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

In `app/dashboard/page.tsx`: find the active cycle lookup already present on this page (it fetches the active cycle for the Coach/stat sections — read the current file to find its exact variable name before editing, since this plan's earlier reads of this file captured the stat-row JSX but not every intermediate variable name). Add, alongside the existing stat-row data assembly:

```ts
import { computeHealthScore } from '@/lib/health/computeHealthScore';
```

```ts
  let healthScoreValue = 100;
  let healthScoreTrend: number[] = [];
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
  }
```

If this page already queries `prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } })` for some other purpose earlier in the file (check before adding a second, redundant query — reuse the existing result if so), reuse that existing variable instead of re-querying.

Add the new cell next to the two existing `StatCard`s:

```tsx
<StatCard label="Financial health" value={healthScoreValue} trend={healthScoreTrend} format="number" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/ui/CountUpStat.test.tsx components/ui/StatCard.test.tsx`
Expected: PASS.

Run the full suite to confirm the dashboard page itself still compiles/tests cleanly: `npx vitest run && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add components/ui/CountUpStat.tsx components/ui/StatCard.tsx app/dashboard/page.tsx components/ui/CountUpStat.test.tsx components/ui/StatCard.test.tsx
git commit -m "feat: add Financial health stat cell to the dashboard

Reuses the existing StatCard/sparkline component with a new 'number'
format mode (default stays 'currency', so no existing caller changes
behavior) — trend line is the last few completed cycles' scores plus
the active one."
git push
```

---

### Task 7: Fold the health score into the Coach's Plan and Check-in messages

**Files:**
- Modify: `lib/ai/coach.ts` (both `generatePlanMessage` and `generateCheckInMessage`)
- Modify: `lib/utils/moneyCycle.ts` (both fallback builders, same optional-field pattern)
- Modify: `app/api/cycles/route.ts` (Plan message call site)
- Modify: `app/api/cron/coach-checkin/route.ts` (Check-in message call site)
- Test: `lib/ai/coach.test.ts`
- Test: `lib/utils/moneyCycle.test.ts`
- Test: `app/api/cycles/route.test.ts`
- Test: `app/api/cron/coach-checkin/route.test.ts`

**Interfaces:**
- Consumes: `computeHealthScore` (Task 2).
- Produces: `generatePlanMessage`'s input gains an optional `previousCycleScore?: number`; `generateCheckInMessage`'s input gains an optional `healthScore?: { total: number; delta: number | null }`. `buildFallbackPlanMessage`/`buildFallbackCheckInMessage` gain the same optional fields, appended the same mechanical way `shortfallWarning` already is.

- [ ] **Step 1: Write the failing tests**

In `lib/ai/coach.test.ts`, add inside `describe('generatePlanMessage', ...)`:

```ts
it('includes the previous cycle score in the prompt sent to Gemini when present', async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
  } as Response);

  await generatePlanMessage({ ...input, previousCycleScore: 78 });

  const [, options] = vi.mocked(fetch).mock.calls[0];
  const body = JSON.parse(options!.body as string);
  const prompt = body.contents[0].parts[0].text;
  expect(prompt).toContain('78');
});
```

And inside `describe('generateCheckInMessage', ...)`:

```ts
it('includes the health score and delta in the prompt sent to Gemini when present', async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
  } as Response);

  await generateCheckInMessage({ ...input, healthScore: { total: 82, delta: 5 } });

  const [, options] = vi.mocked(fetch).mock.calls[0];
  const body = JSON.parse(options!.body as string);
  const prompt = body.contents[0].parts[0].text;
  expect(prompt).toContain('82');
  expect(prompt).toContain('5');
});
```

In `lib/utils/moneyCycle.test.ts`, add inside `describe('buildFallbackPlanMessage', ...)`:

```ts
it('includes the previous cycle score when present', () => {
  const message = buildFallbackPlanMessage({
    startingAmount: 500, committedSpend: 200, daysRemaining: 10, safeToSpend: 30, previousCycleScore: 78,
  });
  expect(message).toContain('78');
});
```

And inside `describe('buildFallbackCheckInMessage', ...)`:

```ts
it('includes the health score when present', () => {
  const message = buildFallbackCheckInMessage({
    spentSoFar: 150, remainingAmount: 350, daysRemaining: 8, safeToSpend: 43.75, pacingStatus: 'ON_TRACK',
    healthScore: { total: 82, delta: 5 },
  });
  expect(message).toContain('82');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/coach.test.ts lib/utils/moneyCycle.test.ts`
Expected: FAIL — the new optional fields aren't read yet.

- [ ] **Step 3: Write minimal implementation**

In `lib/utils/moneyCycle.ts`, update both fallback builders:

```ts
export function buildFallbackPlanMessage(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
  safeToSpend: number;
  shortfallWarning?: string;
  previousCycleScore?: number;
}): string {
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  const scoreText =
    input.previousCycleScore !== undefined ? ` Last cycle, your financial health score was ${input.previousCycleScore}.` : '';
  return (
    `You've got ${formatCurrency(input.startingAmount)} for the next ${input.daysRemaining} days. ` +
    `${formatCurrency(input.committedSpend)} is already committed to recurring bills, leaving you ` +
    `${formatCurrency(input.safeToSpend)} a day to spend freely.${shortfallText}${scoreText}`
  );
}

export function buildFallbackCheckInMessage(input: {
  spentSoFar: number;
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  pacingStatus: 'ON_TRACK' | 'OVER_PACE';
  shortfallWarning?: string;
  healthScore?: { total: number; delta: number | null };
}): string {
  const pacingText = input.pacingStatus === 'OVER_PACE' ? "you're spending a bit faster than planned" : "you're on track";
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  const scoreText = input.healthScore
    ? ` Your financial health score is ${input.healthScore.total}${
        input.healthScore.delta !== null ? ` (${input.healthScore.delta >= 0 ? '+' : ''}${input.healthScore.delta} since last cycle)` : ''
      }.`
    : '';
  return (
    `You've spent ${formatCurrency(input.spentSoFar)} so far — ${pacingText}. ` +
    `${formatCurrency(input.remainingAmount)} left over ${input.daysRemaining} days, ` +
    `about ${formatCurrency(input.safeToSpend)} a day.${shortfallText}${scoreText}`
  );
}
```

In `lib/ai/coach.ts`, update both exported functions:

```ts
export async function generatePlanMessage(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
  safeToSpend: number;
  shortfallWarning?: string;
  previousCycleScore?: number;
}): Promise<string> {
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  const scoreText =
    input.previousCycleScore !== undefined
      ? ` Last cycle, your financial health score was ${input.previousCycleScore} out of 100.`
      : '';
  const prompt =
    `You are a friendly personal-finance coach speaking directly to the user (use "you"). ` +
    `They are new to budgeting and have no prior financial-management experience, so help them build real ` +
    `awareness, not just see numbers. All amounts are in Australian dollars (AUD). ` +
    `They have $${input.startingAmount.toFixed(2)} for the next ${input.daysRemaining} days. ` +
    `$${input.committedSpend.toFixed(2)} is already committed to recurring bills, leaving them ` +
    `$${input.safeToSpend.toFixed(2)} a day to spend freely.${shortfallText}${scoreText} Write one short, ` +
    `encouraging message (3-4 sentences) presenting this plan, including a brief plain-language explanation ` +
    `of why a daily safe-to-spend limit like this helps them stay in control. Do not use markdown formatting.`;

  try {
    return await callGemini(prompt);
  } catch {
    return buildFallbackPlanMessage(input);
  }
}

export async function generateCheckInMessage(input: {
  spentSoFar: number;
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  pacingStatus: 'ON_TRACK' | 'OVER_PACE';
  shortfallWarning?: string;
  healthScore?: { total: number; delta: number | null };
}): Promise<string> {
  const pacingHint =
    input.pacingStatus === 'OVER_PACE'
      ? 'they are spending faster than planned — gently suggest easing off'
      : 'they are on track — reassure them';
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  const scoreText = input.healthScore
    ? ` Their financial health score is ${input.healthScore.total} out of 100${
        input.healthScore.delta !== null
          ? `, ${input.healthScore.delta >= 0 ? 'up' : 'down'} ${Math.abs(input.healthScore.delta)} points since last cycle`
          : ''
      }.`
    : '';
  const prompt =
    `You are a friendly personal-finance coach speaking directly to the user (use "you"). ` +
    `They are new to budgeting and have no prior financial-management experience, so help them build real ` +
    `awareness, not just see numbers. All amounts are in Australian dollars (AUD). ` +
    `They've spent $${input.spentSoFar.toFixed(2)} so far, with $${input.remainingAmount.toFixed(2)} left ` +
    `over ${input.daysRemaining} days (about $${input.safeToSpend.toFixed(2)}/day). Right now ${pacingHint}.` +
    `${shortfallText}${scoreText} Write one short daily check-in message (3-4 sentences): give the numbers, ` +
    `then briefly explain in plain language what "pacing" means here and why it matters. If their health ` +
    `score changed, mention what it means in one plain-language phrase. Do not use markdown formatting.`;

  try {
    return await callGemini(prompt);
  } catch {
    return buildFallbackCheckInMessage(input);
  }
}
```

In `app/api/cycles/route.ts`: add the import `import { computeHealthScore } from '@/lib/health/computeHealthScore';`, and right before the existing `const planMessageText = await generatePlanMessage({...})` call, add:

```ts
    const priorCycle = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
    });
    const previousCycleScore = priorCycle
      ? (
          await computeHealthScore(
            user.userId,
            {
              id: priorCycle.id,
              startDate: priorCycle.startDate,
              endDate: priorCycle.endDate,
              createdAt: priorCycle.createdAt,
              status: priorCycle.status,
              startingAmount: Number(priorCycle.startingAmount),
            },
            priorCycle.endDate
          )
        ).total
      : undefined;
```

Then update the `generatePlanMessage` call to include `previousCycleScore,` in its input object.

In `app/api/cron/coach-checkin/route.ts`: add the same import, and right before the existing `const content = await generateCheckInMessage({...})` call, add:

```ts
        const currentScore = await computeHealthScore(
          cycle.userId,
          {
            id: cycle.id,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            createdAt: cycle.createdAt,
            status: cycle.status,
            startingAmount,
          },
          now
        );
        const priorCycle = await prisma.moneyCycle.findFirst({
          where: { userId: cycle.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
        });
        const previousTotal = priorCycle
          ? (
              await computeHealthScore(
                cycle.userId,
                {
                  id: priorCycle.id,
                  startDate: priorCycle.startDate,
                  endDate: priorCycle.endDate,
                  createdAt: priorCycle.createdAt,
                  status: priorCycle.status,
                  startingAmount: Number(priorCycle.startingAmount),
                },
                priorCycle.endDate
              )
            ).total
          : null;
        const healthScore = { total: currentScore.total, delta: previousTotal !== null ? currentScore.total - previousTotal : null };
```

Then update the `generateCheckInMessage` call to include `healthScore,` in its input object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ai/coach.test.ts lib/utils/moneyCycle.test.ts app/api/cycles/route.test.ts app/api/cron/coach-checkin/route.test.ts`
Expected: PASS. The two route test files will need their existing `prismaMock.moneyCycle.findFirst`/`cycleCategoryBudget`/`bill`/`expense` mocks extended to also satisfy `computeHealthScore`'s own queries (tracked-category list, bill list, prior-expense aggregation) — read each test file's current fixtures first and extend them minimally (e.g. `prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([])`, `prismaMock.bill.findMany.mockResolvedValue([])` wherever not already present) rather than restructuring the whole file.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/coach.ts lib/utils/moneyCycle.ts app/api/cycles/route.ts app/api/cron/coach-checkin/route.ts lib/ai/coach.test.ts lib/utils/moneyCycle.test.ts app/api/cycles/route.test.ts app/api/cron/coach-checkin/route.test.ts
git commit -m "feat: fold the financial health score into Plan and Check-in messages

Plan message references last cycle's score as context (this cycle has no
data yet); Check-in message gets the live score + delta, same mechanical
pattern shortfallWarning already uses in both prompts and their fallbacks."
git push
```

---

### Task 8: e2e coverage + live verification

**Files:**
- Modify: `e2e/accessibility.spec.ts` (account for the new stat cell on the dashboard a11y test(s))
- Modify: `e2e/dashboard.spec.ts` (if it asserts the exact set/count of visible stat cells — check first)

**Interfaces:**
- Consumes: nothing new — this task only verifies what Tasks 1-7 already built.

- [ ] **Step 1: Check whether the existing dashboard a11y test needs updating**

Read `e2e/accessibility.spec.ts`'s dashboard-related test(s) in full. If any assertion counts or enumerates the dashboard's stat cells (e.g. asserting exactly two `StatCard`s render, or asserting specific text that a third cell's presence would make ambiguous via `getByText` strict-mode matching), update it to account for the new "Financial health" cell. If no such assertion exists (the axe-core scan alone doesn't care how many stat cells there are), no change is needed here — don't add one speculatively.

- [ ] **Step 2: Run the full e2e suite once, locally, to catch any real regression**

Run: `set -a && source .env && set +a && npx playwright test`

If the dashboard-related tests show the same class of timing flakiness already diagnosed earlier this project (a heavier page pushing past a default timeout — see the existing `test.setTimeout()` precedent in `e2e/dashboard.spec.ts` and `e2e/accessibility.spec.ts`), apply the same fix: add `test.setTimeout(60_000)` (or similar, matching the existing precedent's reasoning) to the specific test that's now measurably heavier (one more server-side `computeHealthScore` call per dashboard load). Do not add this preemptively — only if a real run shows it's needed, confirmed by re-running that specific test in isolation at least twice before concluding it's a timing issue and not a real bug.

- [ ] **Step 3: Live verification against the throwaway test account**

Using the existing `nalinijarugula@gmail.com` test account (never the user's real `karisaichetan@gmail.com` account), start a dev server, log in, and manually confirm:
1. The dashboard shows a "Financial health" stat cell with a sensible number (0-100).
2. Logging several small, similar-sized expenses in one category, then one expense ≥2.5x their average, triggers the new anomaly push notification (requires having enabled push notifications for that browser session first) — check it fires with the expected category/amount wording, not just that no error was thrown.
3. The Money Coach's Plan message (start a new cycle) and Check-in message (can be triggered by calling the cron endpoint directly with the correct `CRON_SECRET` bearer token, matching how this was verified in earlier sessions on this project) actually mention the health score in plain language, not just silently carry the field with no visible effect.

Report the exact observed output for all three checks — do not report this task done on the basis of "the code should do X," only on what was actually seen.

- [ ] **Step 4: Final full-suite check**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: everything green.

- [ ] **Step 5: Commit (if Step 1 or Step 2 required any changes)**

```bash
git add -A
git commit -m "test: extend e2e coverage for the health score + anomaly detection"
git push
```

If neither step required a change, skip this commit — there is nothing to commit.
