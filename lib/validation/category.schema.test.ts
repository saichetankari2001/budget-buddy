import { describe, it, expect } from 'vitest';
import { createCategorySchema, updateCategorySchema } from './category.schema';

describe('createCategorySchema', () => {
  it('accepts a name and a hex color', () => {
    const result = createCategorySchema.safeParse({ name: 'Travel', color: '#1a2b3c' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-hex color', () => {
    const result = createCategorySchema.safeParse({ name: 'Travel', color: 'blue' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = createCategorySchema.safeParse({ name: '', color: '#1a2b3c' });
    expect(result.success).toBe(false);
  });
});

describe('updateCategorySchema', () => {
  it('accepts a valid isGstFree boolean', () => {
    const result = updateCategorySchema.safeParse({ isGstFree: true });
    expect(result.success).toBe(true);
  });

  it('rejects a non-boolean isGstFree', () => {
    const result = updateCategorySchema.safeParse({ isGstFree: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object', () => {
    const result = updateCategorySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
