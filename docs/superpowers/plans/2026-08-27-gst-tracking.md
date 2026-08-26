# Budget Buddy — GST Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark a category as GST-free, and show them a "GST paid this month" stat on the dashboard, personal-awareness only.

**Architecture:** A new `isGstFree` boolean on `Category`, a pure `computeGstPaid` function that sums the GST portion (`amount / 11`) of every non-GST-free expense, a new `PATCH /api/categories/:categoryId` route to toggle the flag, a checkbox added to the existing `/budgets` page's per-category rows, and a second dashboard stat card fed by the pure function.

**Tech Stack:** Next.js 14 App Router + TypeScript, Prisma + Neon Postgres, Zod, Vitest — all existing, no new dependencies.

## Global Constraints

- GST-free status lives on `Category`, never on an individual `Expense` — a category-level flag, not a per-expense one.
- Australian retail prices are GST-inclusive; the embedded GST portion of a total is `amount / 11` (since `total = base × 1.10`, `GST = base × 0.10 = total / 11`).
- `computeGstPaid` sums the raw (unrounded) GST portion across all non-GST-free expenses first, and rounds only the final total to 2 decimal places — never rounds each line item individually.
- All Prisma queries/mutations scoped to `userId`, matching every other route in this app.
- The new `PATCH /api/categories/:categoryId` route follows the exact same IDOR-safe pattern as the existing `PATCH /api/expenses/:id` route: `prisma.category.updateMany({ where: { id, userId }, data })`, check `count === 0` → `AppError(404, ...)`, then re-fetch via `findFirst` to return the updated resource.
- No GST-exclusive expense entry, no BAS-style report, no GST columns in CSV import/export, no per-expense GST override — all explicitly out of scope per the spec.
- No dedicated test files for `BudgetsClient.tsx` or the dashboard page — matching this app's convention of curl/manual verification for presentational UI.

---

## File Structure

```
budget-buddy/
├── prisma/
│   └── schema.prisma                              # MODIFY: add Category.isGstFree
├── lib/
│   ├── utils/
│   │   ├── gst.ts                                  # CREATE: computeGstPaid
│   │   └── gst.test.ts                             # CREATE
│   └── validation/
│       └── category.schema.ts                      # MODIFY: add updateCategorySchema
├── app/
│   ├── api/
│   │   └── categories/
│   │       └── [categoryId]/
│   │           ├── route.ts                         # CREATE: PATCH
│   │           └── route.test.ts                    # CREATE
│   ├── budgets/
│   │   ├── page.tsx                                  # MODIFY: pass isGstFree to rows
│   │   └── BudgetsClient.tsx                         # MODIFY: GST-free checkbox per row
│   └── dashboard/
│       └── page.tsx                                  # MODIFY: second CountUpStat card
```

---

### Task 1: Prisma Schema — `Category.isGstFree`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Category.isGstFree: boolean` (defaults to `false`) — consumed by every later task in this plan.

- [ ] **Step 1: Add the field to the `Category` model in `prisma/schema.prisma`**

Modify the existing `Category` model to add one new line (everything else stays exactly as-is):

```prisma
model Category {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  color     String
  isGstFree Boolean   @default(false)
  createdAt DateTime  @default(now())
  expenses  Expense[]
  budgets   Budget[]

  @@unique([userId, name])
}
```

- [ ] **Step 2: Run the migration**

```bash
npm run prisma:migrate -- --name add_category_gst_free
```

Expected: creates `prisma/migrations/<timestamp>_add_category_gst_free/`, applies to your Neon database. Purely additive (one new boolean column with a default) — safe against existing rows.

- [ ] **Step 3: Verify via a connectivity check**

```bash
npm run prisma:generate
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.category.count({ where: { isGstFree: true } }).then((n) => { console.log('isGstFree column queryable. Count:', n); return prisma.\$disconnect(); }).catch((e) => { console.error('Failed:', e); process.exit(1); });
"
```

Expected: "isGstFree column queryable. Count: 0".

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add isGstFree field to Category model"
```

---

### Task 2: `computeGstPaid` Pure Function

**Files:**
- Create: `lib/utils/gst.ts`
- Test: `lib/utils/gst.test.ts`

**Interfaces:**
- Produces: `computeGstPaid(expenses: { amount: number; categoryIsGstFree: boolean }[]): number` — consumed by Task 5's dashboard integration.

- [ ] **Step 1: Write the failing tests**

`lib/utils/gst.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeGstPaid } from './gst';

