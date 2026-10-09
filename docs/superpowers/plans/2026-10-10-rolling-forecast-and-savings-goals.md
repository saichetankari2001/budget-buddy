# Rolling Cash-Flow Forecast & Savings Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Budget Buddy two things leading 2026 budgeting apps have and it doesn't — a cash-flow forecast that looks 90 days forward regardless of the current Money Cycle's own end date, and named savings goals with explicit, logged contributions.

**Architecture:** A new pure function (`computeRollingForecast`) mirrors `projectCycle.ts`'s existing bill/income assembly logic over a rolling `[now, now+90]` window instead of the cycle's own window, flagging one-time bills that fall outside the cycle's window but inside the rolling one. Two new Prisma models (`SavingsGoal`, `SavingsContribution`) back a standard CRUD-actions-plus-routes layer, mirroring `lib/bills/actions.ts`/`lib/income/actions.ts` exactly, plus two new AI-chat tools. Both features surface as new, self-contained, self-fetching components added directly to `/cashflow` — zero changes to `CashFlowClient.tsx`.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres (real migration this time — not schema-free like the health-score plan), Vitest, Playwright + axe-core, Gemini function-calling.

**Spec:** `docs/superpowers/specs/2026-10-10-rolling-forecast-and-savings-goals-design.md`

## Global Constraints

