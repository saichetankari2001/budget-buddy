import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createSavingsGoalActionSchema } from '@/lib/validation/savingsGoal.schema';
import { publishCycleUpdate } from '@/lib/realtime/publish';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export async function addSavingsGoal(
  userId: string,
  input: { name: string; targetAmount: number; targetDate?: Date }
): Promise<ActionResult<{ id: string }>> {
  // Validated here, not just at the route layer: this function is reached by BOTH the REST route
  // (which Zod-parses first) and the chat tool handler (which only does loose typeof guards),
  // matching addBill's/addIncomeSource's existing contract exactly.
  const parsed = createSavingsGoalActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const created = await prisma.savingsGoal.create({
      data: {
        userId,
        name: parsed.data.name,
        targetAmount: parsed.data.targetAmount,
        targetDate: parsed.data.targetDate ?? undefined,
      },
    });
    await publishCycleUpdate(userId);
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: `You already have a savings goal named "${input.name}"` };
    }
    throw error;
  }
}

export async function logSavingsContribution(
  userId: string,
  input: { goalName: string; amount: number; date?: Date }
): Promise<ActionResult<{ id: string }>> {
  const goal = await prisma.savingsGoal.findFirst({
    where: { userId, name: { equals: input.goalName, mode: 'insensitive' } },
  });
  if (!goal) {
    // No "Other"-style fallback, unlike logExpense's category resolution — a savings goal has no
    // sensible generic bucket to fall back to.
    return { success: false, error: `No savings goal named "${input.goalName}" found — create it first.` };
  }

  const created = await prisma.savingsContribution.create({
    data: { savingsGoalId: goal.id, amount: input.amount, date: input.date ?? new Date() },
  });
  await publishCycleUpdate(userId);
  return { success: true, id: created.id };
}

export async function deleteSavingsGoal(userId: string, goalName: string): Promise<ActionResult> {
  const goal = await prisma.savingsGoal.findFirst({
    where: { userId, name: { equals: goalName, mode: 'insensitive' } },
  });
  if (!goal) {
    return { success: false, error: `No savings goal named "${goalName}" found` };
  }

  await prisma.savingsGoal.delete({ where: { id: goal.id } });
  await publishCycleUpdate(userId);
  return { success: true };
}