describe('computeGstPaid', () => {
  it('returns 0 for an empty list', () => {
    expect(computeGstPaid([])).toBe(0);
  });

  it('sums the GST portion of taxable expenses', () => {
    const result = computeGstPaid([
      { amount: 110, categoryIsGstFree: false },
      { amount: 55, categoryIsGstFree: false },
    ]);
    expect(result).toBe(15);
  });

  it('excludes GST-free expenses entirely', () => {
    const result = computeGstPaid([
      { amount: 110, categoryIsGstFree: true },
      { amount: 55, categoryIsGstFree: true },
    ]);
    expect(result).toBe(0);
  });

  it('handles a mix of taxable and GST-free expenses', () => {
    const result = computeGstPaid([
      { amount: 110, categoryIsGstFree: false },
      { amount: 50, categoryIsGstFree: true },
    ]);
    expect(result).toBe(10);
  });

  it('rounds the final total to 2 decimal places', () => {
    const result = computeGstPaid([{ amount: 10, categoryIsGstFree: false }]);
    expect(result).toBe(0.91);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/utils/gst.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/utils/gst.ts`**

```ts
export interface GstExpense {
  amount: number;
  categoryIsGstFree: boolean;
}

export function computeGstPaid(expenses: GstExpense[]): number {
  const rawTotal = expenses
    .filter((e) => !e.categoryIsGstFree)
    .reduce((sum, e) => sum + e.amount / 11, 0);
  return Math.round(rawTotal * 100) / 100;
}
```

**Rationale:** `total = basePrice × 1.10` for any GST-inclusive Australian retail price, so `GST = basePrice × 0.10 = total / 11`. Rounding happens once, on the summed raw total — not per expense — so the result matches what you'd get by adding up exact fractions first and only converting to cents at the very end, avoiding any compounding rounding drift across many small expenses.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/utils/gst.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 126/126 passing (121 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add lib/utils/gst.ts lib/utils/gst.test.ts
git commit -m "feat: add computeGstPaid utility"
```

---

### Task 3: `PATCH /api/categories/:categoryId` Route

**Files:**
- Modify: `lib/validation/category.schema.ts`
- Create: `app/api/categories/[categoryId]/route.ts`
- Create: `app/api/categories/[categoryId]/route.test.ts`

**Interfaces:**
- Consumes: `Category.isGstFree` (Task 1).
- Produces: `updateCategorySchema` (Zod), `PATCH /api/categories/:categoryId` — consumed by Task 4's UI.

- [ ] **Step 1: Write the failing tests for the schema**

`lib/validation/category.schema.test.ts` already exists with 3 tests for `createCategorySchema` (accepts a name+hex color, rejects a non-hex color, rejects an empty name). Add this new `describe` block to that file, alongside the existing tests without modifying them, and add `updateCategorySchema` to the existing `import { createCategorySchema } from './category.schema';` line (turning it into `import { createCategorySchema, updateCategorySchema } from './category.schema';`):

```ts
describe('updateCategorySchema', () => {
  it('accepts a valid isGstFree boolean', () => {
    const result = updateCategorySchema.safeParse({ isGstFree: true });
    expect(result.success).toBe(true);
  });

  it('rejects a non-boolean isGstFree', () => {
    const result = updateCategorySchema.safeParse({ isGstFree: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object', () => {
    const result = updateCategorySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

(If creating the file fresh, also add `import { describe, it, expect } from 'vitest';` at the top.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/validation/category.schema.test.ts
```

Expected: FAIL — `updateCategorySchema` not exported.

- [ ] **Step 3: Add `updateCategorySchema` to `lib/validation/category.schema.ts`**

Add this below the existing `createCategorySchema` (which stays completely unchanged):

```ts
export const updateCategorySchema = z.object({
  isGstFree: z.boolean(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
```

- [ ] **Step 4: Run schema tests to verify they pass**

```bash
npx vitest run lib/validation/category.schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing tests for the route**

`app/api/categories/[categoryId]/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { PATCH } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makePatchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/categories/cat_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/categories/[categoryId]', () => {
  it('updates isGstFree for a category the user owns', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.category.findFirst.mockResolvedValue({
      id: 'cat_1',
      userId: 'user_1',
      name: 'Groceries',
      color: '#f97316',
      isGstFree: true,
      createdAt: new Date(),
    } as never);

    const res = await PATCH(makePatchRequest({ isGstFree: true }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isGstFree).toBe(true);
    expect(prismaMock.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'cat_1', userId: 'user_1' },
      data: { isGstFree: true },
    });
  });

  it("returns 404 when the category doesn't belong to the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(makePatchRequest({ isGstFree: true }), { params: { categoryId: 'cat_foreign' } });

    expect(res.status).toBe(404);
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ isGstFree: true }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(401);
    expect(prismaMock.category.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid payload', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const res = await PATCH(makePatchRequest({ isGstFree: 'yes' }), { params: { categoryId: 'cat_1' } });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
npx vitest run "app/api/categories/[categoryId]/route.test.ts"
```

Expected: FAIL — module not found.

- [ ] **Step 7: Create `app/api/categories/[categoryId]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { updateCategorySchema } from '@/lib/validation/category.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function PATCH(request: NextRequest, { params }: { params: { categoryId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { isGstFree } = updateCategorySchema.parse(body);

    const { count } = await prisma.category.updateMany({
      where: { id: params.categoryId, userId: user.userId },
      data: { isGstFree },
    });

    if (count === 0) {
      throw new AppError(404, 'Category not found');
    }

    const category = await prisma.category.findFirst({
      where: { id: params.categoryId, userId: user.userId },
    });
    return NextResponse.json(category);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run "app/api/categories/[categoryId]/route.test.ts"
```

Expected: PASS (4 tests).

- [ ] **Step 9: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (126 + 3 new schema tests from Steps 1-4 + 4 new route tests from Steps 5-8).

- [ ] **Step 10: Commit**

```bash
git add lib/validation/category.schema.ts app/api/categories/[categoryId]/route.ts "app/api/categories/[categoryId]/route.test.ts"
git commit -m "feat: add PATCH /api/categories/:categoryId route for GST-free toggle"
```

---

### Task 4: GST-Free Checkbox on the Budgets Page

**Files:**
- Modify: `app/budgets/page.tsx`
- Modify: `app/budgets/BudgetsClient.tsx`

**Interfaces:**
- Consumes: `PATCH /api/categories/:categoryId` (Task 3).

- [ ] **Step 1: Modify `app/budgets/page.tsx`**

Change only the `rows` mapping (everything else in the file is unchanged):

```tsx
const rows = categories.map((category) => ({
  categoryId: category.id,
  categoryName: category.name,
  color: category.color,
  monthlyLimit: budgetByCategory.get(category.id) ?? null,
  isGstFree: category.isGstFree,
}));
```

- [ ] **Step 2: Modify `app/budgets/BudgetsClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export interface BudgetRow {
  categoryId: string;
  categoryName: string;
  color: string;
  monthlyLimit: number | null;
  isGstFree: boolean;
}

export function BudgetsClient({ rows: initialRows }: { rows: BudgetRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [inputs, setInputs] = useState<Record<string, string>>(
    Object.fromEntries(initialRows.map((r) => [r.categoryId, r.monthlyLimit?.toString() ?? '']))
  );

  async function handleSave(categoryId: string) {
    const value = Number(inputs[categoryId]);
    const res = await fetch(`/api/budgets/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyLimit: value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save budget');
      return;
    }
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, monthlyLimit: value } : r)));
  }

  async function handleRemove(categoryId: string) {
    const res = await fetch(`/api/budgets/${categoryId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to remove budget');
      return;
    }
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, monthlyLimit: null } : r)));
    setInputs((prev) => ({ ...prev, [categoryId]: '' }));
  }

  async function handleToggleGstFree(categoryId: string, isGstFree: boolean) {
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, isGstFree } : r)));
    const res = await fetch(`/api/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isGstFree }),
    });
    if (!res.ok) {
      setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, isGstFree: !isGstFree } : r)));
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to update category');
    }
  }

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.categoryId} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="font-medium text-foreground">{row.categoryName}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm text-muted">
              <input
                type="checkbox"
                checked={row.isGstFree}
                onChange={(e) => handleToggleGstFree(row.categoryId, e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              GST-free
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="No limit"
              value={inputs[row.categoryId] ?? ''}
              onChange={(e) => setInputs((prev) => ({ ...prev, [row.categoryId]: e.target.value }))}
              className="w-28 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button variant="secondary" onClick={() => handleSave(row.categoryId)}>
              Save
            </Button>
            {row.monthlyLimit !== null && (
              <Button variant="destructive" onClick={() => handleRemove(row.categoryId)}>
                Remove
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

**Rationale for the optimistic update in `handleToggleGstFree`:** the checkbox's local state flips immediately on click (before the network request resolves), then rolls back only if the `PATCH` fails. This makes a boolean toggle feel instant — matching how a native OS settings toggle behaves — rather than waiting on a round-trip before the UI reflects the change, while still handling the failure case correctly.

- [ ] **Step 3: Verify via curl (toggle a category's GST-free flag, confirm it persists)**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/gst-toggle-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"gst-toggle-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

FOOD_CATEGORY_ID=$(curl -s -b /tmp/gst-toggle-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; cats=json.load(sys.stdin); print([c['id'] for c in cats if c['name']=='Food'][0])")

echo "--- mark Food as GST-free ---"
curl -s -b /tmp/gst-toggle-cookies.txt -X PATCH "http://localhost:3000/api/categories/$FOOD_CATEGORY_ID" \
  -H "Content-Type: application/json" \
  -d '{"isGstFree": true}' | python3 -c "
import sys, json
result = json.load(sys.stdin)
assert result['isGstFree'] is True, 'expected isGstFree to be true'
print('PASS: category updated to GST-free')
"

echo "--- confirm the budgets page shows the checkbox checked ---"
curl -s -b /tmp/gst-toggle-cookies.txt http://localhost:3000/budgets -o /tmp/gst-budgets.html \
  -w "budgets page status: %{http_code}\n"
grep -q "GST-free" /tmp/gst-budgets.html && echo "PASS: budgets page renders the GST-free label"

rm -f /tmp/gst-toggle-cookies.txt /tmp/gst-budgets.html
kill %1
```

Expected: `200` statuses, both `PASS` lines print.

- [ ] **Step 4: Run the full suite one more time to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (unchanged — no new automated tests in this task).

- [ ] **Step 5: Commit**

```bash
git add app/budgets/page.tsx app/budgets/BudgetsClient.tsx
git commit -m "feat: add GST-free checkbox to the budgets page"
```

---

### Task 5: "GST Paid This Month" Dashboard Stat

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `computeGstPaid` (Task 2).

- [ ] **Step 1: Modify `app/dashboard/page.tsx`**

Add the import:
```ts
import { computeGstPaid } from '@/lib/utils/gst';
```

Add this line right after the existing `totalThisMonth` computation:
```ts
const totalThisMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
const gstPaidThisMonth = computeGstPaid(
  currentMonthExpenses.map((e) => ({ amount: e.amount, categoryIsGstFree: e.category.isGstFree }))
);
```

Then replace the existing single stat card:
```tsx
<Card className="mb-8">
  <p className="text-sm text-muted">Total spent this month</p>
  <CountUpStat value={totalThisMonth} />
</Card>
```
with a two-column grid containing both stat cards (matching the existing `grid gap-6 sm:grid-cols-2` pattern already used for the charts below it):
```tsx
<div className="mb-8 grid gap-6 sm:grid-cols-2">
  <Card>
    <p className="text-sm text-muted">Total spent this month</p>
    <CountUpStat value={totalThisMonth} />
  </Card>
  <Card>
    <p className="text-sm text-muted">GST paid this month</p>
    <CountUpStat value={gstPaidThisMonth} />
  </Card>
</div>
```

Nothing else in this file changes — `currentMonthExpenses` already carries the full joined `category` object (from the existing `include: { category: true }` on the `prisma.expense.findMany` call), so `e.category.isGstFree` is available with no changes to the query itself.

- [ ] **Step 2: Verify via curl (a GST-free expense and a taxable expense produce the correct GST stat)**

```bash
npm run dev &
sleep 4

curl -s -c /tmp/gst-dashboard-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"gst-dashboard-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

CATEGORIES_JSON=$(curl -s -b /tmp/gst-dashboard-cookies.txt http://localhost:3000/api/categories)
FOOD_ID=$(echo "$CATEGORIES_JSON" | python3 -c "import sys,json; print([c['id'] for c in json.load(sys.stdin) if c['name']=='Food'][0])")
TRANSPORT_ID=$(echo "$CATEGORIES_JSON" | python3 -c "import sys,json; print([c['id'] for c in json.load(sys.stdin) if c['name']=='Transport'][0])")

echo "--- mark Food as GST-free ---"
curl -s -b /tmp/gst-dashboard-cookies.txt -X PATCH "http://localhost:3000/api/categories/$FOOD_ID" \
  -H "Content-Type: application/json" -d '{"isGstFree": true}' -o /dev/null -w "patch status: %{http_code}\n"

echo "--- one GST-free expense (Food, \$55) and one taxable expense (Transport, \$110, GST portion = \$10.00) ---"
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -b /tmp/gst-dashboard-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":55,\"description\":\"Groceries\",\"categoryId\":\"$FOOD_ID\",\"date\":\"$NOW\"}" \
  -o /dev/null -w "create Food expense status: %{http_code}\n"
curl -s -b /tmp/gst-dashboard-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":110,\"description\":\"Flights\",\"categoryId\":\"$TRANSPORT_ID\",\"date\":\"$NOW\"}" \
  -o /dev/null -w "create Transport expense status: %{http_code}\n"

echo "--- dashboard should show \$165.00 total and \$10.00 GST paid ---"
curl -s -b /tmp/gst-dashboard-cookies.txt http://localhost:3000/dashboard -o /tmp/gst-dashboard.html \
  -w "dashboard status: %{http_code}\n"
grep -o '\$165.00' /tmp/gst-dashboard.html && echo "PASS: total spent this month is correct"
grep -o '\$10.00' /tmp/gst-dashboard.html && echo "PASS: GST paid this month excludes the GST-free expense correctly"

rm -f /tmp/gst-dashboard-cookies.txt /tmp/gst-dashboard.html
kill %1
```

Expected: all status codes `200`/`201`, and both `PASS` lines print. ($55 Food + $110 Transport = $165 total; only the $110 Transport expense is taxable, and $110 / 11 = $10.00 GST.)

- [ ] **Step 3: Run the full suite one more time to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (unchanged — no new automated tests in this task).

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add GST paid this month stat to the dashboard"
```

---

### Task 6: Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: 133/133 passing, pristine output.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either. This project treats a clean `tsc --noEmit` as a hard, non-negotiable gate — a past feature phase shipped a typecheck-only bug that Vitest alone didn't catch.

- [ ] **Step 3: End-to-end smoke test — recurring-expense interaction with GST-free categories**

This confirms the spec's claim that marking a category GST-free automatically excludes future *generated* recurring instances too, with no special-case code:

```bash
npm run dev &
sleep 4

curl -s -c /tmp/gst-recurring-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"gst-recurring-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

FOOD_ID=$(curl -s -b /tmp/gst-recurring-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print([c['id'] for c in json.load(sys.stdin) if c['name']=='Food'][0])")

echo "--- mark Food as GST-free, then create a recurring MONTHLY expense in it, dated this month ---"
curl -s -b /tmp/gst-recurring-cookies.txt -X PATCH "http://localhost:3000/api/categories/$FOOD_ID" \
  -H "Content-Type: application/json" -d '{"isGstFree": true}' -o /dev/null -w "patch status: %{http_code}\n"

NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -b /tmp/gst-recurring-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":44,\"description\":\"Meal Kit Subscription\",\"categoryId\":\"$FOOD_ID\",\"date\":\"$NOW\",\"isRecurring\":true,\"recurrenceInterval\":\"MONTHLY\"}" \
  -o /dev/null -w "create recurring status: %{http_code}\n"

echo "--- dashboard should show \$44.00 total spent, but \$0.00 GST paid (the only expense is GST-free) ---"
curl -s -b /tmp/gst-recurring-cookies.txt http://localhost:3000/dashboard -o /tmp/gst-recurring-dashboard.html \
  -w "dashboard status: %{http_code}\n"
grep -o '\$44.00' /tmp/gst-recurring-dashboard.html && echo "PASS: total spent includes the recurring expense"
grep -o '\$0.00' /tmp/gst-recurring-dashboard.html && echo "PASS: GST paid is zero, since the only expense is in a GST-free category"

rm -f /tmp/gst-recurring-cookies.txt /tmp/gst-recurring-dashboard.html
kill %1
```

Expected: all status codes `200`/`201`, both `PASS` lines print.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## End of GST Tracking

At this point: users can mark any category as GST-free on the `/budgets` page, and the dashboard shows a "GST paid this month" stat that automatically respects that flag — including for recurring expenses, with no special-case code needed. The WCAG 2.1 AA audit is next, as its own spec → plan → build cycle.
