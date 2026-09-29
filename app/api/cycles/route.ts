import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createMoneyCycleSchema } from '@/lib/validation/moneyCycle.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generatePlanMessage } from '@/lib/ai/coach';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';
import { publishCycleUpdate } from '@/lib/realtime/publish';

const ACTIVE_CYCLE_MESSAGE = 'You already have an active cycle. It will complete on its own at its end date.';

export const maxDuration = 15;

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

    // The cycle row itself isn't needed to derive these figures, so this runs before the create —
    // the same shared derivation the dashboard and the coach cron use, so the plan message a user
    // reads at creation time agrees with the card they land on immediately afterwards.
    const { remainingAmount, daysRemaining, safeToSpend, committedSpend, shortfallWarning } = await projectCycle(
      user.userId,
      { startingAmount, startDate, endDate: parsedEndDate },
      startDate
    );

    const planMessageText = await generatePlanMessage({
      startingAmount,
      committedSpend,
      daysRemaining,
      safeToSpend,
      shortfallWarning,
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

    await publishCycleUpdate(user.userId);

    return NextResponse.json(
      {
        id: cycle.id,
        startingAmount: Number(cycle.startingAmount),
        remainingAmount,
        daysRemaining,
        safeToSpend,
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