- **This plan requires an actual `prisma migrate dev` migration** — unlike the immediately-prior health-score plan, which was deliberately schema-free. Do not assume zero-migration discipline carries over.
- `computeRollingForecast` lives in `lib/moneyCycle/rollingForecast.ts`, reuses `computeCashFlowProjection` (`lib/utils/cashFlowProjection.ts`) and `computeBillOccurrences` (`lib/utils/moneyCycle.ts`) — the same dependencies `projectCycle.ts` already uses. It does NOT call or modify `projectCycle.ts` itself; the caller (a route) calls `projectCycle` separately to get `remainingAmount`, then passes that into `computeRollingForecast`.
- Window: `[today, today + 90 days]`, where `today` is `startOfSydneyDay(rawNow)` (the EXISTING exported helper from `lib/utils/moneyCycle.ts` — reuse it; do not duplicate `projectCycle.ts`'s private, unexported `getTodayInSydney`, and do not export that private function either — `startOfSydneyDay` already does the identical job and is already public).
- "Heads up" flag: a one-time (non-recurring) `Bill` (`recurrenceInterval === null`) whose `dueDate` is strictly after the active cycle's own `endDate` AND within the rolling window (`dueDate <= today + 90 days`) gets flagged. Recurring bills are never flagged (the spec scopes this to one-time bills only — they're the ones genuinely invisible in the cycle's own projection today).
- New route `GET /api/cycles/active/rolling-forecast` returns `{ trajectory, headsUp: [{name, amount, dueDate}] }` when there's an active cycle, `null` otherwise — mirror `app/api/cycles/active/category-breakdown/route.ts`'s exact null-when-no-cycle convention and response-shape style.
- New Prisma models, exact fields: `SavingsGoal { id, userId, user, name, targetAmount, targetDate?, createdAt, contributions SavingsContribution[] }` with `@@unique([userId, name])`; `SavingsContribution { id, savingsGoalId, savingsGoal, amount, date, createdAt }` with `@@index([savingsGoalId, date])`.
- Goal progress (`sum(contributions.amount) / targetAmount`) is always computed on read — never a stored running total.
- Two new chat tools, `add_savings_goal` and `log_savings_contribution`, added to `lib/ai/chat.ts`'s existing `TOOLS` array and dispatch `if/else if` chain, in the exact same style as the six existing tools. `log_savings_contribution` resolves `goalName` case-insensitively against the user's own `SavingsGoal` rows with NO "Other"-style fallback — no match means `{ success: false, error: ... }` asking the user to create the goal first.
- **Acknowledged, not fixed, limitation**: `app/api/cycles/chat/route.ts` already requires an active Money Cycle before ANY chat tool call is reachable (`if (!cycle) throw new AppError(400, ...)`), including the two new savings-goal tools — even though savings goals are conceptually independent of Money Cycles. This plan does not change that gating (it's a pre-existing architectural choice affecting every existing tool identically, not something to fix as a side effect here). A user with no active cycle can still create/manage goals through the `/cashflow` page's own UI forms, which don't go through the chat endpoint at all.
- Both new `/cashflow` UI pieces ("Looking ahead" forecast chart + heads-up list; "Savings goals" panel) are new, independent, self-fetching client components added as new siblings to `<CashFlowClient>` directly inside `app/cashflow/page.tsx` — NOT added inside `CashFlowClient.tsx` itself. Zero changes to `CashFlowClient.tsx`'s file, props, or behavior.
- Zero changes to `projectCycle.ts`, `computeHealthScore.ts`, anomaly detection, or Coach prompt logic.
- **Do NOT push to GitHub after any task.** Commit locally only, every task. The controller pushes exactly once, batched, after the final whole-branch review passes — the user has asked to stop triggering a Vercel deploy on every commit (free-tier quota).
- TDD throughout: failing test first, then minimal implementation, then green.
- Independent verification is mandatory — re-check every subagent's diff and re-run tests yourself. This project's last two plans each had the final whole-branch review catch something no single task's review did. Apply extra scrutiny to: (a) the migration itself (confirm `npx prisma generate` regenerates the client so `tests/mocks/prisma.ts`'s `mockDeep<PrismaClient>()` automatically picks up `prismaMock.savingsGoal`/`prismaMock.savingsContribution` with no manual mock-file edits — verify this is actually true, don't assume); (b) the heads-up date-boundary logic, by hand, against real dates — this project has hit the exact "missing/wrong date boundary" bug class twice already in the two most recent plans; (c) live verification of the full flow (create a goal via chat, log a contribution via chat, see a real future one-time bill flagged as "heads up") against the throwaway test account `nalinijarugula@gmail.com` / `Pravs@1112` — never the user's real account.

---

### Task 1: Prisma migration — `SavingsGoal` + `SavingsContribution`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new migration under `prisma/migrations/` (via `npx prisma migrate dev`, not hand-written)
- Verify: `tests/mocks/prisma.ts` (should need NO changes — confirm this)

**Interfaces:**
- Produces: the `SavingsGoal` and `SavingsContribution` Prisma models and their generated client types (`prisma.savingsGoal`, `prisma.savingsContribution`), consumed by every later task.

- [ ] **Step 1: Add the two models to `prisma/schema.prisma`**

Add after the existing `CycleCategoryBudget` model (or any sensible location alongside the other per-user models like `Bill`/`IncomeSource` — match the file's existing ordering convention):

```prisma
model SavingsGoal {
  id            String                @id @default(cuid())
  userId        String
  user          User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  name          String
  targetAmount  Decimal               @db.Decimal(10, 2)
  targetDate    DateTime?
  createdAt     DateTime              @default(now())
  contributions SavingsContribution[]

  @@unique([userId, name])
}

model SavingsContribution {
  id            String      @id @default(cuid())
  savingsGoalId String
  savingsGoal   SavingsGoal @relation(fields: [savingsGoalId], references: [id], onDelete: Cascade)
  amount        Decimal     @db.Decimal(10, 2)
  date          DateTime
  createdAt     DateTime    @default(now())

  @@index([savingsGoalId, date])
}
```

Also add `savingsGoals SavingsGoal[]` to the `User` model's relation list, alongside its existing `bills Bill[]`/`incomeSources IncomeSource[]` lines — read the current `User` model first to match the exact existing field ordering style.

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name add_savings_goals`
Expected: a new migration folder created under `prisma/migrations/`, applied cleanly to the local/dev database with no errors, and `npx prisma generate` runs automatically as part of this command (confirm the generated client includes the two new models by checking `node_modules/.prisma/client/index.d.ts` mentions `SavingsGoal`/`SavingsContribution`, or simply by proceeding to Step 3).

- [ ] **Step 3: Confirm the test-mock surface picked up the new models with zero manual edits**

Read `tests/mocks/prisma.ts` in full. It uses `mockDeep<PrismaClient>()`, which auto-generates a mock for every model on the CLIENT TYPE — since the client was just regenerated in Step 2 to include the two new models, `prismaMock.savingsGoal` and `prismaMock.savingsContribution` should already exist with zero changes to this file. Verify this directly:

```bash
npx tsx -e "
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
console.log(typeof prismaMock.savingsGoal, typeof prismaMock.savingsContribution);
"
```
Expected output: `object object` (both exist as mock objects), confirming no edits to `tests/mocks/prisma.ts` are needed. If this fails for any reason, investigate before proceeding — do not silently hand-add entries to that file without understanding why the auto-mock didn't pick them up.

- [ ] **Step 4: Run the full suite to confirm nothing broke**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green — this task adds zero new application code, only schema + migration, so nothing should change.

- [ ] **Step 5: Commit (do NOT push)**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add SavingsGoal and SavingsContribution models

New tables for the rolling-forecast-and-savings-goals plan. Progress is
always computed on read (sum of contributions / target), never stored."
```

---

### Task 2: Pure `computeRollingForecast` function

**Files:**
- Create: `lib/moneyCycle/rollingForecast.ts`
- Test: `lib/moneyCycle/rollingForecast.test.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma`), `computeCashFlowProjection` (`lib/utils/cashFlowProjection.ts`), `computeBillOccurrences`/`startOfSydneyDay` (`lib/utils/moneyCycle.ts`).
- Produces:
  ```ts
  export interface RollingForecastResult {
    trajectory: { date: string; balance: number; events: { label: string; amount: number }[] }[];
    headsUp: { name: string; amount: number; dueDate: string }[];
  }
  export async function computeRollingForecast(
    userId: string,
    input: { remainingAmount: number; cycleEndDate: Date },
    rawNow: Date,
    windowDays?: number // defaults to 90
  ): Promise<RollingForecastResult>
  ```
  Task 5 (the new API route) calls this directly.

- [ ] **Step 1: Write the failing tests**

Create `lib/moneyCycle/rollingForecast.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { computeRollingForecast } from './rollingForecast';

const userId = 'user_1';
const rawNow = new Date('2026-10-10T08:00:00.000Z'); // a Saturday; Sydney is UTC+11 in October (DST)

describe('computeRollingForecast', () => {
  it('projects 90 days forward from today regardless of the cycle end date', async () => {
    prismaMock.bill.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    // Cycle ends in just 5 days, but the forecast must still run the full 90.
    const cycleEndDate = new Date('2026-10-15T00:00:00.000Z');
    const result = await computeRollingForecast(userId, { remainingAmount: 100, cycleEndDate }, rawNow);

    expect(result.trajectory.length).toBe(91); // day 0 through day 90 inclusive
    expect(result.trajectory[0].balance).toBe(100);
    expect(result.trajectory[90].balance).toBe(100); // no events anywhere in the window
  });

  it('flags a one-time bill due after the cycle ends but inside the 90-day window as heads-up', async () => {
    const cycleEndDate = new Date('2026-10-20T00:00:00.000Z'); // 10 days out
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Car registration', amount: { toString: () => '450.00' } as never,
        dueDate: new Date('2026-11-15T00:00:00.000Z'), // 36 days out: after cycle end, inside window
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([
      { name: 'Car registration', amount: 450, dueDate: new Date('2026-11-15T00:00:00.000Z').toISOString() },
    ]);
    // And it also appears in the trajectory itself as a real event, not just the heads-up list.
    const dayOfBill = result.trajectory.find((d) => d.date === new Date('2026-11-15T00:00:00.000Z').toISOString());
    expect(dayOfBill?.events).toContainEqual({ label: 'Car registration', amount: -450 });
  });

  it('does NOT flag a one-time bill due before the cycle ends, even though it is also inside the window', async () => {
    const cycleEndDate = new Date('2026-10-30T00:00:00.000Z'); // 20 days out
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Phone', amount: { toString: () => '50.00' } as never,
        dueDate: new Date('2026-10-18T00:00:00.000Z'), // 8 days out: BEFORE cycle end
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
  });

  it('does NOT flag a one-time bill due exactly on the cycle end date (not "strictly after")', async () => {
    const cycleEndDate = new Date('2026-10-20T00:00:00.000Z');
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Rent', amount: { toString: () => '800.00' } as never,
        dueDate: new Date('2026-10-20T00:00:00.000Z'), // exactly the cycle end date
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
  });

  it('never flags a RECURRING bill, even one whose next occurrence falls after the cycle ends', async () => {
    const cycleEndDate = new Date('2026-10-15T00:00:00.000Z');
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Netflix', amount: { toString: () => '15.00' } as never,
        dueDate: new Date('2026-10-25T00:00:00.000Z'), recurrenceInterval: 'MONTHLY',
        categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
  });

  it('excludes a bill due beyond the 90-day window entirely', async () => {
    const cycleEndDate = new Date('2026-10-15T00:00:00.000Z');
    prismaMock.bill.findMany.mockResolvedValue([
      {
        id: 'bill_1', userId, name: 'Far future bill', amount: { toString: () => '100.00' } as never,
        dueDate: new Date('2027-03-01T00:00:00.000Z'), // well beyond 90 days from Oct 10
        recurrenceInterval: null, categoryId: null, paidExpenseId: null, createdAt: new Date(),
      },
    ] as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const result = await computeRollingForecast(userId, { remainingAmount: 1000, cycleEndDate }, rawNow);

    expect(result.headsUp).toEqual([]);
    expect(result.trajectory.every((d) => d.events.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/moneyCycle/rollingForecast.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/moneyCycle/rollingForecast.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { computeBillOccurrences, startOfSydneyDay } from '@/lib/utils/moneyCycle';
import { computeCashFlowProjection } from '@/lib/utils/cashFlowProjection';

const DEFAULT_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RollingForecastResult {
  trajectory: { date: string; balance: number; events: { label: string; amount: number }[] }[];
  headsUp: { name: string; amount: number; dueDate: string }[];
}

/**
 * Projects cash flow [today, today + windowDays] — deliberately decoupled from the active Money
 * Cycle's own endDate, since Bill/IncomeSource rows are user-scoped, not cycle-scoped, and a real
 * obligation doesn't stop existing just because today's cycle happens to end sooner. `remainingAmount`
 * (the cycle's own live balance) is the only thing borrowed from the cycle — this is why the feature
 * still requires an active cycle today, rather than introducing a separate "account balance" concept.
 */
export async function computeRollingForecast(
  userId: string,
  input: { remainingAmount: number; cycleEndDate: Date },
  rawNow: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS
): Promise<RollingForecastResult> {
  const today = startOfSydneyDay(rawNow);
  const windowEnd = new Date(today.getTime() + windowDays * MS_PER_DAY);

  const billTemplates = await prisma.bill.findMany({ where: { userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId, type: 'FIXED' } });

  const oneTimeBills = billTemplates.filter(
    (b) => b.recurrenceInterval === null && b.paidExpenseId === null && b.dueDate <= windowEnd
  );
  const billOccurrencesOneTime = oneTimeBills.map((b) => ({ date: b.dueDate, amount: Number(b.amount), label: b.name }));
  const billOccurrencesRecurring = computeBillOccurrences(
    billTemplates
      .filter((b) => b.recurrenceInterval !== null)
      .map((b) => ({ amount: Number(b.amount), recurrenceInterval: b.recurrenceInterval!, date: b.dueDate, label: b.name })),
    today,
    windowEnd
  );

  const fixedIncomeOneTime = incomeSources
    .filter((s) => s.recurrenceInterval === null && s.startDate <= windowEnd)
    .map((s) => ({ date: s.startDate, amount: Number(s.amount), label: s.name }));
  const fixedIncomeRecurring = computeBillOccurrences(
    incomeSources
      .filter((s) => s.recurrenceInterval !== null && s.startDate <= windowEnd)
      .map((s) => ({ amount: Number(s.amount), recurrenceInterval: s.recurrenceInterval!, date: s.startDate, label: s.name })),
    today,
    windowEnd
  );

  const projectionResult = computeCashFlowProjection({
    currentBalance: input.remainingAmount,
    today,
    endDate: windowEnd,
    fixedIncomeOccurrences: [...fixedIncomeOneTime, ...fixedIncomeRecurring],
    billOccurrences: [...billOccurrencesOneTime, ...billOccurrencesRecurring],
  });

  // "Heads up": a one-time bill due strictly after the cycle's own end (so the cycle's own
  // projection, which stops at cycleEndDate, never shows it) but still inside this 90-day window.
  const headsUp = oneTimeBills
    .filter((b) => b.dueDate.getTime() > input.cycleEndDate.getTime())
    .map((b) => ({ name: b.name, amount: Number(b.amount), dueDate: b.dueDate.toISOString() }));

  return {
    trajectory: projectionResult.trajectory.map((day) => ({
      date: day.date.toISOString(),
      balance: day.balance,
      events: day.events,
    })),
    headsUp,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/moneyCycle/rollingForecast.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit (do NOT push)**

```bash
git add lib/moneyCycle/rollingForecast.ts lib/moneyCycle/rollingForecast.test.ts
git commit -m "feat: add computeRollingForecast — 90-day cash-flow window, cycle-independent

Reuses the same projection engine and bill/income assembly logic
projectCycle.ts already has, over a rolling [today, today+90] window
instead of the cycle's own [startDate, endDate]. Flags one-time bills due
after the cycle ends but inside the window -- bills otherwise invisible
until a new cycle happens to start."
```

---

### Task 3: `SavingsGoal`/`SavingsContribution` CRUD actions

**Files:**
- Create: `lib/validation/savingsGoal.schema.ts`
- Create: `lib/savingsGoals/actions.ts`
- Test: `lib/savingsGoals/actions.test.ts`

**Interfaces:**
- Consumes: `prisma`, `publishCycleUpdate` (`lib/realtime/publish.ts` — reused exactly as `lib/bills/actions.ts`/`lib/income/actions.ts` already do, since its own doc comment already generalizes beyond strict "cycle" semantics to "notify tabs that cash-flow data changed").
- Produces:
  ```ts
  type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };
  export async function addSavingsGoal(
    userId: string,
    input: { name: string; targetAmount: number; targetDate?: Date }
  ): Promise<ActionResult<{ id: string }>>
  export async function logSavingsContribution(
    userId: string,
    input: { goalName: string; amount: number; date?: Date }
  ): Promise<ActionResult<{ id: string }>>
  export async function deleteSavingsGoal(userId: string, goalName: string): Promise<ActionResult>
  ```
  Tasks 4 (chat tools) and 6 (API routes) call these directly.

- [ ] **Step 1: Write the failing tests**

Create `lib/validation/savingsGoal.schema.ts` first (needed by the test file):

```ts
import { z } from 'zod';

const sharedFields = {
  name: z.string().min(1).max(100),
  targetAmount: z.number().positive(),
};

/** Route-layer shape: JSON over the wire, so targetDate arrives as an ISO string (optional). */
export const createSavingsGoalSchema = z.object({ ...sharedFields, targetDate: z.string().datetime().nullish() });

/**
 * Action-layer shape: the same rules, for callers that already hold a real Date (or undefined).
 * Mirrors createBillActionSchema's split exactly — the chat tool path only does loose typeof
 * guards before calling addSavingsGoal, so this is what actually enforces the rules there.
 */
export const createSavingsGoalActionSchema = z.object({ ...sharedFields, targetDate: z.date().nullish() });

export type CreateSavingsGoalInput = z.infer<typeof createSavingsGoalSchema>;
```

Create `lib/savingsGoals/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/realtime/publish', () => ({ publishCycleUpdate: vi.fn().mockResolvedValue(undefined) }));

import { publishCycleUpdate } from '@/lib/realtime/publish';
import { addSavingsGoal, logSavingsContribution, deleteSavingsGoal } from './actions';

describe('addSavingsGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a goal with a target amount and no target date', async () => {
    prismaMock.savingsGoal.create.mockResolvedValue({ id: 'goal_1' } as never);

    const result = await addSavingsGoal('user_1', { name: 'Laptop fund', targetAmount: 1500 });

    expect(result).toEqual({ success: true, id: 'goal_1' });
    expect(prismaMock.savingsGoal.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', name: 'Laptop fund', targetAmount: 1500, targetDate: undefined },
    });
    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });

  it('rejects a non-positive target amount without touching the database', async () => {
    const result = await addSavingsGoal('user_1', { name: 'Laptop fund', targetAmount: 0 });

    expect(result).toEqual({ success: false, error: expect.any(String) });
    expect(prismaMock.savingsGoal.create).not.toHaveBeenCalled();
  });

  it('returns a friendly error when a goal with the same name already exists', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaMock.savingsGoal.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' })
    );

    const result = await addSavingsGoal('user_1', { name: 'Laptop fund', targetAmount: 1500 });

    expect(result).toEqual({ success: false, error: 'You already have a savings goal named "Laptop fund"' });
  });
});

