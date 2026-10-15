import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';
import { publishCycleUpdate } from '@/lib/realtime/publish';
import { generatePlanMessage } from '@/lib/ai/coach';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { aggregateByCategory } from '@/lib/utils/expenseAggregation';
import { computeCategoryRecommendation } from '@/lib/moneyCycle/computeCategoryRecommendation';

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string; code?: 'VALIDATION_ERROR' };

const MAX_CYCLE_AMOUNT = 99_999_999;
export const ACTIVE_CYCLE_MESSAGE = 'You already have an active cycle. It will complete on its own at its end date.';

async function findActiveCycle(userId: string) {
  return prisma.moneyCycle.findFirst({ where: { userId, status: 'ACTIVE' } });
}

export async function createCycle(
  userId: string,
  input: { startingAmount: number; endDate: Date }
): Promise<
  ActionResult<{
    id: string;
    startingAmount: number;
    remainingAmount: number;
    daysRemaining: number;
    safeToSpend: number;
    startDate: Date;
    endDate: Date;
    status: string;
    message: { id: string; kind: string; content: string; createdAt: Date };
  }>
> {
  const existingActive = await findActiveCycle(userId);
  if (existingActive) {
    return { success: false, error: ACTIVE_CYCLE_MESSAGE };
  }

  const startDate = new Date();
  const { startingAmount, endDate: parsedEndDate } = input;

  // The cycle row itself isn't needed to derive these figures, so this runs before the create —
  // the same shared derivation the dashboard and the coach cron use, so the plan message a user
  // reads at creation time agrees with the card they land on immediately afterwards.
  const { remainingAmount, daysRemaining, safeToSpend, committedSpend, shortfallWarning } = await projectCycle(
    userId,
    { startingAmount, startDate, endDate: parsedEndDate },
    startDate
  );

  const discretionaryPool = Math.max(remainingAmount - committedSpend, 0);
  const [allTimeExpenses, userCategories] = await Promise.all([
    prisma.expense.findMany({ where: { userId }, include: { category: true } }),
    prisma.category.findMany({ where: { userId } }),
  ]);
  const categoryHistory = aggregateByCategory(
    allTimeExpenses.map((e) => ({ amount: Number(e.amount), date: e.date, category: e.category }))
  );
  // Every signup seeds DEFAULT_CATEGORIES and there's no way to delete a category in this app, so
  // a brand-new user always has real categories with zero expense history — not zero categories.
  // aggregateByCategory only emits entries for categories that actually appear in the expenses
  // array, so without this zero-fill, computeCategoryRecommendation would see an empty `history`
  // array and hit its "zero categories" branch (returns []) instead of its "zero spend, has
  // categories" branch (even split across up to 5 categories + Other), leaving every brand-new
  // user's first cycle with no recommendation rows at all.
  const categoriesWithHistory = new Set(categoryHistory.map((c) => c.categoryId));
  const zeroFilledHistory = [
    ...categoryHistory,
    ...userCategories
      .filter((cat) => !categoriesWithHistory.has(cat.id))
      .map((cat) => ({ categoryId: cat.id, categoryName: cat.name, color: cat.color, total: 0 })),
  ];
  const recommendation = computeCategoryRecommendation(zeroFilledHistory, discretionaryPool);

  const priorCycle = await prisma.moneyCycle.findFirst({
    where: { userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
  });
  const previousCycleScore = priorCycle
    ? (
        await computeHealthScore(
          userId,
          {
            id: priorCycle.id,
            startDate: priorCycle.startDate,
            endDate: priorCycle.endDate,
            createdAt: priorCycle.createdAt,
            status: priorCycle.status,
            startingAmount: Number(priorCycle.startingAmount),
          },
          priorCycle.endDate
        )
      ).total
    : undefined;

  const planMessageText = await generatePlanMessage({
    startingAmount,
    committedSpend,
    daysRemaining,
    safeToSpend,
    shortfallWarning,
    previousCycleScore,
  });

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const createdCycle = await tx.moneyCycle.create({
        data: { userId, startingAmount, startDate, endDate: parsedEndDate },
      });
      if (recommendation.length > 0) {
        await tx.cycleCategoryBudget.createMany({
          data: recommendation.map((r) => ({
            cycleId: createdCycle.id,
            categoryId: r.categoryId,
            categoryName: r.categoryName,
            categoryColor: r.color,
            recommendedAmount: r.recommendedAmount,
          })),
        });
      }
      const createdMessage = await tx.coachMessage.create({
        data: { cycleId: createdCycle.id, kind: 'PLAN', content: planMessageText },
      });
      return { cycle: createdCycle, message: createdMessage };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: ACTIVE_CYCLE_MESSAGE };
    }
    throw error;
  }
  const { cycle, message } = result;

  await publishCycleUpdate(userId);

  return {
    success: true,
    id: cycle.id,
    startingAmount: Number(cycle.startingAmount),
    remainingAmount,
    daysRemaining,
    safeToSpend,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    status: cycle.status,
    message: { id: message.id, kind: message.kind, content: message.content, createdAt: message.createdAt },
  };
}

export async function updateCycleAmount(
  userId: string,
  newAmount: number
): Promise<ActionResult<{ remainingAmount: number; daysRemaining: number; safeToSpend: number }>> {
  if (!Number.isFinite(newAmount) || newAmount <= 0 || newAmount > MAX_CYCLE_AMOUNT) {
    return {
      success: false,
      error: 'Amount must be a positive number under $100,000,000',
      code: 'VALIDATION_ERROR',
    };
  }

  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  // Derived through the same shared projection the dashboard uses, with `newAmount` standing in as
  // the hypothetical starting amount. Previously this path used a flat average that could not see
  // Bill or IncomeSource rows, so the chat's reply to "change it to $700" could quote a completely
  // different daily figure from the dashboard card sitting right above it.
  const { remainingAmount, daysRemaining, safeToSpend } = await projectCycle(userId, {
    startingAmount: newAmount,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
  });

  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { startingAmount: newAmount } });
  await publishCycleUpdate(userId);

  return { success: true, remainingAmount, daysRemaining, safeToSpend };
}

export async function cancelCycle(userId: string): Promise<ActionResult> {
  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'CANCELLED' } });

  return { success: true };
}
