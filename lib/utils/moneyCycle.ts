import { RecurrenceInterval } from '@prisma/client';
import { computeMissingOccurrences } from './recurringOccurrences';
import { formatCurrency } from './currency';

export function computeDaysRemaining(endDate: Date, today: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((endDate.getTime() - today.getTime()) / msPerDay);
  return Math.max(days, 1);
}

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

export function computeSafeToSpend(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
}): number {
  const discretionary = Math.max(input.startingAmount - input.committedSpend, 0);
  return discretionary / input.daysRemaining;
}

export function computePacingStatus(input: {
  startingAmount: number;
  spentSoFar: number;
  daysElapsed: number;
  totalDays: number;
}): 'ON_TRACK' | 'OVER_PACE' {
  const plannedRatePerDay = input.startingAmount / input.totalDays;
  const effectiveDaysElapsed = Math.max(input.daysElapsed, 1);
  const actualRatePerDay = input.spentSoFar / effectiveDaysElapsed;
  return actualRatePerDay > plannedRatePerDay ? 'OVER_PACE' : 'ON_TRACK';
}

export function buildFallbackPlanMessage(input: {
  startingAmount: number;
  committedSpend: number;
  daysRemaining: number;
  safeToSpend: number;
  shortfallWarning?: string;
}): string {
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  return (
    `You've got ${formatCurrency(input.startingAmount)} for the next ${input.daysRemaining} days. ` +
    `${formatCurrency(input.committedSpend)} is already committed to recurring bills, leaving you ` +
    `${formatCurrency(input.safeToSpend)} a day to spend freely.${shortfallText}`
  );
}

export function buildFallbackCheckInMessage(input: {
  spentSoFar: number;
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  pacingStatus: 'ON_TRACK' | 'OVER_PACE';
  shortfallWarning?: string;
}): string {
  const pacingText =
    input.pacingStatus === 'OVER_PACE'
      ? "you're spending a bit faster than planned"
      : "you're on track";
  const shortfallText = input.shortfallWarning ? ` Importantly: ${input.shortfallWarning}.` : '';
  return (
    `You've spent ${formatCurrency(input.spentSoFar)} so far — ${pacingText}. ` +
    `${formatCurrency(input.remainingAmount)} left over ${input.daysRemaining} days, ` +
    `about ${formatCurrency(input.safeToSpend)} a day.${shortfallText}`
  );
}
