import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { updateExpenseSchema } from '@/lib/validation/expense.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const data = updateExpenseSchema.parse(body);

    if (data.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: data.categoryId, userId: user.userId },
      });
      if (!category) {
        throw new AppError(404, 'Category not found');
      }
    }

    const { count } = await prisma.expense.updateMany({
      where: { id: params.id, userId: user.userId },
      data: {
        ...data,
        ...(data.date ? { date: new Date(data.date) } : {}),
        ...(data.isRecurring === false ? { recurrenceInterval: null } : {}),
      },
    });

    if (count === 0) {
      throw new AppError(404, 'Expense not found');
    }

    const expense = await prisma.expense.findFirst({ where: { id: params.id, userId: user.userId } });
    return NextResponse.json(expense ? { ...expense, amount: Number(expense.amount) } : expense);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    await prisma.expense.deleteMany({ where: { id: params.id, userId: user.userId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
