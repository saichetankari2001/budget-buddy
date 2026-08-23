import { z } from 'zod';
import { RecurrenceInterval } from '@prisma/client';

const expenseFields = {
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  date: z.string().datetime(),
  isRecurring: z.boolean().optional(),
  recurrenceInterval: z.nativeEnum(RecurrenceInterval).optional(),
};

function requiresIntervalWhenRecurring(data: {
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
}) {
  if (data.isRecurring) {
    return data.recurrenceInterval !== undefined;
  }
  return data.recurrenceInterval === undefined;
}

const RECURRENCE_REFINEMENT_MESSAGE =
  'recurrenceInterval is required when isRecurring is true, and must be omitted when isRecurring is false';

export const createExpenseSchema = z
  .object(expenseFields)
  .refine(requiresIntervalWhenRecurring, {
    message: RECURRENCE_REFINEMENT_MESSAGE,
    path: ['recurrenceInterval'],
  });

export const updateExpenseSchema = z
  .object(expenseFields)
  .partial()
  .refine(requiresIntervalWhenRecurring, {
    message: RECURRENCE_REFINEMENT_MESSAGE,
    path: ['recurrenceInterval'],
  });

export const expenseFiltersSchema = z.object({
  categoryId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
