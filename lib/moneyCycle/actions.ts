import { prisma } from '@/lib/prisma';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';

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

  // Derived through the same shared projection the dashboard uses, with `newAmount` standing in as
  // the hypothetical starting amount. Previously this path used a flat average that could not see
  // Bill or IncomeSource rows, so the chat's reply to "change it to $700" could quote a completely
  // different daily figure from the dashboard card sitting right above it.
  const { remainingAmount, daysRemaining, safeToSpend } = await projectCycle(userId, {
    startingAmount: newAmount,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
  });

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
