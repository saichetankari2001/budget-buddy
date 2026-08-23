# Budget Buddy v1.2 (Recurring Expenses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark an expense as recurring (weekly/monthly/yearly) so future occurrences generate automatically on dashboard load, with catch-up for missed periods — no cron job.

**Architecture:** `Expense` gains recurrence fields directly (no separate template model). A pure date-math function decides what's due; a thin Prisma wrapper creates the missing rows; the wrapper is called once per dashboard load, before the existing expense query.

**Tech Stack:** Next.js 14 App Router + TypeScript (existing), Prisma + Neon Postgres (existing), Zod, Vitest + React Testing Library, the existing Indigo Bento design system.

## Global Constraints

- `isRecurring: true` requires a non-null `recurrenceInterval`; `isRecurring: false` (default) requires `recurrenceInterval` to be omitted — enforced via a Zod `.refine()` on both `createExpenseSchema` and `updateExpenseSchema`.
- The self-relation `Expense.recurringSourceId → Expense.id` uses `onDelete: SetNull`, never `Cascade` — deleting a recurring expense must detach (not delete) its already-generated past instances, preserving spending history.
- Reuse Prisma's generated `RecurrenceInterval` enum (from `@prisma/client`) as the single source of truth everywhere an interval value is validated or typed — the Zod schema uses `z.nativeEnum(RecurrenceInterval)`, and the pure date-math function's parameter is typed as `RecurrenceInterval` from `@prisma/client`. Never hand-write a duplicate `'WEEKLY' | 'MONTHLY' | 'YEARLY'` string union anywhere.
- **Existing test regression risk (read carefully before Task 3):** `app/api/expenses/route.test.ts`'s POST test asserts `prisma.expense.create` was called with an object containing ONLY `{ userId, categoryId, amount, description, date }` — no extra keys. `isRecurring`/`recurrenceInterval` must be added to the `create` call via conditional spread (`...(isRecurring !== undefined ? { isRecurring } : {})`), NEVER unconditionally (e.g. `isRecurring: isRecurring ?? false` directly in the object), or that existing test breaks.
- `app/api/expenses/[id]/route.ts`'s `PATCH` handler needs **no code changes** — it already does `data: { ...data, ... }` where `data` comes from `updateExpenseSchema.parse(body)`; Zod's `.partial()` omits absent optional keys from the parsed object entirely (they are not present as `undefined`-valued keys), so existing PATCH tests are unaffected by the new optional fields, and the new fields pass through automatically when a caller does send them.
- All Prisma queries/mutations remain scoped to the current user's `userId`, matching the existing pattern throughout this app.
- Money stays `Decimal(10,2)`, never `Float` (unaffected by this plan — `amount` is only ever copied through, never recomputed).
- No recurring budgets, no pause/skip-single-occurrence, no notifications — out of scope per the spec.

---

## File Structure

```
budget-buddy/
├── prisma/
│   └── schema.prisma                              # MODIFY: add RecurrenceInterval enum + Expense fields
├── lib/
│   ├── validation/
│   │   ├── expense.schema.ts                       # MODIFY: add isRecurring/recurrenceInterval + refinement
│   │   └── expense.schema.test.ts                  # MODIFY: add refinement tests
│   ├── utils/
│   │   ├── recurringOccurrences.ts                 # CREATE: pure date-math
│   │   └── recurringOccurrences.test.ts            # CREATE
│   ├── generateDueRecurringExpenses.ts              # CREATE: Prisma wrapper
│   └── generateDueRecurringExpenses.test.ts         # CREATE
├── app/
│   ├── api/
│   │   └── expenses/
│   │       ├── route.ts                             # MODIFY: POST accepts new fields
│   │       ├── route.test.ts                        # MODIFY: add recurring-creation test
│   │       └── [id]/route.test.ts                   # MODIFY: add recurring-update test (route.ts unchanged)
│   ├── dashboard/
│   │   └── page.tsx                                 # MODIFY: call generateDueRecurringExpenses
│   └── expenses/
│       ├── page.tsx                                  # MODIFY: serialize new fields
│       └── ExpensesClient.tsx                        # MODIFY: repeat icon, edit pre-fill
└── components/
    └── expenses/
        ├── ExpenseForm.tsx                           # MODIFY: Repeat checkbox + interval select
        └── ExpenseForm.test.tsx                      # MODIFY: add checkbox/interval tests
```

---

### Task 1: Prisma Schema — Recurrence Fields

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `RecurrenceInterval` enum (`WEEKLY`/`MONTHLY`/`YEARLY`) and `Expense.isRecurring`/`recurrenceInterval`/`recurringSourceId` fields, all consumed by every later task in this plan.

- [ ] **Step 1: Add the enum and modify the `Expense` model in `prisma/schema.prisma`**

