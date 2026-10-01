import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push/send';
import { computeCategoryTotalsForWindow } from './categoryTotals';
import { formatCurrency } from '@/lib/utils/currency';

/**
 * Checked immediately after an expense is created (POST /api/expenses), not in the daily cron —
 * the whole point is finding out the moment a category runs hot, not the next morning. Fire-and-
 * forget, matching publishCycleUpdate's contract elsewhere in this app: a failure here (in the
 * threshold check, the push send, anything) must never fail the expense creation that triggered it.
 */
export async function checkCategoryThresholdAndNotify(userId: string, categoryId: string): Promise<void> {
  try {
    const cycle = await prisma.moneyCycle.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (!cycle) return;

    // The expense's category might not be one of the cycle's tracked categories — it wasn't among
    // the top 5 historical categories at cycle creation, or it's a category created afterward —
    // in which case it folds into the "Other" row (categoryId: null).
    const targetRow =
      (await prisma.cycleCategoryBudget.findFirst({ where: { cycleId: cycle.id, categoryId } })) ??
      (await prisma.cycleCategoryBudget.findFirst({ where: { cycleId: cycle.id, categoryId: null } }));
    if (!targetRow) return;

    const recommended = Number(targetRow.recommendedAmount);
    if (recommended <= 0) return;

    const trackedRows = await prisma.cycleCategoryBudget.findMany({
      where: { cycleId: cycle.id, categoryId: { not: null } },
    });
    const trackedCategoryIds = trackedRows.map((r) => r.categoryId as string);
    const actuals = await computeCategoryTotalsForWindow(userId, { gte: cycle.startDate }, trackedCategoryIds);
    const actualForTarget = actuals.find((a) => a.categoryId === targetRow.categoryId)?.actual ?? 0;

    const ratio = actualForTarget / recommended;

    let message: string | null = null;
    let updateData: { notifiedAt80?: Date; notifiedAt100?: Date } = {};

    if (ratio >= 1 && !targetRow.notifiedAt100) {
      message = `You've used all of your ${formatCurrency(recommended)} ${targetRow.categoryName} budget for this cycle.`;
      updateData = { notifiedAt100: new Date() };
    } else if (ratio >= 0.8 && !targetRow.notifiedAt80) {
      message = `You've used ${Math.round(ratio * 100)}% of your ${formatCurrency(recommended)} ${targetRow.categoryName} budget for this cycle.`;
      updateData = { notifiedAt80: new Date() };
    }

    if (!message) return;

    await prisma.cycleCategoryBudget.update({ where: { id: targetRow.id }, data: updateData });

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, { title: 'Budget Buddy', body: message });
      } catch (pushError) {
        console.error(`Failed to send category threshold push for subscription ${subscription.id}:`, pushError);
      }
    }
  } catch (error) {
    console.error(`Failed to check category threshold for user ${userId}:`, error);
  }
}
