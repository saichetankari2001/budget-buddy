import { z } from 'zod';

/** FIXED sources are the ones the projection treats as known, scheduled money, so they can't be
 *  missing the two things that make them schedulable. IRREGULAR sources have no amount or cadence
 *  by definition — they're only ever realised through logged IncomeEntry rows. */
export const FIXED_INCOME_SOURCE_RULE_MESSAGE = 'FIXED income sources require an amount and a recurrence interval';

export function isCompleteIncomeSourceShape(data: {
  type: 'FIXED' | 'IRREGULAR';
  amount?: number | null;
  recurrenceInterval?: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null;
}): boolean {
  return data.type === 'IRREGULAR' || (data.amount != null && data.recurrenceInterval != null);
}

const sharedFields = {
  name: z.string().min(1).max(100),
  type: z.enum(['FIXED', 'IRREGULAR']),
  amount: z.number().positive().nullish(),
  recurrenceInterval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).nullish(),
};

/** Route-layer shape: JSON over the wire, so startDate arrives as an ISO string. */
export const createIncomeSourceSchema = z
  .object({ ...sharedFields, startDate: z.string().datetime() })
  .refine(isCompleteIncomeSourceShape, { message: FIXED_INCOME_SOURCE_RULE_MESSAGE });

/**
 * Action-layer shape: the same rules, for callers that already hold a real Date. `addIncomeSource`
 * validates against this itself so the chat tool path — which only does loose JS typeof guards
 * before calling it — can't slip a FIXED source with no amount or cadence past the rules the REST
 * form enforces.
 */
export const createIncomeSourceActionSchema = z
  // z.date() itself rejects an Invalid Date (it is `instanceof Date` but NaN-timed), which is exactly
  // what `new Date(input.startDate)` produces when the chat hands over free-form text like "next week".
  .object({ ...sharedFields, startDate: z.date() })
  .refine(isCompleteIncomeSourceShape, { message: FIXED_INCOME_SOURCE_RULE_MESSAGE });

export type CreateIncomeSourceInput = z.infer<typeof createIncomeSourceSchema>;
