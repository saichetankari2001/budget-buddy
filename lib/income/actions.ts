import { Prisma, IncomeSourceType, RecurrenceInterval } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createIncomeSourceActionSchema } from '@/lib/validation/incomeSource.schema';
import { publishCycleUpdate } from '@/lib/realtime/publish';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export async function addIncomeSource(
  userId: string,
  input: { name: string; type: IncomeSourceType; amount?: number | null; recurrenceInterval?: RecurrenceInterval | null; startDate: Date }
): Promise<ActionResult<{ id: string }>> {
  // Validated here, not just at the route layer: this function is reached by BOTH the REST route
  // (which Zod-parses first) and the chat tool handler (which only does loose typeof guards). Without
  // this, the chat path could create a FIXED source with a null amount and null cadence — a phantom
  // "$0.00" income event in the projection and a "Fixed · repeats " artifact in the UI.
  const parsed = createIncomeSourceActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const created = await prisma.incomeSource.create({
      data: {
        userId,
        name: parsed.data.name,
        type: parsed.data.type,
        amount: parsed.data.amount ?? undefined,
        recurrenceInterval: parsed.data.recurrenceInterval ?? undefined,
        startDate: parsed.data.startDate,
      },
    });
    await publishCycleUpdate(userId);
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
  await publishCycleUpdate(userId);
  return { success: true, id: created.id };
}
