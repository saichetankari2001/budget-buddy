// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { importExpensesFromCsv } from '@/lib/importExpensesFromCsv';
import { POST } from './route';

vi.mock('@/lib/auth/session');
vi.mock('@/lib/importExpensesFromCsv');

const mockUser = { userId: 'user_1', email: 'test@example.com' };

describe('POST /api/expenses/import', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const formData = new FormData();
    formData.append(
      'file',
      new File(['date,description,category,amount'], 'expenses.csv', { type: 'text/csv' })
    );
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file is uploaded', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    const formData = new FormData();
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('imports a valid CSV file and returns the summary', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(importExpensesFromCsv).mockResolvedValue({ imported: 2, skipped: [] });

    const csvContent = 'date,description,category,amount\n2026-08-01,Groceries,Food,42.50';
    const formData = new FormData();
    formData.append('file', new File([csvContent], 'expenses.csv', { type: 'text/csv' }));
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ imported: 2, skipped: [] });
    expect(importExpensesFromCsv).toHaveBeenCalledWith('user_1', csvContent);
  });

  it('returns 400 with a message mentioning the row limit when the file has too many rows', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    const header = 'date,description,category,amount';
    const dataLines = Array.from(
      { length: 5001 },
      (_, i) => `2026-08-01,Item ${i},Food,1.00`
    );
    const csvContent = [header, ...dataLines].join('\n');

    const formData = new FormData();
    formData.append('file', new File([csvContent], 'expenses.csv', { type: 'text/csv' }));
    const req = new NextRequest('http://localhost/api/expenses/import', { method: 'POST', body: formData });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/row limit|too many rows/i);
  });
});
