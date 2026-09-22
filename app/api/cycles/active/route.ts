import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { computeDaysRemaining, computeCommittedSpend, computeSafeToSpend } from '@/lib/utils/moneyCycle';

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
    const committedSpend = computeCommittedSpend(
      recurringTemplates
        .filter((t) => t.recurrenceInterval !== null)
        .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date })),
      now,
      cycle.endDate
    );
    const daysRemaining = computeDaysRemaining(cycle.endDate, now);

    const spentAggregate = await prisma.expense.aggregate({
      where: { userId: user.userId, date: { gte: cycle.startDate, lte: now } },
      _sum: { amount: true },
    });
    const spentSoFar = Number(spentAggregate._sum.amount ?? 0);
    const remainingAmount = Math.max(Number(cycle.startingAmount) - spentSoFar - committedSpend, 0);
    const safeToSpend = computeSafeToSpend({ startingAmount: remainingAmount, committedSpend: 0, daysRemaining });

    return NextResponse.json({
      id: cycle.id,
      startingAmount: Number(cycle.startingAmount),
      remainingAmount,
      daysRemaining,
      safeToSpend,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      messages: cycle.messages.map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
