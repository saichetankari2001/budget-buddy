import { prisma } from '@/lib/prisma';
import { computeMissingOccurrences } from '@/lib/utils/recurringOccurrences';

export async function generateDueRecurringExpenses(userId: string, today: Date = new Date()): Promise<void> {
  const templates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
  });

  // Each template is processed sequentially (one findMany + N awaited creates
  // per template) rather than batched. That's fine at this project's
  // free-tier/portfolio scale, but if a user ever accumulated a large number
  // of recurring expenses, this would need batching — e.g. createMany for the
  // generated instances, or Promise.all across independent templates.
  for (const template of templates) {
    if (!template.recurrenceInterval) continue;

    const instances = await prisma.expense.findMany({
      where: { recurringSourceId: template.id },
      orderBy: { date: 'desc' },
      take: 1,
    });

    const lastDate = instances[0]?.date ?? template.date;

    const missingDates = computeMissingOccurrences(
      template.recurrenceInterval,
      template.date,
      lastDate,
      today
    );

    // Known limitation: no idempotency guard here (no unique constraint or
    // transaction). Two near-simultaneous calls for the same user (e.g. two
    // browser tabs both loading the dashboard) could both read the same
    // `lastDate` and both create the same catch-up instances, duplicating
    // spending. Accepted trade-off at this project's scale.
    for (const occurrenceDate of missingDates) {
      await prisma.expense.create({
        data: {
          userId: template.userId,
          categoryId: template.categoryId,
          amount: template.amount,
          description: template.description,
          date: occurrenceDate,
          isRecurring: false,
          recurringSourceId: template.id,
        },
      });
    }
  }
}
