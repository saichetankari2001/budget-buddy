import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/moneyCycle/actions', () => ({ updateCycleAmount: vi.fn(), cancelCycle: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';
import { PATCH, DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('PATCH /api/cycles/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the amount and returns the new figures', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(updateCycleAmount).mockResolvedValue({
      success: true,
      remainingAmount: 700,
      daysRemaining: 5,
      safeToSpend: 140,
      message: 'Updated to $700.',
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/cycles/cycle_1', {
        method: 'PATCH',
        body: JSON.stringify({ newAmount: 700 }),
      }),
      { params: { id: 'cycle_1' } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.remainingAmount).toBe(700);
    expect(updateCycleAmount).toHaveBeenCalledWith('user_1', 700);
  });

  it('returns 404 when there is no active cycle to update', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(updateCycleAmount).mockResolvedValue({ success: false, error: 'No active cycle found' });

    const res = await PATCH(
      new NextRequest('http://localhost/api/cycles/cycle_1', {
        method: 'PATCH',
        body: JSON.stringify({ newAmount: 700 }),
      }),
      { params: { id: 'cycle_1' } }
    );

    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(
      new NextRequest('http://localhost/api/cycles/cycle_1', {
        method: 'PATCH',
        body: JSON.stringify({ newAmount: 700 }),
      }),
      { params: { id: 'cycle_1' } }
    );

    expect(res.status).toBe(401);
    expect(updateCycleAmount).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/cycles/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels the active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(cancelCycle).mockResolvedValue({ success: true });

    const res = await DELETE(new NextRequest('http://localhost/api/cycles/cycle_1', { method: 'DELETE' }), {
      params: { id: 'cycle_1' },
    });

    expect(res.status).toBe(200);
    expect(cancelCycle).toHaveBeenCalledWith('user_1');
  });

  it('returns 404 when there is no active cycle to cancel', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(cancelCycle).mockResolvedValue({ success: false, error: 'No active cycle found' });

    const res = await DELETE(new NextRequest('http://localhost/api/cycles/cycle_1', { method: 'DELETE' }), {
      params: { id: 'cycle_1' },
    });

    expect(res.status).toBe(404);
  });
});
