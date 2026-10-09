import { prisma } from '@/lib/prisma';
import { computeBillOccurrences, startOfSydneyDay } from '@/lib/utils/moneyCycle';
import { computeCashFlowProjection } from '@/lib/utils/cashFlowProjection';

const DEFAULT_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RollingForecastResult {
  trajectory: { date: string; balance: number; events: { label: string; amount: number }[] }[];
  headsUp: { name: string; amount: number; dueDate: string }[];
}

/**
 * Projects cash flow [today, today + windowDays] — deliberately decoupled from the active Money
 * Cycle's own endDate, since Bill/IncomeSource rows are user-scoped, not cycle-scoped, and a real
 * obligation doesn't stop existing just because today's cycle happens to end sooner. `remainingAmount`
 * (the cycle's own live balance) is the only thing borrowed from the cycle — this is why the feature
 * still requires an active cycle today, rather than introducing a separate "account balance" concept.
 */
export async function computeRollingForecast(
  userId: string,
  input: { remainingAmount: number; cycleEndDate: Date },
  rawNow: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS
): Promise<RollingForecastResult> {
  const today = startOfSydneyDay(rawNow);
  const windowEnd = new Date(today.getTime() + windowDays * MS_PER_DAY);

  const billTemplates = await prisma.bill.findMany({ where: { userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId, type: 'FIXED' } });
  // Legacy recurring Expense templates (the expense form's "repeats" checkbox) are a real, live
  // outflow source — projectCycle.ts already folds these into its own projection via
  // legacyRecurringExpenseOccurrences. Omitting them here would make the rolling forecast more
  // optimistic than the cycle's own projection for the same days, the exact "two different numbers
  // for the same money" failure mode projectCycle.ts's header comment exists to prevent.
  const recurringExpenseTemplates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
  });

  // Floor both sides of every dueDate/startDate boundary comparison through startOfSydneyDay. Bill
  // and IncomeSource rows created through the UI are always already UTC-midnight-stamped, so this
  // is a no-op for them, but a non-midnight ISO timestamp (e.g. handed over by the AI chat tool)
  // would otherwise compare as a raw instant and could be dropped from the window, or mis-flagged
  // at the cycleEndDate boundary, purely due to its time-of-day component.
  const windowEndDay = startOfSydneyDay(windowEnd);
  const cycleEndDay = startOfSydneyDay(input.cycleEndDate);

  const oneTimeBills = billTemplates.filter(
    (b) => b.recurrenceInterval === null && b.paidExpenseId === null && startOfSydneyDay(b.dueDate) <= windowEndDay
  );
  const billOccurrencesOneTime = oneTimeBills.map((b) => ({ date: b.dueDate, amount: Number(b.amount), label: b.name }));
  const billOccurrencesRecurring = computeBillOccurrences(
    billTemplates
      .filter((b) => b.recurrenceInterval !== null)
      .map((b) => ({ amount: Number(b.amount), recurrenceInterval: b.recurrenceInterval!, date: b.dueDate, label: b.name })),
    today,
    windowEnd
  );
  const legacyRecurringExpenseOccurrences = computeBillOccurrences(
    recurringExpenseTemplates
      .filter((t) => t.recurrenceInterval !== null)
      .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date, label: t.description })),
    today,
    windowEnd
  );

  const fixedIncomeOneTime = incomeSources
    .filter((s) => s.recurrenceInterval === null && startOfSydneyDay(s.startDate) <= windowEndDay)
    .map((s) => ({ date: s.startDate, amount: Number(s.amount), label: s.name }));
  const fixedIncomeRecurring = computeBillOccurrences(
    incomeSources
      .filter((s) => s.recurrenceInterval !== null && startOfSydneyDay(s.startDate) <= windowEndDay)
      .map((s) => ({ amount: Number(s.amount), recurrenceInterval: s.recurrenceInterval!, date: s.startDate, label: s.name })),
    today,
    windowEnd
  );

  const projectionResult = computeCashFlowProjection({
    currentBalance: input.remainingAmount,
    today,
    endDate: windowEnd,
    fixedIncomeOccurrences: [...fixedIncomeOneTime, ...fixedIncomeRecurring],
    billOccurrences: [...billOccurrencesOneTime, ...billOccurrencesRecurring, ...legacyRecurringExpenseOccurrences],
  });

  // "Heads up": a one-time bill due strictly after the cycle's own end (so the cycle's own
  // projection, which stops at cycleEndDate, never shows it) but still inside this 90-day window.
  // Scoped to one-time Bill rows only — legacy recurring Expense templates are trajectory events
  // only, never heads-up candidates, per the original spec.
  const headsUp = oneTimeBills
    .filter((b) => startOfSydneyDay(b.dueDate).getTime() > cycleEndDay.getTime())
    .map((b) => ({ name: b.name, amount: Number(b.amount), dueDate: b.dueDate.toISOString() }));

  return {
    trajectory: projectionResult.trajectory.map((day) => ({
      date: day.date.toISOString(),
      balance: day.balance,
      events: day.events,
    })),
    headsUp,
  };
}
