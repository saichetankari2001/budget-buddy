# Budget Buddy v1.3 (CSV Import/Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export their full expense history to a CSV file, and bulk-import expenses from a CSV file, with malformed rows skipped and reported rather than blocking the whole import.

**Architecture:** Two new API routes, each backed by a pure, unit-testable function kept separate from the Prisma-touching code that reads/writes the database — the same separation already used for `computeCountUpValue`, `aggregateByCategory`, and `computeMissingOccurrences` in earlier phases. Export serializes via a hand-rolled CSV writer; import parses via the `papaparse` library (the one place in this app where a small dependency is worth it, since hand-written CSV parsers are a classic source of subtle bugs).

**Tech Stack:** Next.js 14 App Router + TypeScript (existing), Prisma + Neon Postgres (existing), Zod (existing, not used directly in this feature — validation here is plain TypeScript since CSV rows aren't JSON), `papaparse` (new dependency), Vitest.

## Global Constraints

- CSV columns, in order: `date,description,category,amount`. Dates as `YYYY-MM-DD`; amounts as plain decimal strings with 2 decimal places (e.g. `42.50`); category as its name, not its ID.
- Export covers the user's full expense history — no filters.
- Import: a row is valid only if `date` matches `YYYY-MM-DD` exactly, `description` is non-empty, `category` is non-empty, and `amount` parses to a positive number. Invalid rows are skipped (not imported) and reported with a 1-indexed row number (excluding the header) and a reason — they never block the rest of the file.
- Import auto-creates any category name that doesn't already exist for the user (case-insensitive match against existing categories), cycling through the existing `DEFAULT_CATEGORIES` color palette in `lib/constants.ts` (`#f97316, #3b82f6, #8b5cf6, #10b981, #ec4899, #6b7280`) — reuse this palette exactly, never invent a new one. A category created for one row in a file is reused for later rows in the same file that reference the same name.
- No recurring-expense fields (`isRecurring`/`recurrenceInterval`) in the CSV format — only the four core columns. Imported expenses are always plain (non-recurring).
- All Prisma queries/mutations scoped to `userId`, matching every other route in this app.
- Every route wraps its body in try/catch and calls `handleRouteError(error)` on failure, using `AppError(401, 'Not authenticated')` for the auth check, matching every existing route in this app.
- No dedicated test file for the two new UI buttons in `ExpensesClient.tsx` — curl-verified instead, matching this component's existing convention.

---

## File Structure

```
budget-buddy/
├── package.json                                  # MODIFY: add papaparse + @types/papaparse
├── lib/
│   ├── utils/
│   │   ├── csv.ts                                 # CREATE: serializeExpensesToCsv, parseAndValidateCsvRows
│   │   └── csv.test.ts                             # CREATE
│   ├── importExpensesFromCsv.ts                    # CREATE: Prisma wrapper
│   └── importExpensesFromCsv.test.ts               # CREATE
├── app/
│   ├── api/
│   │   └── expenses/
│   │       ├── export/
│   │       │   ├── route.ts                         # CREATE: GET
│   │       │   └── route.test.ts                    # CREATE
│   │       └── import/
│   │           ├── route.ts                         # CREATE: POST
│   │           └── route.test.ts                    # CREATE
│   └── expenses/
│       └── ExpensesClient.tsx                        # MODIFY: Export/Import buttons + results summary
```

---

### Task 1: CSV Serialization (Export Side)

**Files:**
- Create: `lib/utils/csv.ts`
- Test: `lib/utils/csv.test.ts`

**Interfaces:**
- Produces: `serializeExpensesToCsv(expenses: { date: string; description: string; categoryName: string; amount: number }[]): string` — consumed by Task 4's export route.

- [ ] **Step 1: Write the failing tests**

`lib/utils/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { serializeExpensesToCsv } from './csv';

describe('serializeExpensesToCsv', () => {
  it('returns just the header for an empty list', () => {
    expect(serializeExpensesToCsv([])).toBe('date,description,category,amount');
  });

  it('serializes normal rows', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Groceries', categoryName: 'Food', amount: 42.5 },
      { date: '2026-08-02', description: 'Bus fare', categoryName: 'Transport', amount: 3 },
    ]);
    expect(csv).toBe(
      'date,description,category,amount\n2026-08-01,Groceries,Food,42.50\n2026-08-02,Bus fare,Transport,3.00'
    );
  });

  it('quotes a description containing a comma', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Coffee, tea', categoryName: 'Food', amount: 5 },
    ]);
    expect(csv).toBe('date,description,category,amount\n2026-08-01,"Coffee, tea",Food,5.00');
  });

  it('escapes a description containing a double quote', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'The "best" coffee', categoryName: 'Food', amount: 5 },
    ]);
    expect(csv).toBe('date,description,category,amount\n2026-08-01,"The ""best"" coffee",Food,5.00');
  });

  it('quotes and escapes a description containing both a comma and a double quote', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Coffee, "the best"', categoryName: 'Food', amount: 5 },
    ]);
    expect(csv).toBe('date,description,category,amount\n2026-08-01,"Coffee, ""the best""",Food,5.00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/utils/csv.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/utils/csv.ts`**

```ts
export interface CsvExpenseRow {
  date: string;
  description: string;
  categoryName: string;
  amount: number;
}

function escapeCsvField(field: string): string {
  if (/[",\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function serializeExpensesToCsv(expenses: CsvExpenseRow[]): string {
  const header = 'date,description,category,amount';
  const rows = expenses.map((e) =>
    [e.date, escapeCsvField(e.description), escapeCsvField(e.categoryName), e.amount.toFixed(2)].join(',')
  );
  return [header, ...rows].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/utils/csv.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 100/100 passing (95 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add lib/utils/csv.ts lib/utils/csv.test.ts
git commit -m "feat: add CSV serialization for expense export"
```

---

### Task 2: CSV Parsing and Validation (Import Side)

**Files:**
- Modify: `package.json` (add `papaparse` + `@types/papaparse`)
- Modify: `lib/utils/csv.ts` (add `parseAndValidateCsvRows`)
- Modify: `lib/utils/csv.test.ts` (add new tests, keep the 5 existing ones)

**Interfaces:**
- Produces: `parseAndValidateCsvRows(csvText: string): { valid: ParsedExpenseRow[]; skipped: SkippedRow[] }`, where `ParsedExpenseRow = { date: string; description: string; categoryName: string; amount: number }` and `SkippedRow = { row: number; reason: string }` — consumed by Task 3's `importExpensesFromCsv` wrapper.

**Rationale:** this is the one dependency addition in this feature. CSV parsing has real edge cases — quoted fields containing commas, quoted fields containing embedded newlines, different quote-escaping conventions — that are easy to get subtly wrong by hand. `papaparse` is small (~6KB), has no dependencies of its own, and is one of the most widely used, well-tested CSV parsers in the JS ecosystem. Serialization (Task 1) stays hand-rolled because writing CSV is far simpler than reading it — there's no ambiguity to resolve on the way out, only on the way in.

- [ ] **Step 1: Add the dependency**

```bash
npm install papaparse
npm install --save-dev @types/papaparse
```

- [ ] **Step 2: Write the failing tests**

Add these to `lib/utils/csv.test.ts` (keep the 5 existing `serializeExpensesToCsv` tests unchanged, add a new `describe` block and the `parseAndValidateCsvRows` import):

```ts
import { parseAndValidateCsvRows } from './csv';

describe('parseAndValidateCsvRows', () => {
  it('parses a clean file into valid rows', () => {
    const csv =
      'date,description,category,amount\n2026-08-01,Groceries,Food,42.50\n2026-08-02,Bus fare,Transport,3.00';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([
      { date: '2026-08-01', description: 'Groceries', categoryName: 'Food', amount: 42.5 },
      { date: '2026-08-02', description: 'Bus fare', categoryName: 'Transport', amount: 3 },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('skips a row with an invalid date', () => {
    const csv = 'date,description,category,amount\nnot-a-date,Groceries,Food,42.50';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([
      { row: 1, reason: 'date "not-a-date" is not a valid YYYY-MM-DD date' },
    ]);
  });

  it('skips a row with a non-numeric amount', () => {
    const csv = 'date,description,category,amount\n2026-08-01,Groceries,Food,not-a-number';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([
      { row: 1, reason: 'amount "not-a-number" is not a positive number' },
    ]);
  });

  it('skips a row with an empty description', () => {
    const csv = 'date,description,category,amount\n2026-08-01,,Food,42.50';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([{ row: 1, reason: 'description is empty' }]);
  });

  it('correctly parses a quoted field containing a comma (round-trip with the exporter)', () => {
    const csv = 'date,description,category,amount\n2026-08-01,"Coffee, tea",Food,5.00';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([
      { date: '2026-08-01', description: 'Coffee, tea', categoryName: 'Food', amount: 5 },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('returns empty valid and skipped arrays for a file with only a header', () => {
    const csv = 'date,description,category,amount';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run lib/utils/csv.test.ts
```

Expected: FAIL — `parseAndValidateCsvRows` not exported.

- [ ] **Step 4: Add `parseAndValidateCsvRows` to `lib/utils/csv.ts`**

Add this to the top of the file (alongside the existing `escapeCsvField`/`serializeExpensesToCsv`, which stay unchanged):

```ts
import Papa from 'papaparse';

export interface ParsedExpenseRow {
  date: string;
  description: string;
  categoryName: string;
  amount: number;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseResult {
  valid: ParsedExpenseRow[];
  skipped: SkippedRow[];
}

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseAndValidateCsvRows(csvText: string): ParseResult {
  const { data } = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const valid: ParsedExpenseRow[] = [];
  const skipped: SkippedRow[] = [];

  data.forEach((row, index) => {
    const rowNumber = index + 1;
    const date = (row.date ?? '').trim();
    const description = (row.description ?? '').trim();
    const categoryName = (row.category ?? '').trim();
    const amountRaw = (row.amount ?? '').trim();

    if (!DATE_FORMAT_REGEX.test(date) || Number.isNaN(Date.parse(date))) {
      skipped.push({ row: rowNumber, reason: `date "${date}" is not a valid YYYY-MM-DD date` });
      return;
    }
    if (!description) {
      skipped.push({ row: rowNumber, reason: 'description is empty' });
      return;
    }
    if (!categoryName) {
      skipped.push({ row: rowNumber, reason: 'category is empty' });
      return;
    }
    const amount = Number(amountRaw);
    if (amountRaw === '' || Number.isNaN(amount) || amount <= 0) {
      skipped.push({ row: rowNumber, reason: `amount "${amountRaw}" is not a positive number` });
      return;
    }

    valid.push({ date, description, categoryName, amount });
  });

  return { valid, skipped };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/utils/csv.test.ts
```

Expected: PASS (11 tests — 5 existing + 6 new).

- [ ] **Step 6: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 106/106 passing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/utils/csv.ts lib/utils/csv.test.ts
git commit -m "feat: add CSV parsing and validation for expense import"
```

---

### Task 3: Import Wrapper (Category Matching + Expense Creation)

**Files:**
- Create: `lib/importExpensesFromCsv.ts`
- Create: `lib/importExpensesFromCsv.test.ts`

**Interfaces:**
- Consumes: `parseAndValidateCsvRows` (Task 2), `DEFAULT_CATEGORIES` from `lib/constants.ts` (existing), `prisma` (`lib/prisma.ts`), `tests/mocks/prisma.ts`.
- Produces: `importExpensesFromCsv(userId: string, csvText: string): Promise<{ imported: number; skipped: SkippedRow[] }>` — consumed by Task 5's import route.

- [ ] **Step 1: Write the failing tests**

`lib/importExpensesFromCsv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { importExpensesFromCsv } from './importExpensesFromCsv';

describe('importExpensesFromCsv', () => {
  it('matches an existing category case-insensitively and creates the expense', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
    ]);
    prismaMock.expense.create.mockResolvedValue({} as never);

    const csv = 'date,description,category,amount\n2026-08-01,Groceries,food,42.50';
    const result = await importExpensesFromCsv('user_1', csv);

    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: 42.5,
        description: 'Groceries',
        date: new Date('2026-08-01'),
      },
    });
  });

  it('auto-creates a missing category once and reuses it across multiple rows', async () => {
    prismaMock.category.findMany.mockResolvedValue([]);
    prismaMock.category.create.mockResolvedValue({
      id: 'cat_new',
      userId: 'user_1',
      name: 'Subscriptions',
      color: '#f97316',
      createdAt: new Date(),
    });
    prismaMock.expense.create.mockResolvedValue({} as never);

    const csv =
      'date,description,category,amount\n2026-08-01,Netflix,Subscriptions,15.00\n2026-08-02,Spotify,Subscriptions,10.00';
    const result = await importExpensesFromCsv('user_1', csv);

    expect(result.imported).toBe(2);
    expect(prismaMock.category.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', name: 'Subscriptions', color: '#f97316' },
    });
    expect(prismaMock.expense.create).toHaveBeenCalledTimes(2);
  });

  it('reports skipped rows from validation alongside successfully imported ones', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
    ]);
    prismaMock.expense.create.mockResolvedValue({} as never);

    const csv =
      'date,description,category,amount\n2026-08-01,Groceries,Food,42.50\nnot-a-date,Bad Row,Food,10.00';
    const result = await importExpensesFromCsv('user_1', csv);

    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual([
      { row: 2, reason: 'date "not-a-date" is not a valid YYYY-MM-DD date' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/importExpensesFromCsv.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/importExpensesFromCsv.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { parseAndValidateCsvRows, SkippedRow } from '@/lib/utils/csv';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

const CATEGORY_COLOR_PALETTE = DEFAULT_CATEGORIES.map((c) => c.color);

export async function importExpensesFromCsv(
  userId: string,
  csvText: string
): Promise<{ imported: number; skipped: SkippedRow[] }> {
  const { valid, skipped } = parseAndValidateCsvRows(csvText);

  const existingCategories = await prisma.category.findMany({ where: { userId } });
  const categoryByLowerName = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c]));
  let paletteIndex = existingCategories.length;

  let imported = 0;
  for (const row of valid) {
    const key = row.categoryName.toLowerCase();
    let category = categoryByLowerName.get(key);
    if (!category) {
      category = await prisma.category.create({
        data: {
          userId,
          name: row.categoryName,
          color: CATEGORY_COLOR_PALETTE[paletteIndex % CATEGORY_COLOR_PALETTE.length],
        },
      });
      paletteIndex += 1;
      categoryByLowerName.set(key, category);
    }

    await prisma.expense.create({
      data: {
        userId,
        categoryId: category.id,
        amount: row.amount,
        description: row.description,
        date: new Date(row.date),
      },
    });
    imported += 1;
  }

  return { imported, skipped };
}
```

**Rationale:** the in-memory `categoryByLowerName` map is seeded once from the user's existing categories, then updated as new categories are created during the loop — this is what makes the second test case work (`Subscriptions` is created once on row 1, then found in the map on row 2 without a second `category.create` call). `paletteIndex` starts at the count of existing categories so a user who already has 6 categories doesn't always get the same color for their first auto-created one.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/importExpensesFromCsv.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 109/109 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/importExpensesFromCsv.ts lib/importExpensesFromCsv.test.ts
git commit -m "feat: add CSV import wrapper with category auto-creation"
```

