'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';

export function StartCycleForm({ onSubmit }: { onSubmit: (data: { startingAmount: number; endDate: string }) => void }) {
  const [amount, setAmount] = useState('');
  const [endDate, setEndDate] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ startingAmount: Number(amount), endDate });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        How much do you have?
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Until when
        <DateField
          ariaLabel="Until when"
          required
          value={endDate}
          onChange={setEndDate}
          className="rounded-xl border border-border bg-card px-3 py-2 text-base w-full focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <Button type="submit">Start</Button>
    </form>
  );
}
