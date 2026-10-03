'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { PencilIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { RecurrenceInterval } from '@prisma/client';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';
import { formatCurrency } from '@/lib/utils/currency';

interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  isRecurring: boolean;
  recurrenceInterval?: RecurrenceInterval;
  category: { id: string; name: string; color: string };
}

interface ImportSummary {
  imported: number;
  skipped: { row: number; reason: string }[];
}

export function ExpensesClient({
  categories,
  initialExpenses,
}: {
  categories: { id: string; name: string; color: string }[];
  initialExpenses: Expense[];
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  // ExpenseFilters changes the category/date filters by pushing new searchParams onto the same
  // /dashboard route, which re-runs the server component and sends this component a fresh
  // `initialExpenses` prop reflecting the new filter — but this component isn't remounted by that
  // navigation (same position in the tree), so useState(initialExpenses) above only ever applies
  // on first mount. Without this effect, applying a filter changes the URL correctly but the
  // visible list silently keeps showing the pre-filter data (confirmed live: filtering to a
  // category that excludes an existing expense still displayed it). Re-sync whenever the server
  // sends a new filtered list.
  useEffect(() => {
    setExpenses(initialExpenses);
  }, [initialExpenses]);

  async function handleCreate(data: CreateExpenseInput) {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save expense');
      return;
    }
    const created = await res.json();
    const category = categories.find((c) => c.id === created.categoryId)!;
    setExpenses((prev) => [{ ...created, amount: Number(created.amount), category }, ...prev]);
    setShowAddForm(false);
  }

  async function handleUpdate(id: string, data: CreateExpenseInput) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save expense');
      return;
    }
    const category = categories.find((c) => c.id === data.categoryId)!;
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              amount: data.amount,
              description: data.description,
              date: data.date,
              isRecurring: data.isRecurring ?? false,
              recurrenceInterval: data.recurrenceInterval,
              category,
            }
          : e
      )
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to delete expense');
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/expenses/import', { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to import expenses');
      return;
    }

    const result: ImportSummary = await res.json();
    setImportSummary(result);

    interface ExpenseApiResponse {
      id: string;
      amount: number;
      description: string;
      date: string;
      isRecurring: boolean;
      recurrenceInterval: RecurrenceInterval | null;
      category: { id: string; name: string; color: string };
    }

    const refreshed = await fetch('/api/expenses');
    if (refreshed.ok) {
      const data: ExpenseApiResponse[] = await refreshed.json();
      setExpenses(
        data.map((d) => ({
          id: d.id,
          amount: d.amount,
          description: d.description,
          date: d.date,
          isRecurring: d.isRecurring,
          recurrenceInterval: d.recurrenceInterval ?? undefined,
          category: { id: d.category.id, name: d.category.name, color: d.category.color },
        }))
      );
    }
  }

  return (
    <div>
      {importSummary && (
        <GlassPanel elevation={1} className="mb-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">
                Imported {importSummary.imported} expense{importSummary.imported === 1 ? '' : 's'}.
              </p>
              {importSummary.skipped.length > 0 && (
                <div className="mt-2">
                  <p className="text-muted">
                    {importSummary.skipped.length} row{importSummary.skipped.length === 1 ? '' : 's'} skipped:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-muted">
                    {importSummary.skipped.map((s) => (
                      <li key={s.row}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              onClick={() => setImportSummary(null)}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </GlassPanel>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setShowAddForm((v) => !v)} variant="secondary">
          {showAddForm ? 'Cancel' : 'Add expense'}
        </Button>
        <a
          href="/api/expenses/export"
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground backdrop-blur-xl transition duration-200 hover:bg-white/10"
        >
          Export CSV
        </a>
        <label className="cursor-pointer rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground backdrop-blur-xl transition duration-200 hover:bg-white/10">
          Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {showAddForm && (
        <GlassPanel elevation={1} className="mb-6">
          <ExpenseForm categories={categories} onSubmit={handleCreate} />
        </GlassPanel>
      )}

      {expenses.length === 0 && (
        <GlassPanel elevation={1}>
          <p className="text-sm text-muted">No expenses match these filters.</p>
        </GlassPanel>
      )}

      <ul className="flex flex-col gap-2">
        {expenses.map((expense, index) =>
          editingId === expense.id ? (
            <li key={expense.id}>
              <GlassPanel elevation={1}>
                <ExpenseForm
                  categories={categories}
                  initialValues={{
                    amount: expense.amount,
                    description: expense.description,
                    categoryId: expense.category.id,
                    date: expense.date.slice(0, 10),
                    isRecurring: expense.isRecurring,
                    recurrenceInterval: expense.recurrenceInterval,
                  }}
                  onSubmit={(data) => handleUpdate(expense.id, data)}
                />
              </GlassPanel>
            </li>
          ) : (
            <li
              key={expense.id}
              className="animate-fade-slide-in motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
            >
              <GlassPanel elevation={1} className="flex items-center justify-between text-sm">
                <div>
                  <p className="flex items-center gap-1 font-medium text-foreground">
                    {expense.description}
                    {expense.isRecurring && (
                      <ArrowPathIcon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    )}
                  </p>
                  <p className="text-muted">
                    {/* Explicit 'en-AU' locale (matching lib/utils/currency.ts's convention, and
                        the identical fix already applied to CashFlowClient's bill dates): Node's
                        default Intl locale resolves to en-US regardless of server timezone/OS
                        locale, while the browser resolves its own default — an unpinned
                        toLocaleDateString() here renders e.g. "10/3/2026" server-side vs
                        "03/10/2026" client-side, a real SSR/client hydration mismatch (confirmed
                        live: this component receives expenses as server-rendered props, so this
                        text genuinely renders on both sides — React discarded the server HTML and
                        re-rendered the whole root on the client because of it). */}
                    {expense.category.name} ·{' '}
                    <span className="font-mono">{new Date(expense.date).toLocaleDateString('en-AU')}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-foreground">{formatCurrency(expense.amount)}</span>
                  <IconButton icon={PencilIcon} label="Edit" onClick={() => setEditingId(expense.id)} />
                  <IconButton
                    icon={TrashIcon}
                    label="Delete"
                    variant="destructive"
                    onClick={() => handleDelete(expense.id)}
                  />
                </div>
              </GlassPanel>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
