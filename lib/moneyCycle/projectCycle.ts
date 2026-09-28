import { prisma } from '@/lib/prisma';
import { computeDaysRemaining, computeBillOccurrences } from '@/lib/utils/moneyCycle';
import { computeCashFlowProjection } from '@/lib/utils/cashFlowProjection';
import { formatCurrency } from '@/lib/utils/currency';

export interface CycleProjectionResult {
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  /** Total already-recorded spending inside this cycle's window so far. */
  spentSoFar: number;
  /**
   * Total outflow still expected inside the projection window (Bill occurrences plus legacy
   * recurring-Expense occurrences). This replaces the old `computeCommittedSpend`, which only ever
   * saw legacy recurring Expense rows and was blind to the Bill table entirely.
   */
  committedSpend: number;
  projection: { date: string; balance: number; events: { label: string; amount: number }[] }[];
  isShortfall: boolean;
  shortfallWarning?: string;
}

/**
 * The app's canonical "today". Bucketing a raw `new Date()` by UTC calendar day silently shifts
 * which day an event lands on depending on the host's offset — for an Australian user that means a
 * bill due "today" can be projected on yesterday (or tomorrow) for most of the day. Resolving the
 * calendar day in Australia/Sydney first, then stamping it as UTC midnight, gives the projection a
 * day-0 anchor that matches what the user's calendar actually says while staying compatible with
 * computeCashFlowProjection's deterministic UTC bucketing.
 */
function getTodayInSydney(rawNow: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(rawNow);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * The single source of truth for a cycle's derived figures: remaining balance, days left, the real
 * safe-to-spend-per-day, and the day-by-day cash-flow trajectory.
 *
 * Every consumer that quotes these numbers to the user — the dashboard's GET /api/cycles/active,
 * cycle creation, the chat's `update_cycle_amount` tool (via `updateCycleAmount`), and the daily
 * check-in cron — must go through here. Previously three of those four used a flat-average
 * approximation that could not see Bill or IncomeSource rows at all, so the same cycle could be
 * quoted two different daily allowances seconds apart, and the cron could tell a user in a real
 * projected shortfall that they were "on track".
 */
export async function projectCycle(
  userId: string,
  cycle: { startingAmount: number; startDate: Date; endDate: Date },
  rawNow: Date = new Date()
): Promise<CycleProjectionResult> {
  const now = getTodayInSydney(rawNow);

  const recurringTemplates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
  });

  // `rawNow` (not the day-anchored `now`) bounds the "what has actually happened so far" aggregates:
  // these are point-in-time sums, and clamping them to midnight would drop expenses and income
  // already logged earlier today.
  const spentAggregate = await prisma.expense.aggregate({
    where: { userId, date: { gte: cycle.startDate, lte: rawNow } },
    _sum: { amount: true },
  });
  const spentSoFar = Number(spentAggregate._sum.amount ?? 0);

  const recurringExpenseTemplates = recurringTemplates
    .filter((t) => t.recurrenceInterval !== null)
    .map((t) => ({
      amount: Number(t.amount),
      recurrenceInterval: t.recurrenceInterval!,
      date: t.date,
      label: t.description,
    }));

  const billTemplates = await prisma.bill.findMany({ where: { userId } });
  // No lower bound on dueDate: an overdue but still-unpaid one-time bill is a real, pending
  // obligation and belongs in the projection (computeCashFlowProjection folds a past-dated event
  // into day 0). `paidExpenseId === null` is what keeps a settled one-time bill out — for a
  // one-time bill there is no next occurrence, so a set paidExpenseId means "settled forever".
  const billOccurrencesOneTime = billTemplates
    .filter((b) => b.recurrenceInterval === null && b.paidExpenseId === null && b.dueDate <= cycle.endDate)
    .map((b) => ({ date: b.dueDate, amount: Number(b.amount), label: b.name }));
  // Recurring occurrences stay anchored at `now` as the window start on purpose: widening the
  // window backwards here would re-emit occurrences that were already paid and advanced past,
  // double-counting them. That needs its own design, not a widened filter.
  const billOccurrencesRecurring = computeBillOccurrences(
    billTemplates
      .filter((b) => b.recurrenceInterval !== null)
      .map((b) => ({ amount: Number(b.amount), recurrenceInterval: b.recurrenceInterval!, date: b.dueDate, label: b.name })),
    now,
    cycle.endDate
  );
  const legacyRecurringExpenseOccurrences = computeBillOccurrences(recurringExpenseTemplates, now, cycle.endDate);

  const incomeSources = await prisma.incomeSource.findMany({ where: { userId, type: 'FIXED' } });
  // Same as the one-time bills above: a one-time income source whose start date has already passed
  // but which has not landed yet is still expected money. There is no "paid" concept to exclude.
  const fixedIncomeOneTime = incomeSources
    .filter((s) => s.recurrenceInterval === null && s.startDate <= cycle.endDate)
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
    where: { incomeSource: { userId }, date: { gte: cycle.startDate, lte: rawNow } },
    _sum: { amount: true },
  });
  const incomeEntriesSoFar = Number(incomeEntriesAggregate._sum.amount ?? 0);
  const remainingAmount = Math.max(cycle.startingAmount - spentSoFar + incomeEntriesSoFar, 0);

  const billOccurrences = [
    ...billOccurrencesOneTime,
    ...billOccurrencesRecurring,
    ...legacyRecurringExpenseOccurrences,
  ];
  const projectionResult = computeCashFlowProjection({
    currentBalance: remainingAmount,
    today: now,
    endDate: cycle.endDate,
    fixedIncomeOccurrences: [...fixedIncomeOneTime, ...fixedIncomeRecurring],
    billOccurrences,
  });

  const daysRemaining = computeDaysRemaining(cycle.endDate, now);
  const committedSpend = billOccurrences.reduce((total, occurrence) => total + occurrence.amount, 0);

  // Phrased as a clause so it drops straight into the " Importantly: {shortfallWarning}." sentence
  // that lib/ai/coach.ts's prompts and lib/utils/moneyCycle.ts's fallback messages already build.
  const shortfallWarning = projectionResult.isShortfall
    ? `you're projected to be short by ${formatCurrency(Math.abs(projectionResult.minFutureBalance))} around ` +
      `${projectionResult.minFutureBalanceDate.toLocaleDateString('en-AU')} if nothing changes`
    : undefined;

  return {
    remainingAmount,
    daysRemaining,
    // computeCashFlowProjection already clamps safeToSpendPerDay to 0 on a shortfall — no need to
    // re-check isShortfall here too.
    safeToSpend: projectionResult.safeToSpendPerDay,
    spentSoFar,
    committedSpend,
    projection: projectionResult.trajectory.map((day) => ({
      date: day.date.toISOString(),
      balance: day.balance,
      events: day.events,
    })),
    isShortfall: projectionResult.isShortfall,
    shortfallWarning,
  };
}
