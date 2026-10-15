import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generateChatReply, ChatHistoryMessage, ChatToolHandlers } from '@/lib/ai/chat';
import { createCycle, updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';
import { addIncomeSource, logIncomeEntry } from '@/lib/income/actions';
import { addBill, markBillPaid } from '@/lib/bills/actions';
import { logExpense } from '@/lib/expenses/actions';
import { addSavingsGoal, logSavingsContribution } from '@/lib/savingsGoals/actions';

// 3000 chars comfortably covers a user laying out their whole financial situation in one message
// (bills, subscriptions, income sources, a savings goal) — the AI context window and DB column
// (CoachMessage.content is an unbounded Postgres TEXT) impose no real constraint here; this is
// purely an anti-abuse ceiling, not a conversational one.
const chatMessageSchema = z.object({ message: z.string().min(1).max(3000) });

// Up to 5 sequential Groq calls (see MAX_TOOL_ROUNDS in lib/ai/chat.ts), each with its own 9s
// timeout — 55s leaves margin under Vercel's 60s Hobby-plan ceiling for the worst case.
export const maxDuration = 55;

const HISTORY_LIMIT = 10;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { message } = chatMessageSchema.parse(await request.json());

    const handlers: ChatToolHandlers = {
      startCycle: (input) => createCycle(user.userId, { startingAmount: input.startingAmount, endDate: new Date(input.endDate) }),
      updateCycleAmount: (newAmount: number) => updateCycleAmount(user.userId, newAmount),
      cancelCycle: () => cancelCycle(user.userId),
      addIncomeSource: (input) => addIncomeSource(user.userId, { ...input, startDate: new Date(input.startDate) }),
      logIncome: (input) => logIncomeEntry(user.userId, input),
      addBill: (input) => addBill(user.userId, { ...input, dueDate: new Date(input.dueDate) }),
      markBillPaid: (billName: string) => markBillPaid(user.userId, billName),
      logExpense: (input) => logExpense(user.userId, input),
      addSavingsGoal: (input) => addSavingsGoal(user.userId, { ...input, targetDate: input.targetDate ? new Date(input.targetDate) : undefined }),
      logSavingsContribution: (input) => logSavingsContribution(user.userId, input),
    };

    const cycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });

    if (!cycle) {
      // No active cycle yet, so this exchange can't be persisted as normal conversation history —
      // CoachMessage.cycleId is required, and there's no cycle to attach it to. Every tool
      // (including start_cycle) is still callable: tools that themselves need an active cycle
      // already self-check in their own action layer (updateCycleAmount, cancelCycle) and fail
      // gracefully with a real error the model can relay, so nothing here needs to special-case
      // which tools are "allowed" before one exists.
      const reply = await generateChatReply(message, [], handlers);

      // If start_cycle just succeeded inside that call, a cycle now exists — persist this
      // bootstrapping exchange against it retroactively, so it isn't silently lost from the
      // conversation the user just had.
      const newCycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
      if (newCycle) {
        await prisma.coachMessage.create({ data: { cycleId: newCycle.id, kind: 'USER', content: message } });
        await prisma.coachMessage.create({ data: { cycleId: newCycle.id, kind: 'CHAT', content: reply } });
      }

      return NextResponse.json({ reply });
    }

    const userMessage = await prisma.coachMessage.create({
      data: { cycleId: cycle.id, kind: 'USER', content: message },
    });

    const priorMessages = await prisma.coachMessage.findMany({
      where: { cycleId: cycle.id, id: { not: userMessage.id } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    const history: ChatHistoryMessage[] = priorMessages
      .reverse()
      .map((m) => ({ role: m.kind === 'USER' ? 'user' : 'assistant', content: m.content }));

    const reply = await generateChatReply(message, history, handlers);

    await prisma.coachMessage.create({ data: { cycleId: cycle.id, kind: 'CHAT', content: reply } });

    return NextResponse.json({ reply });
  } catch (error) {
    return handleRouteError(error);
  }
}
