import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createExpenseSchema, expenseFiltersSchema } from '@/lib/validation/expense.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { categoryId, from, to } = expenseFiltersSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const where: Prisma.ExpenseWhereInput = { userId: user.userId };
    if (categoryId) where.categoryId = categoryId;
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: { category: true },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(expenses.map((expense) => ({ ...expense, amount: Number(expense.amount) })));
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
    const { amount, description, categoryId, date, isRecurring, recurrenceInterval } =
      createExpenseSchema.parse(body);

    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: user.userId },
    });
    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    const expense = await prisma.expense.create({
      data: {
        userId: user.userId,
        categoryId,
        amount,
        description,
        date: new Date(date),
        ...(isRecurring !== undefined ? { isRecurring } : {}),
        ...(recurrenceInterval !== undefined ? { recurrenceInterval } : {}),
      },
    });

    return NextResponse.json({ ...expense, amount: Number(expense.amount) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