describe('logSavingsContribution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs a contribution against an existing goal, resolved case-insensitively', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsContribution.create.mockResolvedValue({ id: 'contrib_1' } as never);

    const result = await logSavingsContribution('user_1', { goalName: 'laptop fund', amount: 50 });

    expect(result).toEqual({ success: true, id: 'contrib_1' });
    expect(prismaMock.savingsGoal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', name: { equals: 'laptop fund', mode: 'insensitive' } },
    });
    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });

  it('returns an error with no fallback when no goal matches the given name', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue(null);

    const result = await logSavingsContribution('user_1', { goalName: 'Nonexistent goal', amount: 50 });

    expect(result).toEqual({
      success: false,
      error: 'No savings goal named "Nonexistent goal" found — create it first.',
    });
    expect(prismaMock.savingsContribution.create).not.toHaveBeenCalled();
  });

  it('defaults the contribution date to now when none is given', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsContribution.create.mockResolvedValue({ id: 'contrib_1' } as never);

    await logSavingsContribution('user_1', { goalName: 'Laptop fund', amount: 50 });

    expect(prismaMock.savingsContribution.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ date: expect.any(Date) }) })
    );
  });
});

describe('deleteSavingsGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a goal owned by the user', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsGoal.delete.mockResolvedValue({ id: 'goal_1' } as never);

    const result = await deleteSavingsGoal('user_1', 'Laptop fund');

    expect(result).toEqual({ success: true });
    expect(prismaMock.savingsGoal.delete).toHaveBeenCalledWith({ where: { id: 'goal_1' } });
  });

  it('returns an error when no goal matches', async () => {
    prismaMock.savingsGoal.findFirst.mockResolvedValue(null);

    const result = await deleteSavingsGoal('user_1', 'Nonexistent');

    expect(result).toEqual({ success: false, error: 'No savings goal named "Nonexistent" found' });
    expect(prismaMock.savingsGoal.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/savingsGoals/actions.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/savingsGoals/actions.ts`:

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createSavingsGoalActionSchema } from '@/lib/validation/savingsGoal.schema';
import { publishCycleUpdate } from '@/lib/realtime/publish';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export async function addSavingsGoal(
  userId: string,
  input: { name: string; targetAmount: number; targetDate?: Date }
): Promise<ActionResult<{ id: string }>> {
  // Validated here, not just at the route layer: this function is reached by BOTH the REST route
  // (which Zod-parses first) and the chat tool handler (which only does loose typeof guards),
  // matching addBill's/addIncomeSource's existing contract exactly.
  const parsed = createSavingsGoalActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const created = await prisma.savingsGoal.create({
      data: {
        userId,
        name: parsed.data.name,
        targetAmount: parsed.data.targetAmount,
        targetDate: parsed.data.targetDate ?? undefined,
      },
    });
    await publishCycleUpdate(userId);
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: `You already have a savings goal named "${input.name}"` };
    }
    throw error;
  }
}

export async function logSavingsContribution(
  userId: string,
  input: { goalName: string; amount: number; date?: Date }
): Promise<ActionResult<{ id: string }>> {
  const goal = await prisma.savingsGoal.findFirst({
    where: { userId, name: { equals: input.goalName, mode: 'insensitive' } },
  });
  if (!goal) {
    // No "Other"-style fallback, unlike logExpense's category resolution — a savings goal has no
    // sensible generic bucket to fall back to.
    return { success: false, error: `No savings goal named "${input.goalName}" found — create it first.` };
  }

  const created = await prisma.savingsContribution.create({
    data: { savingsGoalId: goal.id, amount: input.amount, date: input.date ?? new Date() },
  });
  await publishCycleUpdate(userId);
  return { success: true, id: created.id };
}

export async function deleteSavingsGoal(userId: string, goalName: string): Promise<ActionResult> {
  const goal = await prisma.savingsGoal.findFirst({
    where: { userId, name: { equals: goalName, mode: 'insensitive' } },
  });
  if (!goal) {
    return { success: false, error: `No savings goal named "${goalName}" found` };
  }

  await prisma.savingsGoal.delete({ where: { id: goal.id } });
  await publishCycleUpdate(userId);
  return { success: true };
}
```

Note: the test for `logSavingsContribution`'s case-insensitive lookup expects `findFirst` called with `{ equals: 'laptop fund', mode: 'insensitive' }` literally (the lowercase input string, not re-cased) — this matches how Prisma's `mode: 'insensitive'` already does the case-folding at the database level, so the action doesn't need to lowercase anything itself before querying.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/savingsGoals/actions.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit (do NOT push)**

```bash
git add lib/validation/savingsGoal.schema.ts lib/savingsGoals/actions.ts lib/savingsGoals/actions.test.ts
git commit -m "feat: add SavingsGoal CRUD actions

addSavingsGoal/logSavingsContribution/deleteSavingsGoal, mirroring
addBill/addIncomeSource/logIncomeEntry's existing validation and
error-shape conventions exactly. No fallback on an unmatched goal name --
unlike expense categories, a goal has no sensible generic bucket."
```

---

### Task 4: Wire two new chat tools

**Files:**
- Modify: `lib/ai/chat.ts`
- Modify: `app/api/cycles/chat/route.ts`
- Test: `lib/ai/chat.test.ts`
- Test: `app/api/cycles/chat/route.test.ts`

**Interfaces:**
- Consumes: `addSavingsGoal`/`logSavingsContribution` from Task 3.
- Produces: `ChatToolHandlers` gains `addSavingsGoal: (input: { name: string; targetAmount: number; targetDate?: string }) => Promise<{success, error?, [key:string]:unknown}>` and `logSavingsContribution: (input: { goalName: string; amount: number }) => Promise<{success, error?, [key:string]:unknown}>`.

- [ ] **Step 1: Write the failing tests**

In `lib/ai/chat.test.ts`, add `addSavingsGoal: vi.fn(), logSavingsContribution: vi.fn(),` to every existing inline mock `handlers` object in this file (the same bulk `replace_all` approach used when `logExpense` was added previously in this project's history — check the file's current handler-mock lines and add both new entries alongside them consistently across every test block). Then add two new test blocks:

```ts
it('calls addSavingsGoal when Gemini requests add_savings_goal, then uses the follow-up reply', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ functionCall: { name: 'add_savings_goal', args: { name: 'Laptop fund', targetAmount: 1500, targetDate: '2026-12-25T00:00:00.000Z' } } }],
          },
        }],
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Got it — I've set up your Laptop fund goal." } ] } }] }),
    } as Response);

  const handlers = {
    updateCycleAmount: vi.fn(), cancelCycle: vi.fn(), addIncomeSource: vi.fn(), logIncome: vi.fn(),
    addBill: vi.fn(), markBillPaid: vi.fn(), logExpense: vi.fn(),
    addSavingsGoal: vi.fn().mockResolvedValue({ success: true, id: 'goal_1' }),
    logSavingsContribution: vi.fn(),
  };

  const result = await generateChatReply('I want to save $1500 for a laptop by Christmas', [], handlers);

  expect(handlers.addSavingsGoal).toHaveBeenCalledWith({ name: 'Laptop fund', targetAmount: 1500, targetDate: '2026-12-25T00:00:00.000Z' });
  expect(result).toBe("Got it — I've set up your Laptop fund goal.");
});

it('calls logSavingsContribution when Gemini requests log_savings_contribution', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ functionCall: { name: 'log_savings_contribution', args: { goalName: 'Laptop fund', amount: 50 } } }] } }],
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Nice, $50 closer to your laptop fund.' }] } }] }),
    } as Response);

  const handlers = {
    updateCycleAmount: vi.fn(), cancelCycle: vi.fn(), addIncomeSource: vi.fn(), logIncome: vi.fn(),
    addBill: vi.fn(), markBillPaid: vi.fn(), logExpense: vi.fn(), addSavingsGoal: vi.fn(),
    logSavingsContribution: vi.fn().mockResolvedValue({ success: true, id: 'contrib_1' }),
  };

  const result = await generateChatReply('I put $50 towards my laptop fund', [], handlers);

  expect(handlers.logSavingsContribution).toHaveBeenCalledWith({ goalName: 'Laptop fund', amount: 50 });
  expect(result).toBe('Nice, $50 closer to your laptop fund.');
});
```

In `app/api/cycles/chat/route.test.ts`, add after the existing `'binds the logExpense handler to user.userId'` test:

```ts
it('binds the addSavingsGoal handler to user.userId and converts targetDate to a Date when present', async () => {
  const { addSavingsGoal } = await import('@/lib/savingsGoals/actions');
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
  prismaMock.coachMessage.findMany.mockResolvedValue([]);
  prismaMock.coachMessage.create.mockResolvedValue({} as never);
  vi.mocked(generateChatReply).mockResolvedValue('Set up your goal.');
  vi.mocked(addSavingsGoal).mockResolvedValue({ success: true, id: 'goal_1' } as never);

  await POST(new NextRequest('http://localhost/api/cycles/chat', { method: 'POST', body: JSON.stringify({ message: 'save for a laptop' }) }));

  const handlers = vi.mocked(generateChatReply).mock.calls[0][2];
  await handlers.addSavingsGoal({ name: 'Laptop fund', targetAmount: 1500, targetDate: '2026-12-25T00:00:00.000Z' });

  expect(addSavingsGoal).toHaveBeenCalledWith('user_1', { name: 'Laptop fund', targetAmount: 1500, targetDate: new Date('2026-12-25T00:00:00.000Z') });
});

it('binds the logSavingsContribution handler to user.userId', async () => {
  const { logSavingsContribution } = await import('@/lib/savingsGoals/actions');
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
  prismaMock.coachMessage.findMany.mockResolvedValue([]);
  prismaMock.coachMessage.create.mockResolvedValue({} as never);
  vi.mocked(generateChatReply).mockResolvedValue('Logged it.');
  vi.mocked(logSavingsContribution).mockResolvedValue({ success: true, id: 'contrib_1' } as never);

  await POST(new NextRequest('http://localhost/api/cycles/chat', { method: 'POST', body: JSON.stringify({ message: 'I put $50 towards my laptop fund' }) }));

  const handlers = vi.mocked(generateChatReply).mock.calls[0][2];
  await handlers.logSavingsContribution({ goalName: 'Laptop fund', amount: 50 });

  expect(logSavingsContribution).toHaveBeenCalledWith('user_1', { goalName: 'Laptop fund', amount: 50 });
});
```

Also add `vi.mock('@/lib/savingsGoals/actions', () => ({ addSavingsGoal: vi.fn(), logSavingsContribution: vi.fn() }));` and the corresponding import near this test file's existing `vi.mock('@/lib/expenses/actions', ...)` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/chat.test.ts app/api/cycles/chat/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

In `lib/ai/chat.ts`, add two entries to the `TOOLS` array's `functionDeclarations`, after the existing `log_expense` entry:

```ts
      {
        name: 'add_savings_goal',
        description: "Create a new savings goal the user wants to work toward — a named target amount, optionally with a target date",
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'A short name for this goal, e.g. "Laptop fund" or "Holiday"' },
            targetAmount: { type: 'number', description: 'The total amount the user wants to save, in AUD' },
            targetDate: { type: 'string', description: 'ISO date string for when they want to reach it, if mentioned' },
          },
          required: ['name', 'targetAmount'],
        },
      },
      {
        name: 'log_savings_contribution',
        description: "Log money the user just put toward an existing savings goal",
        parameters: {
          type: 'object',
          properties: {
            goalName: { type: 'string', description: 'The name of the savings goal this money went toward' },
            amount: { type: 'number', description: 'The amount contributed, in AUD' },
          },
          required: ['goalName', 'amount'],
        },
      },
```

Add to the `ChatToolHandlers` interface, after `logExpense`:

```ts
  addSavingsGoal: (input: {
    name: string;
    targetAmount: number;
    targetDate?: string;
  }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  logSavingsContribution: (input: { goalName: string; amount: number }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
```

Add to the dispatch `if/else if` chain, after the `log_expense` branch and before the final `else`:

```ts
      } else if (name === 'add_savings_goal') {
        if (typeof args.name !== 'string') {
          toolResult = { success: false, error: 'name must be a string' };
        } else if (typeof args.targetAmount !== 'number') {
          toolResult = { success: false, error: 'targetAmount must be a number' };
        } else {
          toolResult = await handlers.addSavingsGoal({
            name: args.name,
            targetAmount: args.targetAmount,
            targetDate: typeof args.targetDate === 'string' ? args.targetDate : undefined,
          });
        }
      } else if (name === 'log_savings_contribution') {
        if (typeof args.goalName !== 'string') {
          toolResult = { success: false, error: 'goalName must be a string' };
        } else if (typeof args.amount !== 'number') {
          toolResult = { success: false, error: 'amount must be a number' };
        } else {
          toolResult = await handlers.logSavingsContribution({ goalName: args.goalName, amount: args.amount });
        }
```

In `app/api/cycles/chat/route.ts`, add the import `import { addSavingsGoal, logSavingsContribution } from '@/lib/savingsGoals/actions';` and two entries to the `handlers` object passed to `generateChatReply`:

```ts
      addSavingsGoal: (input) => addSavingsGoal(user.userId, { ...input, targetDate: input.targetDate ? new Date(input.targetDate) : undefined }),
      logSavingsContribution: (input) => logSavingsContribution(user.userId, input),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ai/chat.test.ts app/api/cycles/chat/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit (do NOT push)**

```bash
git add lib/ai/chat.ts lib/ai/chat.test.ts app/api/cycles/chat/route.ts app/api/cycles/chat/route.test.ts
git commit -m "feat: add add_savings_goal and log_savings_contribution chat tools

Same TOOLS/dispatch/ChatToolHandlers pattern every existing tool already
uses. Inherits the existing chat endpoint's active-cycle requirement --
not changed here, acknowledged as a pre-existing limitation in the plan."
```

---

### Task 5: `GET /api/cycles/active/rolling-forecast` route

**Files:**
- Create: `app/api/cycles/active/rolling-forecast/route.ts`
- Test: `app/api/cycles/active/rolling-forecast/route.test.ts`

**Interfaces:**
- Consumes: `computeRollingForecast` (Task 2), `projectCycle` (`lib/moneyCycle/projectCycle.ts`, called but not modified).
- Produces: the route Task 7's UI component fetches from.

- [ ] **Step 1: Write the failing tests**

Create `app/api/cycles/active/rolling-forecast/route.test.ts`, mirroring `app/api/cycles/active/category-breakdown/route.test.ts`'s structure exactly:

```ts
import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/cycles/active/rolling-forecast', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns null when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET();
    expect(await res.json()).toBeNull();
  });

  it('returns a trajectory and headsUp list when there is an active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-10-01T00:00:00.000Z'), endDate: new Date('2026-10-15T00:00:00.000Z'),
      status: 'ACTIVE', createdAt: new Date('2026-10-01T00:00:00.000Z'),
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.bill.findMany.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.trajectory).toBeInstanceOf(Array);
    expect(json.headsUp).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cycles/active/rolling-forecast/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/cycles/active/rolling-forecast/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';
