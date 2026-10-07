import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/push/send', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { sendPushNotification } from '@/lib/push/send';
import { checkExpenseAnomalyAndNotify } from './expenseAnomalyNotifications';

const foodCategory = { id: 'cat_food', userId: 'user_1', name: 'Food', color: '#f97316', isGstFree: false, createdAt: new Date() };

function priorExpenses(amounts: number[]) {
  return amounts.map((amount, i) => ({
    id: `exp_prior_${i}`,
    categoryId: 'cat_food',
    amount: { toString: () => amount.toFixed(2) } as never,
  }));
}

describe('checkExpenseAnomalyAndNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.category.findFirst.mockResolvedValue(foodCategory as never);
  });

  it('does nothing with fewer than 3 prior expenses in the category', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25]) as never);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 200, description: 'Dinner' });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('does not fire for a normal-sized expense close to the baseline', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never); // avg 25
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 30, description: 'Groceries' });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('fires with the baseline and category in the message when the new expense is >= 2.5x the average', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never); // avg 25, threshold 62.50
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' });

    expect(sendPushNotification).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(sendPushNotification).mock.calls[0];
    expect(payload.body).toContain('Fancy dinner');
    expect(payload.body).toContain('Food');
    expect(payload.body).toContain('$85.00');
    expect(payload.body).toContain('$25.00');
  });

  it('excludes the new expense itself from the prior-expenses query', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    await checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' });

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'exp_new' } }) })
    );
  });

  it('never throws, even if sendPushNotification itself rejects', async () => {
    prismaMock.expense.findMany.mockResolvedValue(priorExpenses([20, 25, 30]) as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);
    vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('push service down'));

    await expect(
      checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' })
    ).resolves.toBeUndefined();
  });

  it('never throws if the category lookup itself fails', async () => {
    prismaMock.category.findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      checkExpenseAnomalyAndNotify('user_1', 'cat_food', { id: 'exp_new', amount: 85, description: 'Fancy dinner' })
    ).resolves.toBeUndefined();
  });
});