---

### Task 4: Export Route

**Files:**
- Create: `app/api/expenses/export/route.ts`
- Create: `app/api/expenses/export/route.test.ts`

**Interfaces:**
- Consumes: `serializeExpensesToCsv` (Task 1), `getCurrentUser` (`lib/auth/session.ts`, existing), `AppError`/`handleRouteError` (existing).
- Produces: `GET /api/expenses/export` — consumed by Task 6's UI.

- [ ] **Step 1: Write the failing tests**

`app/api/expenses/export/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { GET } from './route';

vi.mock('@/lib/auth/session');

const mockUser = { userId: 'user_1', email: 'test@example.com' };

describe('GET /api/expenses/export', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns a CSV file with the correct headers and content', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: 'exp_1',
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: { toString: () => '42.50' } as never,
        description: 'Groceries',
        date: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date(),
        isRecurring: false,
        recurrenceInterval: null,
        recurringSourceId: null,
        category: { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
      },
    ] as never);

    const res = await GET();
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="expenses.csv"');
    expect(text).toBe('date,description,category,amount\n2026-08-01,Groceries,Food,42.50');
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      include: { category: true },
      orderBy: { date: 'asc' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/expenses/export/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/api/expenses/export/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { serializeExpensesToCsv } from '@/lib/utils/csv';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const expenses = await prisma.expense.findMany({
      where: { userId: user.userId },
      include: { category: true },
      orderBy: { date: 'asc' },
    });

    const csv = serializeExpensesToCsv(
      expenses.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        description: e.description,
        categoryName: e.category.name,
        amount: Number(e.amount),
      }))
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="expenses.csv"',
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/expenses/export/route.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 111/111 passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/expenses/export/route.ts app/api/expenses/export/route.test.ts
git commit -m "feat: add CSV export route"
```

