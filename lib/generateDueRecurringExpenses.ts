import { prisma } from '@/lib/prisma';
import { computeMissingOccurrences } from '@/lib/utils/recurringOccurrences';

export async function generateDueRecurringExpenses(userId: string, today: Date = new Date()): Promise<void> {
  const templates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
  });

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
