# Income, Bills & Cash-Flow Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Money Cycle's flat "starting amount / days remaining" average with a real day-by-day cash-flow projection driven by modeled income sources and scheduled bills, so a bill landing before a paycheck clears is correctly identified as the actual spending constraint — not averaged away.

**Architecture:** Two new Prisma models (`IncomeSource`/`IncomeEntry` for money coming in, `Bill` for money owed on a specific date) feed a new pure projection function that walks forward day-by-day and finds the lowest point in the "obligated-only" balance trajectory. That function replaces the flat-average `computeSafeToSpend` call inside `GET /api/cycles/active`. Chat gets four new tools (mirroring Spec 3's exact security model), and two new pages present manual management (income sources + bills) and the day-by-day list view.

**Tech Stack:** Next.js 14 App Router, Prisma + Neon Postgres, Gemini function-calling, Zod, Vitest + Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-09-27-income-bills-cashflow-design.md`

## Global Constraints

- Three new Prisma things: `IncomeSourceType` enum (`FIXED`, `IRREGULAR`), `IncomeSource` model, `IncomeEntry` model, `Bill` model — exact fields in Task 1.
- The projection algorithm (spec Part 2) is a pure function, no DB/HTTP — the highest-value, highest-risk piece of this plan. It must find the lowest point in the day-by-day trajectory, not average.
- Existing recurring `Expense` rows (`isRecurring: true`) keep working as future obligations in the projection alongside new `Bill` rows — no migration, no deprecation of the old mechanism.
- Every new chat tool handler resolves the caller's own data server-side via `getCurrentUser()` — never receives or trusts an AI-supplied user/entity ID. This is the exact security model already proven in `lib/moneyCycle/actions.ts` (Spec 3): a handler takes `userId` as a normal parameter and looks up its own target row by `{userId, ...}`, never by a client- or AI-supplied ID.
- `markBillPaid` must be idempotent against being called twice for the same due occurrence — calling it again before the (now-advanced) next due date arrives returns a failure, not a duplicate `Expense`.
- The chat route (`app/api/cycles/chat/route.ts`) requires an `ACTIVE` `MoneyCycle` to exist before accepting any message at all — this plan does not change that gate. The four new chat tools are therefore only reachable while a cycle is active; the manual forms (Task 7) work regardless of whether a cycle exists.
- `GET /api/cycles/active`'s response gains a `projection: { date: string; balance: number; events: { label: string; amount: number }[] }[]` array (one entry per day from today to the cycle's end date); `safeToSpend` is now sourced from the projection algorithm instead of the flat average.
- The projection view uses a vertical list (validated with the user via mockup during brainstorming) — no calendar grid, no chart.
- axe-core WCAG 2.1 AA coverage required for every new page, matching every existing page in this app.
- Work happens directly on `main`, no worktree/feature branch. Push after every task.
- If a task's live-Gemini verification step hits a free-tier rate or daily-quota limit, do not guess or block indefinitely — proceed using the exact, already-proven request/response shapes documented in `lib/ai/chat.ts` (Turn 1's `functionCall` shape, Turn 2's `role: 'user'` requirement for relaying a `functionResponse` — both live-verified during Spec 3) and flag the limitation clearly in the task report, same as Spec 3's Task 3/Task 8 precedent.
- Every subagent's report is independently re-verified by the controller (diff review, real test re-runs, real push-sync checks) before being trusted — this project's established, non-negotiable discipline.

---

### Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new migration directory under `prisma/migrations/`

**Interfaces:**
- Produces: `IncomeSourceType` enum, `IncomeSource`, `IncomeEntry`, `Bill` models — every later task's Prisma calls and generated types rely on these existing.

- [ ] **Step 1: Read the current schema fresh, then add the new enum and three models**

Read `prisma/schema.prisma` in full first — confirm the exact current state of `RecurrenceInterval`, `Expense`, `Category`, and `User` before editing (this plan was written against a known-good state, but always verify before writing an exact diff).

Add this enum near the existing `RecurrenceInterval`/`CycleStatus`/`MessageKind` enums:

```prisma
enum IncomeSourceType {
  FIXED
  IRREGULAR
}
```

Add these three models (after `PushSubscription` or wherever the file's existing convention places new models):

```prisma
model IncomeSource {
  id                 String              @id @default(cuid())
  userId             String
  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  name               String
  type               IncomeSourceType
  amount             Decimal?            @db.Decimal(10, 2)
  recurrenceInterval RecurrenceInterval?
  startDate          DateTime
  createdAt          DateTime            @default(now())
  entries            IncomeEntry[]

  @@unique([userId, name])
}

model IncomeEntry {
  id             String       @id @default(cuid())
  incomeSourceId String
  incomeSource   IncomeSource @relation(fields: [incomeSourceId], references: [id], onDelete: Cascade)
  amount         Decimal      @db.Decimal(10, 2)
  date           DateTime
  createdAt      DateTime     @default(now())

  @@index([incomeSourceId, date])
}

model Bill {
  id                 String              @id @default(cuid())
  userId             String
  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  name               String
  amount             Decimal             @db.Decimal(10, 2)
  dueDate            DateTime
  recurrenceInterval RecurrenceInterval?
  categoryId         String?
  category           Category?           @relation(fields: [categoryId], references: [id])
  paidExpenseId      String?             @unique
  paidExpense        Expense?            @relation(fields: [paidExpenseId], references: [id], onDelete: SetNull)
  createdAt          DateTime            @default(now())

  @@unique([userId, name])
  @@index([userId, dueDate])
}
```

Add the reverse relations the above requires — `User` needs `incomeSources IncomeSource[]` and `bills Bill[]`; `Category` needs `bills Bill[]`; `Expense` needs `bill Bill?` (the implicit back-relation for `paidExpenseId`'s one-to-one). Read the current `User`/`Category`/`Expense` models first to place these consistently with their existing relation-field ordering.

**Design notes to carry into later tasks (not schema, just context):**
- `categoryId` is optional on `Bill` — the manual UI (Task 7) lets a user pick a real category; the chat tool `add_bill` (Task 6) does not require one, since an AI has no way to know a user's category IDs. `markBillPaid` (Task 4) resolves a category at payment time: `bill.categoryId ?? <find-or-create a "Bills" category for this user>`.
- `Bill.dueDate` always represents *the next unpaid occurrence*. For a recurring bill, marking it paid advances `dueDate` to the next occurrence (Task 4) rather than storing a separate row per occurrence — this is also what makes `markBillPaid` naturally idempotent (see Task 4).

- [ ] **Step 2: Generate and apply the migration against the real Neon database**

Run: `cd /Users/saichetankari/Downloads/budget-buddy && npx prisma migrate dev --name add_income_bills_models`

This is the real, shared Neon database (local dev and production both point at it) — confirm success with `npx prisma migrate status` (expected: "Database schema is up to date!").

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: 225/225 Vitest tests pass (this task only adds new models/enum nothing yet references — nothing should break), typecheck clean, lint clean.

- [ ] **Step 4: Commit and push**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add IncomeSource, IncomeEntry, and Bill models"
git push
```

---

### Task 2: Cash-flow projection algorithm (pure function, no DB)

**Files:**
- Create: `lib/utils/cashFlowProjection.ts`
- Create: `lib/utils/cashFlowProjection.test.ts`

**Interfaces:**
- Consumes: `computeMissingOccurrences` from `lib/utils/recurringOccurrences.ts` (unchanged — it's already a pure, generic function taking `(interval, sourceDate, lastDate, today)`; no generalization needed, it was never coupled to `Expense`).
- Produces: `computeCashFlowProjection(input): ProjectionResult` — the exact shape below. Task 5 (wiring into `GET /api/cycles/active`) and Task 6 (chat tool results) both call this directly.

This is the highest-value, highest-risk task in this plan. Treat it as its own dedicated task — do not batch it with anything else.

- [ ] **Step 1: Write the failing tests covering every required scenario**

Create `lib/utils/cashFlowProjection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCashFlowProjection } from './cashFlowProjection';

const DAY = 24 * 60 * 60 * 1000;

describe('computeCashFlowProjection', () => {
  it('finds no dip when a fixed paycheck lands before a bill is due', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-10-03T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 100,
      today,
      endDate,
      fixedIncomeOccurrences: [{ date: new Date('2026-09-26T00:00:00.000Z'), amount: 400, label: 'Job' }],
      billOccurrences: [{ date: new Date('2026-09-30T00:00:00.000Z'), amount: 300, label: 'Rent' }],
    });

    expect(result.minFutureBalance).toBe(200); // 100 + 400 - 300
    expect(result.isShortfall).toBe(false);
    expect(result.trajectory.find((d) => d.date.getTime() === new Date('2026-09-30T00:00:00.000Z').getTime())!.balance).toBe(200);
  });

  it('finds the real dip when a bill lands before the fixed income that would cover it (the motivating scenario)', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-10-05T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 100,
      today,
      endDate,
      fixedIncomeOccurrences: [{ date: new Date('2026-09-29T00:00:00.000Z'), amount: 400, label: 'Job' }],
      billOccurrences: [{ date: new Date('2026-09-30T00:00:00.000Z'), amount: 735, label: 'Rent + Subscription' }],
    });

    // Sep 29: 100 + 400 = 500. Sep 30: 500 - 735 = -235.
    expect(result.minFutureBalance).toBe(-235);
    expect(result.isShortfall).toBe(true);
  });

  it('ignores irregular income for future days but counts a logged actual entry on its real date', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-27T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 50,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [],
      // An irregular source's future occurrence contributes nothing — it simply isn't passed in
      // as a fixedIncomeOccurrence at all (the caller is responsible for that filtering; this
      // function only ever sees confirmed, known amounts). A logged actual entry for TODAY is
      // folded into currentBalance by the caller before this function runs, so the trajectory
      // itself has nothing irregular-specific to special-case — this test documents that
      // omitting an irregular source from the inputs is sufficient, not a separate code path.
    });

    expect(result.trajectory.every((d) => d.balance === 50)).toBe(true);
  });

  it('produces multiple occurrences for a recurring bill within the window', () => {
    const today = new Date('2026-09-01T00:00:00.000Z');
    const endDate = new Date('2026-09-20T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 1000,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [
        { date: new Date('2026-09-08T00:00:00.000Z'), amount: 50, label: 'Weekly bill' },
        { date: new Date('2026-09-15T00:00:00.000Z'), amount: 50, label: 'Weekly bill' },
      ],
    });

    expect(result.minFutureBalance).toBe(900); // 1000 - 50 - 50
  });

  it('reports a shortfall day even when it falls on the cycle end date itself (boundary)', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-26T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 10,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: new Date('2026-09-26T00:00:00.000Z'), amount: 20, label: 'Last-day bill' }],
    });

    expect(result.minFutureBalance).toBe(-10);
    expect(result.isShortfall).toBe(true);
    expect(result.trajectory[result.trajectory.length - 1].balance).toBe(-10);
  });

  it('floors the safe-to-spend day count at 1 when the lowest point is today', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-30T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 100,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: today, amount: 40, label: 'Due today' }],
    });

    // minFutureBalance = 60, occurring on day 0 (today) — dividing by a floored day count of 1
    // must not throw or divide by zero, and must yield the full 60 for today specifically.
    expect(result.minFutureBalance).toBe(60);
    expect(result.safeToSpendPerDay).toBe(60);
  });

  it('clamps safe-to-spend to 0 on a shortfall rather than returning a negative daily figure', () => {
    const today = new Date('2026-09-24T00:00:00.000Z');
    const endDate = new Date('2026-09-30T00:00:00.000Z');
    const result = computeCashFlowProjection({
      currentBalance: 10,
      today,
      endDate,
      fixedIncomeOccurrences: [],
      billOccurrences: [{ date: new Date('2026-09-25T00:00:00.000Z'), amount: 50, label: 'Bill' }],
    });

    expect(result.isShortfall).toBe(true);
    expect(result.safeToSpendPerDay).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/utils/cashFlowProjection.test.ts`
Expected: FAIL — `./cashFlowProjection` does not exist yet.

- [ ] **Step 3: Implement `lib/utils/cashFlowProjection.ts`**

```ts
export interface ProjectionEvent {
  date: Date;
  amount: number;
  label: string;
}

export interface ProjectionDay {
  date: Date;
  balance: number;
  events: { label: string; amount: number }[];
}

export interface ProjectionResult {
  trajectory: ProjectionDay[];
  minFutureBalance: number;
  minFutureBalanceDate: Date;
  isShortfall: boolean;
  safeToSpendPerDay: number;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / msPerDay);
}

export function computeCashFlowProjection(input: {
  currentBalance: number;
  today: Date;
  endDate: Date;
  fixedIncomeOccurrences: ProjectionEvent[];
  billOccurrences: ProjectionEvent[];
}): ProjectionResult {
  const today = startOfDay(input.today);
  const endDate = startOfDay(input.endDate);
  const totalDays = Math.max(daysBetween(today, endDate), 0);

  const eventsByDay = new Map<number, { label: string; amount: number }[]>();
  const addEvent = (event: ProjectionEvent, sign: 1 | -1) => {
    const dayOffset = daysBetween(today, startOfDay(event.date));
    if (dayOffset < 0 || dayOffset > totalDays) return;
    const existing = eventsByDay.get(dayOffset) ?? [];
    existing.push({ label: event.label, amount: sign * event.amount });
    eventsByDay.set(dayOffset, existing);
  };
  input.fixedIncomeOccurrences.forEach((e) => addEvent(e, 1));
  input.billOccurrences.forEach((e) => addEvent(e, -1));

  const trajectory: ProjectionDay[] = [];
  let runningBalance = input.currentBalance;
  let minFutureBalance = input.currentBalance;
  let minFutureBalanceDate = today;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset++) {
    const dayEvents = eventsByDay.get(dayOffset) ?? [];
    for (const event of dayEvents) {
      runningBalance += event.amount;
    }
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    trajectory.push({ date, balance: runningBalance, events: dayEvents });

    if (runningBalance < minFutureBalance) {
      minFutureBalance = runningBalance;
      minFutureBalanceDate = date;
    }
  }

  const isShortfall = minFutureBalance < 0;
  const daysUntilMin = Math.max(daysBetween(today, minFutureBalanceDate), 1);
  const safeToSpendPerDay = isShortfall ? 0 : minFutureBalance / daysUntilMin;

  return { trajectory, minFutureBalance, minFutureBalanceDate, isShortfall, safeToSpendPerDay };
}
```

Also add a thin `Bill`-occurrence wrapper next to `computeCommittedSpend` in `lib/utils/moneyCycle.ts` — read that file fresh first, then add:

```ts
export function computeBillOccurrences(
  templates: { amount: number; recurrenceInterval: RecurrenceInterval; date: Date; label: string }[],
  windowStart: Date,
  windowEnd: Date
): { date: Date; amount: number; label: string }[] {
  return templates.flatMap((template) =>
    computeMissingOccurrences(template.recurrenceInterval, template.date, windowStart, windowEnd).map((date) => ({
      date,
      amount: template.amount,
      label: template.label,
    }))
  );
}
```

This mirrors `computeCommittedSpend`'s exact pattern but returns dated occurrences (needed for the day-by-day projection) instead of a single summed total — `computeCommittedSpend` itself is unchanged and still used wherever only a total is needed (e.g. `lib/moneyCycle/actions.ts`, unaffected by this plan).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/utils/cashFlowProjection.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 6: Commit and push**

```bash
git add lib/utils/cashFlowProjection.ts lib/utils/cashFlowProjection.test.ts lib/utils/moneyCycle.ts
git commit -m "feat: add day-by-day cash-flow projection algorithm"
git push
```

---

### Task 3: Income sources and entries (shared actions + REST routes)

**Files:**
- Create: `lib/income/actions.ts`
- Create: `lib/income/actions.test.ts`
- Create: `app/api/income-sources/route.ts` (POST create, GET list)
- Create: `app/api/income-sources/route.test.ts`
- Create: `app/api/income-sources/[id]/entries/route.ts` (POST log an actual entry)
- Create: `app/api/income-sources/[id]/entries/route.test.ts`
- Create: `lib/validation/incomeSource.schema.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`), `getCurrentUser` (`lib/auth/session.ts`), `AppError`/`handleRouteError`.
- Produces: `addIncomeSource(userId: string, input: {name, type, amount?, recurrenceInterval?, startDate}): Promise<ActionResult<{id: string}>>` and `logIncomeEntry(userId: string, input: {sourceName: string, amount: number, date?: Date}): Promise<ActionResult<{id: string}>>` from `lib/income/actions.ts` — Task 6's chat tools call these directly with the exact same signatures. `ActionResult<T> = ({success:true} & T) | {success:false, error:string}` (same shape as `lib/moneyCycle/actions.ts`).

- [ ] **Step 1: Write `lib/validation/incomeSource.schema.ts`**

```ts
import { z } from 'zod';

export const createIncomeSourceSchema = z
  .object({
    name: z.string().min(1).max(100),
    type: z.enum(['FIXED', 'IRREGULAR']),
    amount: z.number().positive().optional(),
    recurrenceInterval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
    startDate: z.string().datetime(),
  })
  .refine((data) => data.type === 'IRREGULAR' || (data.amount !== undefined && data.recurrenceInterval !== undefined), {
    message: 'FIXED income sources require an amount and a recurrence interval',
  });

export type CreateIncomeSourceInput = z.infer<typeof createIncomeSourceSchema>;
```

- [ ] **Step 2: Write the failing tests for the shared action module**

Create `lib/income/actions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { addIncomeSource, logIncomeEntry } from './actions';

describe('addIncomeSource', () => {
  it('creates a FIXED source with amount and recurrence', async () => {
    prismaMock.incomeSource.create.mockResolvedValue({ id: 'inc_1' } as never);

    const result = await addIncomeSource('user_1', {
      name: 'Casual job',
      type: 'FIXED',
      amount: 151.2,
      recurrenceInterval: 'WEEKLY',
      startDate: new Date('2026-09-29T00:00:00.000Z'),
    });

    expect(result).toEqual({ success: true, id: 'inc_1' });
    expect(prismaMock.incomeSource.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Casual job',
        type: 'FIXED',
        amount: 151.2,
        recurrenceInterval: 'WEEKLY',
        startDate: new Date('2026-09-29T00:00:00.000Z'),
      },
    });
  });

  it('creates an IRREGULAR source with no amount/recurrence', async () => {
    prismaMock.incomeSource.create.mockResolvedValue({ id: 'inc_2' } as never);

    const result = await addIncomeSource('user_1', {
      name: 'Uber',
      type: 'IRREGULAR',
      startDate: new Date('2026-09-24T00:00:00.000Z'),
    });

    expect(result).toEqual({ success: true, id: 'inc_2' });
    expect(prismaMock.incomeSource.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Uber',
        type: 'IRREGULAR',
        amount: undefined,
        recurrenceInterval: undefined,
        startDate: new Date('2026-09-24T00:00:00.000Z'),
      },
    });
  });

  it('returns a failure result on a duplicate name for this user', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaMock.incomeSource.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '5.0.0' })
    );

    const result = await addIncomeSource('user_1', {
      name: 'Uber',
      type: 'IRREGULAR',
      startDate: new Date(),
    });

    expect(result).toEqual({ success: false, error: 'You already have an income source named "Uber"' });
  });
});

describe('logIncomeEntry', () => {
  it('logs an entry against an existing source by name', async () => {
    prismaMock.incomeSource.findFirst.mockResolvedValue({ id: 'inc_1', userId: 'user_1', name: 'Uber' } as never);
    prismaMock.incomeEntry.create.mockResolvedValue({ id: 'entry_1' } as never);

    const result = await logIncomeEntry('user_1', { sourceName: 'Uber', amount: 52 });

    expect(result.success).toBe(true);
    expect(prismaMock.incomeSource.findFirst).toHaveBeenCalledWith({ where: { userId: 'user_1', name: 'Uber' } });
    expect(prismaMock.incomeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ incomeSourceId: 'inc_1', amount: 52 }) })
    );
  });

  it('returns a failure result when no source with that name exists', async () => {
    prismaMock.incomeSource.findFirst.mockResolvedValue(null);

    const result = await logIncomeEntry('user_1', { sourceName: 'Nonexistent', amount: 52 });

    expect(result).toEqual({ success: false, error: 'No income source named "Nonexistent" found' });
    expect(prismaMock.incomeEntry.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/income/actions.test.ts`
Expected: FAIL — `./actions` does not exist yet.

- [ ] **Step 4: Implement `lib/income/actions.ts`**

```ts
import { Prisma, IncomeSourceType, RecurrenceInterval } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export async function addIncomeSource(
  userId: string,
  input: { name: string; type: IncomeSourceType; amount?: number; recurrenceInterval?: RecurrenceInterval; startDate: Date }
): Promise<ActionResult<{ id: string }>> {
  try {
    const created = await prisma.incomeSource.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        amount: input.amount,
        recurrenceInterval: input.recurrenceInterval,
        startDate: input.startDate,
      },
    });
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: `You already have an income source named "${input.name}"` };
    }
    throw error;
  }
}

export async function logIncomeEntry(
  userId: string,
  input: { sourceName: string; amount: number; date?: Date }
): Promise<ActionResult<{ id: string }>> {
  const source = await prisma.incomeSource.findFirst({ where: { userId, name: input.sourceName } });
  if (!source) {
    return { success: false, error: `No income source named "${input.sourceName}" found` };
  }

  const created = await prisma.incomeEntry.create({
    data: { incomeSourceId: source.id, amount: input.amount, date: input.date ?? new Date() },
  });
  return { success: true, id: created.id };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/income/actions.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Write the failing tests for the REST routes**

Create `app/api/income-sources/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/income/actions', () => ({ addIncomeSource: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { addIncomeSource } from '@/lib/income/actions';
import { POST, GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/income-sources', () => {
  it('creates an income source', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addIncomeSource).mockResolvedValue({ success: true, id: 'inc_1' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources', {
        method: 'POST',
        body: JSON.stringify({ name: 'Uber', type: 'IRREGULAR', startDate: '2026-09-24T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(201);
    expect(addIncomeSource).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ name: 'Uber', type: 'IRREGULAR' })
    );
  });

  it('returns 400 on a duplicate name', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addIncomeSource).mockResolvedValue({ success: false, error: 'You already have an income source named "Uber"' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources', {
        method: 'POST',
        body: JSON.stringify({ name: 'Uber', type: 'IRREGULAR', startDate: '2026-09-24T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources', {
        method: 'POST',
        body: JSON.stringify({ name: 'Uber', type: 'IRREGULAR', startDate: '2026-09-24T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /api/income-sources', () => {
  it('lists the caller\'s own income sources', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      { id: 'inc_1', userId: 'user_1', name: 'Uber', type: 'IRREGULAR', amount: null, recurrenceInterval: null, startDate: new Date(), createdAt: new Date() },
    ] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(prismaMock.incomeSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run app/api/income-sources/route.test.ts`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 8: Implement `app/api/income-sources/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createIncomeSourceSchema } from '@/lib/validation/incomeSource.schema';
import { addIncomeSource } from '@/lib/income/actions';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const input = createIncomeSourceSchema.parse(await request.json());
    const result = await addIncomeSource(user.userId, {
      name: input.name,
      type: input.type,
      amount: input.amount,
      recurrenceInterval: input.recurrenceInterval,
      startDate: new Date(input.startDate),
    });

    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const sources = await prisma.incomeSource.findMany({ where: { userId: user.userId }, orderBy: { createdAt: 'asc' } });
    return NextResponse.json(
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        amount: s.amount ? Number(s.amount) : null,
        recurrenceInterval: s.recurrenceInterval,
        startDate: s.startDate,
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 9: Write the failing tests for logging an entry, then implement**

Create `app/api/income-sources/[id]/entries/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/income/actions', () => ({ logIncomeEntry: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { logIncomeEntry } from '@/lib/income/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/income-sources/[id]/entries', () => {
  it('logs an entry (the id route param identifies the source by name lookup, not by id, matching the chat tool\'s server-side resolution)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(logIncomeEntry).mockResolvedValue({ success: true, id: 'entry_1' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources/Uber/entries', {
        method: 'POST',
        body: JSON.stringify({ amount: 52 }),
      }),
      { params: { id: 'Uber' } }
    );

    expect(res.status).toBe(201);
    expect(logIncomeEntry).toHaveBeenCalledWith('user_1', { sourceName: 'Uber', amount: 52, date: undefined });
  });

  it('returns 400 when the named source does not exist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(logIncomeEntry).mockResolvedValue({ success: false, error: 'No income source named "Uber" found' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources/Uber/entries', {
        method: 'POST',
        body: JSON.stringify({ amount: 52 }),
      }),
      { params: { id: 'Uber' } }
    );

    expect(res.status).toBe(400);
  });
});
```

**Design note:** the `[id]` segment here is actually the source's *name*, not its database id — matching this project's established pattern from Spec 3 where a URL path segment is accepted for RESTful shape but the real security/lookup boundary is `userId`-scoped inside the shared action (`logIncomeEntry` looks up by `{userId, name}`, never trusts an id). Naming the route param `id` for consistency with Next.js's `[id]` convention is fine; treat its value as an opaque source-name lookup key throughout.

Implement `app/api/income-sources/[id]/entries/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { logIncomeEntry } from '@/lib/income/actions';

const logEntrySchema = z.object({ amount: z.number().positive(), date: z.string().datetime().optional() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { amount, date } = logEntrySchema.parse(await request.json());
    const result = await logIncomeEntry(user.userId, {
      sourceName: decodeURIComponent(params.id),
      amount,
      date: date ? new Date(date) : undefined,
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

- [ ] **Step 10: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 11: Commit and push**

```bash
git add lib/income/ app/api/income-sources/ lib/validation/incomeSource.schema.ts
git commit -m "feat: add income source and income entry CRUD"
git push
```

---

### Task 4: Bills (shared actions + REST routes, mark-paid creates a linked Expense)

**Files:**
- Create: `lib/bills/actions.ts`
- Create: `lib/bills/actions.test.ts`
- Create: `app/api/bills/route.ts` (POST create, GET list)
- Create: `app/api/bills/route.test.ts`
- Create: `app/api/bills/[id]/pay/route.ts` (POST mark paid)
- Create: `app/api/bills/[id]/pay/route.test.ts`
- Create: `lib/validation/bill.schema.ts`
- Modify: `lib/utils/recurringOccurrences.ts` (export the single-next-occurrence helper)

**Interfaces:**
- Consumes: `prisma`, `AppError`/`handleRouteError`, `getCurrentUser`.
- Produces: `addBill(userId, input): Promise<ActionResult<{id: string}>>` and `markBillPaid(userId, billName): Promise<ActionResult<{expenseId: string}>>` from `lib/bills/actions.ts` — Task 6's chat tools call these directly.

- [ ] **Step 1: Export a single-next-occurrence helper from `lib/utils/recurringOccurrences.ts`**

Read the file fresh — it currently has an internal (unexported) `advance` function and the exported `computeMissingOccurrences`. Add one new exported function without changing either existing one:

```ts
export function computeNextOccurrence(interval: RecurrenceInterval, sourceDate: Date, afterDate: Date): Date {
  return advance(sourceDate, afterDate, interval);
}
```

This is a direct re-export of the existing internal `advance` logic — no behavior change to anything already using this file.

- [ ] **Step 2: Write `lib/validation/bill.schema.ts`**

```ts
import { z } from 'zod';

export const createBillSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  dueDate: z.string().datetime(),
  recurrenceInterval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  categoryId: z.string().optional(),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
```

- [ ] **Step 3: Write the failing tests for the shared action module**

Create `lib/bills/actions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { addBill, markBillPaid } from './actions';

describe('addBill', () => {
  it('creates a recurring bill', async () => {
    prismaMock.bill.create.mockResolvedValue({ id: 'bill_1' } as never);

    const result = await addBill('user_1', {
      name: 'Rent',
      amount: 800,
      dueDate: new Date('2026-09-30T00:00:00.000Z'),
      recurrenceInterval: 'MONTHLY',
    });

    expect(result).toEqual({ success: true, id: 'bill_1' });
    expect(prismaMock.bill.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Rent',
        amount: 800,
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        recurrenceInterval: 'MONTHLY',
        categoryId: undefined,
      },
    });
  });

  it('returns a failure result on a duplicate name for this user', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaMock.bill.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '5.0.0' })
    );

    const result = await addBill('user_1', { name: 'Rent', amount: 800, dueDate: new Date() });

    expect(result).toEqual({ success: false, error: 'You already have a bill named "Rent"' });
  });
});

describe('markBillPaid', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('creates a linked Expense and advances a recurring bill\'s due date', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toNumber: () => 800 } as never,
      dueDate: now, recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: null,
    } as never);
    prismaMock.category.findFirst.mockResolvedValue(null);
    prismaMock.category.create.mockResolvedValue({ id: 'cat_bills' } as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_1' } as never);
    prismaMock.bill.update.mockResolvedValue({} as never);

    const result = await markBillPaid('user_1', 'Rent');

    expect(result).toEqual({ success: true, expenseId: 'exp_1' });
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1', amount: 800, categoryId: 'cat_bills' }) })
    );
    expect(prismaMock.bill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_1' },
        data: expect.objectContaining({ paidExpenseId: 'exp_1', dueDate: new Date('2026-10-30T00:00:00.000Z') }),
      })
    );
  });

  it('marks a one-time bill fully settled with no next due date advance beyond marking it paid', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_2', userId: 'user_1', name: 'Medical bill', amount: { toNumber: () => 150 } as never,
      dueDate: now, recurrenceInterval: null, categoryId: 'cat_existing', paidExpenseId: null,
    } as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_2' } as never);
    prismaMock.bill.update.mockResolvedValue({} as never);

    const result = await markBillPaid('user_1', 'Medical bill');

    expect(result).toEqual({ success: true, expenseId: 'exp_2' });
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat_existing' }) })
    );
  });

  it('rejects paying a bill that is not due yet (idempotency guard against double-payment)', async () => {
    prismaMock.bill.findFirst.mockResolvedValue({
      id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toNumber: () => 800 } as never,
      dueDate: new Date('2026-10-30T00:00:00.000Z'), recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: 'exp_1',
    } as never);

    const result = await markBillPaid('user_1', 'Rent');

    expect(result).toEqual({ success: false, error: 'Rent is not due yet — it was already paid for this period' });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('returns a failure result when no bill with that name exists', async () => {
    prismaMock.bill.findFirst.mockResolvedValue(null);

    const result = await markBillPaid('user_1', 'Nonexistent');

    expect(result).toEqual({ success: false, error: 'No bill named "Nonexistent" found' });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run lib/bills/actions.test.ts`
Expected: FAIL — `./actions` does not exist yet.

- [ ] **Step 5: Implement `lib/bills/actions.ts`**

```ts
import { Prisma, RecurrenceInterval } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computeNextOccurrence } from '@/lib/utils/recurringOccurrences';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

const BILLS_CATEGORY_NAME = 'Bills';
const BILLS_CATEGORY_COLOR = '#8b5cf6';

async function findOrCreateBillsCategory(userId: string): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { userId, name: BILLS_CATEGORY_NAME } });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { userId, name: BILLS_CATEGORY_NAME, color: BILLS_CATEGORY_COLOR },
  });
  return created.id;
}

