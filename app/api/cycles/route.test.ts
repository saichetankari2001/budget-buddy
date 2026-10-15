import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/moneyCycle/actions', () => ({ createCycle: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { createCycle } from '@/lib/moneyCycle/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/cycles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // endDate's schema validation requires a real future date within 400 days of "now" — pin the
    // clock so '2026-09-20' stays valid regardless of when this suite actually runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(makeRequest({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }));

    expect(res.status).toBe(401);
    expect(createCycle).not.toHaveBeenCalled();
  });

  it('calls createCycle with the parsed input, converting endDate to a Date, and returns its result as JSON', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    const message = { id: 'msg_1', kind: 'PLAN', content: 'Your plan is ready.', createdAt: new Date('2026-09-15T00:00:00.000Z') };
    vi.mocked(createCycle).mockResolvedValue({
      success: true,
      id: 'cycle_1',
      startingAmount: 500,
      remainingAmount: 500,
      daysRemaining: 5,
      safeToSpend: 100,
      startDate: new Date('2026-09-15T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      message,
    });

    const res = await POST(makeRequest({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }));

    expect(res.status).toBe(201);
    expect(createCycle).toHaveBeenCalledWith('user_1', { startingAmount: 500, endDate: new Date('2026-09-20T00:00:00.000Z') });
    const json = await res.json();
    expect(json.startingAmount).toBe(500);
    expect(json.daysRemaining).toBe(5);
    expect(json.messages).toEqual([{ ...message, createdAt: message.createdAt.toISOString() }]);
    expect(getCurrentUser).toHaveBeenCalledWith(expect.anything());
  });

  it('returns 400 with the action error when createCycle reports failure (e.g. already has an active cycle)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(createCycle).mockResolvedValue({
      success: false,
      error: 'You already have an active cycle. It will complete on its own at its end date.',
    });

    const res = await POST(makeRequest({ startingAmount: 500, endDate: '2026-09-20T00:00:00.000Z' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('You already have an active cycle. It will complete on its own at its end date.');
  });

  it('returns 400 for an invalid payload without calling createCycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const res = await POST(makeRequest({ startingAmount: -5, endDate: '2026-09-20T00:00:00.000Z' }));

    expect(res.status).toBe(400);
    expect(createCycle).not.toHaveBeenCalled();
  });
});
