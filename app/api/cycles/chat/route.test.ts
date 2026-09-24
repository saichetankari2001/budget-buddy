import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/ai/chat', () => ({ generateChatReply: vi.fn() }));
vi.mock('@/lib/moneyCycle/actions', () => ({ updateCycleAmount: vi.fn(), cancelCycle: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { generateChatReply } from '@/lib/ai/chat';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/cycles/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the user message, generates a reply, and saves the reply', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Done — updated to $700.');

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'change it to 700' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply).toBe('Done — updated to $700.');
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'USER', content: 'change it to 700' }) })
    );
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'CHAT', content: 'Done — updated to $700.' }) })
    );
  });

  it('excludes the just-saved user message from the history passed to generateChatReply', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.create
      .mockResolvedValueOnce({
        id: 'msg_new',
        cycleId: 'cycle_1',
        kind: 'USER',
        content: 'change it to 700',
        createdAt: new Date(),
      } as never)
      .mockResolvedValueOnce({} as never);
    // Simulate the DB correctly filtering out msg_new (the where clause under test) —
    // only an older, unrelated message comes back as history.
    prismaMock.coachMessage.findMany.mockResolvedValue([
      { id: 'msg_prior', cycleId: 'cycle_1', kind: 'CHAT', content: 'Hi there', createdAt: new Date() },
    ] as never);
    vi.mocked(generateChatReply).mockResolvedValue('Sure thing.');

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'change it to 700' }),
      })
    );

    expect(res.status).toBe(200);
    // The findMany query must exclude the row it just created.
    expect(prismaMock.coachMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cycleId: 'cycle_1', id: { not: 'msg_new' } }) })
    );
    // And the history handed to generateChatReply must not contain the current turn a second time.
    const historyArg = vi.mocked(generateChatReply).mock.calls[0][1];
    expect(historyArg).not.toContainEqual({ role: 'user', content: 'change it to 700' });
    expect(historyArg).toEqual([{ role: 'model', content: 'Hi there' }]);
  });

  it('returns 400 when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
      })
    );

    expect(res.status).toBe(400);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
      })
    );

    expect(res.status).toBe(401);
  });
});
