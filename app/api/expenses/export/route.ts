import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { serializeExpensesToCsv } from '@/lib/utils/csv';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const expenses = await prisma.expense.findMany({
      where: { userId: user.userId },
      include: { category: true },
      orderBy: { date: 'asc' },
    });

    const csv = serializeExpensesToCsv(
      expenses.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        description: e.description,
        categoryName: e.category.name,
        amount: Number(e.amount),
      }))
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="expenses.csv"',
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
