import { Prisma, IncomeSourceType, RecurrenceInterval } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export async function addIncomeSource(
  userId: string,
  input: { name: string; type: IncomeSourceType; amount?: number; recurrenceInterval?: RecurrenceInterval; startDate: Date }
): Promise<ActionResult<{ id: string }>> {
  try {
    const created = await prisma.incomeSource.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        amount: input.amount,
        recurrenceInterval: input.recurrenceInterval,
        startDate: input.startDate,
      },
    });
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: `You already have an income source named "${input.name}"` };
    }
    throw error;
  }
}

export async function logIncomeEntry(
  userId: string,
  input: { sourceName: string; amount: number; date?: Date }
): Promise<ActionResult<{ id: string }>> {
  const source = await prisma.incomeSource.findFirst({ where: { userId, name: input.sourceName } });
  if (!source) {
    return { success: false, error: `No income source named "${input.sourceName}" found` };
  }

  const created = await prisma.incomeEntry.create({
    data: { incomeSourceId: source.id, amount: input.amount, date: input.date ?? new Date() },
  });
  return { success: true, id: created.id };
}
