import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { createBillSchema } from '@/lib/validation/bill.schema';
import { addBill } from '@/lib/bills/actions';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const input = createBillSchema.parse(await request.json());
    const result = await addBill(user.userId, {
      name: input.name,
      amount: input.amount,
      dueDate: new Date(input.dueDate),
      recurrenceInterval: input.recurrenceInterval,
      categoryId: input.categoryId,
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

    const bills = await prisma.bill.findMany({ where: { userId: user.userId }, orderBy: { dueDate: 'asc' } });
    const now = new Date();
    return NextResponse.json(
      bills.map((b) => ({
        id: b.id,
        name: b.name,
        amount: Number(b.amount),
        dueDate: b.dueDate,
        recurrenceInterval: b.recurrenceInterval,
        categoryId: b.categoryId,
        // `paidExpenseId !== null` alone is stale forever for a recurring bill: it is never cleared,
        // so a monthly bill paid once reports "paid" for the rest of time even after dueDate has
        // advanced to the next period. Pairing it with `dueDate > now` matches the exact condition
        // markBillPaid already uses as its own "already paid for this period" guard.
        isPaidThisPeriod: b.paidExpenseId !== null && b.dueDate > now,
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
