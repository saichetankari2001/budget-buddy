import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

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

    return NextResponse.json({
      id: cycle.id,
      startingAmount: Number(cycle.startingAmount),
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      status: cycle.status,
      messages: cycle.messages.map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
