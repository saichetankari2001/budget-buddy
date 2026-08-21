'use client';

import { useState, FormEvent } from 'react';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';

interface ExpenseFormProps {
  categories: { id: string; name: string }[];
  initialValues?: { amount?: number; description?: string; categoryId?: string; date?: string };
  onSubmit: (data: CreateExpenseInput) => Promise<void>;
}

export function ExpenseForm({ categories, initialValues, onSubmit }: ExpenseFormProps) {
  const [amount, setAmount] = useState(initialValues?.amount?.toString() ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [date, setDate] = useState(initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      amount: Number(amount),
      description,
      categoryId,
      date: new Date(date).toISOString(),
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm">
        Amount
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col text-sm">
        Description
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col text-sm">
        Category
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm">
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
