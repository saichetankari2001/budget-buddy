import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { computeGstPaid } from '@/lib/utils/gst';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { StatCard } from '@/components/ui/StatCard';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from './ExpensesClient';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { categoryId?: string; from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const sixMonthExpenses = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: sixMonthsAgo } },
    include: { category: true },
  });
  const expensesForAggregation = sixMonthExpenses.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const now = new Date();
  const currentMonthExpenses = expensesForAggregation.filter(
    (e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth()
  );
  const monthlyTotals = aggregateByMonth(expensesForAggregation, 6);
  const gstPaidThisMonth = computeGstPaid(
    currentMonthExpenses.map((e) => ({ amount: e.amount, categoryIsGstFree: e.category.isGstFree }))
  );

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const expenseWhere: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) expenseWhere.categoryId = searchParams.categoryId;
  const fromDate = searchParams.from ? new Date(searchParams.from) : undefined;
  const toDate = searchParams.to ? new Date(searchParams.to) : undefined;
  const validFromDate = fromDate && !isNaN(fromDate.getTime()) ? fromDate : undefined;
  const validToDate = toDate && !isNaN(toDate.getTime()) ? toDate : undefined;
  if (validFromDate || validToDate) {
    expenseWhere.date = {
      ...(validFromDate ? { gte: validFromDate } : {}),
      ...(validToDate ? { lte: validToDate } : {}),
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

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Expenses</h1>
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <GlassPanel elevation={1}>
              <StatCard label="GST paid this month" value={gstPaidThisMonth} trend={[]} />
            </GlassPanel>
            <GlassPanel elevation={1}>
              <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
              <MonthlyTrendChart data={monthlyTotals} />
            </GlassPanel>
          </div>
          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">Expenses</h2>
            <ExpenseFilters categories={categories} />
            <ExpensesClient categories={categories} initialExpenses={serializedExpenses} />
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
