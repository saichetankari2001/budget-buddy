import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/bills/actions', () => ({ markBillPaid: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { markBillPaid } from '@/lib/bills/actions';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/bills/[id]/pay', () => {
  it('marks a bill paid by name and returns the created expense id', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(markBillPaid).mockResolvedValue({ success: true, expenseId: 'exp_1' });

    const res = await POST(new NextRequest('http://localhost/api/bills/Rent/pay', { method: 'POST' }), {
      params: { id: 'Rent' },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expenseId).toBe('exp_1');
    expect(markBillPaid).toHaveBeenCalledWith('user_1', 'Rent');
  });

  it('returns 400 when the bill is not due yet', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(markBillPaid).mockResolvedValue({
      success: false,
      error: 'Rent is not due yet — it was already paid for this period',
    });

    const res = await POST(new NextRequest('http://localhost/api/bills/Rent/pay', { method: 'POST' }), {
      params: { id: 'Rent' },
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new NextRequest('http://localhost/api/bills/Rent/pay', { method: 'POST' }), {
      params: { id: 'Rent' },
    });

    expect(res.status).toBe(401);
  });
});
