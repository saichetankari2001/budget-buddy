import { describe, it, expect } from 'vitest';
import { createExpenseSchema, updateExpenseSchema, expenseFiltersSchema } from './expense.schema';

describe('createExpenseSchema', () => {
  it('accepts a valid expense', () => {
    const result = createExpenseSchema.safeParse({
      amount: 42.5,
      description: 'Groceries',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive amount', () => {
    const result = createExpenseSchema.safeParse({
      amount: 0,
      description: 'Groceries',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty description', () => {
    const result = createExpenseSchema.safeParse({
      amount: 10,
      description: '',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('expenseFiltersSchema', () => {
  it('allows all filters to be omitted', () => {
    expect(expenseFiltersSchema.safeParse({}).success).toBe(true);
  });

  it('accepts categoryId and date range filters', () => {
    const result = expenseFiltersSchema.safeParse({
      categoryId: 'cat_1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('createExpenseSchema recurrence refinement', () => {
  it('accepts isRecurring true with a matching recurrenceInterval', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Netflix',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
      isRecurring: true,
      recurrenceInterval: 'MONTHLY',
    });
    expect(result.success).toBe(true);
  });

  it('rejects isRecurring true without a recurrenceInterval', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Netflix',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
      isRecurring: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a recurrenceInterval when isRecurring is false', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Netflix',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
      isRecurring: false,
      recurrenceInterval: 'MONTHLY',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a plain one-off expense with neither field set', () => {
    const result = createExpenseSchema.safeParse({
      amount: 15,
      description: 'Coffee',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateExpenseSchema recurrence refinement', () => {
  it('allows a partial update that omits both recurrence fields', () => {
    const result = updateExpenseSchema.safeParse({ amount: 20 });
    expect(result.success).toBe(true);
  });

  it('rejects setting isRecurring true without recurrenceInterval', () => {
    const result = updateExpenseSchema.safeParse({ isRecurring: true });
    expect(result.success).toBe(false);
  });
});
