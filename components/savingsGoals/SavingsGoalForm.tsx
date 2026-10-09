'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export interface CreateSavingsGoalInput {
  name: string;
  targetAmount: number;
  targetDate?: string;
}

export function SavingsGoalForm({ onSubmit }: { onSubmit: (data: CreateSavingsGoalInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputClasses =
    'rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name,
      targetAmount: Number(targetAmount),
      targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
    });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Goal name
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Target amount
        <input type="number" step="0.01" min="0.01" required value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className={inputClasses} />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Target date (optional)
        <DateField ariaLabel="Target date" value={targetDate} onChange={setTargetDate} className={`${inputClasses} w-full`} />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add goal'}
      </Button>
    </form>
  );
}
