import { prisma } from '@/lib/prisma';
import { checkCategoryThresholdAndNotify } from '@/lib/moneyCycle/categoryThresholdNotifications';
import { checkExpenseAnomalyAndNotify } from '@/lib/moneyCycle/expenseAnomalyNotifications';

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

/**
 * Logs an expense from the chat's natural-language flow ("I spent $20 on groceries"), distinct
 * from POST /api/expenses (which takes a real categoryId from a form select). Here the AI only
 * ever produces a category NAME, so it's resolved against the user's own categories by
 * case-insensitive name match, falling back to "Other" (always present — seeded at signup) rather
 * than failing outright, since the whole point of this path is minimal-friction logging.
 */
export async function logExpense(
  userId: string,
  input: { amount: number; description: string; categoryName?: string; date?: Date }
): Promise<ActionResult<{ id: string; categoryName: string }>> {
  if (!(input.amount > 0)) {
    return { success: false, error: 'Amount must be greater than 0' };
  }
  if (!input.description || input.description.trim().length === 0) {
    return { success: false, error: 'A short description is required' };
  }

  const categories = await prisma.category.findMany({ where: { userId } });
  const requestedName = input.categoryName?.trim().toLowerCase();
  const matched =
    (requestedName && categories.find((c) => c.name.toLowerCase() === requestedName)) ||
    categories.find((c) => c.name.toLowerCase() === 'other');
  if (!matched) {
    // Only reachable if the user has somehow deleted every category including "Other" — there is
    // no category-delete feature today, so this is defensive, not an expected path.
    return { success: false, error: 'No category found to log this expense against' };
  }

  const expense = await prisma.expense.create({
    data: {
      userId,
      categoryId: matched.id,
      amount: input.amount,
      description: input.description.trim(),
      date: input.date ?? new Date(),
    },
  });

  // Matches POST /api/expenses's own contract exactly: fire-and-forget, never fails the expense
  // creation itself if the threshold check or push send throws (checkCategoryThresholdAndNotify
  // already wraps its own body in try/catch).
  await checkCategoryThresholdAndNotify(userId, matched.id);
  await checkExpenseAnomalyAndNotify(userId, matched.id, {
    id: expense.id,
    amount: input.amount,
    description: expense.description,
  });

  return { success: true, id: expense.id, categoryName: matched.name };
}