export async function addBill(
  userId: string,
  input: { name: string; amount: number; dueDate: Date; recurrenceInterval?: RecurrenceInterval; categoryId?: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const created = await prisma.bill.create({
      data: {
        userId,
        name: input.name,
        amount: input.amount,
        dueDate: input.dueDate,
        recurrenceInterval: input.recurrenceInterval,
        categoryId: input.categoryId,
      },
    });
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: `You already have a bill named "${input.name}"` };
    }
    throw error;
  }
}

export async function markBillPaid(userId: string, billName: string): Promise<ActionResult<{ expenseId: string }>> {
  const bill = await prisma.bill.findFirst({ where: { userId, name: billName } });
  if (!bill) {
    return { success: false, error: `No bill named "${billName}" found` };
  }

  const now = new Date();
  if (bill.dueDate.getTime() > now.getTime()) {
    return { success: false, error: `${billName} is not due yet — it was already paid for this period` };
  }

  const categoryId = bill.categoryId ?? (await findOrCreateBillsCategory(userId));

  const expense = await prisma.expense.create({
    data: {
      userId,
      categoryId,
      amount: Number(bill.amount),
      description: billName,
      date: bill.dueDate,
    },
  });

  const nextDueDate = bill.recurrenceInterval
    ? computeNextOccurrence(bill.recurrenceInterval, bill.dueDate, bill.dueDate)
    : bill.dueDate;

  await prisma.bill.update({
    where: { id: bill.id },
    data: { paidExpenseId: expense.id, dueDate: nextDueDate },
  });

  return { success: true, expenseId: expense.id };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/bills/actions.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 7: Write the failing tests for the REST routes**

Create `app/api/bills/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/bills/actions', () => ({ addBill: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { addBill } from '@/lib/bills/actions';
import { POST, GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/bills', () => {
  it('creates a bill', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addBill).mockResolvedValue({ success: true, id: 'bill_1' });

    const res = await POST(
      new NextRequest('http://localhost/api/bills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Rent', amount: 800, dueDate: '2026-09-30T00:00:00.000Z', recurrenceInterval: 'MONTHLY' }),
      })
    );

    expect(res.status).toBe(201);
    expect(addBill).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ name: 'Rent', amount: 800, recurrenceInterval: 'MONTHLY' })
    );
  });

  it('returns 400 on a duplicate name', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addBill).mockResolvedValue({ success: false, error: 'You already have a bill named "Rent"' });

    const res = await POST(
      new NextRequest('http://localhost/api/bills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Rent', amount: 800, dueDate: '2026-09-30T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/bills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Rent', amount: 800, dueDate: '2026-09-30T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /api/bills', () => {
  it("lists the caller's own bills", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.bill.findMany.mockResolvedValue([
      { id: 'bill_1', userId: 'user_1', name: 'Rent', amount: { toString: () => '800.00' } as never, dueDate: new Date(), recurrenceInterval: 'MONTHLY', categoryId: null, paidExpenseId: null, createdAt: new Date() },
    ] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(prismaMock.bill.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user_1' } }));
  });
});
```

Create `app/api/bills/[id]/pay/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/bills/actions', () => ({ markBillPaid: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { markBillPaid } from '@/lib/bills/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/bills/[id]/pay', () => {
  it('marks a bill paid by name and returns the created expense id', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(markBillPaid).mockResolvedValue({ success: true, expenseId: 'exp_1' });

    const res = await POST(new NextRequest('http://localhost/api/bills/Rent/pay', { method: 'POST' }), {
      params: { id: 'Rent' },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expenseId).toBe('exp_1');
    expect(markBillPaid).toHaveBeenCalledWith('user_1', 'Rent');
  });

  it('returns 400 when the bill is not due yet', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(markBillPaid).mockResolvedValue({
      success: false,
      error: 'Rent is not due yet — it was already paid for this period',
    });

    const res = await POST(new NextRequest('http://localhost/api/bills/Rent/pay', { method: 'POST' }), {
      params: { id: 'Rent' },
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new NextRequest('http://localhost/api/bills/Rent/pay', { method: 'POST' }), {
      params: { id: 'Rent' },
    });

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail, then implement `app/api/bills/route.ts` and `app/api/bills/[id]/pay/route.ts`**

Run: `npx vitest run app/api/bills/route.test.ts app/api/bills/\[id\]/pay/route.test.ts`
Expected: FAIL — neither route file exists yet.

Implement `app/api/bills/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createBillSchema } from '@/lib/validation/bill.schema';
import { addBill } from '@/lib/bills/actions';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const input = createBillSchema.parse(await request.json());
    const result = await addBill(user.userId, {
      name: input.name,
      amount: input.amount,
      dueDate: new Date(input.dueDate),
      recurrenceInterval: input.recurrenceInterval,
      categoryId: input.categoryId,
    });

    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const bills = await prisma.bill.findMany({ where: { userId: user.userId }, orderBy: { dueDate: 'asc' } });
    return NextResponse.json(
      bills.map((b) => ({
        id: b.id,
        name: b.name,
        amount: Number(b.amount),
        dueDate: b.dueDate,
        recurrenceInterval: b.recurrenceInterval,
        categoryId: b.categoryId,
        isPaidThisPeriod: b.paidExpenseId !== null,
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
```

Implement `app/api/bills/[id]/pay/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { markBillPaid } from '@/lib/bills/actions';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const result = await markBillPaid(user.userId, decodeURIComponent(params.id));
    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ expenseId: result.expenseId });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

(Same design note as Task 3's `[id]` route: the segment is a name-based lookup key, not a database id — the security boundary is `userId`-scoping inside `markBillPaid`.)

- [ ] **Step 9: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 10: Commit and push**

```bash
git add lib/bills/ app/api/bills/ lib/validation/bill.schema.ts lib/utils/recurringOccurrences.ts
git commit -m "feat: add Bill CRUD with idempotent mark-paid-creates-Expense"
git push
```

---

### Task 5: Wire the projection into GET /api/cycles/active and update coach prompts

**Files:**
- Modify: `app/api/cycles/active/route.ts`
- Modify: `app/api/cycles/active/route.test.ts`
- Modify: `lib/ai/coach.ts`
- Modify: `lib/ai/coach.test.ts`

**Interfaces:**
- Consumes: `computeCashFlowProjection` (Task 2), `computeBillOccurrences` (Task 2, added to `lib/utils/moneyCycle.ts`).
- Produces: `GET /api/cycles/active`'s response gains `projection: {date, balance, events}[]`; `safeToSpend` now comes from `computeCashFlowProjection(...).safeToSpendPerDay`.

- [ ] **Step 1: Read `app/api/cycles/active/route.ts` fresh, then write the failing test for the new response shape**

Add to `app/api/cycles/active/route.test.ts` (read the file fresh first to match its exact existing mocking setup — `vi.useFakeTimers`, `prismaMock` conventions):

```ts
it('includes a day-by-day projection and derives safeToSpend from it, not the flat average', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z')); // pinned so the hardcoded cycle/bill/income
  // dates below stay within the projection window regardless of the real calendar date this test
  // runs on — matches this file's and Spec 3's established fake-timer convention. Remember to
  // restore real timers (vi.useRealTimers()) in this test's own cleanup or the file's existing
  // afterEach if one already exists — check the file's current structure before adding a new one.
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.moneyCycle.findFirst.mockResolvedValue({
    id: 'cycle_1', userId: 'user_1', startingAmount: { toString: () => '100.00' } as never,
    startDate: new Date('2026-09-24T00:00:00.000Z'), endDate: new Date('2026-10-05T00:00:00.000Z'),
    status: 'ACTIVE', messages: [],
  } as never);
  prismaMock.expense.findMany.mockResolvedValue([]); // no legacy recurring-expense obligations
  prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.incomeEntry.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.incomeSource.findMany.mockResolvedValue([
    { id: 'inc_1', userId: 'user_1', type: 'FIXED', amount: { toNumber: () => 400 } as never, recurrenceInterval: null, startDate: new Date('2026-09-29T00:00:00.000Z'), name: 'Job' },
  ] as never);
  prismaMock.bill.findMany.mockResolvedValue([
    { id: 'bill_1', userId: 'user_1', amount: { toNumber: () => 735 } as never, dueDate: new Date('2026-09-30T00:00:00.000Z'), recurrenceInterval: null, name: 'Rent + Subscription' },
  ] as never);

  const res = await GET(new NextRequest('http://localhost/api/cycles/active'));

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.projection).toBeInstanceOf(Array);
  expect(json.projection.length).toBeGreaterThan(0);
  // The motivating scenario: rent lands before the job's one-off start-date income is modeled
  // here as a non-recurring FIXED source with no recurrenceInterval, contributing on startDate only —
  // confirm safeToSpend reflects the real dip, not (100+400-735)/daysRemaining as a flat average.
  expect(json.safeToSpend).toBe(0); // shortfall case: minFutureBalance goes negative
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/cycles/active/route.test.ts`
Expected: FAIL — current route doesn't query `incomeSource`/`bill` or return `projection`.

- [ ] **Step 3: Implement the change in `app/api/cycles/active/route.ts`**

Replace the existing `committedSpend`/`remainingAmount`/`safeToSpend` block (read the current file fresh — it's the block right after `spentSoFar` is computed) with:

```ts
    const recurringExpenseTemplates = recurringTemplates
      .filter((t) => t.recurrenceInterval !== null)
      .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date, label: t.description }));

    const billTemplates = await prisma.bill.findMany({ where: { userId: user.userId } });
    const billOccurrencesOneTime = billTemplates
      .filter((b) => b.recurrenceInterval === null && b.dueDate >= now && b.dueDate <= cycle.endDate)
      .map((b) => ({ date: b.dueDate, amount: Number(b.amount), label: b.name }));
    const billOccurrencesRecurring = computeBillOccurrences(
      billTemplates
        .filter((b) => b.recurrenceInterval !== null)
        .map((b) => ({ amount: Number(b.amount), recurrenceInterval: b.recurrenceInterval!, date: b.dueDate, label: b.name })),
      now,
      cycle.endDate
    );
    const legacyRecurringExpenseOccurrences = computeBillOccurrences(recurringExpenseTemplates, now, cycle.endDate);

    const incomeSources = await prisma.incomeSource.findMany({ where: { userId: user.userId, type: 'FIXED' } });
    const fixedIncomeOneTime = incomeSources
      .filter((s) => s.recurrenceInterval === null && s.startDate >= now && s.startDate <= cycle.endDate)
      .map((s) => ({ date: s.startDate, amount: Number(s.amount), label: s.name }));
    const fixedIncomeRecurring = computeBillOccurrences(
      incomeSources
        .filter((s) => s.recurrenceInterval !== null && s.startDate <= cycle.endDate)
        .map((s) => ({ amount: Number(s.amount), recurrenceInterval: s.recurrenceInterval!, date: s.startDate, label: s.name })),
      now,
      cycle.endDate
    );

    // Step 1 of the projection algorithm (spec Part 2): the current real balance includes every
    // actual IncomeEntry logged since the cycle began, not just starting amount minus spending —
    // otherwise a real, already-landed Uber payment would never show up anywhere.
    const incomeEntriesAggregate = await prisma.incomeEntry.aggregate({
      where: { incomeSource: { userId: user.userId }, date: { gte: cycle.startDate, lte: now } },
      _sum: { amount: true },
    });
    const incomeEntriesSoFar = Number(incomeEntriesAggregate._sum.amount ?? 0);
    const remainingAmount = Math.max(Number(cycle.startingAmount) - spentSoFar + incomeEntriesSoFar, 0);
    const projectionResult = computeCashFlowProjection({
      currentBalance: remainingAmount,
      today: now,
      endDate: cycle.endDate,
      fixedIncomeOccurrences: [...fixedIncomeOneTime, ...fixedIncomeRecurring],
      billOccurrences: [...billOccurrencesOneTime, ...billOccurrencesRecurring, ...legacyRecurringExpenseOccurrences],
    });
    const daysRemaining = computeDaysRemaining(cycle.endDate, now);
    // computeCashFlowProjection already clamps safeToSpendPerDay to 0 on a shortfall — no need to
    // re-check isShortfall here too.
    const safeToSpend = projectionResult.safeToSpendPerDay;
    const projection = projectionResult.trajectory.map((day) => ({
      date: day.date.toISOString(),
      balance: day.balance,
      events: day.events,
    }));
```

And update the final `NextResponse.json({...})` to include `projection` alongside the existing fields. Update the import line to add `computeCashFlowProjection` (from `@/lib/utils/cashFlowProjection`) and `computeBillOccurrences` (from `@/lib/utils/moneyCycle`); `computeCommittedSpend` is no longer needed in this file (its role is now served by the projection) — remove it from the import if nothing else in the file uses it, but confirm by reading the file fresh first.

**Note the deliberate change:** `remainingAmount` here now only subtracts `spentSoFar` from `startingAmount` — the old `committedSpend` subtraction is removed because `computeCashFlowProjection` now accounts for future obligations properly (day-by-day, not pre-subtracted as a lump sum), avoiding double-counting.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/cycles/active/route.test.ts`
Expected: PASS. Re-check any other pre-existing tests in this same file still pass given the response-shape and calculation change — update their expected `safeToSpend`/`remainingAmount` values if this change legitimately affects them (it will, since the calculation method changed) rather than leaving stale assertions.

- [ ] **Step 5: Update `lib/ai/coach.ts`'s prompts to describe the projection's shape**

Read the file fresh, then update both `generatePlanMessage` and `generateCheckInMessage`'s input types and prompt text to optionally accept a `shortfallWarning?: string` field (e.g. "you're projected to be short before rent clears on the 30th") and include it in the prompt when present:

```ts
export async function generatePlanMessage(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
  safeToSpend: number;
  shortfallWarning?: string;
}): Promise<string> {
  const shortfallText = input.shortfallWarning
    ? ` Importantly: ${input.shortfallWarning}.`
    : '';
  const prompt =
    `You are a friendly, concise personal-finance coach speaking directly to the user (use "you"). ` +
    `All amounts are in Australian dollars (AUD). ` +
    `They have $${input.startingAmount.toFixed(2)} for the next ${input.daysRemaining} days. ` +
    `$${input.committedSpend.toFixed(2)} is already committed to recurring bills, leaving them ` +
    `$${input.safeToSpend.toFixed(2)} a day to spend freely.${shortfallText} Write one short, encouraging message ` +
    `(2-3 sentences) presenting this plan. Do not use markdown formatting.`;

  try {
    return await callGemini(prompt);
  } catch {
    return buildFallbackPlanMessage(input);
  }
}
```

Apply the equivalent change to `generateCheckInMessage`. Update `buildFallbackPlanMessage`/`buildFallbackCheckInMessage` (`lib/utils/moneyCycle.ts`) similarly, appending the shortfall text to the fallback string when present, so a Gemini outage doesn't silently drop the warning.

**Explicit decision: `POST /api/cycles` is NOT updated to use the projection or pass `shortfallWarning`.** This matches Spec 3 Task 2's own precedent of deliberately leaving `POST /api/cycles` on its original flat-average calculation rather than threading every new calculation through it. Concretely, this means: right after starting a cycle, `CoachCard.tsx`'s displayed "Daily budget" figure (which comes directly from `POST /api/cycles`'s JSON response — confirmed via `handleStart`'s `setCycle(await res.json())`) will briefly show the old flat-average value, self-correcting on the next `GET /api/cycles/active` fetch (e.g. a page reload, or `CoachCard`'s own periodic behavior if any). This is a transient, non-crashing display inconsistency, not a bug — `lib/utils/cashFlowProjection`'s consumers (Task 8's `ProjectionList`, and `GET /api/cycles/active` itself) are unaffected, since `ProjectionList` performs its own independent fetch to `/api/cycles/active` rather than reading any state `POST /api/cycles` produced. Do not attempt to wire the projection into `POST /api/cycles` in this task — it would duplicate Task 5's Step 3 logic into a third location for a cosmetic, self-correcting gap.

- [ ] **Step 6: Update `lib/ai/coach.test.ts`**

Add test cases confirming `shortfallWarning` appears in the prompt sent to the mocked `fetch` when present, and is absent when not — following the file's existing `vi.stubGlobal('fetch', ...)` pattern.

- [ ] **Step 7: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass (adjusting any pre-existing assertions that legitimately changed), typecheck clean, lint clean.

- [ ] **Step 8: Commit and push**

```bash
git add app/api/cycles/active/route.ts app/api/cycles/active/route.test.ts app/api/cycles/route.ts lib/ai/coach.ts lib/ai/coach.test.ts lib/utils/moneyCycle.ts
git commit -m "feat: wire cash-flow projection into cycle status and coach messages"
git push
```

---

### Task 6: Four new chat tools

**Files:**
- Modify: `lib/ai/chat.ts`
- Modify: `lib/ai/chat.test.ts`
- Modify: `app/api/cycles/chat/route.ts`
- Modify: `app/api/cycles/chat/route.test.ts`

**Interfaces:**
- Consumes: `addIncomeSource`, `logIncomeEntry` (Task 3), `addBill`, `markBillPaid` (Task 4).
- Produces: `ChatToolHandlers` interface gains four new optional methods; `generateChatReply`'s tool dispatch handles four new tool names.

- [ ] **Step 1: Read `lib/ai/chat.ts` fresh, then extend the `TOOLS` array and `ChatToolHandlers` interface**

Add four new `functionDeclarations` entries to the existing `TOOLS[0].functionDeclarations` array (alongside `update_cycle_amount`/`cancel_cycle`, do not remove those):

```ts
{
  name: 'add_income_source',
  description: "Add a new income source for the user — a job, gig, or any recurring or irregular way they earn money",
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short name for this income source, e.g. "Casual job" or "Uber"' },
      type: { type: 'string', enum: ['FIXED', 'IRREGULAR'], description: 'FIXED if the amount and schedule are predictable; IRREGULAR if the amount varies (e.g. gig work)' },
      amount: { type: 'number', description: 'The amount per occurrence in AUD, only for FIXED sources' },
      recurrenceInterval: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How often it recurs, only for FIXED sources' },
      startDate: { type: 'string', description: 'ISO date string for when this income starts' },
    },
    required: ['name', 'type', 'startDate'],
  },
},
{
  name: 'log_income',
  description: "Log an actual amount of money the user just received from an existing income source",
  parameters: {
    type: 'object',
    properties: {
      sourceName: { type: 'string', description: 'The name of the income source this money came from' },
      amount: { type: 'number', description: 'The amount received, in AUD' },
    },
    required: ['sourceName', 'amount'],
  },
},
{
  name: 'add_bill',
  description: "Add a new bill — a future obligation the user needs to pay on a specific date",
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short name for this bill, e.g. "Rent" or "Phone bill"' },
      amount: { type: 'number', description: 'The amount owed, in AUD' },
      dueDate: { type: 'string', description: 'ISO date string for when this bill is due' },
      recurrenceInterval: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'YEARLY'], description: 'How often it recurs, omit for a one-time bill' },
    },
    required: ['name', 'amount', 'dueDate'],
  },
},
{
  name: 'mark_bill_paid',
  description: "Mark a bill as paid, recording it as a real expense",
  parameters: {
    type: 'object',
    properties: { billName: { type: 'string', description: 'The name of the bill that was paid' } },
    required: ['billName'],
  },
},
```

Extend `ChatToolHandlers`:

```ts
export interface ChatToolHandlers {
  updateCycleAmount: (newAmount: number) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  cancelCycle: () => Promise<{ success: boolean; error?: string }>;
  addIncomeSource: (input: { name: string; type: 'FIXED' | 'IRREGULAR'; amount?: number; recurrenceInterval?: 'WEEKLY' | 'MONTHLY' | 'YEARLY'; startDate: string }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  logIncome: (input: { sourceName: string; amount: number }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  addBill: (input: { name: string; amount: number; dueDate: string; recurrenceInterval?: 'WEEKLY' | 'MONTHLY' | 'YEARLY' }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  markBillPaid: (billName: string) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
}
```

- [ ] **Step 2: Write the failing tests for the new tool dispatch**

Add to `lib/ai/chat.test.ts`, following the existing test file's exact mocked-`fetch` pattern for `update_cycle_amount`/`cancel_cycle` (two mocked `fetch` calls: Turn 1 returns a `functionCall`, Turn 2 returns the follow-up text). One example, for `add_bill` — write the equivalent three more for `add_income_source`, `log_income`, and `mark_bill_paid`, each asserting the correct handler is called with the exact args Gemini's `functionCall.args` would contain:

```ts
it('calls addBill when Gemini requests add_bill, then uses the follow-up reply', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'add_bill', args: { name: 'Phone', amount: 30, dueDate: '2026-10-02T00:00:00.000Z' } } }],
            },
          },
        ],
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { role: 'model', parts: [{ text: "Added your $30 phone bill, due Oct 2." }] } }],
      }),
    } as Response);

  const handlers = {
    updateCycleAmount: vi.fn(),
    cancelCycle: vi.fn(),
    addIncomeSource: vi.fn(),
    logIncome: vi.fn(),
    addBill: vi.fn().mockResolvedValue({ success: true, id: 'bill_1' }),
    markBillPaid: vi.fn(),
  };
  const result = await generateChatReply('add a phone bill, $30, due Oct 2', [], handlers);

  expect(result).toBe('Added your $30 phone bill, due Oct 2.');
  expect(handlers.addBill).toHaveBeenCalledWith({ name: 'Phone', amount: 30, dueDate: '2026-10-02T00:00:00.000Z' });
});
```

Also add one test confirming a tool-handler throw for one of the new tools is caught the same way as the existing tools — reuse the existing "tool handler throws" test's exact structure (find it in the current file), swapped to `add_bill` rejecting and asserting the relayed `functionResponse.response` is `{success:false, error:'That action failed — try again.'}`.

Every existing test in this file that constructs a `ChatToolHandlers` object (including the two tests for `update_cycle_amount`/`cancel_cycle` already in the file) must be updated to include all six handler keys now that the interface requires them — a partial object will fail to typecheck.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/ai/chat.test.ts`
Expected: FAIL — dispatch logic doesn't recognize the four new tool names yet.

