import { Prisma, RecurrenceInterval } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computeNextOccurrence } from '@/lib/utils/recurringOccurrences';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

const BILLS_CATEGORY_NAME = 'Bills';
const BILLS_CATEGORY_COLOR = '#8b5cf6';

async function findOrCreateBillsCategory(userId: string): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { userId, name: BILLS_CATEGORY_NAME } });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { userId, name: BILLS_CATEGORY_NAME, color: BILLS_CATEGORY_COLOR },
  });
  return created.id;
}

export async function addBill(
  userId: string,
  input: { name: string; amount: number; dueDate: Date; recurrenceInterval?: RecurrenceInterval; categoryId?: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const created = await prisma.bill.create({
      data: {
        userId,
        name: input.name,
        amount: input.amount,
        dueDate: input.dueDate,
        recurrenceInterval: input.recurrenceInterval,
        categoryId: input.categoryId,
      },
    });
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: `You already have a bill named "${input.name}"` };
    }
    throw error;
  }
}

export async function markBillPaid(userId: string, billName: string): Promise<ActionResult<{ expenseId: string }>> {
  const bill = await prisma.bill.findFirst({ where: { userId, name: billName } });
  if (!bill) {
    return { success: false, error: `No bill named "${billName}" found` };
  }

  const now = new Date();
  if (bill.dueDate.getTime() > now.getTime()) {
    return { success: false, error: `${billName} is not due yet — it was already paid for this period` };
  }
  // For one-time bills, dueDate never advances after payment (there is no next occurrence), so the
  // "not due yet" check above can't guard against a second call the way it does for recurring bills.
  // paidExpenseId is the only signal left for a one-time bill's already-paid state.
  if (!bill.recurrenceInterval && bill.paidExpenseId) {
    return { success: false, error: `${billName} is not due yet — it was already paid for this period` };
  }

  const categoryId = bill.categoryId ?? (await findOrCreateBillsCategory(userId));

  const expense = await prisma.expense.create({
    data: {
      userId,
      categoryId,
      amount: Number(bill.amount),
      description: billName,
      date: bill.dueDate,
    },
  });

  const nextDueDate = bill.recurrenceInterval
    ? computeNextOccurrence(bill.recurrenceInterval, bill.dueDate, bill.dueDate)
    : bill.dueDate;

  await prisma.bill.update({
    where: { id: bill.id },
    data: { paidExpenseId: expense.id, dueDate: nextDueDate },
  });

  return { success: true, expenseId: expense.id };
}
