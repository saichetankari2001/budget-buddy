import { RecurrenceInterval } from '@prisma/client';

function advance(sourceDate: Date, fromDate: Date, interval: RecurrenceInterval): Date {
  if (interval === 'WEEKLY') {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (interval === 'YEARLY') {
    const next = new Date(fromDate);
    next.setFullYear(next.getFullYear() + 1);
    const daysInTargetMonth = new Date(next.getFullYear(), sourceDate.getMonth() + 1, 0).getDate();
    next.setMonth(sourceDate.getMonth(), Math.min(sourceDate.getDate(), daysInTargetMonth));
    return next;
  }

  // MONTHLY — always anchor to sourceDate's day-of-month, recovering it whenever
  // the target month is long enough (e.g. Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
  const next = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 1);
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(sourceDate.getDate(), daysInTargetMonth));
  return next;
}

export function computeMissingOccurrences(
  interval: RecurrenceInterval,
  sourceDate: Date,
  lastDate: Date,
  today: Date
): Date[] {
  const occurrences: Date[] = [];
  let cursor = advance(sourceDate, lastDate, interval);

  while (cursor.getTime() <= today.getTime()) {
    occurrences.push(cursor);
    cursor = advance(sourceDate, cursor, interval);
  }

  return occurrences;
}
