import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createMoneyCycleSchema } from '@/lib/validation/moneyCycle.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createCycle } from '@/lib/moneyCycle/actions';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { startingAmount, endDate } = createMoneyCycleSchema.parse(await request.json());

    const result = await createCycle(user.userId, { startingAmount, endDate: new Date(endDate) });
    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json(
      {
        id: result.id,
        startingAmount: result.startingAmount,
        remainingAmount: result.remainingAmount,
        daysRemaining: result.daysRemaining,
        safeToSpend: result.safeToSpend,
        startDate: result.startDate,
        endDate: result.endDate,
        status: result.status,
        messages: [result.message],
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
