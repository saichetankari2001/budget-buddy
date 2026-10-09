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

  const oneTimeBills = billTemplates.filter(
    (b) => b.recurrenceInterval === null && b.paidExpenseId === null && b.dueDate <= windowEnd
  );
  const billOccurrencesOneTime = oneTimeBills.map((b) => ({ date: b.dueDate, amount: Number(b.amount), label: b.name }));
  const billOccurrencesRecurring = computeBillOccurrences(
    billTemplates
      .filter((b) => b.recurrenceInterval !== null)
      .map((b) => ({ amount: Number(b.amount), recurrenceInterval: b.recurrenceInterval!, date: b.dueDate, label: b.name })),
    today,
    windowEnd
  );

  const fixedIncomeOneTime = incomeSources
    .filter((s) => s.recurrenceInterval === null && s.startDate <= windowEnd)
    .map((s) => ({ date: s.startDate, amount: Number(s.amount), label: s.name }));
  const fixedIncomeRecurring = computeBillOccurrences(
    incomeSources
      .filter((s) => s.recurrenceInterval !== null && s.startDate <= windowEnd)
      .map((s) => ({ amount: Number(s.amount), recurrenceInterval: s.recurrenceInterval!, date: s.startDate, label: s.name })),
    today,
    windowEnd
  );

  const projectionResult = computeCashFlowProjection({
    currentBalance: input.remainingAmount,
    today,
    endDate: windowEnd,
    fixedIncomeOccurrences: [...fixedIncomeOneTime, ...fixedIncomeRecurring],
    billOccurrences: [...billOccurrencesOneTime, ...billOccurrencesRecurring],
  });

  // "Heads up": a one-time bill due strictly after the cycle's own end (so the cycle's own
  // projection, which stops at cycleEndDate, never shows it) but still inside this 90-day window.
  const headsUp = oneTimeBills
    .filter((b) => b.dueDate.getTime() > input.cycleEndDate.getTime())
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
