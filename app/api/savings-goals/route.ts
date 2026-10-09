import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createSavingsGoalSchema } from '@/lib/validation/savingsGoal.schema';
import { addSavingsGoal } from '@/lib/savingsGoals/actions';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const goals = await prisma.savingsGoal.findMany({
      where: { userId: user.userId },
      include: { contributions: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(
      goals.map((g) => ({
        id: g.id,
        name: g.name,
        targetAmount: Number(g.targetAmount),
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        // Always computed on read from real contribution rows -- never a stored running total.
        contributedAmount: g.contributions.reduce((sum, c) => sum + Number(c.amount), 0),
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const parsed = createSavingsGoalSchema.parse(body);

    const result = await addSavingsGoal(user.userId, {
      name: parsed.name,
      targetAmount: parsed.targetAmount,
      targetDate: parsed.targetDate ? new Date(parsed.targetDate) : undefined,
    });

    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
