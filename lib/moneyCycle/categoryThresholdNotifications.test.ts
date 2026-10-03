import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/push/send', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { sendPushNotification } from '@/lib/push/send';
import { checkCategoryThresholdAndNotify } from './categoryThresholdNotifications';

const activeCycle = {
  id: 'cycle_1', userId: 'user_1', startDate: new Date('2026-09-10T00:00:00.000Z'),
  endDate: new Date('2026-09-20T00:00:00.000Z'), status: 'ACTIVE', createdAt: new Date(),
  startingAmount: { toString: () => '500.00' } as never,
};

const foodBudgetRow = {
  id: 'ccb_1', cycleId: 'cycle_1', categoryId: 'cat_food', categoryName: 'Food', categoryColor: '#f97316',
  recommendedAmount: { toString: () => '100.00' } as never, notifiedAt80: null, notifiedAt100: null, createdAt: new Date(),
};

describe('checkCategoryThresholdAndNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when there is no active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    await checkCategoryThresholdAndNotify('user_1', 'cat_food');

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('sends an 80% alert and sets notifiedAt80 the first time a category crosses 80%', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findFirst.mockResolvedValue(foodBudgetRow as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([foodBudgetRow] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '85.00' } as never },
    ] as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);

    await checkCategoryThresholdAndNotify('user_1', 'cat_food');

    expect(prismaMock.cycleCategoryBudget.update).toHaveBeenCalledWith({
      where: { id: 'ccb_1' },
      data: { notifiedAt80: expect.any(Date) },
    });
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('sends a 100% alert (not an 80% one) when actual already meets or exceeds the full recommended amount', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findFirst.mockResolvedValue(foodBudgetRow as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([foodBudgetRow] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '110.00' } as never },
    ] as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    await checkCategoryThresholdAndNotify('user_1', 'cat_food');

    expect(prismaMock.cycleCategoryBudget.update).toHaveBeenCalledWith({
      where: { id: 'ccb_1' },
      data: { notifiedAt100: expect.any(Date) },
    });
  });

  it('never re-fires the same threshold twice for the same cycle and category', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findFirst.mockResolvedValue({
      ...foodBudgetRow,
      notifiedAt80: new Date('2026-09-11T00:00:00.000Z'),
    } as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([foodBudgetRow] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '85.00' } as never },
    ] as never);

    await checkCategoryThresholdAndNotify('user_1', 'cat_food');

    expect(prismaMock.cycleCategoryBudget.update).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('falls back to the Other row when the expense category is not one of the tracked ones', async () => {
    const otherBudgetRow = {
      ...foodBudgetRow, id: 'ccb_other', categoryId: null, categoryName: 'Other',
      recommendedAmount: { toString: () => '50.00' } as never,
    };
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findFirst
      .mockResolvedValueOnce(null) // no row for this exact categoryId
      .mockResolvedValueOnce(otherBudgetRow as never); // falls back to the Other row
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([foodBudgetRow] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_untracked', amount: { toString: () => '60.00' } as never },
    ] as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    await checkCategoryThresholdAndNotify('user_1', 'cat_untracked');

    expect(prismaMock.cycleCategoryBudget.update).toHaveBeenCalledWith({
      where: { id: 'ccb_other' },
      data: { notifiedAt100: expect.any(Date) },
    });
  });

  it("checks against the start of the cycle's own Sydney calendar day, not its exact creation timestamp", async () => {
    // Regression test: a cycle created at 23:10 UTC on the 10th is already the 11th in Sydney
    // (UTC+10 in September). An expense dated "today" (the 11th) via the date picker serializes
    // to 2026-09-11T00:00:00.000Z, earlier than this exact creation instant — before the fix,
    // such a same-day expense would never be counted, so the 80%/100% threshold could never fire
    // on the day a cycle was actually started.
    const lateCreatedCycle = { ...activeCycle, startDate: new Date('2026-09-10T23:10:00.000Z') };
    prismaMock.moneyCycle.findFirst.mockResolvedValue(lateCreatedCycle as never);
    prismaMock.cycleCategoryBudget.findFirst.mockResolvedValue(foodBudgetRow as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([foodBudgetRow] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '85.00' } as never },
    ] as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    await checkCategoryThresholdAndNotify('user_1', 'cat_food');

    const findManyMock = prismaMock.expense.findMany as unknown as { mock: { calls: unknown[][] } };
    const firstCallArgs = findManyMock.mock.calls[0][0] as { where: { date: { gte: Date } } };
    expect(firstCallArgs.where.date).toMatchObject({ gte: new Date('2026-09-11T00:00:00.000Z') });
    // And the threshold check still ran off that (correctly-windowed) $85 total.
    expect(prismaMock.cycleCategoryBudget.update).toHaveBeenCalledWith({
      where: { id: 'ccb_1' },
      data: { notifiedAt80: expect.any(Date) },
    });
  });

  it('never throws, even if sendPushNotification itself rejects', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(activeCycle as never);
    prismaMock.cycleCategoryBudget.findFirst.mockResolvedValue(foodBudgetRow as never);
    prismaMock.cycleCategoryBudget.findMany.mockResolvedValue([foodBudgetRow] as never);
    prismaMock.expense.findMany.mockResolvedValue([
      { categoryId: 'cat_food', amount: { toString: () => '85.00' } as never },
    ] as never);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub_1', userId: 'user_1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: new Date() },
    ] as never);
    vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('push service down'));

    await expect(checkCategoryThresholdAndNotify('user_1', 'cat_food')).resolves.toBeUndefined();
  });
});
