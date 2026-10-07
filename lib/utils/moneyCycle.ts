import { RecurrenceInterval } from '@prisma/client';
import { computeMissingOccurrences } from './recurringOccurrences';
import { formatCurrency } from './currency';

export function computeDaysRemaining(endDate: Date, today: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((endDate.getTime() - today.getTime()) / msPerDay);
  return Math.max(days, 1);
}

/**
 * Floors an instant to the start (00:00, stamped as UTC midnight) of its own calendar day in
 * Australia/Sydney — the same anchoring projectCycle.ts's getTodayInSydney uses for "today" when
 * bucketing the cash-flow projection, generalized to any instant.
 *
 * Needed wherever a cycle's exact creation timestamp (`cycle.startDate`, stored to the second) is
 * used as a `gte` filter bound for "spending so far this cycle": without flooring it first, any
 * expense dated "today" via the date picker (which serializes to today's UTC midnight) is
 * silently excluded from that cycle's totals the moment any time at all has passed since the
 * cycle was created — which is to say, always. A user who starts a cycle and immediately logs an
 * expense dated today would see it vanish from "this cycle" entirely.
 */
export function startOfSydneyDay(instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * @deprecated Flat-average helper with no production callers left. It only ever saw legacy recurring
 * Expense templates — it is blind to Bill and IncomeSource rows — which is exactly how the dashboard
 * and the chat ended up quoting different numbers for the same cycle. Derive cycle figures through
 * `lib/moneyCycle/projectCycle.ts` instead; kept only for its own unit tests.
 */
export function computeCommittedSpend(
  templates: { amount: number; recurrenceInterval: RecurrenceInterval; date: Date }[],
  windowStart: Date,
  windowEnd: Date
): number {
  return templates.reduce((total, template) => {
    const occurrences = computeMissingOccurrences(
      template.recurrenceInterval,
      template.date,
      windowStart,
      windowEnd
    );
    return total + occurrences.length * template.amount;
  }, 0);
}

export function computeBillOccurrences(
  templates: { amount: number; recurrenceInterval: RecurrenceInterval; date: Date; label: string }[],
  windowStart: Date,
  windowEnd: Date
): { date: Date; amount: number; label: string }[] {
  return templates.flatMap((template) =>
    computeMissingOccurrences(template.recurrenceInterval, template.date, windowStart, windowEnd).map((date) => ({
      // computeMissingOccurrences constructs its dates in LOCAL time (local midnight on the
      // intended calendar day). Re-anchor to the equivalent UTC-midnight instant for that same
      // local calendar day here, at the boundary, so consumers that bucket by UTC calendar day
      // (e.g. computeCashFlowProjection) see the occurrence land on the day it was actually meant
      // for, regardless of the host's timezone offset. computeMissingOccurrences itself is left
      // untouched — it's pre-existing and still relied on as-is by computeCommittedSpend.
      date: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())),
      amount: template.amount,
      label: template.label,
    }))
  );
}

/**
 * @deprecated Flat-average helper with no production callers left — see computeCommittedSpend above.
 * `projectCycle`'s `safeToSpend` (from computeCashFlowProjection) is the real figure: it knows when
 * the money actually leaves and lands, not just the total.
 */
export function computeSafeToSpend(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
}): number {
  const discretionary = Math.max(input.startingAmount - input.committedSpend, 0);
  return discretionary / input.daysRemaining;
}

export function computePacingRates(input: {
  startingAmount: number;
  spentSoFar: number;
  daysElapsed: number;
  totalDays: number;
}): { plannedRatePerDay: number; actualRatePerDay: number; status: 'ON_TRACK' | 'OVER_PACE' } {
  const plannedRatePerDay = input.startingAmount / input.totalDays;
  const effectiveDaysElapsed = Math.max(input.daysElapsed, 1);
  const actualRatePerDay = input.spentSoFar / effectiveDaysElapsed;
  const status = actualRatePerDay > plannedRatePerDay ? 'OVER_PACE' : 'ON_TRACK';
  return { plannedRatePerDay, actualRatePerDay, status };
}

export function computePacingStatus(input: {
  startingAmount: number;
  spentSoFar: number;
  daysElapsed: number;
  totalDays: number;
}): 'ON_TRACK' | 'OVER_PACE' {
  return computePacingRates(input).status;
}

export function buildFallbackPlanMessage(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
  safeToSpend: number;
  shortfallWarning?: string;
  previousCycleScore?: number;
}): string {
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  const scoreText =
    input.previousCycleScore !== undefined ? ` Last cycle, your financial health score was ${input.previousCycleScore}.` : '';
  return (
    `You've got ${formatCurrency(input.startingAmount)} for the next ${input.daysRemaining} days. ` +
    `${formatCurrency(input.committedSpend)} is already committed to recurring bills, leaving you ` +
    `${formatCurrency(input.safeToSpend)} a day to spend freely.${shortfallText}${scoreText}`
  );
}

export function buildFallbackCheckInMessage(input: {
  spentSoFar: number;
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  pacingStatus: 'ON_TRACK' | 'OVER_PACE';
  shortfallWarning?: string;
  healthScore?: { total: number; delta: number | null };
}): string {
  const pacingText =
    input.pacingStatus === 'OVER_PACE'
      ? "you're spending a bit faster than planned"
      : "you're on track";
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  const scoreText = input.healthScore
    ? ` Your financial health score is ${input.healthScore.total}${
        input.healthScore.delta !== null ? ` (${input.healthScore.delta >= 0 ? '+' : ''}${input.healthScore.delta} since last cycle)` : ''
      }.`
    : '';
  return (
    `You've spent ${formatCurrency(input.spentSoFar)} so far — ${pacingText}. ` +
    `${formatCurrency(input.remainingAmount)} left over ${input.daysRemaining} days, ` +
    `about ${formatCurrency(input.safeToSpend)} a day.${shortfallText}${scoreText}`
  );
}
