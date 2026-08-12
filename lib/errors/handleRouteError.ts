import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './AppError';

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: error.flatten() },
      { status: 400 }
    );
  }

  console.error(error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
