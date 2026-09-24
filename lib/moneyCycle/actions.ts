import { prisma } from '@/lib/prisma';
import { computeDaysRemaining, computeCommittedSpend, computeSafeToSpend } from '@/lib/utils/moneyCycle';

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string; code?: 'VALIDATION_ERROR' };

const MAX_CYCLE_AMOUNT = 99_999_999;

async function findActiveCycle(userId: string) {
  return prisma.moneyCycle.findFirst({ where: { userId, status: 'ACTIVE' } });
}

export async function updateCycleAmount(
  userId: string,
  newAmount: number
): Promise<ActionResult<{ remainingAmount: number; daysRemaining: number; safeToSpend: number }>> {
  if (!Number.isFinite(newAmount) || newAmount <= 0 || newAmount > MAX_CYCLE_AMOUNT) {
    return {
      success: false,
      error: 'Amount must be a positive number under $100,000,000',
      code: 'VALIDATION_ERROR',
    };
  }

  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  const now = new Date();
  const recurringTemplates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
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
    where: { userId, date: { gte: cycle.startDate, lte: now } },
    _sum: { amount: true },
  });
  const spentSoFar = Number(spentAggregate._sum.amount ?? 0);
  const remainingAmount = Math.max(newAmount - spentSoFar - committedSpend, 0);
  const safeToSpend = computeSafeToSpend({ startingAmount: remainingAmount, committedSpend: 0, daysRemaining });

  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { startingAmount: newAmount } });

  return { success: true, remainingAmount, daysRemaining, safeToSpend };
}

export async function cancelCycle(userId: string): Promise<ActionResult> {
  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'CANCELLED' } });

  return { success: true };
}
