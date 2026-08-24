import { describe, it, expect } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { generateDueRecurringExpenses } from './generateDueRecurringExpenses';

const template = {
  id: 'exp_template',
  userId: 'user_1',
  categoryId: 'cat_1',
  amount: { toString: () => '15.00' } as never,
  description: 'Netflix',
  date: new Date(2026, 5, 15), // June 15
  createdAt: new Date(),
  isRecurring: true,
  recurrenceInterval: 'MONTHLY',
  recurringSourceId: null,
} as never;

describe('generateDueRecurringExpenses', () => {
  it('creates a missing instance for a due monthly recurring expense', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([template]).mockResolvedValueOnce([]);
    prismaMock.expense.create.mockResolvedValue({} as never);

    await generateDueRecurringExpenses('user_1', new Date(2026, 6, 20)); // July 20

    expect(prismaMock.expense.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'user_1', isRecurring: true },
    });
    expect(prismaMock.expense.findMany).toHaveBeenNthCalledWith(2, {
      where: { recurringSourceId: 'exp_template' },
      orderBy: { date: 'desc' },
      take: 1,
    });
    expect(prismaMock.expense.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        categoryId: 'cat_1',
        amount: template.amount,
        description: 'Netflix',
        date: new Date(2026, 6, 15), // July 15
        isRecurring: false,
        recurringSourceId: 'exp_template',
      },
    });
  });

  it('creates nothing when no occurrence is due yet', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([template]).mockResolvedValueOnce([]);

    await generateDueRecurringExpenses('user_1', new Date(2026, 5, 20)); // June 20, before July 15 is due

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('scopes the template lookup to userId and creates nothing when there are no templates', async () => {
    prismaMock.expense.findMany.mockResolvedValueOnce([]);

    await generateDueRecurringExpenses('user_1', new Date(2026, 7, 1));

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isRecurring: true },
    });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });
});