- [ ] **Step 4: Extend the tool-dispatch `if/else if` chain in `generateChatReply`**

Read the current dispatch block fresh (the `if (name === 'update_cycle_amount') {...} else if (name === 'cancel_cycle') {...} else {...}` chain inside the `try` block). Add four more `else if` branches following the exact same shape as the existing two — each does a `typeof`/shape check on `args` before calling its handler, falling back to `{success:false, error: '<field> must be a <type>'}` on a malformed arg, matching `update_cycle_amount`'s existing `typeof args.newAmount !== 'number'` guard precisely. For `add_income_source`, validate `typeof args.name === 'string'`, `args.type === 'FIXED' || args.type === 'IRREGULAR'`, and `typeof args.startDate === 'string'` before calling `handlers.addIncomeSource`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/chat.test.ts`
Expected: PASS, all new and existing tests.

- [ ] **Step 6: Wire the four new handlers in `app/api/cycles/chat/route.ts`**

Read the file fresh, then extend the `generateChatReply(message, history, {...})` call's handlers object:

```ts
const reply = await generateChatReply(message, history, {
  updateCycleAmount: (newAmount: number) => updateCycleAmount(user.userId, newAmount),
  cancelCycle: () => cancelCycle(user.userId),
  addIncomeSource: (input) => addIncomeSource(user.userId, { ...input, startDate: new Date(input.startDate) }),
  logIncome: (input) => logIncomeEntry(user.userId, input),
  addBill: (input) => addBill(user.userId, { ...input, dueDate: new Date(input.dueDate) }),
  markBillPaid: (billName: string) => markBillPaid(user.userId, billName),
});
```

