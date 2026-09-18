'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { PushSubscribe } from '@/components/pwa/PushSubscribe';
import { StartCycleForm } from './StartCycleForm';
import { formatCurrency } from '@/lib/utils/currency';

interface CoachMessage {
  id: string;
  kind: 'PLAN' | 'CHECK_IN';
  content: string;
  createdAt: string;
}

interface ActiveCycle {
  id: string;
  startingAmount: number;
  startDate: string;
  endDate: string;
  status: string;
  messages: CoachMessage[];
}

export function CoachCard() {
  const [cycle, setCycle] = useState<ActiveCycle | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/cycles/active')
      .then((res) => res.json())
      .then(setCycle);
  }, []);

  async function handleStart(data: { startingAmount: number; endDate: string }) {
    const res = await fetch('/api/cycles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startingAmount: data.startingAmount, endDate: new Date(data.endDate).toISOString() }),
    });
    if (res.ok) {
      setCycle(await res.json());
    }
  }

  if (cycle === undefined) {
    return null; // loading — avoid a flash of the empty-state form before the fetch resolves
  }

  if (cycle === null) {
    return (
      <Card>
        <h2 className="mb-3 font-heading font-medium text-foreground">Money Coach</h2>
        <StartCycleForm onSubmit={handleStart} />
      </Card>
    );
  }

  const daysRemaining = Math.max(
    Math.round((new Date(cycle.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    0
  );

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading font-medium text-foreground">Money Coach</h2>
        <PushSubscribe />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted">Amount left</p>
          <p className="bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-2xl font-semibold text-transparent">
            {formatCurrency(cycle.startingAmount)}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Days left</p>
          <p className="font-mono text-2xl font-semibold text-foreground">{daysRemaining}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {cycle.messages.map((message) => (
          <li
            key={message.id}
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground backdrop-blur-xl"
          >
            <p>{message.content}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {message.kind === 'PLAN' ? 'Plan' : 'Check-in'} · {new Date(message.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
