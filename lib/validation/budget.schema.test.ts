import { describe, it, expect } from 'vitest';
import { upsertBudgetSchema } from './budget.schema';

describe('upsertBudgetSchema', () => {
  it('accepts a positive monthlyLimit', () => {
    const result = upsertBudgetSchema.safeParse({ monthlyLimit: 250 });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive monthlyLimit', () => {
    const result = upsertBudgetSchema.safeParse({ monthlyLimit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing monthlyLimit', () => {
    const result = upsertBudgetSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
