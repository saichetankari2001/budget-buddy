import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { upsertBudgetSchema } from '@/lib/validation/budget.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function PUT(request: NextRequest, { params }: { params: { categoryId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { monthlyLimit } = upsertBudgetSchema.parse(body);

    const category = await prisma.category.findFirst({
      where: { id: params.categoryId, userId: user.userId },
    });
    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    const budget = await prisma.budget.upsert({
      where: { userId_categoryId: { userId: user.userId, categoryId: params.categoryId } },
      update: { monthlyLimit },
      create: { userId: user.userId, categoryId: params.categoryId, monthlyLimit },
    });

    return NextResponse.json({ ...budget, monthlyLimit: Number(budget.monthlyLimit) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { categoryId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    await prisma.budget.deleteMany({ where: { categoryId: params.categoryId, userId: user.userId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
