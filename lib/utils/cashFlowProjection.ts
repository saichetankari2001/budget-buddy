export interface ProjectionEvent {
  date: Date;
  amount: number;
  label: string;
}

export interface ProjectionDay {
  date: Date;
  balance: number;
  events: { label: string; amount: number }[];
}

export interface ProjectionResult {
  trajectory: ProjectionDay[];
  minFutureBalance: number;
  minFutureBalanceDate: Date;
  isShortfall: boolean;
  safeToSpendPerDay: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Bucketed in UTC (not local time): dates flowing through this function come from stored
// timestamps (DB-backed occurrences) and are compared/consumed as absolute instants. Bucketing
// by local calendar day would shift which "day" an event lands on depending on the server's
// timezone offset, silently changing results between environments. UTC keeps day boundaries
// deterministic regardless of where this code runs.
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export function computeCashFlowProjection(input: {
  currentBalance: number;
  today: Date;
  endDate: Date;
  fixedIncomeOccurrences: ProjectionEvent[];
  billOccurrences: ProjectionEvent[];
}): ProjectionResult {
  const today = startOfDay(input.today);
  const endDate = startOfDay(input.endDate);
  const totalDays = Math.max(daysBetween(today, endDate), 0);

  const eventsByDay = new Map<number, { label: string; amount: number }[]>();
  const addEvent = (event: ProjectionEvent, sign: 1 | -1) => {
    const dayOffset = daysBetween(today, startOfDay(event.date));
    if (dayOffset < 0 || dayOffset > totalDays) return;
    const existing = eventsByDay.get(dayOffset) ?? [];
    existing.push({ label: event.label, amount: sign * event.amount });
    eventsByDay.set(dayOffset, existing);
  };
  input.fixedIncomeOccurrences.forEach((e) => addEvent(e, 1));
  input.billOccurrences.forEach((e) => addEvent(e, -1));

  const trajectory: ProjectionDay[] = [];
  let runningBalance = input.currentBalance;
  // The starting balance itself is never a candidate "dip" — it's just today's known balance,
  // not a projection outcome. Tracking only begins once the first event (income or bill) has
  // actually fired, so a flat run-up before anything happens can't masquerade as the low point;
  // since the balance is constant between events, the true minimum always lands on (or right
  // after) an event day, so restricting candidates to "on/after the first event" loses nothing.
  //
  // Exception: if the starting balance is ALREADY negative, that's a real shortfall today, not a
  // benign flat prefix — it must seed the tracker so it isn't erased by a later, unrelated income
  // event with nothing negative in between. Without this, an overdrawn user with income landing
  // later (and no bills before it) would see `isShortfall: false`, because the negative starting
  // point never became a tracked candidate. This also makes the "no events at all" fallback below
  // consistent with the event-driven path instead of being the only place a negative start surfaces.
  let minFutureBalance = input.currentBalance < 0 ? input.currentBalance : Infinity;
  let minFutureBalanceDate = today;
  let anyEventSoFar = false;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset++) {
    const dayEvents = eventsByDay.get(dayOffset) ?? [];
    for (const event of dayEvents) {
      runningBalance += event.amount;
    }
    if (dayEvents.length > 0) {
      anyEventSoFar = true;
    }
    const date = new Date(today.getTime() + dayOffset * MS_PER_DAY);
    trajectory.push({ date, balance: runningBalance, events: dayEvents });

    if (anyEventSoFar && runningBalance < minFutureBalance) {
      minFutureBalance = runningBalance;
      minFutureBalanceDate = date;
    }
  }

  // No income or bill occurrence ever fell inside the window — the balance never moves, so the
  // starting balance is trivially the (only) value across the whole trajectory. Anchor the "min"
  // date at the END of the window (not today) so daysUntilMin below spans the full remaining
  // cycle rather than flooring to 1 day — otherwise safeToSpendPerDay would report the ENTIRE
  // balance as "today's" allowance instead of spreading it evenly across the days left, which is
  // misleading for a figure the UI presents as a daily budget.
  if (minFutureBalance === Infinity) {
    minFutureBalance = input.currentBalance;
    minFutureBalanceDate = endDate;
  }

  const isShortfall = minFutureBalance < 0;
  const daysUntilMin = Math.max(daysBetween(today, minFutureBalanceDate), 1);
  const safeToSpendPerDay = isShortfall ? 0 : minFutureBalance / daysUntilMin;

  return { trajectory, minFutureBalance, minFutureBalanceDate, isShortfall, safeToSpendPerDay };
}
