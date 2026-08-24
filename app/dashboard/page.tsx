import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory, aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { CountUpStat } from '@/components/ui/CountUpStat';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // middleware.ts already guarantees `user` is non-null for this route;
  // this check exists only to satisfy TypeScript.
  if (!user) return null;

  try {
    await generateDueRecurringExpenses(user.userId);
  } catch (error) {
    // A generation hiccup (e.g. a transient DB error) shouldn't block the
    // user from viewing their existing dashboard data.
    console.error('Failed to generate recurring expenses:', error);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const expenses = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: sixMonthsAgo } },
    include: { category: true },
  });

  const expensesForAggregation = expenses.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const now = new Date();
  const currentMonthExpenses = expensesForAggregation.filter(
    (e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth()
  );

  const categoryTotals = aggregateByCategory(currentMonthExpenses);
  const monthlyTotals = aggregateByMonth(expensesForAggregation, 6);
  const totalThisMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const budgets = await prisma.budget.findMany({
    where: { userId: user.userId },
    include: { category: true },
  });
  const spentByCategory = new Map(categoryTotals.map((c) => [c.categoryId, c.total]));
  const budgetItems = budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    spent: spentByCategory.get(budget.categoryId) ?? 0,
    limit: Number(budget.monthlyLimit),
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Dashboard</h1>

        <Card className="mb-8">
          <p className="text-sm text-muted">Total spent this month</p>
          <CountUpStat value={totalThisMonth} />
        </Card>

        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          <Card hoverable>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </Card>
          <Card hoverable>
            <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
            <MonthlyTrendChart data={monthlyTotals} />
          </Card>
        </div>

        <Card>
          <h2 className="mb-3 font-heading font-medium text-foreground">Budget progress</h2>
          <BudgetProgress items={budgetItems} />
        </Card>
      </main>
    </>
  );
}
