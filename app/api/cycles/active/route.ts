import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { computeDaysRemaining, computeBillOccurrences } from '@/lib/utils/moneyCycle';
import { computeCashFlowProjection } from '@/lib/utils/cashFlowProjection';

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const cycle = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: 'ACTIVE' },
      include: { messages: { orderBy: { createdAt: 'desc' } } },
    });

    if (!cycle) {
      return NextResponse.json(null);
    }

    const now = new Date();

    // Lazy completion: if this cycle's end date has passed, complete it now rather than
    // continuing to report stale ACTIVE data — matches the spec's "checked lazily on load" design.
    if (cycle.endDate.getTime() <= now.getTime()) {
      await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED' } });
      return NextResponse.json(null);
    }

    const recurringTemplates = await prisma.expense.findMany({
      where: { userId: user.userId, isRecurring: true },
    });

    const spentAggregate = await prisma.expense.aggregate({
      where: { userId: user.userId, date: { gte: cycle.startDate, lte: now } },
      _sum: { amount: true },
    });
    const spentSoFar = Number(spentAggregate._sum.amount ?? 0);

    const recurringExpenseTemplates = recurringTemplates
      .filter((t) => t.recurrenceInterval !== null)
      .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date, label: t.description }));

    const billTemplates = await prisma.bill.findMany({ where: { userId: user.userId } });
    const billOccurrencesOneTime = billTemplates
      .filter((b) => b.recurrenceInterval === null && b.dueDate >= now && b.dueDate <= cycle.endDate)
      .map((b) => ({ date: b.dueDate, amount: Number(b.amount), label: b.name }));
    const billOccurrencesRecurring = computeBillOccurrences(
      billTemplates
        .filter((b) => b.recurrenceInterval !== null)
        .map((b) => ({ amount: Number(b.amount), recurrenceInterval: b.recurrenceInterval!, date: b.dueDate, label: b.name })),
      now,
      cycle.endDate
    );
    const legacyRecurringExpenseOccurrences = computeBillOccurrences(recurringExpenseTemplates, now, cycle.endDate);

    const incomeSources = await prisma.incomeSource.findMany({ where: { userId: user.userId, type: 'FIXED' } });
    const fixedIncomeOneTime = incomeSources
      .filter((s) => s.recurrenceInterval === null && s.startDate >= now && s.startDate <= cycle.endDate)
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
      where: { incomeSource: { userId: user.userId }, date: { gte: cycle.startDate, lte: now } },
      _sum: { amount: true },
    });
    const incomeEntriesSoFar = Number(incomeEntriesAggregate._sum.amount ?? 0);
    const remainingAmount = Math.max(Number(cycle.startingAmount) - spentSoFar + incomeEntriesSoFar, 0);
    const projectionResult = computeCashFlowProjection({
      currentBalance: remainingAmount,
      today: now,
      endDate: cycle.endDate,
      fixedIncomeOccurrences: [...fixedIncomeOneTime, ...fixedIncomeRecurring],
      billOccurrences: [...billOccurrencesOneTime, ...billOccurrencesRecurring, ...legacyRecurringExpenseOccurrences],
    });
    const daysRemaining = computeDaysRemaining(cycle.endDate, now);
    // computeCashFlowProjection already clamps safeToSpendPerDay to 0 on a shortfall — no need to
    // re-check isShortfall here too.
    const safeToSpend = projectionResult.safeToSpendPerDay;
    const projection = projectionResult.trajectory.map((day) => ({
      date: day.date.toISOString(),
      balance: day.balance,
      events: day.events,
    }));

    return NextResponse.json({
      id: cycle.id,
      startingAmount: Number(cycle.startingAmount),
      remainingAmount,
      daysRemaining,
      safeToSpend,
      projection,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      messages: cycle.messages.map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
