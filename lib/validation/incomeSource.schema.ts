import { z } from 'zod';

export const createIncomeSourceSchema = z
  .object({
    name: z.string().min(1).max(100),
    type: z.enum(['FIXED', 'IRREGULAR']),
    amount: z.number().positive().optional(),
    recurrenceInterval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
    startDate: z.string().datetime(),
  })
  .refine((data) => data.type === 'IRREGULAR' || (data.amount !== undefined && data.recurrenceInterval !== undefined), {
    message: 'FIXED income sources require an amount and a recurrence interval',
  });

export type CreateIncomeSourceInput = z.infer<typeof createIncomeSourceSchema>;
