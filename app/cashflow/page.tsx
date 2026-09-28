import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Header } from '@/components/ui/Header';
import { CashFlowClient } from './CashFlowClient';

export default async function CashFlowPage() {
  const user = await getCurrentUser();
  if (!user) return null;

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

  const now = new Date();
  const serializedBills = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate.toISOString(),
    recurrenceInterval: b.recurrenceInterval ?? undefined,
    // See GET /api/bills for why `paidExpenseId !== null` alone is stale forever on a recurring
    // bill — this pairs it with the same "is it currently due" check markBillPaid guards on.
    isPaidThisPeriod: b.paidExpenseId !== null && b.dueDate > now,
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Cash Flow</h1>
        <CashFlowClient initialIncomeSources={serializedIncomeSources} initialBills={serializedBills} />
      </main>
    </>
  );
}