---

### Task 5: Import Route

**Files:**
- Create: `app/api/expenses/import/route.ts`
- Create: `app/api/expenses/import/route.test.ts`

**Interfaces:**
- Consumes: `importExpensesFromCsv` (Task 3), `getCurrentUser` (existing), `AppError`/`handleRouteError` (existing).
- Produces: `POST /api/expenses/import`, request body a `multipart/form-data` upload with a `file` field, response body `{ imported: number, skipped: { row: number, reason: string }[] }` — consumed by Task 6's UI.

- [ ] **Step 1: Write the failing tests**

`app/api/expenses/import/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { importExpensesFromCsv } from '@/lib/importExpensesFromCsv';
import { POST } from './route';

vi.mock('@/lib/auth/session');
vi.mock('@/lib/importExpensesFromCsv');

const mockUser = { userId: 'user_1', email: 'test@example.com' };

describe('POST /api/expenses/import', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const formData = new FormData();
    formData.append(
      'file',
      new File(['date,description,category,amount'], 'expenses.csv', { type: 'text/csv' })
    );
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file is uploaded', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    const formData = new FormData();
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('imports a valid CSV file and returns the summary', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(importExpensesFromCsv).mockResolvedValue({ imported: 2, skipped: [] });

    const csvContent = 'date,description,category,amount\n2026-08-01,Groceries,Food,42.50';
    const formData = new FormData();
    formData.append('file', new File([csvContent], 'expenses.csv', { type: 'text/csv' }));
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ imported: 2, skipped: [] });
    expect(importExpensesFromCsv).toHaveBeenCalledWith('user_1', csvContent);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/expenses/import/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/api/expenses/import/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { importExpensesFromCsv } from '@/lib/importExpensesFromCsv';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new AppError(400, 'No file uploaded');
    }

    const csvText = await file.text();
    const result = await importExpensesFromCsv(user.userId, csvText);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/expenses/import/route.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 114/114 passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/expenses/import/route.ts app/api/expenses/import/route.test.ts
git commit -m "feat: add CSV import route"
```

