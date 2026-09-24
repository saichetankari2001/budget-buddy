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
