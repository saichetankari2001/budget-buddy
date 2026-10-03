import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory, aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { CountUpStat } from '@/components/ui/CountUpStat';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { CoachCard } from '@/components/coach/CoachCard';
import { SpendingBreakdownCard } from '@/components/dashboard/SpendingBreakdownCard';
import { DashboardHeroOrb } from '@/components/dashboard/DashboardHeroOrb';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';
import { computeGstPaid } from '@/lib/utils/gst';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from '@/app/expenses/ExpensesClient';
import { CashFlowClient } from '@/app/cashflow/CashFlowClient';
import { BudgetsClient } from '@/app/budgets/BudgetsClient';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { categoryId?: string; from?: string; to?: string };
}) {
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
  const gstPaidThisMonth = computeGstPaid(
    currentMonthExpenses.map((e) => ({ amount: e.amount, categoryIsGstFree: e.category.isGstFree }))
  );

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

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const expenseWhere: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) expenseWhere.categoryId = searchParams.categoryId;
  if (searchParams.from || searchParams.to) {
    expenseWhere.date = {
      ...(searchParams.from ? { gte: new Date(searchParams.from) } : {}),
      ...(searchParams.to ? { lte: new Date(searchParams.to) } : {}),
    };
  }

  const filteredExpenses = await prisma.expense.findMany({
    where: expenseWhere,
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  const serializedExpenses = filteredExpenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    description: e.description,
    date: e.date.toISOString(),
    isRecurring: e.isRecurring,
    recurrenceInterval: e.recurrenceInterval ?? undefined,
    category: { id: e.category.id, name: e.category.name, color: e.category.color },
  }));

  const [incomeSources, bills] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId: user.userId }, orderBy: { createdAt: 'asc' } }),
    prisma.bill.findMany({ where: { userId: user.userId }, orderBy: { dueDate: 'asc' } }),
  ]);

  const serializedIncomeSources = incomeSources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    amount: s.amount ? Number(s.amount) : null,
    recurrenceInterval: s.recurrenceInterval ?? undefined,
    startDate: s.startDate.toISOString(),
  }));

  const nowForBills = new Date();
  const serializedBills = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate.toISOString(),
    recurrenceInterval: b.recurrenceInterval ?? undefined,
    isPaidThisPeriod: b.paidExpenseId !== null && b.dueDate > nowForBills,
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
        <DashboardHeroOrb />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Dashboard</h1>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <GlassPanel elevation={2}>
            <p className="text-sm text-muted">Total spent this month</p>
            <CountUpStat value={totalThisMonth} />
          </GlassPanel>
          <GlassPanel elevation={2}>
            <p className="text-sm text-muted">GST paid this month</p>
            <CountUpStat value={gstPaidThisMonth} />
          </GlassPanel>

          <div className="sm:col-span-2">
            <CoachCard />
          </div>

          <div className="sm:col-span-2">
            <SpendingBreakdownCard />
          </div>

          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </GlassPanel>
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
            <MonthlyTrendChart data={monthlyTotals} />
          </GlassPanel>

          <div className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Budget progress</h2>
              <BudgetProgress items={budgetItems} />
            </GlassPanel>
          </div>

          <div id="expenses" className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Expenses</h2>
              <ExpenseFilters categories={categories} />
              <ExpensesClient categories={categories} initialExpenses={serializedExpenses} />
            </GlassPanel>
          </div>

          <div id="cashflow" className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Cash Flow</h2>
              <CashFlowClient initialIncomeSources={serializedIncomeSources} initialBills={serializedBills} />
            </GlassPanel>
          </div>

          <div id="budgets" className="sm:col-span-2">
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">Manage budgets</h2>
              <BudgetsClient rows={budgetRows} />
            </GlassPanel>
          </div>
        </div>
      </main>
    </>
  );
}