Add this enum anywhere in the file (convention: near the top, after the datasource block):

```prisma
enum RecurrenceInterval {
  WEEKLY
  MONTHLY
  YEARLY
}
```

Modify the existing `Expense` model to add four new lines (everything else in the model stays exactly as-is):

```prisma
model Expense {
  id                 String              @id @default(cuid())
  userId             String
  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId         String
  category           Category            @relation(fields: [categoryId], references: [id])
  amount             Decimal             @db.Decimal(10, 2)
  description        String
  date               DateTime
  createdAt          DateTime            @default(now())
  isRecurring        Boolean             @default(false)
  recurrenceInterval RecurrenceInterval?
  recurringSourceId  String?
  recurringSource    Expense?            @relation("RecurringInstances", fields: [recurringSourceId], references: [id], onDelete: SetNull)
  recurringInstances Expense[]           @relation("RecurringInstances")

  @@index([userId, date])
}
```

**Rationale:** the self-relation needs an explicit name (`"RecurringInstances"`) because Prisma can't otherwise tell the two directions of an `Expense`-to-`Expense` relation apart. `onDelete: SetNull` (not `Cascade`) means deleting a recurring expense detaches its generated children (`recurringSourceId` becomes `null`) rather than deleting them — they remain as real historical expenses.

- [ ] **Step 2: Run the migration**

```bash
npm run prisma:migrate -- --name add_recurring_expenses
```

Expected: creates `prisma/migrations/<timestamp>_add_recurring_expenses/`, applies to your Neon database. This is a purely additive migration (new enum type, new nullable/defaulted columns) — safe against existing rows.

- [ ] **Step 3: Verify via a connectivity check**

```bash
npm run prisma:generate
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.expense.count({ where: { isRecurring: true } }).then((n) => { console.log('isRecurring column queryable. Count:', n); return prisma.\$disconnect(); }).catch((e) => { console.error('Failed:', e); process.exit(1); });
"
```

