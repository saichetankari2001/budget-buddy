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

  const trackedRows = await prisma.cycleCategoryBudget.findMany({
    where: { cycleId: cycle.id },
    orderBy: { createdAt: 'asc' },
  });
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

  const billPunctuality = await computeBillPunctualityPoints(userId, windowStart, windowEnd);

  // `total` is rounded ONCE from the unrounded components — never by summing the already-rounded
  // display values below, which would compound rounding error into a different (and not spec'd)
  // number.
  const total = Math.round(budgetAdherence.points + pacingPoints + billPunctuality.points);

  return {
    total,
    budgetAdherence: { ...budgetAdherence, points: Math.round(budgetAdherence.points) },
    pacing: { points: Math.round(pacingPoints), status },
    billPunctuality: { ...billPunctuality, points: Math.round(billPunctuality.points) },
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
  // Tracked separately from the clamped `unusedFraction` used for scoring: the clamped value is
  // always exactly 0 for ANY over-budget category, so it can't distinguish "10% over" from "500%
  // over" when picking which one to name. This unclamped ratio can keep growing past 1, so
  // whichever category is furthest over budget always wins the comparison.
  let worstRatio = -Infinity;
  let worstCategoryName: string | undefined;
  let sumFraction = 0;

  for (const row of trackedRows) {
    const recommended = Number(row.recommendedAmount);
    const actual = actuals.find((a) => a.categoryId === row.categoryId)?.actual ?? 0;
    const unusedFraction = recommended > 0 ? Math.max(0, Math.min(1, 1 - actual / recommended)) : 1;
    sumFraction += unusedFraction;
    const ratio = recommended > 0 ? actual / recommended : 0;
    if (unusedFraction < 1 && ratio > worstRatio) {
      worstFraction = unusedFraction;
      worstRatio = ratio;
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
  windowEnd: Date
): Promise<{ points: number; lateBillName?: string }> {
  const bills = await prisma.bill.findMany({ where: { userId } });

  const paidExpenseIds = bills
    .map((b) => b.paidExpenseId)
    .filter((id): id is string => id !== null);
  const paidExpenses = paidExpenseIds.length
    ? await prisma.expense.findMany({ where: { userId, id: { in: paidExpenseIds } } })
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

    // Not paid (or paid outside this window) — does it have an occurrence overdue as of this
    // cycle's own window boundary (never the live clock — for a non-active cycle, `windowEnd` is
    // that cycle's own `endDate`, so a cancelled/completed cycle's score can never drift just
    // because real time keeps passing after the cycle itself stopped moving)? `bill.dueDate <=
    // windowEnd` is itself the overdue test here — there is no separate "now" to compare against.
    if (bill.dueDate >= windowStart && bill.dueDate <= windowEnd) {
      dueCount += 1;
      lateBillName = bill.name;
    }
  }

  if (dueCount === 0) {
    return { points: 30 };
  }
  return { points: 30 * (onTimeCount / dueCount), lateBillName };
}
