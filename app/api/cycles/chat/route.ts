import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generateChatReply, ChatHistoryMessage } from '@/lib/ai/chat';
import { updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';

const chatMessageSchema = z.object({ message: z.string().min(1).max(500) });

export const maxDuration = 15;

const HISTORY_LIMIT = 10;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { message } = chatMessageSchema.parse(await request.json());

    const cycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
    if (!cycle) {
      throw new AppError(400, 'No active cycle to chat about');
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
      .map((m) => ({ role: m.kind === 'USER' ? 'user' : 'model', content: m.content }));

    const reply = await generateChatReply(message, history, {
      updateCycleAmount: (newAmount: number) => updateCycleAmount(user.userId, newAmount),
      cancelCycle: () => cancelCycle(user.userId),
    });

    await prisma.coachMessage.create({ data: { cycleId: cycle.id, kind: 'CHAT', content: reply } });

    return NextResponse.json({ reply });
  } catch (error) {
    return handleRouteError(error);
  }
}
