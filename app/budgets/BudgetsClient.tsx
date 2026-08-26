'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export interface BudgetRow {
  categoryId: string;
  categoryName: string;
  color: string;
  monthlyLimit: number | null;
  isGstFree: boolean;
}

export function BudgetsClient({ rows: initialRows }: { rows: BudgetRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [inputs, setInputs] = useState<Record<string, string>>(
    Object.fromEntries(initialRows.map((r) => [r.categoryId, r.monthlyLimit?.toString() ?? '']))
  );

  async function handleSave(categoryId: string) {
    const value = Number(inputs[categoryId]);
    const res = await fetch(`/api/budgets/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyLimit: value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save budget');
      return;
    }
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, monthlyLimit: value } : r)));
  }

  async function handleRemove(categoryId: string) {
    const res = await fetch(`/api/budgets/${categoryId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to remove budget');
      return;
    }
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, monthlyLimit: null } : r)));
    setInputs((prev) => ({ ...prev, [categoryId]: '' }));
  }

  async function handleToggleGstFree(categoryId: string, isGstFree: boolean) {
    setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, isGstFree } : r)));
    const res = await fetch(`/api/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isGstFree }),
    });
    if (!res.ok) {
      setRows((prev) => prev.map((r) => (r.categoryId === categoryId ? { ...r, isGstFree: !isGstFree } : r)));
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to update category');
    }
  }

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.categoryId} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="font-medium text-foreground">{row.categoryName}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm text-muted">
              <input
                type="checkbox"
                checked={row.isGstFree}
                onChange={(e) => handleToggleGstFree(row.categoryId, e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              GST-free
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="No limit"
              value={inputs[row.categoryId] ?? ''}
              onChange={(e) => setInputs((prev) => ({ ...prev, [row.categoryId]: e.target.value }))}
              className="w-28 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button variant="secondary" onClick={() => handleSave(row.categoryId)}>
              Save
            </Button>
            {row.monthlyLimit !== null && (
              <Button variant="destructive" onClick={() => handleRemove(row.categoryId)}>
                Remove
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
