import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const budgets = await prisma.budget.findMany({
      where: { userId: user.userId },
      include: { category: true },
    });

    return NextResponse.json(
      budgets.map((budget) => ({ ...budget, monthlyLimit: Number(budget.monthlyLimit) }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
