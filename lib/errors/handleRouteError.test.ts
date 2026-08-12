import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import { handleRouteError } from './handleRouteError';
import { AppError } from './AppError';

describe('handleRouteError', () => {
  it('maps AppError to its status code and message', async () => {
    const res = handleRouteError(new AppError(409, 'Email already in use', 'EMAIL_TAKEN'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Email already in use', code: 'EMAIL_TAKEN' });
  });

  it('maps ZodError to 400 with validation details', async () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
    const res = handleRouteError((result as { success: false; error: ZodError }).error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('maps unknown errors to 500', async () => {
    const res = handleRouteError(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });
});
