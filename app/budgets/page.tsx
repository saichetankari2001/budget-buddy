import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory } from '@/lib/utils/expenseAggregation';
import { getCurrentMonthRange } from '@/lib/utils/dateRange';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { BudgetsClient } from './BudgetsClient';

export default async function BudgetsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { start: startOfMonth, end: startOfNextMonth } = getCurrentMonthRange(new Date());

  const [budgets, categories, currentMonthExpenses] = await Promise.all([
    prisma.budget.findMany({ where: { userId: user.userId }, include: { category: true } }),
    prisma.category.findMany({ where: { userId: user.userId } }),
    prisma.expense.findMany({
      where: { userId: user.userId, date: { gte: startOfMonth, lt: startOfNextMonth } },
      include: { category: true },
    }),
  ]);

  const categoryTotals = aggregateByCategory(
    currentMonthExpenses.map((e) => ({ amount: Number(e.amount), date: e.date, category: e.category }))
  );
  const spentByCategory = new Map(categoryTotals.map((c) => [c.categoryId, c.total]));
  const budgetItems = budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    spent: spentByCategory.get(budget.categoryId) ?? 0,
    limit: Number(budget.monthlyLimit),
  }));

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));
  const budgetRows = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    monthlyLimit: budgetByCategory.get(category.id) ?? null,
    isGstFree: category.isGstFree,
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Budgets</h1>
        <div className="flex flex-col gap-6">
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">Budget progress</h2>
            <BudgetProgress items={budgetItems} />
          </GlassPanel>
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">Manage budgets</h2>
            <BudgetsClient rows={budgetRows} />
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
