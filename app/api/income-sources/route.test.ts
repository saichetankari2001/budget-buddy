import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/income/actions', () => ({ addIncomeSource: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { addIncomeSource } from '@/lib/income/actions';
import { POST, GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/income-sources', () => {
  it('creates an income source', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addIncomeSource).mockResolvedValue({ success: true, id: 'inc_1' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources', {
        method: 'POST',
        body: JSON.stringify({ name: 'Uber', type: 'IRREGULAR', startDate: '2026-09-24T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(201);
    expect(addIncomeSource).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ name: 'Uber', type: 'IRREGULAR' })
    );
  });

  it('returns 400 on a duplicate name', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(addIncomeSource).mockResolvedValue({ success: false, error: 'You already have an income source named "Uber"' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources', {
        method: 'POST',
        body: JSON.stringify({ name: 'Uber', type: 'IRREGULAR', startDate: '2026-09-24T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources', {
        method: 'POST',
        body: JSON.stringify({ name: 'Uber', type: 'IRREGULAR', startDate: '2026-09-24T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /api/income-sources', () => {
  it('lists the caller\'s own income sources', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      { id: 'inc_1', userId: 'user_1', name: 'Uber', type: 'IRREGULAR', amount: null, recurrenceInterval: null, startDate: new Date(), createdAt: new Date() },
    ] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(prismaMock.incomeSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });
});
