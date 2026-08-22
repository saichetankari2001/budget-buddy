'use client';

import { useState, FormEvent } from 'react';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';
import { Button } from '@/components/ui/Button';

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

  const inputClasses =
    'rounded-xl border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Amount
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Description
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClasses}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClasses}
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
