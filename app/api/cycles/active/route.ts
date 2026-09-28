import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const cycle = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: 'ACTIVE' },
      include: { messages: { orderBy: { createdAt: 'desc' } } },
    });

    if (!cycle) {
      return NextResponse.json(null);
    }

    const now = new Date();

    // Lazy completion: if this cycle's end date has passed, complete it now rather than
    // continuing to report stale ACTIVE data — matches the spec's "checked lazily on load" design.
    if (cycle.endDate.getTime() <= now.getTime()) {
      await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED' } });
      return NextResponse.json(null);
    }

    // Every consumer of these figures (this route, cycle creation, the chat's update_cycle_amount
    // tool, the daily check-in cron) derives them from projectCycle, so the dashboard and the chat
    // can never quote two different daily allowances for the same cycle.
    const { remainingAmount, daysRemaining, safeToSpend, projection } = await projectCycle(
      user.userId,
      {
        startingAmount: Number(cycle.startingAmount),
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      },
      now
    );

    return NextResponse.json({
      id: cycle.id,
      startingAmount: Number(cycle.startingAmount),
      remainingAmount,
      daysRemaining,
      safeToSpend,
      projection,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      messages: cycle.messages.map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