---

### Task 6: Export/Import Buttons on the Expenses Page

**Files:**
- Modify: `app/expenses/ExpensesClient.tsx`

**Interfaces:**
- Consumes: `GET /api/expenses/export` (Task 4), `POST /api/expenses/import` (Task 5).

- [ ] **Step 1: Modify `app/expenses/ExpensesClient.tsx`**

Add a `ChangeEvent` import, an `importSummary` state, a `handleImport` function, and the two new buttons plus the summary panel. The full updated file:

```tsx
'use client';

import { useState, ChangeEvent } from 'react';
import { PencilIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { RecurrenceInterval } from '@prisma/client';
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
  recurrenceInterval?: RecurrenceInterval;
  category: { id: string; name: string; color: string };
}

interface ImportSummary {
  imported: number;
  skipped: { row: number; reason: string }[];
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
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

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

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/expenses/import', { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to import expenses');
      return;
    }

    const result: ImportSummary = await res.json();
    setImportSummary(result);

    interface ExpenseApiResponse {
      id: string;
      amount: number;
      description: string;
      date: string;
      isRecurring: boolean;
      recurrenceInterval: RecurrenceInterval | null;
      category: { id: string; name: string; color: string };
    }

    const refreshed = await fetch('/api/expenses');
    if (refreshed.ok) {
      const data: ExpenseApiResponse[] = await refreshed.json();
      setExpenses(
        data.map((d) => ({
          id: d.id,
          amount: d.amount,
          description: d.description,
          date: d.date,
          isRecurring: d.isRecurring,
          recurrenceInterval: d.recurrenceInterval ?? undefined,
          category: { id: d.category.id, name: d.category.name, color: d.category.color },
        }))
      );
    }
  }

  return (
    <div>
      {importSummary && (
        <Card className="mb-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">
                Imported {importSummary.imported} expense{importSummary.imported === 1 ? '' : 's'}.
              </p>
              {importSummary.skipped.length > 0 && (
                <div className="mt-2">
                  <p className="text-muted">
                    {importSummary.skipped.length} row{importSummary.skipped.length === 1 ? '' : 's'} skipped:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-muted">
                    {importSummary.skipped.map((s) => (
                      <li key={s.row}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              onClick={() => setImportSummary(null)}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setShowAddForm((v) => !v)} variant="secondary">
          {showAddForm ? 'Cancel' : 'Add expense'}
        </Button>
        <a
          href="/api/expenses/export"
          className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition duration-200 hover:bg-background"
        >
          Export CSV
        </a>
        <label className="cursor-pointer rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition duration-200 hover:bg-background">
          Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
      </div>

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

**Rationale for refetching via `GET /api/expenses` after import** (rather than a full page reload): the `categories` prop passed into this component is a snapshot from the server component at page load — it won't include any categories the import just auto-created. `GET /api/expenses` already returns each expense with its joined `category` object (see `app/api/expenses/route.ts`), so rebuilding local state directly from that response (rather than looking categories up in the stale `categories` prop, the way `handleCreate`/`handleUpdate` do) sidesteps the staleness problem entirely — a newly auto-created category shows up correctly without needing to separately refetch the categories list.

- [ ] **Step 2: Verify via curl (export downloads a CSV, import round-trips a file, including an auto-created category)**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/csv-verify-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"csv-verify-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

echo "--- export (should be header-only, no expenses yet) ---"
curl -s -b /tmp/csv-verify-cookies.txt http://localhost:3000/api/expenses/export -o /tmp/export-empty.csv \
  -w "export status: %{http_code}\n"
cat /tmp/export-empty.csv
echo ""

echo "--- import a small CSV with one clean row and one bad row, referencing a brand-new category ---"
printf 'date,description,category,amount\n2026-08-01,Domain renewal,Web Hosting,12.00\nnot-a-date,Bad Row,Web Hosting,5.00\n' > /tmp/import-test.csv
curl -s -b /tmp/csv-verify-cookies.txt -X POST http://localhost:3000/api/expenses/import \
  -F "file=@/tmp/import-test.csv;type=text/csv" | python3 -c "
import sys, json
result = json.load(sys.stdin)
print('imported:', result['imported'])
print('skipped:', result['skipped'])
assert result['imported'] == 1, 'expected exactly 1 imported row'
assert len(result['skipped']) == 1, 'expected exactly 1 skipped row'
assert result['skipped'][0]['row'] == 2, 'expected the bad row to be reported as row 2'
print('PASS: import summary is correct')
"

echo "--- export again (should now include the imported row and show the auto-created category name) ---"
curl -s -b /tmp/csv-verify-cookies.txt http://localhost:3000/api/expenses/export -o /tmp/export-after.csv \
  -w "export status: %{http_code}\n"
cat /tmp/export-after.csv
grep -q "Web Hosting" /tmp/export-after.csv && echo "PASS: auto-created category name round-trips through export"

rm -f /tmp/csv-verify-cookies.txt /tmp/export-empty.csv /tmp/export-after.csv /tmp/import-test.csv
kill %1
```

