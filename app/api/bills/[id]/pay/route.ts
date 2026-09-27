import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { markBillPaid } from '@/lib/bills/actions';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const result = await markBillPaid(user.userId, decodeURIComponent(params.id));
    if (!result.success) {
      throw new AppError(400, result.error);
    }

    return NextResponse.json({ expenseId: result.expenseId });
  } catch (error) {
    return handleRouteError(error);
  }
}
