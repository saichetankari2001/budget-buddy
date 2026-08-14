import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema } from './auth.schema';

describe('signupSchema', () => {
  it('accepts a valid email and an 8+ char password', () => {
    const result = signupSchema.safeParse({ email: 'a@example.com', password: 'longenough' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = signupSchema.safeParse({ email: 'not-an-email', password: 'longenough' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({ email: 'a@example.com', password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts any non-empty password with a valid email', () => {
    const result = loginSchema.safeParse({ email: 'a@example.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'a@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});
