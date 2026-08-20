import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createCategorySchema } from '@/lib/validation/category.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const categories = await prisma.category.findMany({ where: { userId: user.userId } });
    return NextResponse.json(categories);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { name, color } = createCategorySchema.parse(body);

    const category = await prisma.category.create({
      data: { userId: user.userId, name, color },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
