import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createIncomeSourceSchema } from '@/lib/validation/incomeSource.schema';
import { addIncomeSource } from '@/lib/income/actions';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const input = createIncomeSourceSchema.parse(await request.json());
    const result = await addIncomeSource(user.userId, {
      name: input.name,
      type: input.type,
      amount: input.amount,
      recurrenceInterval: input.recurrenceInterval,
      startDate: new Date(input.startDate),
    });

    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const sources = await prisma.incomeSource.findMany({ where: { userId: user.userId }, orderBy: { createdAt: 'asc' } });
    return NextResponse.json(
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        amount: s.amount ? Number(s.amount) : null,
        recurrenceInterval: s.recurrenceInterval,
        startDate: s.startDate,
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
