import { z } from 'zod';

const sharedFields = {
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  recurrenceInterval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).nullish(),
  categoryId: z.string().nullish(),
};

/** Route-layer shape: JSON over the wire, so dueDate arrives as an ISO string. */
export const createBillSchema = z.object({ ...sharedFields, dueDate: z.string().datetime() });

/**
 * Action-layer shape: the same rules, for callers that already hold a real Date. `addBill` validates
 * against this itself so the chat tool path — which only does loose JS typeof guards before calling
 * it — can't slip a zero/negative amount, an unparseable due date, or a bogus recurrence interval
 * past the rules the REST form enforces.
 */
// z.date() itself rejects an Invalid Date (it is `instanceof Date` but NaN-timed), which is exactly
// what `new Date(input.dueDate)` produces when the chat hands over free-form text like "next tuesday".
export const createBillActionSchema = z.object({ ...sharedFields, dueDate: z.date() });

export type CreateBillInput = z.infer<typeof createBillSchema>;
