import { formatCurrency } from '@/lib/utils/currency';

export interface BudgetProgressItem {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
}

export function BudgetProgress({ items }: { items: BudgetProgressItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">No budgets set yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const percent = Math.min((item.spent / item.limit) * 100, 100);
        const overBudget = item.spent > item.limit;

        return (
          <li key={item.categoryId}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{item.categoryName}</span>
              <span className={overBudget ? 'font-medium text-destructive' : 'text-muted'}>
                {formatCurrency(item.spent)} / {formatCurrency(item.limit)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overBudget ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            {overBudget && (
              <p className="mt-1 text-xs text-destructive">
                {formatCurrency(item.spent - item.limit)} over budget
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
