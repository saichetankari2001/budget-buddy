// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/health/computeHealthScore', () => ({ computeHealthScore: vi.fn() }));
vi.mock('@/lib/generateDueRecurringExpenses', () => ({ generateDueRecurringExpenses: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makeRequest() {
  return new NextRequest('http://localhost/api/dashboard/summary');
}

describe('GET /api/dashboard/summary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('calls getCurrentUser with the request, so the Bearer fallback is reachable', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    await GET(makeRequest());

    expect(getCurrentUser).toHaveBeenCalledWith(expect.anything());
  });

  it('generates due recurring expenses for the authenticated user before querying expenses, mobile-only users never fall behind web', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    await GET(makeRequest());

    expect(generateDueRecurringExpenses).toHaveBeenCalledWith(mockUser.userId);
  });

  it('sums this calendar month\'s expenses for totalSpentThisMonth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([
      { amount: { toString: () => '20.00' } as never, date: new Date('2026-09-05T00:00:00.000Z'), category: null },
      { amount: { toString: () => '15.50' } as never, date: new Date('2026-09-10T00:00:00.000Z'), category: null },
    ] as never);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.totalSpentThisMonth).toBe(35.5);
  });

  it('reports hasScore:false and value:0 when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.healthScore).toEqual({ value: 0, hasScore: false });
    expect(computeHealthScore).not.toHaveBeenCalled();
  });

  it('reports the real score and hasScore:true when there is an active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      status: 'ACTIVE',
      startingAmount: { toString: () => '500.00' } as never,
    } as never);
    vi.mocked(computeHealthScore).mockResolvedValue({ total: 72 } as never);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.healthScore).toEqual({ value: 72, hasScore: true });
  });
});
