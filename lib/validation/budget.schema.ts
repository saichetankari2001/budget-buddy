import { z } from 'zod';

export const upsertBudgetSchema = z.object({
  monthlyLimit: z.number().positive('Monthly limit must be greater than 0'),
});

export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;
