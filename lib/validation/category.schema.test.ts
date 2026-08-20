import { describe, it, expect } from 'vitest';
import { createCategorySchema } from './category.schema';

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