Add the corresponding imports (`addIncomeSource` from `@/lib/income/actions`, `logIncomeEntry` from `@/lib/income/actions`, `addBill`/`markBillPaid` from `@/lib/bills/actions`).

- [ ] **Step 7: Update `app/api/cycles/chat/route.test.ts`**

Add mocks for the four newly-imported action functions (following the file's existing `vi.mock('@/lib/moneyCycle/actions', ...)` pattern) so the existing tests' mock setup doesn't leave these unmocked and accidentally hit the real database.

- [ ] **Step 8: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 9: Live-verify the new tools against the real Gemini API, following Spec 3's established caution**

Adapt Spec 3's live-verification approach (see `docs/superpowers/plans/2026-09-24-cycle-chat-and-fixes.md`, Task 3, for the exact method): run one real request with the extended `TOOLS` array for a message like "I got a new job starting next Monday, $30/hour, weekly" and confirm Gemini returns a `functionCall` naming `add_income_source` with plausible extracted args. If this hits the same free-tier daily-quota wall Spec 3 encountered (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), do not block — the request/response *envelope* shape (`role: 'user'` for the relay turn, `candidates[0].content.parts[].functionCall`) is already proven correct by Spec 3's live verification and is unaffected by adding more tool declarations to the same `tools` array; note the quota limitation in the report and proceed, flagging this specific tool's live-decision behavior as unconfirmed for Task 9's final verification to catch when quota allows.

- [ ] **Step 10: Commit and push**

```bash
git add lib/ai/chat.ts lib/ai/chat.test.ts app/api/cycles/chat/route.ts app/api/cycles/chat/route.test.ts
git commit -m "feat: add income and bill chat tools"
git push
```

---

### Task 7: Manual UI — income source and bill management page

**Files:**
- Create: `app/cashflow/page.tsx`
- Create: `app/cashflow/CashFlowClient.tsx`
- Create: `components/income/IncomeSourceForm.tsx`
- Create: `components/bills/BillForm.tsx`
- Modify: `components/ui/Header.tsx` (add nav link)

**Interfaces:**
- Consumes: `POST /api/income-sources`, `GET /api/income-sources`, `POST /api/income-sources/[id]/entries`, `POST /api/bills`, `GET /api/bills`, `POST /api/bills/[id]/pay` (Tasks 3-4).

- [ ] **Step 1: Read `app/expenses/page.tsx`, `app/expenses/ExpensesClient.tsx`, `app/budgets/page.tsx` fresh** to confirm this project's exact server-component-fetches-then-passes-to-client-component pattern before writing the new page — match it precisely rather than inventing a new structure.

- [ ] **Step 2: Add the nav link in `components/ui/Header.tsx`**

Add `{ href: '/cashflow', label: 'Cash Flow' }` to the existing `NAV_LINKS` array — this is the only change to this file for this task (the logout/unsubscribe logic is untouched, already correct from Spec 3).

- [ ] **Step 3: Create `components/income/IncomeSourceForm.tsx`**

Follow `components/expenses/ExpenseForm.tsx`'s exact conventions (inputClasses string, `DateField` for the date input, `Button`, label-wraps-input pattern, a checkbox-style toggle for FIXED vs IRREGULAR shown as a `<select>` instead since it's not boolean):

