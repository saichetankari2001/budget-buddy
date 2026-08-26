import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { updateCategorySchema } from '@/lib/validation/category.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function PATCH(request: NextRequest, { params }: { params: { categoryId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { isGstFree } = updateCategorySchema.parse(body);

    const { count } = await prisma.category.updateMany({
      where: { id: params.categoryId, userId: user.userId },
      data: { isGstFree },
    });

    if (count === 0) {
      throw new AppError(404, 'Category not found');
    }

    const category = await prisma.category.findFirst({
      where: { id: params.categoryId, userId: user.userId },
    });
    return NextResponse.json(category);
  } catch (error) {
    return handleRouteError(error);
  }
}
