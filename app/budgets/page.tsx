import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { BudgetsClient } from './BudgetsClient';

export default async function BudgetsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });
  const budgets = await prisma.budget.findMany({ where: { userId: user.userId } });

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));

  const rows = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    monthlyLimit: budgetByCategory.get(category.id) ?? null,
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Budgets</h1>
        <Card>
          <BudgetsClient rows={rows} />
        </Card>
      </main>
    </>
  );
}
