import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createMoneyCycleSchema } from '@/lib/validation/moneyCycle.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generatePlanMessage } from '@/lib/ai/coach';
import { computeDaysRemaining, computeCommittedSpend, computeSafeToSpend } from '@/lib/utils/moneyCycle';

const ACTIVE_CYCLE_MESSAGE = 'You already have an active cycle. It will complete on its own at its end date.';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { startingAmount, endDate } = createMoneyCycleSchema.parse(await request.json());

    const existingActive = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: 'ACTIVE' },
    });
    if (existingActive) {
      throw new AppError(400, ACTIVE_CYCLE_MESSAGE);
    }

    const startDate = new Date();
    const parsedEndDate = new Date(endDate);

    const recurringTemplates = await prisma.expense.findMany({
      where: { userId: user.userId, isRecurring: true },
    });
    const committedSpend = computeCommittedSpend(
      recurringTemplates
        .filter((t) => t.recurrenceInterval !== null)
        .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date })),
      startDate,
      parsedEndDate
    );
    const daysRemaining = computeDaysRemaining(parsedEndDate, startDate);
    const safeToSpend = computeSafeToSpend({ startingAmount, committedSpend, daysRemaining });

    const planMessageText = await generatePlanMessage({
      startingAmount,
      committedSpend,
      daysRemaining,
      safeToSpend,
    });

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const createdCycle = await tx.moneyCycle.create({
          data: { userId: user.userId, startingAmount, startDate, endDate: parsedEndDate },
        });
        const createdMessage = await tx.coachMessage.create({
          data: { cycleId: createdCycle.id, kind: 'PLAN', content: planMessageText },
        });
        return { cycle: createdCycle, message: createdMessage };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(400, ACTIVE_CYCLE_MESSAGE);
      }
      throw error;
    }
    const { cycle, message } = result;

    return NextResponse.json(
      {
        id: cycle.id,
        startingAmount: Number(cycle.startingAmount),
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
        messages: [{ id: message.id, kind: message.kind, content: message.content, createdAt: message.createdAt }],
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
