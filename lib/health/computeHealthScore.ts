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
