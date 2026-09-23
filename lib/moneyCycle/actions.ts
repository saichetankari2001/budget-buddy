import { prisma } from '@/lib/prisma';
import { generatePlanMessage } from '@/lib/ai/coach';
import { computeDaysRemaining, computeCommittedSpend, computeSafeToSpend } from '@/lib/utils/moneyCycle';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

async function findActiveCycle(userId: string) {
  return prisma.moneyCycle.findFirst({ where: { userId, status: 'ACTIVE' } });
}

export async function updateCycleAmount(
  userId: string,
  newAmount: number
): Promise<ActionResult<{ remainingAmount: number; daysRemaining: number; safeToSpend: number; message: string }>> {
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
  const remainingAmount = Math.max(newAmount - committedSpend, 0);
  const safeToSpend = computeSafeToSpend({ startingAmount: remainingAmount, committedSpend: 0, daysRemaining });

  const planMessageText = await generatePlanMessage({
    startingAmount: newAmount,
    committedSpend,
    daysRemaining,
    safeToSpend,
  });

  await prisma.$transaction(async (tx) => {
    await tx.moneyCycle.update({ where: { id: cycle.id }, data: { startingAmount: newAmount } });
    await tx.coachMessage.create({ data: { cycleId: cycle.id, kind: 'PLAN', content: planMessageText } });
  });

  return { success: true, remainingAmount, daysRemaining, safeToSpend, message: planMessageText };
}

export async function cancelCycle(userId: string): Promise<ActionResult> {
  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'CANCELLED' } });

  return { success: true };
}