import { computeRollingForecast } from '@/lib/moneyCycle/rollingForecast';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const cycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
    if (!cycle) {
      return NextResponse.json(null);
    }

    const now = new Date();
    const { remainingAmount } = await projectCycle(
      user.userId,
      { startingAmount: Number(cycle.startingAmount), startDate: cycle.startDate, endDate: cycle.endDate },
      now
    );

    const forecast = await computeRollingForecast(user.userId, { remainingAmount, cycleEndDate: cycle.endDate }, now);

    return NextResponse.json(forecast);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/cycles/active/rolling-forecast/route.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit (do NOT push)**

```bash
git add app/api/cycles/active/rolling-forecast/route.ts app/api/cycles/active/rolling-forecast/route.test.ts
git commit -m "feat: add GET /api/cycles/active/rolling-forecast route

Mirrors the existing category-breakdown route's null-when-no-cycle
convention exactly. Calls the existing projectCycle (unmodified) for the
live balance, then the new computeRollingForecast for the 90-day window."
```

---

### Task 6: Savings-goal API routes

**Files:**
- Create: `app/api/savings-goals/route.ts` (GET list with progress, POST create)
- Create: `app/api/savings-goals/[id]/contributions/route.ts` (POST contribute)
- Create: `app/api/savings-goals/[id]/route.ts` (DELETE)
- Test: three corresponding `.test.ts` files

