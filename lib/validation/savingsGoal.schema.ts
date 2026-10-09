import { z } from 'zod';

const sharedFields = {
  name: z.string().min(1).max(100),
  targetAmount: z.number().positive(),
};

/** Route-layer shape: JSON over the wire, so targetDate arrives as an ISO string (optional). */
export const createSavingsGoalSchema = z.object({ ...sharedFields, targetDate: z.string().datetime().nullish() });

/**
 * Action-layer shape: the same rules, for callers that already hold a real Date (or undefined).
 * Mirrors createBillActionSchema's split exactly — the chat tool path only does loose typeof
 * guards before calling addSavingsGoal, so this is what actually enforces the rules there.
 */
export const createSavingsGoalActionSchema = z.object({ ...sharedFields, targetDate: z.date().nullish() });

export type CreateSavingsGoalInput = z.infer<typeof createSavingsGoalSchema>;
