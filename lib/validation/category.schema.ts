import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex code, e.g. #1a2b3c'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  isGstFree: z.boolean(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
