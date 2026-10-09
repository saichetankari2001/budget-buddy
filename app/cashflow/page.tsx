import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
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

  const nowForBills = new Date();
  const serializedBills = bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    dueDate: b.dueDate.toISOString(),
    recurrenceInterval: b.recurrenceInterval ?? undefined,
    isPaidThisPeriod: b.paidExpenseId !== null && b.dueDate > nowForBills,
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Cash Flow</h1>
        <GlassPanel elevation={1}>
          <CashFlowClient initialIncomeSources={serializedIncomeSources} initialBills={serializedBills} />
        </GlassPanel>
      </main>
    </>
  );
}
