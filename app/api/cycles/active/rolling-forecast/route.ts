import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';
import { computeRollingForecast } from '@/lib/moneyCycle/rollingForecast';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const cycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
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

    const { remainingAmount } = await projectCycle(
      user.userId,
      { startingAmount: Number(cycle.startingAmount), startDate: cycle.startDate, endDate: cycle.endDate },
      now
    );

    const forecast = await computeRollingForecast(user.userId, { remainingAmount, cycleEndDate: cycle.endDate }, now);

    return NextResponse.json(forecast);
  } catch (error) {
    return handleRouteError(error);
  }
}
