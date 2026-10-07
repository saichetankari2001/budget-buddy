import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push/send';
import { formatCurrency } from '@/lib/utils/currency';

const MIN_PRIOR_EXPENSES = 3;
const ANOMALY_MULTIPLIER = 2.5;
const PRIOR_EXPENSES_WINDOW = 10;

/**
 * A second, independent signal from checkCategoryThresholdAndNotify: that one compares against a
 * fixed budget, so it's blind to a single large purchase early in a cycle when the category is
 * nowhere near its budget yet. This compares a new expense against the user's own recent average
 * in that category instead, catching the purchase itself, not just the category running hot.
 * Fire-and-forget, matching that sibling function's exact contract: never throws into its caller.
 */
export async function checkExpenseAnomalyAndNotify(
  userId: string,
  categoryId: string,
  newExpense: { id: string; amount: number; description: string }
): Promise<void> {
  try {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) return;

    const priorExpenses = await prisma.expense.findMany({
      where: { userId, categoryId, id: { not: newExpense.id } },
      orderBy: { date: 'desc' },
      take: PRIOR_EXPENSES_WINDOW,
    });
    if (priorExpenses.length < MIN_PRIOR_EXPENSES) return;

    const baseline = priorExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / priorExpenses.length;
    if (baseline <= 0 || newExpense.amount < ANOMALY_MULTIPLIER * baseline) return;

    const message =
      `This ${formatCurrency(newExpense.amount)} ${newExpense.description} is well above your usual ` +
      `${formatCurrency(baseline)} ${category.name} spend.`;

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, { title: 'Budget Buddy', body: message });
      } catch (pushError) {
        console.error(`Failed to send anomaly push for subscription ${subscription.id}:`, pushError);
      }
    }
  } catch (error) {
    console.error(`Failed to check expense anomaly for user ${userId}:`, error);
  }
}
