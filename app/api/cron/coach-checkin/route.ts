// app/api/cron/coach-checkin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generateCheckInMessage } from '@/lib/ai/coach';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { sendPushNotification } from '@/lib/push/send';
import { computeDaysRemaining, computePacingStatus } from '@/lib/utils/moneyCycle';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleCheckIn(request);
}

export async function POST(request: NextRequest) {
  return handleCheckIn(request);
}

async function handleCheckIn(request: NextRequest) {
  try {
    if (!process.env.CRON_SECRET) {
      throw new AppError(500, 'CRON_SECRET is not configured');
    }

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

        const lastMessage = await prisma.coachMessage.findFirst({
          where: { cycleId: cycle.id, kind: { in: ['PLAN', 'CHECK_IN'] } },
          orderBy: { createdAt: 'desc' },
        });
        const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;
        if (lastMessage && now.getTime() - lastMessage.createdAt.getTime() < TWENTY_HOURS_MS) {
          continue; // already checked in recently — avoid duplicate messages/pushes on a retry or manual re-trigger
        }

        const startingAmount = Number(cycle.startingAmount);
        const totalDays = computeDaysRemaining(cycle.endDate, cycle.startDate);
        const daysElapsed = computeDaysRemaining(now, cycle.startDate);

        // The safety-critical call site: this message becomes a push notification. The old flat
        // average here could not see Bill rows at all, so a user heading into a real projected
        // shortfall would be told they were "on track". The shared projection sees the bills, and
        // its shortfallWarning is now woven into the message.
        const { remainingAmount, daysRemaining, safeToSpend, spentSoFar, shortfallWarning } = await projectCycle(
          cycle.userId,
          {
            startingAmount,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
          },
          now
        );
        const pacingStatus = computePacingStatus({ startingAmount, spentSoFar, daysElapsed, totalDays });

        const currentScore = await computeHealthScore(
          cycle.userId,
          {
            id: cycle.id,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            createdAt: cycle.createdAt,
            status: cycle.status,
            startingAmount,
          },
          now
        );
        const priorCycle = await prisma.moneyCycle.findFirst({
          where: { userId: cycle.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
        });
        const previousTotal = priorCycle
          ? (
              await computeHealthScore(
                cycle.userId,
                {
                  id: priorCycle.id,
                  startDate: priorCycle.startDate,
                  endDate: priorCycle.endDate,
                  createdAt: priorCycle.createdAt,
                  status: priorCycle.status,
                  startingAmount: Number(priorCycle.startingAmount),
                },
                priorCycle.endDate
              )
            ).total
          : null;
        const healthScore = { total: currentScore.total, delta: previousTotal !== null ? currentScore.total - previousTotal : null };

        const content = await generateCheckInMessage({
          spentSoFar,
          remainingAmount,
          daysRemaining,
          safeToSpend,
          pacingStatus,
          shortfallWarning,
          healthScore,
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
