/**
 * The current calendar-month date range, as a half-open interval: `start` is the 1st of the
 * month at midnight, `end` is the 1st of the *next* month at midnight (exclusive upper bound).
 *
 * Extracted as its own helper after a Prisma query on `/dashboard` once filtered only with
 * `date: { gte: start }` and no upper bound — which silently counted any future-dated expense
 * (nothing in this app prevents entering one) as part of "this month's" spend, inflating the
 * Total-spent stat, polluting the category pie chart, and mis-bucketing into the wrong index of
 * the daily spend-trend sparkline. Always pass both `start` and `end` to a `date` filter built
 * from this helper's result.
 */
export function getCurrentMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}
