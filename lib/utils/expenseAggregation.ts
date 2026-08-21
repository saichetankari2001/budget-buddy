export interface ExpenseWithCategory {
  amount: number;
  date: Date;
  category: { id: string; name: string; color: string };
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
}

export interface MonthlyTotal {
  month: string; // 'YYYY-MM'
  total: number;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function aggregateByCategory(expenses: ExpenseWithCategory[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();

  for (const expense of expenses) {
    const existing = totals.get(expense.category.id);
    if (existing) {
      existing.total += expense.amount;
    } else {
      totals.set(expense.category.id, {
        categoryId: expense.category.id,
        categoryName: expense.category.name,
        color: expense.category.color,
        total: expense.amount,
      });
    }
  }

  return Array.from(totals.values());
}

export function aggregateByMonth(expenses: ExpenseWithCategory[], monthsBack: number): MonthlyTotal[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }

  const totals = new Map<string, number>(months.map((m) => [m, 0]));

  for (const expense of expenses) {
    const key = monthKey(expense.date);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + expense.amount);
    }
  }

  return months.map((month) => ({ month, total: totals.get(month) ?? 0 }));
}
