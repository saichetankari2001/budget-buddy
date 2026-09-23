import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';

const updateCycleSchema = z.object({ newAmount: z.number().positive() });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { newAmount } = updateCycleSchema.parse(await request.json());
    const result = await updateCycleAmount(user.userId, newAmount);

    if (!result.success) {
      throw new AppError(404, result.error);
    }

    return NextResponse.json({
      remainingAmount: result.remainingAmount,
      daysRemaining: result.daysRemaining,
      safeToSpend: result.safeToSpend,
      message: result.message,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params: _params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const result = await cancelCycle(user.userId);

    if (!result.success) {
      throw new AppError(404, result.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
