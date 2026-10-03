import { prisma } from '@/lib/prisma';

export interface CategoryActual {
  categoryId: string | null;
  actual: number;
}

/**
 * Actual spend per category within a date window, computed on read — never stored. For each
 * explicitly-tracked category, sums that category's Expense rows in the window; "Other"
 * (categoryId: null) is everything else: the window's total spend minus the tracked categories'
 * sum. This is the one place that answers "how much did this user spend, by category" — used both
 * for "this cycle so far" (Task 5's notification check, Task 7's live tracking) and "all-time"
 * (Task 7's pre-expense historical pie), so there's exactly one implementation to keep correct.
 *
 * `window.createdAtGte` is a SEPARATE filter from `date`, ANDed with it — not a substitute. It
 * exists only for "this cycle so far" callers, which float their `date` lower bound to the start
 * of the cycle's own Sydney calendar day (see startOfSydneyDay) so a same-day expense still counts.
 * That flooring alone isn't enough: `date` has no concept of which MoneyCycle an expense actually
 * belongs to, so if a prior cycle completed/was cancelled and a new one started the same Sydney
 * day, an expense logged under the OLD cycle earlier that day would have a `date` inside the NEW
 * cycle's floored window too — double-counting it as the new cycle's spend. `createdAtGte` (passed
 * as the new cycle's own `createdAt`) excludes anything logged before the new cycle existed, which
 * `date` alone cannot distinguish. The all-time historical caller intentionally omits it.
 */
export async function computeCategoryTotalsForWindow(
  userId: string,
  window: { gte?: Date; lte?: Date; createdAtGte?: Date },
  trackedCategoryIds: string[]
): Promise<CategoryActual[]> {
  const hasWindow = window.gte !== undefined || window.lte !== undefined;

  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      ...(hasWindow
        ? {
            date: {
              ...(window.gte ? { gte: window.gte } : {}),
              ...(window.lte ? { lte: window.lte } : {}),
            },
          }
        : {}),
      ...(window.createdAtGte ? { createdAt: { gte: window.createdAtGte } } : {}),
    },
    select: { categoryId: true, amount: true },
  });

  const totalsByCategory = new Map<string, number>();
  let totalAll = 0;
  for (const expense of expenses) {
    const amount = Number(expense.amount);
    totalAll += amount;
    totalsByCategory.set(expense.categoryId, (totalsByCategory.get(expense.categoryId) ?? 0) + amount);
  }

  const trackedActuals: CategoryActual[] = trackedCategoryIds.map((categoryId) => ({
    categoryId,
    actual: totalsByCategory.get(categoryId) ?? 0,
  }));
  const trackedTotal = trackedActuals.reduce((sum, a) => sum + a.actual, 0);
  const otherActual = Math.max(totalAll - trackedTotal, 0);

  return [...trackedActuals, { categoryId: null, actual: otherActual }];
}
