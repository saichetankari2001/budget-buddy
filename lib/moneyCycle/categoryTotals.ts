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
 */
export async function computeCategoryTotalsForWindow(
  userId: string,
  window: { gte?: Date; lte?: Date },
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
