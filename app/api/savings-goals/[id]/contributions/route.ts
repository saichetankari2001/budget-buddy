import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { logSavingsContribution } from '@/lib/savingsGoals/actions';

const contributionSchema = z.object({ goalName: z.string().min(1), amount: z.number().positive() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { goalName, amount } = contributionSchema.parse(await request.json());
    void params; // the form already knows the goal's name; the :id in the URL is for REST shape only

    const result = await logSavingsContribution(user.userId, { goalName, amount });
    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
