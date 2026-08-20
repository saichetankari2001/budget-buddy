import { z } from 'zod';

export const createExpenseSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  date: z.string().datetime(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const expenseFiltersSchema = z.object({
  categoryId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
