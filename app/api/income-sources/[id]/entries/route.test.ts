import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/income/actions', () => ({ logIncomeEntry: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { logIncomeEntry } from '@/lib/income/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/income-sources/[id]/entries', () => {
  it('logs an entry (the id route param identifies the source by name lookup, not by id, matching the chat tool\'s server-side resolution)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(logIncomeEntry).mockResolvedValue({ success: true, id: 'entry_1' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources/Uber/entries', {
        method: 'POST',
        body: JSON.stringify({ amount: 52 }),
      }),
      { params: { id: 'Uber' } }
    );

    expect(res.status).toBe(201);
    expect(logIncomeEntry).toHaveBeenCalledWith('user_1', { sourceName: 'Uber', amount: 52, date: undefined });
  });

  it('returns 400 when the named source does not exist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(logIncomeEntry).mockResolvedValue({ success: false, error: 'No income source named "Uber" found' });

    const res = await POST(
      new NextRequest('http://localhost/api/income-sources/Uber/entries', {
        method: 'POST',
        body: JSON.stringify({ amount: 52 }),
      }),
      { params: { id: 'Uber' } }
    );

    expect(res.status).toBe(400);
  });
});
