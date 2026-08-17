import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/validation/auth.schema';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

// Dummy bcrypt hash used to mitigate timing attacks when user doesn't exist.
// Allows bcrypt verify to run even for unknown emails, preventing timing-based email enumeration.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Dxq8P7X8XjZoUmwjxD8s7XJ8XjZoU';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });
    // Always call verifyPassword (unconditionally) to avoid timing-based email enumeration.
    // Use dummy hash when user not found so bcrypt compare runs in both cases.
    const passwordValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordValid) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = await signToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({ id: user.id, email: user.email }, { status: 200 });
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
