'use client';

import { useState } from 'react';
import { PencilIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { RecurrenceInterval } from '@prisma/client';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';

interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  isRecurring: boolean;
  recurrenceInterval?: RecurrenceInterval;
  category: { id: string; name: string; color: string };
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

  return (
    <div>
      <Button onClick={() => setShowAddForm((v) => !v)} variant="secondary" className="mb-4">
        {showAddForm ? 'Cancel' : 'Add expense'}
      </Button>

      {showAddForm && (
        <Card className="mb-6">
          <ExpenseForm categories={categories} onSubmit={handleCreate} />
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {expenses.map((expense, index) =>
          editingId === expense.id ? (
            <li key={expense.id}>
              <Card>
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
              </Card>
            </li>
          ) : (
            <li
              key={expense.id}
              className="animate-fade-slide-in motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
            >
              <Card className="flex items-center justify-between text-sm">
                <div>
                  <p className="flex items-center gap-1 font-medium text-foreground">
                    {expense.description}
                    {expense.isRecurring && (
                      <ArrowPathIcon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    )}
                  </p>
                  <p className="text-muted">
                    {expense.category.name} · {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">${expense.amount.toFixed(2)}</span>
                  <IconButton icon={PencilIcon} label="Edit" onClick={() => setEditingId(expense.id)} />
                  <IconButton
                    icon={TrashIcon}
                    label="Delete"
                    variant="destructive"
                    onClick={() => handleDelete(expense.id)}
                  />
                </div>
              </Card>
            </li>
          )
        )}
        {expenses.length === 0 && <p className="text-sm text-muted">No expenses match these filters.</p>}
      </ul>
    </div>
  );
}
