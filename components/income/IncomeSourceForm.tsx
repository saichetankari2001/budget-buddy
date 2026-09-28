'use client';

import { useState, FormEvent } from 'react';
import type { RecurrenceInterval } from '@prisma/client';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export interface CreateIncomeSourceInput {
  name: string;
  type: 'FIXED' | 'IRREGULAR';
  amount?: number;
  recurrenceInterval?: RecurrenceInterval;
  startDate: string;
}

export function IncomeSourceForm({ onSubmit }: { onSubmit: (data: CreateIncomeSourceInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'FIXED' | 'IRREGULAR'>('IRREGULAR');
  const [amount, setAmount] = useState('');
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('WEEKLY');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const inputClasses =
    'rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name,
      type,
      amount: type === 'FIXED' ? Number(amount) : undefined,
      recurrenceInterval: type === 'FIXED' ? recurrenceInterval : undefined,
      startDate: new Date(startDate).toISOString(),
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
        Type
        <select value={type} onChange={(e) => setType(e.target.value as 'FIXED' | 'IRREGULAR')} className={inputClasses}>
          <option value="IRREGULAR">Irregular (e.g. gig work)</option>
          <option value="FIXED">Fixed (predictable amount and schedule)</option>
        </select>
      </label>
      {type === 'FIXED' && (
        <>
          <label className="flex flex-col text-sm text-foreground">
            Amount per payment
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClasses} />
          </label>
          <label className="flex flex-col text-sm text-foreground">
            Repeats
            <select value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(e.target.value as RecurrenceInterval)} className={inputClasses}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </label>
        </>
      )}
      <label className="flex flex-col text-sm text-foreground">
        Start date
        <DateField ariaLabel="Start date" required value={startDate} onChange={setStartDate} className={`${inputClasses} w-full`} />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add income source'}
      </Button>
    </form>
  );
}
