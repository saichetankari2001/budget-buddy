import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { logIncomeEntry } from '@/lib/income/actions';

const logEntrySchema = z.object({ amount: z.number().positive(), date: z.string().datetime().optional() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { amount, date } = logEntrySchema.parse(await request.json());
    const result = await logIncomeEntry(user.userId, {
      sourceName: decodeURIComponent(params.id),
      amount,
      date: date ? new Date(date) : undefined,
    });

    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