Expected: "isRecurring column queryable. Count: 0".

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add recurrence fields to Expense model"
```

---

### Task 2: Validation Schema — Recurrence Fields

**Files:**
- Modify: `lib/validation/expense.schema.ts`, `lib/validation/expense.schema.test.ts`

**Interfaces:**
- Consumes: `RecurrenceInterval` (from `@prisma/client`, Task 1).
- Produces: `createExpenseSchema`/`updateExpenseSchema` now accept optional `isRecurring: boolean` and `recurrenceInterval: RecurrenceInterval`, with the required-together refinement — consumed by Task 3's routes and Task 7's form.

- [ ] **Step 1: Write the failing tests**

Add these to the existing `lib/validation/expense.schema.test.ts` (keep all 5 existing tests unchanged, add these new `describe` blocks):

```ts
describe('createExpenseSchema recurrence refinement', () => {
  it('accepts isRecurring true with a matching recurrenceInterval', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Netflix',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
      isRecurring: true,
      recurrenceInterval: 'MONTHLY',
    });
    expect(result.success).toBe(true);
  });

  it('rejects isRecurring true without a recurrenceInterval', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Netflix',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
      isRecurring: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a recurrenceInterval when isRecurring is false', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Netflix',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
      isRecurring: false,
      recurrenceInterval: 'MONTHLY',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a plain one-off expense with neither field set', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Coffee',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateExpenseSchema recurrence refinement', () => {
  it('allows a partial update that omits both recurrence fields', () => {
    const result = updateExpenseSchema.safeParse({ amount: 20 });
    expect(result.success).toBe(true);
  });

  it('rejects setting isRecurring true without recurrenceInterval', () => {
    const result = updateExpenseSchema.safeParse({ isRecurring: true });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/validation/expense.schema.test.ts
```

Expected: FAIL — `isRecurring`/`recurrenceInterval` aren't recognized fields yet, so the "accepts" tests fail (extra keys aren't rejected by default Zod, so these might actually pass already — but the "rejects" tests will fail since nothing rejects them yet).

- [ ] **Step 3: Rewrite `lib/validation/expense.schema.ts`**

```ts
import { z } from 'zod';
import { RecurrenceInterval } from '@prisma/client';

const expenseFields = {
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  date: z.string().datetime(),
  isRecurring: z.boolean().optional(),
  recurrenceInterval: z.nativeEnum(RecurrenceInterval).optional(),
};

function requiresIntervalWhenRecurring(data: {
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
}) {
  if (data.isRecurring) {
    return data.recurrenceInterval !== undefined;
  }
  return data.recurrenceInterval === undefined;
}

const RECURRENCE_REFINEMENT_MESSAGE =
  'recurrenceInterval is required when isRecurring is true, and must be omitted when isRecurring is false';

export const createExpenseSchema = z
  .object(expenseFields)
  .refine(requiresIntervalWhenRecurring, {
    message: RECURRENCE_REFINEMENT_MESSAGE,
    path: ['recurrenceInterval'],
  });

export const updateExpenseSchema = z
  .object(expenseFields)
  .partial()
  .refine(requiresIntervalWhenRecurring, {
    message: RECURRENCE_REFINEMENT_MESSAGE,
    path: ['recurrenceInterval'],
  });

export const expenseFiltersSchema = z.object({
  categoryId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
```

**Rationale:** `updateExpenseSchema` can no longer be `createExpenseSchema.partial()` (the previous approach) because `.refine()` returns a `ZodEffects` wrapper that doesn't have a `.partial()` method — so both schemas are now built independently from the same `expenseFields` object, each with its own `.refine()`. Using `z.nativeEnum(RecurrenceInterval)` (Prisma's generated enum) instead of a hand-written `z.enum([...])` means the valid interval values live in exactly one place (the Prisma schema) — adding a new interval later only requires a migration, not a second edit here.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/validation/expense.schema.test.ts
```

Expected: PASS (11 tests — 5 existing + 6 new).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 80/80 passing (74 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add lib/validation/expense.schema.ts lib/validation/expense.schema.test.ts
git commit -m "feat: add recurrence fields to expense validation schema"
```

---

### Task 3: API Routes Accept Recurring Fields

**Files:**
- Modify: `app/api/expenses/route.ts`, `app/api/expenses/route.test.ts`, `app/api/expenses/[id]/route.test.ts`

**Interfaces:**
- Consumes: `createExpenseSchema`/`updateExpenseSchema` (Task 2).
- Produces: `POST /api/expenses` now accepts and stores `isRecurring`/`recurrenceInterval`; `PATCH /api/expenses/:id` already accepts them with no code change (verified by a new test only).

- [ ] **Step 1: Write the failing test for POST**

Add this test to the existing `app/api/expenses/route.test.ts`, inside the `describe('POST /api/expenses', ...)` block (keep the 2 existing tests unchanged):

```ts
it('creates a recurring expense with isRecurring and recurrenceInterval', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.category.findFirst.mockResolvedValue({
    id: 'cat_1',
    userId: 'user_1',
    name: 'Food',
    color: '#f97316',
    createdAt: new Date(),
  });
  prismaMock.expense.create.mockResolvedValue({
    id: 'exp_1',
    userId: 'user_1',
    categoryId: 'cat_1',
    amount: { toString: () => '15.00' } as never,
    description: 'Netflix',
    date: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date(),
    isRecurring: true,
    recurrenceInterval: 'MONTHLY',
    recurringSourceId: null,
  } as never);

  const res = await POST(
    new NextRequest('http://localhost/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        amount: 15,
        description: 'Netflix',
        categoryId: 'cat_1',
        date: '2026-08-01T00:00:00.000Z',
        isRecurring: true,
        recurrenceInterval: 'MONTHLY',
      }),
    })
  );

  expect(res.status).toBe(201);
  expect(prismaMock.expense.create).toHaveBeenCalledWith({
    data: {
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: 15,
      description: 'Netflix',
      date: new Date('2026-08-01T00:00:00.000Z'),
      isRecurring: true,
      recurrenceInterval: 'MONTHLY',
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/expenses/route.test.ts
```

Expected: FAIL — the route doesn't pass `isRecurring`/`recurrenceInterval` through to `prisma.expense.create` yet.

- [ ] **Step 3: Modify the `POST` handler in `app/api/expenses/route.ts`**

Change only the `POST` function (leave `GET` untouched):

```ts
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { amount, description, categoryId, date, isRecurring, recurrenceInterval } =
      createExpenseSchema.parse(body);

    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: user.userId },
    });
    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    const expense = await prisma.expense.create({
      data: {
        userId: user.userId,
        categoryId,
        amount,
        description,
        date: new Date(date),
        ...(isRecurring !== undefined ? { isRecurring } : {}),
        ...(recurrenceInterval !== undefined ? { recurrenceInterval } : {}),
      },
    });

    return NextResponse.json({ ...expense, amount: Number(expense.amount) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

**Do not write `isRecurring: isRecurring ?? false` directly in the object.** The existing test for a plain (non-recurring) expense asserts `prisma.expense.create` was called with an object containing exactly `{ userId, categoryId, amount, description, date }` — no extra keys. The conditional spread above means that when a request omits these fields entirely, the `create` call's `data` object is byte-identical to before; Prisma's `@default(false)` on the column fills in `isRecurring` at the database level when the key is absent from `data`.

- [ ] **Step 4: Run test to verify it passes, and confirm the pre-existing test still passes**

```bash
npx vitest run app/api/expenses/route.test.ts
```

Expected: PASS (5 tests — 3 GET + 2 POST-existing-unchanged... plus the 1 new = check the file shows all passing, no regressions on the original "creates an expense for the current user" test).

- [ ] **Step 5: Add a pass-through test for PATCH (no route code change needed)**

Add this test to the existing `app/api/expenses/[id]/route.test.ts`, inside the `describe('PATCH /api/expenses/[id]', ...)` block:

```ts
it('updates isRecurring and recurrenceInterval via a partial update', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  prismaMock.expense.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.expense.findFirst.mockResolvedValue({
    id: 'exp_1',
    userId: 'user_1',
    categoryId: 'cat_1',
    amount: { toString: () => '15.00' } as never,
    description: 'Netflix',
    date: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date(),
    isRecurring: true,
    recurrenceInterval: 'YEARLY',
    recurringSourceId: null,
  } as never);

  const req = new NextRequest('http://localhost/api/expenses/exp_1', {
    method: 'PATCH',
    body: JSON.stringify({ isRecurring: true, recurrenceInterval: 'YEARLY' }),
  });
  const res = await PATCH(req, { params: { id: 'exp_1' } });

  expect(res.status).toBe(200);
  expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
    where: { id: 'exp_1', userId: 'user_1' },
    data: { isRecurring: true, recurrenceInterval: 'YEARLY' },
  });
});
```

This test passes against the EXISTING, unmodified `PATCH` handler — it's here to prove (not just assert by inspection) that the generic `{ ...data }` spread already forwards these fields correctly once Task 2's schema accepts them.

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run "app/api/expenses/[id]/route.test.ts"
```

Expected: PASS (5 tests — 4 existing + 1 new), with zero changes to `app/api/expenses/[id]/route.ts` itself.

- [ ] **Step 7: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 82/82 passing (80 + 2 new).

- [ ] **Step 8: Commit**

```bash
git add app/api/expenses/route.ts app/api/expenses/route.test.ts "app/api/expenses/[id]/route.test.ts"
git commit -m "feat: accept recurring fields in expense create/update routes"
```

---

### Task 4: Recurrence Date-Math (Pure Function)

**Files:**
- Create: `lib/utils/recurringOccurrences.ts`, `lib/utils/recurringOccurrences.test.ts`

**Interfaces:**
- Consumes: `RecurrenceInterval` (from `@prisma/client`, Task 1).
- Produces: `computeMissingOccurrences(interval: RecurrenceInterval, sourceDate: Date, lastDate: Date, today: Date): Date[]` — consumed by Task 5's `generateDueRecurringExpenses`.

**Rationale (read before writing tests — the test dates matter):** all test dates use the local-time constructor form `new Date(year, monthIndex, day)`, never ISO date-string literals like `new Date('2026-08-01T00:00:00.000Z')`. The implementation below uses local-time `Date` methods (`getMonth`/`setDate`/etc., matching the existing `sixMonthsAgo` logic in `app/dashboard/page.tsx` and `monthKey` in `lib/utils/expenseAggregation.ts`) — parsing an ISO UTC string and then reading it with local-time getters can silently shift by a day depending on the machine's timezone, which would make these tests non-deterministic. Using the local constructor form for both the inputs and the expected outputs keeps the tests correct regardless of what timezone they run in.

- [ ] **Step 1: Write the failing tests**

`lib/utils/recurringOccurrences.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeMissingOccurrences } from './recurringOccurrences';

describe('computeMissingOccurrences', () => {
  it('returns weekly occurrences up to today', () => {
    const source = new Date(2026, 7, 1); // Aug 1, 2026
    const today = new Date(2026, 7, 22); // Aug 22, 2026
    const result = computeMissingOccurrences('WEEKLY', source, source, today);
    expect(result).toEqual([new Date(2026, 7, 8), new Date(2026, 7, 15), new Date(2026, 7, 22)]);
  });

  it('returns monthly occurrences, catching up multiple missed months', () => {
    const source = new Date(2026, 5, 15); // June 15
    const today = new Date(2026, 8, 20); // Sep 20
    const result = computeMissingOccurrences('MONTHLY', source, source, today);
    expect(result).toEqual([new Date(2026, 6, 15), new Date(2026, 7, 15), new Date(2026, 8, 15)]);
  });

  it('clamps to month-end and recovers the anchor day once the target month is long enough', () => {
    const source = new Date(2026, 0, 31); // Jan 31, 2026 (2026 is not a leap year)
    const today = new Date(2026, 3, 1); // Apr 1
    const result = computeMissingOccurrences('MONTHLY', source, source, today);
    expect(result).toEqual([
      new Date(2026, 1, 28), // Feb 28 — clamped, Feb has 28 days
      new Date(2026, 2, 31), // Mar 31 — recovered, March has 31 days
    ]);
  });

  it('returns yearly occurrences', () => {
    const source = new Date(2024, 7, 20); // Aug 20, 2024
    const today = new Date(2026, 8, 1); // Sep 1, 2026
    const result = computeMissingOccurrences('YEARLY', source, source, today);
    expect(result).toEqual([new Date(2025, 7, 20), new Date(2026, 7, 20)]);
  });

  it('returns an empty array when already up to date', () => {
    const source = new Date(2026, 7, 1); // Aug 1
    const lastDate = new Date(2026, 7, 15); // Aug 15
    const today = new Date(2026, 7, 20); // Aug 20
    const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
    expect(result).toEqual([]);
  });

  it('resumes from lastDate, not sourceDate, when some occurrences were already generated', () => {
    const source = new Date(2026, 5, 15); // June 15
    const lastDate = new Date(2026, 6, 15); // July 15 (already generated)
    const today = new Date(2026, 8, 20); // Sep 20
    const result = computeMissingOccurrences('MONTHLY', source, lastDate, today);
    expect(result).toEqual([new Date(2026, 7, 15), new Date(2026, 8, 15)]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/utils/recurringOccurrences.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/utils/recurringOccurrences.ts`**

```ts
import { RecurrenceInterval } from '@prisma/client';

function advance(sourceDate: Date, fromDate: Date, interval: RecurrenceInterval): Date {
  if (interval === 'WEEKLY') {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (interval === 'YEARLY') {
    const next = new Date(fromDate);
    next.setFullYear(next.getFullYear() + 1);
    const daysInTargetMonth = new Date(next.getFullYear(), sourceDate.getMonth() + 1, 0).getDate();
    next.setMonth(sourceDate.getMonth(), Math.min(sourceDate.getDate(), daysInTargetMonth));
    return next;
  }

  // MONTHLY — always anchor to sourceDate's day-of-month, recovering it whenever
  // the target month is long enough (e.g. Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
  const next = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 1);
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(sourceDate.getDate(), daysInTargetMonth));
  return next;
}

export function computeMissingOccurrences(
  interval: RecurrenceInterval,
  sourceDate: Date,
  lastDate: Date,
  today: Date
): Date[] {
  const occurrences: Date[] = [];
  let cursor = advance(sourceDate, lastDate, interval);

  while (cursor.getTime() <= today.getTime()) {
    occurrences.push(cursor);
    cursor = advance(sourceDate, cursor, interval);
  }

  return occurrences;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/utils/recurringOccurrences.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 88/88 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/recurringOccurrences.ts lib/utils/recurringOccurrences.test.ts
git commit -m "feat: add recurrence date-math utility"
```

---

### Task 5: Recurring Expense Generator (Prisma Wrapper)

**Files:**
- Create: `lib/generateDueRecurringExpenses.ts`, `lib/generateDueRecurringExpenses.test.ts`

**Interfaces:**
- Consumes: `computeMissingOccurrences` (Task 4), `prisma` (`lib/prisma.ts`), `tests/mocks/prisma.ts`.
- Produces: `generateDueRecurringExpenses(userId: string, today?: Date): Promise<void>` — consumed by Task 6's dashboard page.

**Rationale:** `today` is an optional second parameter (defaulting to `new Date()`) rather than the function calling `new Date()` internally with no way to override it. This is a standard dependency-injection-for-testability technique: tests pass a fixed date to get deterministic assertions, while production code (Task 6) just omits the argument and gets the real current time. The alternative — mocking the global `Date` object with `vi.useFakeTimers()` — is more invasive and can leak into unrelated parts of a test file; injecting the value directly is simpler and keeps the function's contract explicit.

- [ ] **Step 1: Write the failing tests**

`lib/generateDueRecurringExpenses.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { generateDueRecurringExpenses } from './generateDueRecurringExpenses';

const template = {
  id: 'exp_template',
  userId: 'user_1',
  categoryId: 'cat_1',
  amount: { toString: () => '15.00' } as never,
  description: 'Netflix',
  date: new Date(2026, 5, 15), // June 15
  createdAt: new Date(),
  isRecurring: true,
  recurrenceInterval: 'MONTHLY',
  recurringSourceId: null,
} as never;

describe('generateDueRecurringExpenses', () => {
  it('creates a missing instance for a due monthly recurring expense', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([template]).mockResolvedValueOnce([]);
    prismaMock.expense.create.mockResolvedValue({} as never);

    await generateDueRecurringExpenses('user_1', new Date(2026, 6, 20)); // July 20

    expect(prismaMock.expense.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'user_1', isRecurring: true },
    });
    expect(prismaMock.expense.findMany).toHaveBeenNthCalledWith(2, {
      where: { recurringSourceId: 'exp_template' },
      orderBy: { date: 'desc' },
      take: 1,
    });
    expect(prismaMock.expense.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: template.amount,
        description: 'Netflix',
        date: new Date(2026, 6, 15), // July 15
        isRecurring: false,
        recurringSourceId: 'exp_template',
      },
    });
  });

  it('creates nothing when no occurrence is due yet', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([template]).mockResolvedValueOnce([]);

    await generateDueRecurringExpenses('user_1', new Date(2026, 5, 20)); // June 20, before July 15 is due

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('scopes the template lookup to userId and creates nothing when there are no templates', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([]);

    await generateDueRecurringExpenses('user_1', new Date(2026, 7, 1));

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isRecurring: true },
    });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/generateDueRecurringExpenses.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/generateDueRecurringExpenses.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { computeMissingOccurrences } from '@/lib/utils/recurringOccurrences';

export async function generateDueRecurringExpenses(userId: string, today: Date = new Date()): Promise<void> {
  const templates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
  });

  for (const template of templates) {
    if (!template.recurrenceInterval) continue;

    const instances = await prisma.expense.findMany({
      where: { recurringSourceId: template.id },
      orderBy: { date: 'desc' },
      take: 1,
    });

    const lastDate = instances[0]?.date ?? template.date;

    const missingDates = computeMissingOccurrences(
      template.recurrenceInterval,
      template.date,
      lastDate,
      today
    );

    for (const occurrenceDate of missingDates) {
      await prisma.expense.create({
        data: {
          userId: template.userId,
          categoryId: template.categoryId,
          amount: template.amount,
          description: template.description,
          date: occurrenceDate,
          isRecurring: false,
          recurringSourceId: template.id,
        },
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/generateDueRecurringExpenses.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 91/91 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/generateDueRecurringExpenses.ts lib/generateDueRecurringExpenses.test.ts
git commit -m "feat: add recurring expense generator"
```

---

### Task 6: Dashboard Integration

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `generateDueRecurringExpenses` (Task 5).

- [ ] **Step 1: Modify `app/dashboard/page.tsx`**

Add the import and one call, right after the existing `if (!user) return null;` check and before the `sixMonthsAgo` computation. Everything else in the file is unchanged:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory, aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { CountUpStat } from '@/components/ui/CountUpStat';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // middleware.ts already guarantees `user` is non-null for this route;
  // this check exists only to satisfy TypeScript.
  if (!user) return null;

  await generateDueRecurringExpenses(user.userId);

  const sixMonthsAgo = new Date();
  // ...rest of the file unchanged from here down...
```

- [ ] **Step 2: Verify via curl (signup, create a backdated recurring expense, confirm the dashboard generates catch-up instances)**

```bash
npm run dev &
sleep 4
curl -s -c /tmp/recurring-verify-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"recurring-verify-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

CATEGORY_ID=$(curl -s -b /tmp/recurring-verify-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
TWO_MONTHS_AGO=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow() - timedelta(days=61)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")

curl -s -b /tmp/recurring-verify-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":10,\"description\":\"Recurring Test\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"$TWO_MONTHS_AGO\",\"isRecurring\":true,\"recurrenceInterval\":\"MONTHLY\"}" \
  -o /dev/null -w "create recurring status: %{http_code}\n"

curl -s -b /tmp/recurring-verify-cookies.txt http://localhost:3000/dashboard -o /dev/null -w "dashboard status (triggers generation): %{http_code}\n"

curl -s -b /tmp/recurring-verify-cookies.txt http://localhost:3000/api/expenses | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('total expenses:', len(data))
assert len(data) >= 2, 'expected the original recurring expense plus at least one generated catch-up instance'
print('PASS: catch-up generation created at least one new expense')
"

rm -f /tmp/recurring-verify-cookies.txt
kill %1
```

Expected: `201` for the recurring expense creation, `200` for the dashboard load, and the Python check prints "PASS" (a MONTHLY expense backdated 61 days should generate at least 1, likely 2, catch-up instances by today).

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: generate due recurring expenses on dashboard load"
```

---

### Task 7: ExpenseForm — Repeat Checkbox

**Files:**
- Modify: `components/expenses/ExpenseForm.tsx`, `components/expenses/ExpenseForm.test.tsx`

**Interfaces:**
- Produces: `ExpenseForm`'s `initialValues` prop gains optional `isRecurring`/`recurrenceInterval`; its `onSubmit` payload now always includes `isRecurring: boolean` and `recurrenceInterval: RecurrenceInterval | undefined` — consumed by Task 8's `ExpensesClient`.

- [ ] **Step 1: Write the failing tests**

Add these to the existing `components/expenses/ExpenseForm.test.tsx` (keep the 2 existing tests unchanged):

```ts
it('shows the interval select only when Repeat is checked', () => {
  render(<ExpenseForm categories={categories} onSubmit={vi.fn()} />);

  expect(screen.queryByLabelText(/repeat interval/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/^repeat$/i));

  expect(screen.getByLabelText(/repeat interval/i)).toBeInTheDocument();
});

it('submits isRecurring and recurrenceInterval when Repeat is checked', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15' } });
  fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Netflix' } });
  fireEvent.click(screen.getByLabelText(/^repeat$/i));
  fireEvent.change(screen.getByLabelText(/repeat interval/i), { target: { value: 'YEARLY' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ isRecurring: true, recurrenceInterval: 'YEARLY' })
  );
});

it('submits isRecurring false and no recurrenceInterval when Repeat is unchecked', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '15' } });
  fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Coffee' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ isRecurring: false, recurrenceInterval: undefined })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/expenses/ExpenseForm.test.tsx
```

Expected: FAIL — no "Repeat" checkbox exists yet.

- [ ] **Step 3: Rewrite `components/expenses/ExpenseForm.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';
import { Button } from '@/components/ui/Button';

type Interval = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

interface ExpenseFormProps {
  categories: { id: string; name: string }[];
  initialValues?: {
    amount?: number;
    description?: string;
    categoryId?: string;
    date?: string;
    isRecurring?: boolean;
    recurrenceInterval?: Interval;
  };
  onSubmit: (data: CreateExpenseInput) => Promise<void>;
}

export function ExpenseForm({ categories, initialValues, onSubmit }: ExpenseFormProps) {
  const [amount, setAmount] = useState(initialValues?.amount?.toString() ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [date, setDate] = useState(initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(initialValues?.isRecurring ?? false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<Interval>(
    initialValues?.recurrenceInterval ?? 'MONTHLY'
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      amount: Number(amount),
      description,
      categoryId,
      date: new Date(date).toISOString(),
      isRecurring,
      recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
    });
    setSubmitting(false);
  }

  const inputClasses =
    'rounded-xl border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
        Description
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClasses}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        Repeat
      </label>
      {isRecurring && (
        <label className="flex flex-col text-sm text-foreground">
          Repeat interval
          <select
            value={recurrenceInterval}
            onChange={(e) => setRecurrenceInterval(e.target.value as Interval)}
            className={inputClasses}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/expenses/ExpenseForm.test.tsx
```

Expected: PASS (5 tests — 2 existing + 3 new).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 94/94 passing.

- [ ] **Step 6: Commit**

```bash
git add components/expenses/ExpenseForm.tsx components/expenses/ExpenseForm.test.tsx
git commit -m "feat: add Repeat checkbox and interval select to ExpenseForm"
```

---

### Task 8: Expense List — Repeat Icon and Edit Pre-fill

**Files:**
- Modify: `app/expenses/page.tsx`, `app/expenses/ExpensesClient.tsx`

**Interfaces:**
- Consumes: `ExpenseForm`'s updated `initialValues`/`onSubmit` shape (Task 7).

- [ ] **Step 1: Modify `app/expenses/page.tsx`**

Change only the `serialized` mapping (everything else in the file is unchanged):

```tsx
const serialized = expenses.map((e) => ({
  id: e.id,
  amount: Number(e.amount),
  description: e.description,
  date: e.date.toISOString(),
  isRecurring: e.isRecurring,
  recurrenceInterval: e.recurrenceInterval ?? undefined,
  category: { id: e.category.id, name: e.category.name, color: e.category.color },
}));
```

- [ ] **Step 2: Modify `app/expenses/ExpensesClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { PencilIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';

interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  isRecurring: boolean;
  recurrenceInterval?: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  category: { id: string; name: string; color: string };
}

export function ExpensesClient({
  categories,
  initialExpenses,
}: {
  categories: { id: string; name: string; color: string }[];
  initialExpenses: Expense[];
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleCreate(data: CreateExpenseInput) {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save expense');
      return;
    }
    const created = await res.json();
    const category = categories.find((c) => c.id === created.categoryId)!;
    setExpenses((prev) => [{ ...created, amount: Number(created.amount), category }, ...prev]);
    setShowAddForm(false);
  }

  async function handleUpdate(id: string, data: CreateExpenseInput) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save expense');
      return;
    }
    const category = categories.find((c) => c.id === data.categoryId)!;
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              amount: data.amount,
              description: data.description,
              date: data.date,
              isRecurring: data.isRecurring ?? false,
              recurrenceInterval: data.recurrenceInterval,
              category,
            }
          : e
      )
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to delete expense');
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <Button onClick={() => setShowAddForm((v) => !v)} variant="secondary" className="mb-4">
        {showAddForm ? 'Cancel' : 'Add expense'}
      </Button>

      {showAddForm && (
        <Card className="mb-6">
          <ExpenseForm categories={categories} onSubmit={handleCreate} />
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {expenses.map((expense, index) =>
          editingId === expense.id ? (
            <li key={expense.id}>
              <Card>
                <ExpenseForm
                  categories={categories}
                  initialValues={{
                    amount: expense.amount,
                    description: expense.description,
                    categoryId: expense.category.id,
                    date: expense.date.slice(0, 10),
                    isRecurring: expense.isRecurring,
                    recurrenceInterval: expense.recurrenceInterval,
                  }}
                  onSubmit={(data) => handleUpdate(expense.id, data)}
                />
              </Card>
            </li>
          ) : (
            <li
              key={expense.id}
              className="animate-fade-slide-in motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
            >
              <Card className="flex items-center justify-between text-sm">
                <div>
                  <p className="flex items-center gap-1 font-medium text-foreground">
                    {expense.description}
                    {expense.isRecurring && (
                      <ArrowPathIcon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    )}
                  </p>
                  <p className="text-muted">
                    {expense.category.name} · {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">${expense.amount.toFixed(2)}</span>
                  <IconButton icon={PencilIcon} label="Edit" onClick={() => setEditingId(expense.id)} />
                  <IconButton
                    icon={TrashIcon}
                    label="Delete"
                    variant="destructive"
                    onClick={() => handleDelete(expense.id)}
                  />
                </div>
              </Card>
            </li>
          )
        )}
        {expenses.length === 0 && <p className="text-sm text-muted">No expenses match these filters.</p>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify via curl (signup, create a recurring expense, confirm the list shows it and the repeat icon markup is present)**

```bash
npm run dev &
sleep 4
curl -s -c /tmp/exp-recurring-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"exp-recurring-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"
CATEGORY_ID=$(curl -s -b /tmp/exp-recurring-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s -b /tmp/exp-recurring-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":15,\"description\":\"Recurring List Test\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"isRecurring\":true,\"recurrenceInterval\":\"MONTHLY\"}" \
  -o /dev/null -w "create status: %{http_code}\n"
curl -s -b /tmp/exp-recurring-cookies.txt http://localhost:3000/expenses -o /tmp/exp-recurring.html \
  -w "expenses page status: %{http_code}\n"
grep -o 'Recurring List Test' /tmp/exp-recurring.html
rm -f /tmp/exp-recurring-cookies.txt /tmp/exp-recurring.html
kill %1
```

Expected: `201`/`200`, and the grep finds a match.

- [ ] **Step 4: Run the full suite one more time to confirm no regressions**

```bash
npx vitest run
```

Expected: 94/94 passing (unchanged — no new tests in this task).

- [ ] **Step 5: Commit**

```bash
git add app/expenses/page.tsx app/expenses/ExpensesClient.tsx
git commit -m "feat: show repeat icon and pre-fill recurrence on edit"
```

---

### Task 9: Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: 94/94 passing, pristine output.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either.

- [ ] **Step 3: Full end-to-end smoke test — create, edit, and verify catch-up generation**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/final-recurring-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"final-recurring-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

CATEGORY_ID=$(curl -s -b /tmp/final-recurring-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
TWO_MONTHS_AGO=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow() - timedelta(days=61)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")

echo "--- create a recurring expense backdated 61 days ---"
EXPENSE_ID=$(curl -s -b /tmp/final-recurring-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":10,\"description\":\"Final Test Recurring\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"$TWO_MONTHS_AGO\",\"isRecurring\":true,\"recurrenceInterval\":\"MONTHLY\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "created: $EXPENSE_ID"

echo "--- edit its amount (recurrence fields stay unchanged) ---"
curl -s -b /tmp/final-recurring-cookies.txt -X PATCH "http://localhost:3000/api/expenses/$EXPENSE_ID" \
  -H "Content-Type: application/json" -d '{"amount": 12}' -w "%{http_code}\n"

echo "--- load dashboard to trigger catch-up generation ---"
curl -s -b /tmp/final-recurring-cookies.txt http://localhost:3000/dashboard -o /dev/null -w "%{http_code}\n"

echo "--- confirm catch-up instances were generated ---"
curl -s -b /tmp/final-recurring-cookies.txt http://localhost:3000/api/expenses | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('total expenses:', len(data))
assert len(data) >= 2, 'expected the original recurring expense plus at least one generated catch-up instance'
generated = [e for e in data if e.get('recurringSourceId')]
print('generated instances:', len(generated))
assert len(generated) >= 1
print('PASS')
"

rm -f /tmp/final-recurring-cookies.txt
kill %1
```

Expected: all status codes `200`/`201`, the script prints "PASS".

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## End of v1.2 (Recurring Expenses)

At this point: users can mark any expense as recurring (weekly/monthly/yearly), edit or
delete it like any other expense, and future occurrences generate automatically —
including catching up on any months missed between visits — the next time they load
the dashboard. v1.3 (CSV import/export) is next, as its own spec → plan → build cycle.