```tsx
'use client';

import { useState, FormEvent } from 'react';
import type { RecurrenceInterval } from '@prisma/client';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export interface CreateIncomeSourceInput {
  name: string;
  type: 'FIXED' | 'IRREGULAR';
  amount?: number;
  recurrenceInterval?: RecurrenceInterval;
  startDate: string;
}

export function IncomeSourceForm({ onSubmit }: { onSubmit: (data: CreateIncomeSourceInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'FIXED' | 'IRREGULAR'>('IRREGULAR');
  const [amount, setAmount] = useState('');
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('WEEKLY');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const inputClasses =
    'rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name,
      type,
      amount: type === 'FIXED' ? Number(amount) : undefined,
      recurrenceInterval: type === 'FIXED' ? recurrenceInterval : undefined,
      startDate: new Date(startDate).toISOString(),
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Name
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Type
        <select value={type} onChange={(e) => setType(e.target.value as 'FIXED' | 'IRREGULAR')} className={inputClasses}>
          <option value="IRREGULAR">Irregular (e.g. gig work)</option>
          <option value="FIXED">Fixed (predictable amount and schedule)</option>
        </select>
      </label>
      {type === 'FIXED' && (
        <>
          <label className="flex flex-col text-sm text-foreground">
            Amount per payment
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClasses} />
          </label>
          <label className="flex flex-col text-sm text-foreground">
            Repeats
            <select value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(e.target.value as RecurrenceInterval)} className={inputClasses}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </label>
        </>
      )}
      <label className="flex flex-col text-sm text-foreground">
        Start date
        <DateField ariaLabel="Start date" required value={startDate} onChange={setStartDate} className={`${inputClasses} w-full`} />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add income source'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create `components/bills/BillForm.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import type { RecurrenceInterval } from '@prisma/client';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export interface CreateBillInput {
  name: string;
  amount: number;
  dueDate: string;
  recurrenceInterval?: RecurrenceInterval;
}

