import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from './ExpensesClient';
import { Header } from '@/components/ui/Header';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { categoryId?: string; from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const where: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) where.categoryId = searchParams.categoryId;
  if (searchParams.from || searchParams.to) {
    where.date = {
      ...(searchParams.from ? { gte: new Date(searchParams.from) } : {}),
      ...(searchParams.to ? { lte: new Date(searchParams.to) } : {}),
    };
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  const serialized = expenses.map((e) => ({
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Expenses</h1>
        <ExpenseFilters categories={categories} />
        <ExpensesClient categories={categories} initialExpenses={serialized} />
      </main>
    </>
  );
}
