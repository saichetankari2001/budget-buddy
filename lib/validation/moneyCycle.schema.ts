import { z } from 'zod';

const MAX_CYCLE_DAYS = 400;

export const createMoneyCycleSchema = z.object({
  startingAmount: z.number().positive('Starting amount must be greater than 0'),
  endDate: z
    .string()
    .datetime()
    .refine(
      (value) => {
        const end = new Date(value).getTime();
        const now = Date.now();
        const maxMs = MAX_CYCLE_DAYS * 24 * 60 * 60 * 1000;
        return end > now && end - now <= maxMs;
      },
      { message: `endDate must be in the future and within ${MAX_CYCLE_DAYS} days from now` }
    ),
});

export type CreateMoneyCycleInput = z.infer<typeof createMoneyCycleSchema>;
