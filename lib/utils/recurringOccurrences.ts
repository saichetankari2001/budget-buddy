import { RecurrenceInterval } from '@prisma/client';

function advance(sourceDate: Date, fromDate: Date, interval: RecurrenceInterval): Date {
  if (interval === 'WEEKLY') {
    // Find the next occurrence of the same day-of-week after fromDate
    const sourceDay = sourceDate.getDay(); // 0-6, where 0 = Sunday
    const fromDay = fromDate.getDay();
    let daysToAdd = (sourceDay - fromDay + 7) % 7;
    if (daysToAdd === 0) {
      daysToAdd = 7; // If fromDate is the same day-of-week, add 7 days
    }
    const next = new Date(fromDate);
    next.setDate(next.getDate() + daysToAdd);
    return next;
  }

  if (interval === 'YEARLY') {
    // Check if the occurrence in the current year is after fromDate
    const currentYear = new Date(fromDate.getFullYear(), sourceDate.getMonth(), 1);
    const daysInCurrentMonth = new Date(currentYear.getFullYear(), sourceDate.getMonth() + 1, 0).getDate();
    currentYear.setMonth(sourceDate.getMonth(), Math.min(sourceDate.getDate(), daysInCurrentMonth));
    if (currentYear.getTime() > fromDate.getTime()) {
      return currentYear;
    }

    // Otherwise, advance to the next year
    const next = new Date(fromDate);
    next.setFullYear(next.getFullYear() + 1);
    const daysInTargetMonth = new Date(next.getFullYear(), sourceDate.getMonth() + 1, 0).getDate();
    next.setMonth(sourceDate.getMonth(), Math.min(sourceDate.getDate(), daysInTargetMonth));
    return next;
  }

  // MONTHLY — check if the occurrence in the current month is after fromDate
  const daysInCurrentMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();
  const currentMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), Math.min(sourceDate.getDate(), daysInCurrentMonth));
  if (currentMonth.getTime() > fromDate.getTime()) {
    return currentMonth;
  }

  // Otherwise, always anchor to sourceDate's day-of-month in the next month, recovering it whenever
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
