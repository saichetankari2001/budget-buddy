import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { computeCategoryTotalsForWindow } from '@/lib/moneyCycle/categoryTotals';
import { startOfSydneyDay } from '@/lib/utils/moneyCycle';

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

    const budgetRows = await prisma.cycleCategoryBudget.findMany({ where: { cycleId: cycle.id } });
    if (budgetRows.length === 0) {
      // Distinct from "no active cycle" above: there IS a cycle, it just has no recommendation
      // rows because the user had zero spending history when it was created (a brand-new
      // signup, most commonly). SpendingBreakdownCard already renders a "log a few expenses
      // first" message for exactly this shape — returning `null` here previously made the card
      // disappear entirely instead, which left that message dead code.
      return NextResponse.json({ categories: [], hasAnyExpenseThisCycle: false });
    }

    const trackedCategoryIds = budgetRows.filter((r) => r.categoryId !== null).map((r) => r.categoryId as string);
    const now = new Date();
    // Floor to the start of the cycle's own calendar day (Sydney) — see startOfSydneyDay's doc
    // comment. Without this, an expense dated "today" via the date picker (today's UTC midnight)
    // is always earlier than cycle.startDate's exact creation timestamp, so it would never count
    // as "this cycle" spending on the day the cycle was actually started.
    const cycleWindowStart = startOfSydneyDay(cycle.startDate);
    const [actuals, historical] = await Promise.all([
      computeCategoryTotalsForWindow(user.userId, { gte: cycleWindowStart, lte: now }, trackedCategoryIds),
      computeCategoryTotalsForWindow(user.userId, {}, trackedCategoryIds),
    ]);

    const hasAnyExpenseThisCycle = actuals.some((a) => a.actual > 0);

    const categories = budgetRows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      color: row.categoryColor,
      recommendedAmount: Number(row.recommendedAmount),
      actualAmount: actuals.find((a) => a.categoryId === row.categoryId)?.actual ?? 0,
      historicalAmount: historical.find((a) => a.categoryId === row.categoryId)?.actual ?? 0,
    }));

    return NextResponse.json({ categories, hasAnyExpenseThisCycle });
  } catch (error) {
    return handleRouteError(error);
  }
}
