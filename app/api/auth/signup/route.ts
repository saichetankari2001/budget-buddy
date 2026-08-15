import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signupSchema } from '@/lib/validation/auth.schema';
import { hashPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = signupSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        categories: { create: DEFAULT_CATEGORIES },
      },
    });

    const token = await signToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
