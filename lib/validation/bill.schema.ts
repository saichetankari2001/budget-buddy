import { z } from 'zod';

export const createBillSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  dueDate: z.string().datetime(),
  recurrenceInterval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  categoryId: z.string().optional(),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