export function BillForm({ onSubmit }: { onSubmit: (data: CreateBillInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('MONTHLY');
  const [submitting, setSubmitting] = useState(false);

  const inputClasses =
    'rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name,
      amount: Number(amount),
      dueDate: new Date(dueDate).toISOString(),
      recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Name
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Amount
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Due date
        <DateField ariaLabel="Due date" required value={dueDate} onChange={setDueDate} className={`${inputClasses} w-full`} />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
          className="h-4 w-4 rounded accent-primary focus:ring-primary"
        />
        Repeats
      </label>
      {isRecurring && (
        <label className="flex flex-col text-sm text-foreground">
          Repeat interval
          <select
            value={recurrenceInterval}
            onChange={(e) => setRecurrenceInterval(e.target.value as RecurrenceInterval)}
            className={inputClasses}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add bill'}
      </Button>
    </form>
  );
}
```

This copies `ExpenseForm.tsx`'s exact `isRecurring` boolean-toggle convention verbatim (checkbox reveals a conditional `<select>`), just for a `Bill`'s `dueDate` instead of an `Expense`'s `date`/`categoryId`/`description`. Read `ExpenseForm.tsx` again while implementing this to confirm nothing about that convention has shifted since this plan was written.

- [ ] **Step 5: Create `app/cashflow/page.tsx` and `app/cashflow/CashFlowClient.tsx`**

`page.tsx` is a server component following `app/expenses/page.tsx`'s exact pattern: get the current user, fetch the user's income sources and bills via direct Prisma calls (not a fetch to its own API — matching how other server-rendered pages in this app already avoid self-fetching), pass them as props to the client component.

`CashFlowClient.tsx` renders two `Card` sections — "Income sources" (list + `IncomeSourceForm` behind an "Add income source" toggle button, matching `ExpensesClient.tsx`'s show/hide-form pattern) and "Bills" (list + `BillForm` behind an "Add bill" toggle button, each bill row showing a "Mark paid" button that POSTs to `/api/bills/[name]/pay` and refetches the list on success). This task does NOT yet include the day-by-day projection list (that's Task 8) — this page is income/bill management only; Task 8 adds the projection section to the same page (confirm by reading this task's own output before starting Task 8, rather than assuming).

- [ ] **Step 6: Run the full suite and a manual smoke check**

Run: `npm test -- --run && npm run typecheck && npm run lint`. This task has no new automated tests of its own (client components with data-fetching are verified live/via Playwright in this codebase, matching `CoachCard.tsx`'s established precedent) — confirm nothing else broke.

- [ ] **Step 7: Commit and push**

```bash
git add app/cashflow/ components/income/ components/bills/ components/ui/Header.tsx
git commit -m "feat: add income source and bill management page"
git push
```

---

### Task 8: Day-by-day projection view (vertical list) + axe-core coverage

**Files:**
- Modify: `app/cashflow/page.tsx`
- Modify: `app/cashflow/CashFlowClient.tsx`
- Create: `components/cashflow/ProjectionList.tsx`
- Modify: `e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `GET /api/cycles/active`'s `projection` field (Task 5).

- [ ] **Step 1: Read the current state of `app/cashflow/page.tsx`/`CashFlowClient.tsx`** (from Task 7) fresh before extending them.

- [ ] **Step 2: Create `components/cashflow/ProjectionList.tsx`**

A client component that fetches `/api/cycles/active` on mount (matching `CoachCard.tsx`'s exact `useEffect` + `fetch` pattern) and, if a cycle exists, renders its `projection` array as the vertical list validated during brainstorming: one row per day, the running balance right-aligned, any that day's `events` labeled inline, and the lowest-point day visually flagged using the existing `text-destructive`/`bg-destructive` tokens already used elsewhere in this app's Neon Glass design system (matching e.g. `BudgetProgress.tsx`'s over-budget treatment for visual consistency). If no cycle is active, render a short prompt to start one (link to `/dashboard`, where `CoachCard`'s `StartCycleForm` lives) rather than an empty list.

- [ ] **Step 3: Add `<ProjectionList />` to `CashFlowClient.tsx`**, below the income-sources/bills sections from Task 7.

- [ ] **Step 4: Add axe-core coverage in `e2e/accessibility.spec.ts`**

Read the file fresh (it will have grown since Task 6 of Spec 3 added two tests). Add a new test following the established `signUp` + `AxeBuilder` pattern:

```ts
test('cashflow page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-cashflow');
  await page.goto('/cashflow');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('cashflow page with an active cycle and a bill shows the projection list and has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-cashflow-projection');
  await page.goto('/dashboard');
  await page.getByLabel(/how much do you have/i).fill('500');
  await page.getByLabel('Until when', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

  await page.goto('/cashflow');
  await page.getByRole('button', { name: /add bill/i }).click();
  await page.getByLabel(/^name$/i).fill('Rent');
  await page.getByLabel(/amount/i).fill('800');
  // Read the actual DateField/label text this task's own BillForm renders before writing this
  // selector — do not guess it from ExpenseForm's "Date" label without confirming BillForm used
  // the same wording ("Due date" is used in this plan's Step 4 above; confirm against the real
  // rendered form).
  await page.getByLabel(/due date/i).fill('2026-10-01');
  await page.getByRole('button', { name: /add bill/i }).click();

  await expect(page.getByText('Rent')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 5: Run the full clean-build Playwright suite**

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 1
lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
rm -rf .next && CI=true npm run build && CI=true npm run test:e2e
```

Expected: every test passing, including the two new ones and every existing axe-core check. Per this project's hard-won Spec 3 lesson: actually observe the new tests exercise real rendered content (the projection list, a real bill row) before trusting a pass — don't accept a green run on faith if a selector could plausibly be matching nothing.

- [ ] **Step 6: Run the full Vitest suite, typecheck, lint**

Run: `npm test -- --run && npm run typecheck && npm run lint`

- [ ] **Step 7: Commit and push**

```bash
git add app/cashflow/ components/cashflow/ e2e/accessibility.spec.ts
git commit -m "feat: add day-by-day cash-flow projection list view"
git push
```

---

### Task 9: Final whole-feature verification

**Files:** none modified — verification only, unless a genuine defect is found (in which case fix it, add a regression test, and note it clearly as new work beyond verification, matching Spec 3 Task 8's precedent).

**Interfaces:** N/A.

- [ ] **Step 1: Run the full automated suite from a clean build**

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 1
lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
npm test -- --run
npm run typecheck
npm run lint
rm -rf .next
CI=true npm run build
CI=true npm run test:e2e
```

- [ ] **Step 2: Live browser verification of the actual motivating scenario**

Using Playwright MCP browser tools against a local dev server with the real `GEMINI_API_KEY`:

1. Sign up, add an `IRREGULAR` income source ("Uber") and a `FIXED` one ("Casual job", an amount, weekly, starting a few days out) via the manual form.
2. Add a bill ("Rent", an amount, a due date that falls *before* the fixed income source's first occurrence) via the manual form.
3. Start a Money Cycle ending after both dates.
4. Visit `/cashflow` and confirm the projection list shows the balance actually dipping (or going negative) on the bill's due date — not a flat daily figure — and that the dashboard's `safeToSpend` reflects this real constraint, not an average that ignores it. This is the concrete, observable proof that Section 2 of the spec is real, not just unit-tested in isolation.
5. Log an actual `IncomeEntry` against the irregular Uber source via the chat ("I made $52 from Uber today") and confirm the real balance updates accordingly on refetch.
6. If Gemini's free-tier quota allows, try "add a bill, phone, $30, due [date]" via chat and confirm it appears in the bills list and the projection updates. If quota is exhausted (a known, previously-encountered constraint), note exactly which live checks were blocked and why, following Spec 3 Task 8's exact reporting precedent — do not fabricate a result.

- [ ] **Step 3: Clean up any test accounts created against the shared Neon database**

- [ ] **Step 4: Report completion**

No commit needed for this task unless a real defect was found and fixed.

---

### Post-plan note for the controller

Given the size of this plan (9 tasks, several touching shared calculation logic), the final whole-branch review that follows Task 9 (per `subagent-driven-development`) should pay particular attention to: (a) whether `remainingAmount`'s changed formula in `active/route.ts` (Task 5) is consistent with what `lib/moneyCycle/actions.ts`'s `updateCycleAmount` still computes (it was NOT touched by this plan — confirm the two don't silently disagree the way Spec 3's final review caught once already), and (b) whether the new `Bill`/`IncomeSource` category-linking logic in `lib/bills/actions.ts` (the `findOrCreateBillsCategory` helper) could create duplicate "Bills" categories under a race (two concurrent `markBillPaid` calls before either commits) — this project's established pattern for this exact kind of duplicate-creation race was already addressed once for push subscriptions in Spec 3; the same category of risk is worth a deliberate look here too.