**Interfaces:**
- Consumes: `addSavingsGoal`/`logSavingsContribution` (Task 3), `createSavingsGoalSchema` (Task 3). `deleteSavingsGoal` (Task 3) is NOT consumed here — the DELETE route below deletes directly via Prisma, scoped by `id`+`userId` (it has a real id from its URL; `deleteSavingsGoal` exists for the chat tool's own name-based lookup, which has no id available). `deleteSavingsGoal` has no caller in this plan yet — it stays in Task 3 as a complete, tested building block for a future chat "delete my X goal" tool, which is explicitly out of scope here.
- Produces: the routes Task 8's UI component calls.

- [ ] **Step 1: Write the failing tests**

Create `app/api/savings-goals/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/savingsGoals/actions', () => ({ addSavingsGoal: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { addSavingsGoal } from '@/lib/savingsGoals/actions';
import { GET, POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/savings-goals', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns goals with computed progress (sum of contributions / target), not a stored total', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.savingsGoal.findMany.mockResolvedValue([
      {
        id: 'goal_1', userId: 'user_1', name: 'Laptop fund', targetAmount: { toString: () => '1500.00' } as never,
        targetDate: new Date('2026-12-25T00:00:00.000Z'), createdAt: new Date(),
        contributions: [
          { id: 'c1', savingsGoalId: 'goal_1', amount: { toString: () => '50.00' } as never, date: new Date(), createdAt: new Date() },
          { id: 'c2', savingsGoalId: 'goal_1', amount: { toString: () => '30.00' } as never, date: new Date(), createdAt: new Date() },
        ],
      },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual([
      {
        id: 'goal_1', name: 'Laptop fund', targetAmount: 1500,
        targetDate: '2026-12-25T00:00:00.000Z', contributedAmount: 80,
      },
    ]);
  });
});

describe('POST /api/savings-goals', () => {
  it('creates a goal via the shared action', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addSavingsGoal).mockResolvedValue({ success: true, id: 'goal_1' } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals', {
        method: 'POST',
        body: JSON.stringify({ name: 'Laptop fund', targetAmount: 1500 }),
      })
    );

    expect(res.status).toBe(201);
    expect(addSavingsGoal).toHaveBeenCalledWith('user_1', expect.objectContaining({ name: 'Laptop fund', targetAmount: 1500 }));
  });

  it('returns 400 with the action error on failure', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addSavingsGoal).mockResolvedValue({ success: false, error: 'You already have a savings goal named "Laptop fund"' } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals', {
        method: 'POST',
        body: JSON.stringify({ name: 'Laptop fund', targetAmount: 1500 }),
      })
    );

    expect(res.status).toBe(400);
  });
});
```

This mirrors `app/api/bills/route.test.ts`'s exact confirmed pattern (`vi.mock` at module scope, `vi.mocked(addBill).mockResolvedValue(...)` per test) — not `vi.doMock`, which this codebase doesn't use for this kind of route-calls-action test.

Create `app/api/savings-goals/[id]/contributions/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/savingsGoals/actions', () => ({ logSavingsContribution: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { logSavingsContribution } from '@/lib/savingsGoals/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/savings-goals/[id]/contributions', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals/goal_1/contributions', { method: 'POST', body: JSON.stringify({ amount: 50, goalName: 'Laptop fund' }) }),
      { params: { id: 'goal_1' } }
    );
    expect(res.status).toBe(401);
  });

  it('logs a contribution via the shared action and returns 201', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(logSavingsContribution).mockResolvedValue({ success: true, id: 'contrib_1' } as never);

    const res = await POST(
      new NextRequest('http://localhost/api/savings-goals/goal_1/contributions', { method: 'POST', body: JSON.stringify({ amount: 50, goalName: 'Laptop fund' }) }),
      { params: { id: 'goal_1' } }
    );

    expect(res.status).toBe(201);
    expect(logSavingsContribution).toHaveBeenCalledWith('user_1', { goalName: 'Laptop fund', amount: 50 });
  });
});
```

Create `app/api/savings-goals/[id]/route.test.ts`. Note: unlike the other two new route files, this one does NOT call into `lib/savingsGoals/actions.ts` at all (see the implementation step below for why) — so this test mocks Prisma directly, the same way `app/api/cycles/active/route.test.ts` and other direct-Prisma routes in this codebase already do, not an action module:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/realtime/publish', () => ({ publishCycleUpdate: vi.fn().mockResolvedValue(undefined) }));

import { getCurrentUser } from '@/lib/auth/session';
import { DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('DELETE /api/savings-goals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost/api/savings-goals/goal_1', { method: 'DELETE' }), { params: { id: 'goal_1' } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when no goal with that id is owned by this user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.savingsGoal.findFirst.mockResolvedValue(null);

    const res = await DELETE(new NextRequest('http://localhost/api/savings-goals/goal_1', { method: 'DELETE' }), { params: { id: 'goal_1' } });

    expect(res.status).toBe(404);
    expect(prismaMock.savingsGoal.delete).not.toHaveBeenCalled();
  });

  it('deletes the goal directly via Prisma, scoped by id AND userId (not via the name-based deleteSavingsGoal action)', async () => {
    // This route intentionally does NOT call deleteSavingsGoal (Task 3) -- that action resolves a
    // goal by NAME, matching the chat tool's own lookup convention, since chat only ever has a name
    // from the conversation. This REST route gets a real id from its own URL, so it looks the goal
    // up by id+userId directly (ownership check) and deletes by id -- a deliberate divergence, not
    // an inconsistency to unify.
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.savingsGoal.findFirst.mockResolvedValue({ id: 'goal_1', userId: 'user_1', name: 'Laptop fund' } as never);
    prismaMock.savingsGoal.delete.mockResolvedValue({ id: 'goal_1' } as never);

    const res = await DELETE(new NextRequest('http://localhost/api/savings-goals/goal_1', { method: 'DELETE' }), { params: { id: 'goal_1' } });

    expect(res.status).toBe(204);
    expect(prismaMock.savingsGoal.findFirst).toHaveBeenCalledWith({ where: { id: 'goal_1', userId: 'user_1' } });
    expect(prismaMock.savingsGoal.delete).toHaveBeenCalledWith({ where: { id: 'goal_1' } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/savings-goals/`
Expected: FAIL — none of the three route files exist yet.

- [ ] **Step 3: Write the implementations**

Create `app/api/savings-goals/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createSavingsGoalSchema } from '@/lib/validation/savingsGoal.schema';
import { addSavingsGoal } from '@/lib/savingsGoals/actions';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const goals = await prisma.savingsGoal.findMany({
      where: { userId: user.userId },
      include: { contributions: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(
      goals.map((g) => ({
        id: g.id,
        name: g.name,
        targetAmount: Number(g.targetAmount),
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        // Always computed on read from real contribution rows -- never a stored running total.
        contributedAmount: g.contributions.reduce((sum, c) => sum + Number(c.amount), 0),
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const parsed = createSavingsGoalSchema.parse(body);

    const result = await addSavingsGoal(user.userId, {
      name: parsed.name,
      targetAmount: parsed.targetAmount,
      targetDate: parsed.targetDate ? new Date(parsed.targetDate) : undefined,
    });

    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

Create `app/api/savings-goals/[id]/contributions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { logSavingsContribution } from '@/lib/savingsGoals/actions';

const contributionSchema = z.object({ goalName: z.string().min(1), amount: z.number().positive() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { goalName, amount } = contributionSchema.parse(await request.json());
    void params; // the form already knows the goal's name; the :id in the URL is for REST shape only

    const result = await logSavingsContribution(user.userId, { goalName, amount });
    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

Create `app/api/savings-goals/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { publishCycleUpdate } from '@/lib/realtime/publish';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    // Scoped by userId, not just id, so one user can never delete another's goal by guessing an id.
    const goal = await prisma.savingsGoal.findFirst({ where: { id: params.id, userId: user.userId } });
    if (!goal) {
      throw new AppError(404, 'Savings goal not found');
    }

    await prisma.savingsGoal.delete({ where: { id: goal.id } });
    await publishCycleUpdate(user.userId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

Note: this route deletes directly via Prisma (scoped by `id` + `userId`) rather than calling `deleteSavingsGoal` from Task 3 (which resolves by NAME, matching the chat tool's own lookup convention) — the two delete paths intentionally use different lookup keys because they arrive with different information (the chat tool only ever has a name from the conversation; this REST route gets a real id from its own URL). This is a deliberate, not-accidental, divergence — call it out in the task report so the reviewer doesn't flag it as an inconsistency to unify.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/savings-goals/`
Expected: PASS, all tests across the three files.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit (do NOT push)**

```bash
git add app/api/savings-goals/
git commit -m "feat: add savings-goal REST routes (list, create, contribute, delete)

GET computes contributedAmount on read from real contribution rows, never
a stored total. Delete is scoped by userId+id directly (not via the
name-based deleteSavingsGoal action, which exists for the chat tool's own
different lookup key) -- confirmed deliberate, not an inconsistency."
```

---

### Task 7: "Looking ahead" rolling-forecast UI on `/cashflow`

**Files:**
- Create: `components/charts/RollingForecastChart.tsx`
- Test: `components/charts/RollingForecastChart.test.tsx`
- Modify: `app/cashflow/page.tsx` (add the new component as a sibling to `<CashFlowClient>` — zero changes to `CashFlowClient.tsx` itself)

**Interfaces:**
- Consumes: `GET /api/cycles/active/rolling-forecast` (Task 5).
- Produces: nothing consumed by later tasks — this is a leaf UI component.

- [ ] **Step 1: Read `components/charts/CashFlowTrajectoryChart.tsx` in full as the visual-style reference**

(Already read during plan-writing — re-read it fresh before implementing, since it's the exact visual/structural pattern to mirror: self-fetching via `useEffect`, the same `GlassPanel`/chart-library styling, the same `sr-only` accessible-summary convention.)

- [ ] **Step 2: Write the failing test**

Create `components/charts/RollingForecastChart.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RollingForecastChart } from './RollingForecastChart';

describe('RollingForecastChart', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders nothing while loading, nothing on no active cycle', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => null } as Response);
    const { container } = render(<RollingForecastChart />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders the heads-up list when the forecast includes one', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        trajectory: [{ date: '2026-10-10T00:00:00.000Z', balance: 100, events: [] }],
        headsUp: [{ name: 'Car registration', amount: 450, dueDate: '2026-11-15T00:00:00.000Z' }],
      }),
    } as Response);

    render(<RollingForecastChart />);

    await waitFor(() => expect(screen.getByText(/Car registration/)).toBeInTheDocument());
    expect(screen.getByText(/\$450\.00/)).toBeInTheDocument();
  });

  it('renders no heads-up section when the list is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ trajectory: [{ date: '2026-10-10T00:00:00.000Z', balance: 100, events: [] }], headsUp: [] }),
    } as Response);

    render(<RollingForecastChart />);

    await waitFor(() => expect(screen.getByText('Looking ahead')).toBeInTheDocument());
    expect(screen.queryByText(/heads up/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/charts/RollingForecastChart.test.tsx`
Expected: FAIL — the component doesn't exist yet.

- [ ] **Step 4: Write the implementation**

Create `components/charts/RollingForecastChart.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { formatCurrency } from '@/lib/utils/currency';

interface ForecastDay {
  date: string;
  balance: number;
  events: { label: string; amount: number }[];
}

interface HeadsUpItem {
  name: string;
  amount: number;
  dueDate: string;
}

interface RollingForecastResponse {
  trajectory: ForecastDay[];
  headsUp: HeadsUpItem[];
}

/**
 * Self-fetching, matching CashFlowTrajectoryChart's existing pattern exactly, but reading from the
 * new rolling-forecast endpoint instead of /api/cycles/active -- a genuinely different window (90
 * days from today, not bounded by the cycle's own end date), so this is a new, separate component
 * rather than a prop added to the existing cycle-bound chart.
 */
export function RollingForecastChart() {
  const [data, setData] = useState<RollingForecastResponse | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/cycles/active/rolling-forecast')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setData(null);
          return;
        }
        setData(await res.json());
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === undefined || data === null) {
    return null;
  }

  const chartData = data.trajectory.map((day) => ({ date: day.date, balance: day.balance }));

  return (
    <GlassPanel elevation={1} hoverable data-testid="rolling-forecast-chart">
      <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Looking ahead</h2>
      <p className="sr-only">
        Projected balance over the next 90 days, from {formatCurrency(data.trajectory[0]?.balance ?? 0)} to{' '}
        {formatCurrency(data.trajectory[data.trajectory.length - 1]?.balance ?? 0)}.
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.35)" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
            contentStyle={{ backgroundColor: '#13111f', borderColor: 'rgba(139,92,246,0.35)', borderRadius: '0.75rem' }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
          <Area type="monotone" dataKey="balance" stroke="rgb(96,165,250)" strokeWidth={2} fill="rgb(96,165,250)" fillOpacity={0.15} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      {data.headsUp.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-foreground">Coming up after your current cycle ends:</p>
          <ul className="flex flex-col gap-1">
            {data.headsUp.map((item) => (
              <li key={item.name} className="flex items-center justify-between text-sm text-muted">
                <span>{item.name}</span>
                <span className="font-mono">
                  {formatCurrency(item.amount)} · {new Date(item.dueDate).toLocaleDateString('en-AU')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassPanel>
  );
}
```

In `app/cashflow/page.tsx`, add the import `import { RollingForecastChart } from '@/components/charts/RollingForecastChart';` and render `<RollingForecastChart />` as a new sibling, directly below the existing `<GlassPanel elevation={1}><CashFlowClient ... /></GlassPanel>` block — do not nest it inside that `GlassPanel`, since `RollingForecastChart` already wraps itself in its own `GlassPanel`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/charts/RollingForecastChart.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green — `CashFlowClient.test.tsx` untouched and passing (confirming zero changes to that file took effect).

- [ ] **Step 7: Commit (do NOT push)**

```bash
git add components/charts/RollingForecastChart.tsx components/charts/RollingForecastChart.test.tsx app/cashflow/page.tsx
git commit -m "feat: add 'Looking ahead' rolling-forecast chart to /cashflow

New, self-fetching, self-contained component -- zero changes to
CashFlowClient.tsx. Renders a heads-up list for one-time bills the
cycle's own projection can't show."
```

---

### Task 8: "Savings goals" UI on `/cashflow`

**Files:**
- Create: `components/savingsGoals/SavingsGoalsPanel.tsx`
- Create: `components/savingsGoals/SavingsGoalForm.tsx`
- Test: `components/savingsGoals/SavingsGoalsPanel.test.tsx`
- Modify: `app/cashflow/page.tsx` (add the new panel as another sibling)

**Interfaces:**
- Consumes: `GET/POST /api/savings-goals`, `POST /api/savings-goals/[id]/contributions`, `DELETE /api/savings-goals/[id]` (Task 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `components/savingsGoals/SavingsGoalsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SavingsGoalsPanel } from './SavingsGoalsPanel';

describe('SavingsGoalsPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows an empty state when there are no goals yet', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<SavingsGoalsPanel />);
    await waitFor(() => expect(screen.getByText(/no savings goals yet/i)).toBeInTheDocument());
  });

  it('renders a goal with its progress toward the target', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'goal_1', name: 'Laptop fund', targetAmount: 1500, targetDate: null, contributedAmount: 50 },
      ],
    } as Response);

    render(<SavingsGoalsPanel />);

    await waitFor(() => expect(screen.getByText('Laptop fund')).toBeInTheDocument());
    expect(screen.getByText(/\$50\.00.*\$1,500\.00|\$1,500\.00.*\$50\.00/)).toBeInTheDocument();
  });

  it('logs a contribution and refetches the goal list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'goal_1', name: 'Laptop fund', targetAmount: 1500, targetDate: null, contributedAmount: 50 }] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'contrib_1' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'goal_1', name: 'Laptop fund', targetAmount: 1500, targetDate: null, contributedAmount: 100 }] } as Response);

    render(<SavingsGoalsPanel />);
    await waitFor(() => expect(screen.getByText('Laptop fund')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add contribution/i }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/savings-goals/goal_1/contributions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ goalName: 'Laptop fund', amount: 50 }) })
    ));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/savingsGoals/SavingsGoalsPanel.test.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Write the implementations**

