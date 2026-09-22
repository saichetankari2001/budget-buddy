// app/api/cron/coach-checkin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generateCheckInMessage } from '@/lib/ai/coach';
import { sendPushNotification } from '@/lib/push/send';
import { computeDaysRemaining, computeCommittedSpend, computeSafeToSpend, computePacingStatus } from '@/lib/utils/moneyCycle';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      throw new AppError(401, 'Not authorized');
    }

    const now = new Date();
    const activeCycles = await prisma.moneyCycle.findMany({ where: { status: 'ACTIVE' } });

    let processed = 0;
    let completed = 0;
    let failed = 0;

    for (const cycle of activeCycles) {
      try {
        if (cycle.endDate.getTime() <= now.getTime()) {
          await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED' } });
          completed += 1;
          continue;
        }

        const startingAmount = Number(cycle.startingAmount);
        const totalDays = computeDaysRemaining(cycle.endDate, cycle.startDate);
        const daysElapsed = computeDaysRemaining(now, cycle.startDate);
        const daysRemaining = computeDaysRemaining(cycle.endDate, now);

        const recurringTemplates = await prisma.expense.findMany({
          where: { userId: cycle.userId, isRecurring: true },
        });
        const committedSpend = computeCommittedSpend(
          recurringTemplates
            .filter((t) => t.recurrenceInterval !== null)
            .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date })),
          now,
          cycle.endDate
        );

        const spentAggregate = await prisma.expense.aggregate({
          where: { userId: cycle.userId, date: { gte: cycle.startDate, lte: now } },
          _sum: { amount: true },
        });
        const spentSoFar = Number(spentAggregate._sum.amount ?? 0);
        const remainingAmount = Math.max(startingAmount - spentSoFar - committedSpend, 0);
        const safeToSpend = computeSafeToSpend({ startingAmount: remainingAmount, committedSpend: 0, daysRemaining });
        const pacingStatus = computePacingStatus({ startingAmount, spentSoFar, daysElapsed, totalDays });

        const content = await generateCheckInMessage({
          spentSoFar,
          remainingAmount,
          daysRemaining,
          safeToSpend,
          pacingStatus,
        });

        await prisma.coachMessage.create({ data: { cycleId: cycle.id, kind: 'CHECK_IN', content } });

        const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: cycle.userId } });
        for (const subscription of subscriptions) {
          try {
            await sendPushNotification(subscription, { title: 'Budget Buddy', body: content });
          } catch (pushError) {
            // sendPushNotification already handles the expected 410-gone case internally
            // (deletes the row and returns normally). This catch is for anything else it
            // rethrows — one dead subscription shouldn't stop this cycle's other subscriptions
            // from being notified.
            console.error(`Failed to send push notification for subscription ${subscription.id}:`, pushError);
          }
        }

        processed += 1;
      } catch (cycleError) {
        // One cycle's unexpected failure shouldn't abort processing of every other user's
        // cycle in the same cron run — a batch job where one bad row shouldn't take down
        // the whole batch.
        console.error(`Failed to process money cycle ${cycle.id}:`, cycleError);
        failed += 1;
      }
    }

    return NextResponse.json({ ok: true, processed, completed, failed });
  } catch (error) {
    return handleRouteError(error);
  }
}
