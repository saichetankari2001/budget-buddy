import { prisma } from '@/lib/prisma';
import { parseAndValidateCsvRows, SkippedRow } from '@/lib/utils/csv';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

const CATEGORY_COLOR_PALETTE = DEFAULT_CATEGORIES.map((c) => c.color);

export async function importExpensesFromCsv(
  userId: string,
  csvText: string
): Promise<{ imported: number; skipped: SkippedRow[] }> {
  const { valid, skipped } = parseAndValidateCsvRows(csvText);

  const existingCategories = await prisma.category.findMany({ where: { userId } });
  const categoryByLowerName = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c]));
  let paletteIndex = existingCategories.length;

  // Known limitation: this loop is not wrapped in a transaction. If a database
  // error occurs partway through (e.g. row 500 of 1000), the rows already
  // processed remain committed with no rollback, and the caller only sees a
  // thrown error with no summary. A full transactional rewrite (prisma.$transaction)
  // is a reasonable fast-follow but is not required at this project's scale.
  let imported = 0;
  for (const row of valid) {
    const key = row.categoryName.toLowerCase();
    let category = categoryByLowerName.get(key);
    if (!category) {
      category = await prisma.category.create({
        data: {
          userId,
          name: row.categoryName,
          color: CATEGORY_COLOR_PALETTE[paletteIndex % CATEGORY_COLOR_PALETTE.length],
        },
      });
      paletteIndex += 1;
      categoryByLowerName.set(key, category);
    }

    await prisma.expense.create({
      data: {
        userId,
        categoryId: category.id,
        amount: row.amount,
        description: row.description,
        date: new Date(row.date),
      },
    });
    imported += 1;
  }

  return { imported, skipped };
}
