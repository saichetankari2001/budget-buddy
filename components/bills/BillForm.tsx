'use client';

import { useState, FormEvent } from 'react';
import type { RecurrenceInterval } from '@prisma/client';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export interface CreateBillInput {
  name: string;
  amount: number;
  dueDate: string;
  recurrenceInterval?: RecurrenceInterval;
}

export function BillForm({ onSubmit }: { onSubmit: (data: CreateBillInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('MONTHLY');
  const [submitting, setSubmitting] = useState(false);

  const inputClasses =
    'rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name,
      amount: Number(amount),
      dueDate: new Date(dueDate).toISOString(),
      recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Name
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
      </label>
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
        Due date
        <DateField ariaLabel="Due date" required value={dueDate} onChange={setDueDate} className={`${inputClasses} w-full`} />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
          className="h-4 w-4 rounded accent-primary focus:ring-primary"
        />
        Repeats
      </label>
      {isRecurring && (
        <label className="flex flex-col text-sm text-foreground">
          Repeat interval
          <select
            value={recurrenceInterval}
            onChange={(e) => setRecurrenceInterval(e.target.value as RecurrenceInterval)}
            className={inputClasses}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add bill'}
      </Button>
    </form>
  );
}
