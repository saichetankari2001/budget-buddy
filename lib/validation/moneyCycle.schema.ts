import { z } from 'zod';

export const createMoneyCycleSchema = z.object({
  startingAmount: z.number().positive('Starting amount must be greater than 0'),
  endDate: z.string().datetime(),
});

export type CreateMoneyCycleInput = z.infer<typeof createMoneyCycleSchema>;
