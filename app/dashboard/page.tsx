import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { aggregateByCategory } from '@/lib/utils/expenseAggregation';
import { getCurrentMonthRange } from '@/lib/utils/dateRange';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { StatCard } from '@/components/ui/StatCard';
import { CoachCard } from '@/components/coach/CoachCard';
import { SpendingBreakdownCard } from '@/components/dashboard/SpendingBreakdownCard';
import { DashboardHeroOrb } from '@/components/dashboard/DashboardHeroOrb';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';
import Link from 'next/link';
import {
  BanknotesIcon,
  ChartPieIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

const QUICK_LINKS = [
  { href: '/expenses', label: 'Expenses', Icon: BanknotesIcon },
  { href: '/budgets', label: 'Budgets', Icon: ChartPieIcon },
  { href: '/cashflow', label: 'Cash Flow', Icon: ArrowsRightLeftIcon },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    await generateDueRecurringExpenses(user.userId);
  } catch (error) {
    console.error('Failed to generate recurring expenses:', error);
  }

  const now = new Date();
  const { start: startOfMonth, end: startOfNextMonth } = getCurrentMonthRange(now);

  const currentMonthExpensesRaw = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: startOfMonth, lt: startOfNextMonth } },
    include: { category: true },
  });
  const currentMonthExpenses = currentMonthExpensesRaw.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const categoryTotals = aggregateByCategory(currentMonthExpenses);
  const totalThisMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const dayOfMonth = now.getDate();
  const dailySpendTotals = Array.from({ length: dayOfMonth }, () => 0);
  for (const e of currentMonthExpenses) {
    const day = e.date.getDate();
    if (day >= 1 && day <= dayOfMonth) {
      dailySpendTotals[day - 1] += e.amount;
    }
  }
  let runningSpend = 0;
  const spendTrend = dailySpendTotals.map((d) => (runningSpend += d));

  let healthScoreValue = 0;
  let healthScoreTrend: number[] = [];
  // No active cycle yet (e.g. a brand-new signup) means there's no real data behind a score —
  // showing a perfect 100 in that state would be a misleading "black box" number, exactly what
  // this feature exists to avoid. The dashboard renders an em-dash instead when this is false.
  let hasHealthScore = false;
  const activeCycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
  if (activeCycle) {
    const currentScore = await computeHealthScore(
      user.userId,
      {
        id: activeCycle.id,
        startDate: activeCycle.startDate,
        endDate: activeCycle.endDate,
        createdAt: activeCycle.createdAt,
        status: activeCycle.status,
        startingAmount: Number(activeCycle.startingAmount),
      },
      new Date()
    );
    const recentPastCycles = await prisma.moneyCycle.findMany({
      where: { userId: user.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    const pastScores = await Promise.all(
      recentPastCycles
        .slice()
        .reverse()
        .map((c) =>
          computeHealthScore(
            user.userId,
            {
              id: c.id,
              startDate: c.startDate,
              endDate: c.endDate,
              createdAt: c.createdAt,
              status: c.status,
              startingAmount: Number(c.startingAmount),
            },
            c.endDate
          )
        )
    );
    healthScoreValue = currentScore.total;
    healthScoreTrend = [...pastScores.map((s) => s.total), currentScore.total];
    hasHealthScore = true;
  }

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <DashboardHeroOrb />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Dashboard</h1>

        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <GlassPanel elevation={2}>
              <StatCard label="Total spent this month" value={totalThisMonth} trend={spendTrend} />
            </GlassPanel>
            <GlassPanel elevation={2}>
              {hasHealthScore ? (
                <StatCard label="Financial health" value={healthScoreValue} trend={healthScoreTrend} format="number" />
              ) : (
                <div>
                  <p className="text-sm text-muted">Financial health</p>
                  <p className="inline-block bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
                    —
                  </p>
                </div>
              )}
            </GlassPanel>
          </div>

          <nav
            aria-label="Quick access"
            className="flex gap-4 overflow-x-auto pb-2"
          >
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="flex-shrink-0">
                <GlassPanel elevation={1} hoverable className="flex items-center gap-2 px-4 py-3">
                  <Icon className="h-5 w-5 text-trust" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </GlassPanel>
              </Link>
            ))}
          </nav>

          <CoachCard />

          <SpendingBreakdownCard />

          <GlassPanel elevation={1}>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