Create `components/savingsGoals/SavingsGoalForm.tsx`:

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export interface CreateSavingsGoalInput {
  name: string;
  targetAmount: number;
  targetDate?: string;
}

export function SavingsGoalForm({ onSubmit }: { onSubmit: (data: CreateSavingsGoalInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputClasses =
    'rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name,
      targetAmount: Number(targetAmount),
      targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Goal name
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Target amount
        <input type="number" step="0.01" min="0.01" required value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className={inputClasses} />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Target date (optional)
        <DateField ariaLabel="Target date" value={targetDate} onChange={setTargetDate} className={`${inputClasses} w-full`} />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add goal'}
      </Button>
    </form>
  );
}
```

Create `components/savingsGoals/SavingsGoalsPanel.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils/currency';
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';
import { SavingsGoalForm, CreateSavingsGoalInput } from './SavingsGoalForm';

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  contributedAmount: number;
}

export function SavingsGoalsPanel() {
  const [goals, setGoals] = useState<SavingsGoal[] | undefined>(undefined);
  const [showAddForm, setShowAddForm] = useState(false);
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');

  const refetch = useCallback(() => {
    fetch('/api/savings-goals')
      .then(async (res) => {
        if (!res.ok) return;
        setGoals(await res.json());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useRealtimeCycleUpdates(refetch);

  async function handleCreateGoal(data: CreateSavingsGoalInput) {
    const res = await fetch('/api/savings-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowAddForm(false);
      refetch();
    }
  }

  async function handleContribute(goal: SavingsGoal) {
    const amount = Number(contributionAmount);
    const res = await fetch(`/api/savings-goals/${goal.id}/contributions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalName: goal.name, amount }),
    });
    if (res.ok) {
      setContributingId(null);
      setContributionAmount('');
      refetch();
    }
  }

  if (goals === undefined) {
    return null;
  }

  return (
    <GlassPanel elevation={1}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-foreground">Savings goals</h2>
        <Button variant="secondary" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancel' : 'Add goal'}
        </Button>
      </div>

      {showAddForm && (
        <div className="mb-4">
          <SavingsGoalForm onSubmit={handleCreateGoal} />
        </div>
      )}

      {goals.length === 0 ? (
        <p className="text-sm text-muted">No savings goals yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => {
            const percent = Math.min((goal.contributedAmount / goal.targetAmount) * 100, 100);
            return (
              <li key={goal.id} className="rounded-xl border border-border bg-white/[0.03] px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{goal.name}</span>
                  <span className="font-mono text-muted">
                    {formatCurrency(goal.contributedAmount)} / {formatCurrency(goal.targetAmount)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-success transition-all duration-300" style={{ width: `${percent}%` }} />
                </div>
                {contributingId === goal.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="flex-1 text-sm text-foreground">
                      Amount
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={contributionAmount}
                        onChange={(e) => setContributionAmount(e.target.value)}
                        className="ml-2 w-24 rounded-lg border border-border bg-card px-2 py-1 text-sm"
                      />
                    </label>
                    <Button onClick={() => handleContribute(goal)}>Save</Button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => setContributingId(goal.id)} className="mt-2">
                    Add contribution
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
```

Check this codebase's `Button`/`GlassPanel` components' exact exported prop names (`variant`, `className`, etc.) before finalizing — match whatever they actually accept (already confirmed `Button` has a `variant="secondary"` option from `CashFlowClient.tsx`'s existing usage; confirm `className` is accepted on `Button` too, or drop it from the "Add contribution" button if not).

In `app/cashflow/page.tsx`, add the import `import { SavingsGoalsPanel } from '@/components/savingsGoals/SavingsGoalsPanel';` and render `<SavingsGoalsPanel />` as a third sibling, below `<RollingForecastChart />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/savingsGoals/SavingsGoalsPanel.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit (do NOT push)**

```bash
git add components/savingsGoals/ app/cashflow/page.tsx
git commit -m "feat: add Savings goals panel to /cashflow

New, self-fetching, self-contained components -- create-goal form and
per-goal contribution logging, matching IncomeSourceForm/BillForm's
existing inline-form conventions. Zero changes to CashFlowClient.tsx."
```

---

### Task 9: e2e extension + whole-feature live verification

**Files:**
- Modify: `e2e/accessibility.spec.ts` (extend `/cashflow`'s existing coverage for the two new sections)

**Interfaces:**
- Consumes: nothing new — this task only verifies Tasks 1-8's work.

- [ ] **Step 1: Extend the existing `/cashflow` accessibility coverage**

Read the current `/cashflow`-related tests in `e2e/accessibility.spec.ts` in full. Add ONE new test (don't duplicate the existing plain "no violations" scan) that exercises the two new sections together:

```ts
test('cashflow page with a savings goal and a rolling forecast has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-savings-rolling');
  await page.goto('/dashboard');
  await page.getByLabel(/how much do you have/i).fill('500');
  await page.getByLabel('Until when', { exact: true }).fill('2026-10-20');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

  await page.goto('/cashflow');
  await page.getByRole('button', { name: /add goal/i }).click();
  await page.getByLabel(/goal name/i).fill('Laptop fund');
  await page.getByLabel(/target amount/i).fill('1500');
  await page.getByRole('button', { name: /^add goal$/i }).click();

  await expect(page.getByText('Laptop fund')).toBeVisible();
  await expect(page.getByText('Looking ahead')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 2: Run the full e2e suite directly in the foreground** (not backgrounded — run it and read its real output in the same call)

Run: `set -a && source .env && set +a && npx playwright test`
Expected: all green, including the new test. If anything fails on a timeout, re-run that specific test in isolation at least twice before concluding it's a real regression vs. this project's documented Neon-latency flakiness — do not dismiss a NEW failure as flaky without that check.

- [ ] **Step 3: Live verification against the throwaway test account**

Using `nalinijarugula@gmail.com` / `Pravs@1112` (never any other account), start a local dev server or production build, and confirm/report the ACTUAL, SPECIFIC observed result for each:
1. Via the Money Coach chat, say something like "I want to save $200 for a gift by next month" — confirm a real `SavingsGoal` row was created (check via the `/cashflow` page's new Savings goals panel, or via a direct Prisma query) and the Coach's reply acknowledges it in plain language.
2. Via chat, say "I put $20 towards my gift fund" — confirm a real `SavingsContribution` row was created and the goal's displayed progress bar updates to reflect it.
3. Add a real one-time bill via the existing Bills UI with a due date AFTER your current active cycle's own end date but within 90 days — confirm it shows up in the new "Looking ahead" section's heads-up list, with the correct amount and date.
4. Confirm the "Looking ahead" chart itself renders a sensible trajectory extending further than the existing cycle-bound "Balance trajectory" chart does.
5. Clean up: delete the probe bill/goal/contributions created during this verification so they don't pollute the test account's real history for future verification sessions on this same account.

Report the exact real numbers/names observed for all four checks — not assumptions.

- [ ] **Step 4: Final check and commit (do NOT push)**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

```bash
git add e2e/accessibility.spec.ts
git commit -m "test: extend e2e coverage for savings goals + rolling forecast

Live-verified the full chat-driven goal/contribution flow and the
heads-up bill flag against the throwaway test account."
```
