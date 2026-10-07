import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createMoneyCycleSchema } from '@/lib/validation/moneyCycle.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generatePlanMessage } from '@/lib/ai/coach';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { projectCycle } from '@/lib/moneyCycle/projectCycle';
import { publishCycleUpdate } from '@/lib/realtime/publish';
import { aggregateByCategory } from '@/lib/utils/expenseAggregation';
import { computeCategoryRecommendation } from '@/lib/moneyCycle/computeCategoryRecommendation';

const ACTIVE_CYCLE_MESSAGE = 'You already have an active cycle. It will complete on its own at its end date.';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { startingAmount, endDate } = createMoneyCycleSchema.parse(await request.json());

    const existingActive = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: 'ACTIVE' },
    });
    if (existingActive) {
      throw new AppError(400, ACTIVE_CYCLE_MESSAGE);
    }

    const startDate = new Date();
    const parsedEndDate = new Date(endDate);

    // The cycle row itself isn't needed to derive these figures, so this runs before the create —
    // the same shared derivation the dashboard and the coach cron use, so the plan message a user
    // reads at creation time agrees with the card they land on immediately afterwards.
    const { remainingAmount, daysRemaining, safeToSpend, committedSpend, shortfallWarning } = await projectCycle(
      user.userId,
      { startingAmount, startDate, endDate: parsedEndDate },
      startDate
    );

    const discretionaryPool = Math.max(remainingAmount - committedSpend, 0);
    const [allTimeExpenses, userCategories] = await Promise.all([
      prisma.expense.findMany({ where: { userId: user.userId }, include: { category: true } }),
      prisma.category.findMany({ where: { userId: user.userId } }),
    ]);
    const categoryHistory = aggregateByCategory(
      allTimeExpenses.map((e) => ({ amount: Number(e.amount), date: e.date, category: e.category }))
    );
    // Every signup seeds DEFAULT_CATEGORIES and there's no way to delete a category in this app, so
    // a brand-new user always has real categories with zero expense history — not zero categories.
    // aggregateByCategory only emits entries for categories that actually appear in the expenses
    // array, so without this zero-fill, computeCategoryRecommendation would see an empty `history`
    // array and hit its "zero categories" branch (returns []) instead of its "zero spend, has
    // categories" branch (spec Section 3, Step 5 — even split across up to 5 categories + Other),
    // leaving every brand-new user's first cycle with no recommendation rows at all.
    const categoriesWithHistory = new Set(categoryHistory.map((c) => c.categoryId));
    const zeroFilledHistory = [
      ...categoryHistory,
      ...userCategories
        .filter((cat) => !categoriesWithHistory.has(cat.id))
        .map((cat) => ({ categoryId: cat.id, categoryName: cat.name, color: cat.color, total: 0 })),
    ];
    const recommendation = computeCategoryRecommendation(zeroFilledHistory, discretionaryPool);

    const priorCycle = await prisma.moneyCycle.findFirst({
      where: { userId: user.userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
    });
    const previousCycleScore = priorCycle
      ? (
          await computeHealthScore(
            user.userId,
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
          data: { userId: user.userId, startingAmount, startDate, endDate: parsedEndDate },
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
        throw new AppError(400, ACTIVE_CYCLE_MESSAGE);
      }
      throw error;
    }
    const { cycle, message } = result;

    await publishCycleUpdate(user.userId);

    return NextResponse.json(
      {
        id: cycle.id,
        startingAmount: Number(cycle.startingAmount),
        remainingAmount,
        daysRemaining,
        safeToSpend,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
        messages: [{ id: message.id, kind: message.kind, content: message.content, createdAt: message.createdAt }],
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
