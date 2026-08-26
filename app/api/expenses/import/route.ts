import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { importExpensesFromCsv } from '@/lib/importExpensesFromCsv';

const MAX_IMPORT_ROWS = 5000;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new AppError(400, 'No file uploaded');
    }

    const csvText = await file.text();

    const rowCount = csvText.trim().split('\n').length - 1; // minus the header line
    if (rowCount > MAX_IMPORT_ROWS) {
      throw new AppError(400, `File has too many rows (max ${MAX_IMPORT_ROWS})`);
    }

    const result = await importExpensesFromCsv(user.userId, csvText);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
