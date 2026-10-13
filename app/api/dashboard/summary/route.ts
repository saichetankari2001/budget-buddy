import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { getCurrentMonthRange } from '@/lib/utils/dateRange';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    try {
      await generateDueRecurringExpenses(user.userId);
    } catch (error) {
      console.error('Failed to generate recurring expenses:', error);
    }

    const now = new Date();
    const { start, end } = getCurrentMonthRange(now);

    const currentMonthExpenses = await prisma.expense.findMany({
      where: { userId: user.userId, date: { gte: start, lt: end } },
    });
    const totalSpentThisMonth = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const activeCycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });

    let healthScore = { value: 0, hasScore: false };
    if (activeCycle) {
      const score = await computeHealthScore(
        user.userId,
        {
          id: activeCycle.id,
          startDate: activeCycle.startDate,
          endDate: activeCycle.endDate,
          createdAt: activeCycle.createdAt,
          status: activeCycle.status,
          startingAmount: Number(activeCycle.startingAmount),
        },
        now
      );
      healthScore = { value: score.total, hasScore: true };
    }

    return NextResponse.json({ totalSpentThisMonth, healthScore });
  } catch (error) {
    return handleRouteError(error);
  }
}