Expected: export status `200` both times, the first export is exactly the header line, the import summary shows `imported: 1` and one skipped row for row 2, the second export contains `2026-08-01,Domain renewal,Web Hosting,12.00`, and both `PASS` lines print.

- [ ] **Step 3: Run the full suite one more time to confirm no regressions**

```bash
npx vitest run
```

Expected: 114/114 passing (unchanged — no new automated tests in this task, per this component's existing convention).

- [ ] **Step 4: Commit**

```bash
git add app/expenses/ExpensesClient.tsx
git commit -m "feat: add Export/Import CSV buttons to the expenses page"
```

---

### Task 7: Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: 114/114 passing, pristine output.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either.

- [ ] **Step 3: End-to-end smoke test — export, edit the file, re-import, verify counts**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/final-csv-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"final-csv-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

CATEGORY_ID=$(curl -s -b /tmp/final-csv-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

echo "--- create two expenses via the normal API, one with a comma in its description ---"
curl -s -b /tmp/final-csv-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":42.5,\"description\":\"Groceries, weekly\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"2026-08-01T00:00:00.000Z\"}" \
  -o /dev/null -w "create 1 status: %{http_code}\n"
curl -s -b /tmp/final-csv-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":10,\"description\":\"Bus fare\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"2026-08-02T00:00:00.000Z\"}" \
  -o /dev/null -w "create 2 status: %{http_code}\n"

echo "--- export, then re-import the exact same file into the same account ---"
curl -s -b /tmp/final-csv-cookies.txt http://localhost:3000/api/expenses/export -o /tmp/final-export.csv \
  -w "export status: %{http_code}\n"
cat /tmp/final-export.csv
echo ""

curl -s -b /tmp/final-csv-cookies.txt -X POST http://localhost:3000/api/expenses/import \
  -F "file=@/tmp/final-export.csv;type=text/csv" | python3 -c "
import sys, json
result = json.load(sys.stdin)
print('re-import result:', result)
assert result['imported'] == 2, 'expected both exported rows to re-import cleanly'
assert result['skipped'] == [], 'expected no skipped rows on a clean re-import of our own export'
print('PASS: exported CSV round-trips cleanly back through import')
"

echo "--- confirm the account now has 4 expenses total (2 original + 2 re-imported duplicates) ---"
curl -s -b /tmp/final-csv-cookies.txt http://localhost:3000/api/expenses | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('total expenses:', len(data))
assert len(data) == 4
print('PASS')
"

rm -f /tmp/final-csv-cookies.txt /tmp/final-export.csv
kill %1
```

Expected: all status codes `200`/`201`, the exported CSV contains a quoted `"Groceries, weekly"` field, and both `PASS` lines print (re-importing an export is expected to duplicate the rows, since this feature has no de-duplication — that's consistent with the spec's stated scope).

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## End of v1.3 (CSV Import/Export)

At this point: users can export their full expense history to a CSV file at any time, and bulk-import expenses from a CSV file — with malformed rows skipped and reported rather than blocking the whole import, and missing categories created automatically. The Australian-standards scope is next, as its own spec → plan → build cycle.
