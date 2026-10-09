import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { publishCycleUpdate } from '@/lib/realtime/publish';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    // Scoped by userId, not just id, so one user can never delete another's goal by guessing an id.
    const goal = await prisma.savingsGoal.findFirst({ where: { id: params.id, userId: user.userId } });
    if (!goal) {
      throw new AppError(404, 'Savings goal not found');
    }

    await prisma.savingsGoal.delete({ where: { id: goal.id } });
    await publishCycleUpdate(user.userId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
