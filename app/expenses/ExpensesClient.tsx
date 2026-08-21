'use client';

import { useState } from 'react';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';

interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
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
    setExpenses((prev) => [
      { ...created, amount: Number(created.amount), category },
      ...prev,
    ]);
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
          ? { ...e, amount: data.amount, description: data.description, date: data.date, category }
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
      <button
        onClick={() => setShowAddForm((v) => !v)}
        className="mb-4 rounded bg-gray-900 px-3 py-2 text-sm text-white"
      >
        {showAddForm ? 'Cancel' : 'Add expense'}
      </button>

      {showAddForm && (
        <div className="mb-6 rounded border border-gray-200 p-4">
          <ExpenseForm categories={categories} onSubmit={handleCreate} />
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {expenses.map((expense) =>
          editingId === expense.id ? (
            <li key={expense.id} className="rounded border border-gray-200 p-4">
              <ExpenseForm
                categories={categories}
                initialValues={{
                  amount: expense.amount,
                  description: expense.description,
                  categoryId: expense.category.id,
                  date: expense.date.slice(0, 10),
                }}
                onSubmit={(data) => handleUpdate(expense.id, data)}
              />
            </li>
          ) : (
            <li
              key={expense.id}
              className="flex items-center justify-between rounded border border-gray-200 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{expense.description}</p>
                <p className="text-gray-500">
                  {expense.category.name} · {new Date(expense.date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">${expense.amount.toFixed(2)}</span>
                <button onClick={() => setEditingId(expense.id)} className="underline">
                  Edit
                </button>
                <button onClick={() => handleDelete(expense.id)} className="text-red-600 underline">
                  Delete
                </button>
              </div>
            </li>
          )
        )}
        {expenses.length === 0 && <p className="text-sm text-gray-500">No expenses match these filters.</p>}
      </ul>
    </div>
  );
}
