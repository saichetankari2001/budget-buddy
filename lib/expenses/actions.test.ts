import { describe, it, expect, vi } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { logExpense } from './actions';

vi.mock('@/lib/moneyCycle/categoryThresholdNotifications', () => ({
  checkCategoryThresholdAndNotify: vi.fn().mockResolvedValue(undefined),
}));

const categories = [
  { id: 'cat_food', userId: 'user_1', name: 'Food', color: '#f97316', isGstFree: false, createdAt: new Date() },
  { id: 'cat_other', userId: 'user_1', name: 'Other', color: '#6b7280', isGstFree: false, createdAt: new Date() },
];

describe('logExpense', () => {
  it('resolves categoryName case-insensitively against the user\'s own categories', async () => {
    prismaMock.category.findMany.mockResolvedValue(categories as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_1' } as never);

    const result = await logExpense('user_1', { amount: 20, description: 'Groceries', categoryName: 'food' });

    expect(result).toEqual({ success: true, id: 'exp_1', categoryName: 'Food' });
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user_1', categoryId: 'cat_food', amount: 20, description: 'Groceries' }),
      })
    );
  });

  it('falls back to "Other" when no categoryName is given', async () => {
    prismaMock.category.findMany.mockResolvedValue(categories as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_2' } as never);

    const result = await logExpense('user_1', { amount: 15, description: 'Random stuff' });

    expect(result).toEqual({ success: true, id: 'exp_2', categoryName: 'Other' });
    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat_other' }) })
    );
  });

  it('falls back to "Other" when categoryName doesn\'t match any of the user\'s categories', async () => {
    prismaMock.category.findMany.mockResolvedValue(categories as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_3' } as never);

    const result = await logExpense('user_1', { amount: 15, description: 'Mystery item', categoryName: 'Spaceships' });

    expect(result).toEqual({ success: true, id: 'exp_3', categoryName: 'Other' });
  });

  it('rejects a non-positive amount without touching the database', async () => {
    const result = await logExpense('user_1', { amount: 0, description: 'Nothing' });

    expect(result).toEqual({ success: false, error: 'Amount must be greater than 0' });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('rejects an empty description without touching the database', async () => {
    const result = await logExpense('user_1', { amount: 10, description: '   ' });

    expect(result).toEqual({ success: false, error: 'A short description is required' });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('calls checkCategoryThresholdAndNotify for the resolved category after a successful create', async () => {
    const { checkCategoryThresholdAndNotify } = await import('@/lib/moneyCycle/categoryThresholdNotifications');
    prismaMock.category.findMany.mockResolvedValue(categories as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_4' } as never);

    await logExpense('user_1', { amount: 20, description: 'Groceries', categoryName: 'Food' });

    expect(checkCategoryThresholdAndNotify).toHaveBeenCalledWith('user_1', 'cat_food');
  });

  it('defaults the expense date to now when none is given', async () => {
    prismaMock.category.findMany.mockResolvedValue(categories as never);
    prismaMock.expense.create.mockResolvedValue({ id: 'exp_5' } as never);

    await logExpense('user_1', { amount: 5, description: 'Coffee' });

    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ date: expect.any(Date) }) })
    );
  });
});
