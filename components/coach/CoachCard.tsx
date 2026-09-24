'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PushSubscribe } from '@/components/pwa/PushSubscribe';
import { StartCycleForm } from './StartCycleForm';
import { formatCurrency } from '@/lib/utils/currency';

interface CoachMessage {
  id: string;
  kind: 'PLAN' | 'CHECK_IN' | 'USER' | 'CHAT';
  content: string;
  createdAt: string;
}

interface ActiveCycle {
  id: string;
  startingAmount: number;
  remainingAmount: number;
  daysRemaining: number;
  safeToSpend: number;
  startDate: string;
  endDate: string;
  status: string;
  messages: CoachMessage[];
}

export function CoachCard() {
  const [cycle, setCycle] = useState<ActiveCycle | null | undefined | 'error'>(undefined);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/cycles/active')
      .then(async (res) => {
        if (!res.ok) {
          setCycle('error');
          return;
        }
        setCycle(await res.json());
      })
      .catch(() => setCycle('error'));
  }, []);

  async function handleStart(data: { startingAmount: number; endDate: string }) {
    const res = await fetch('/api/cycles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startingAmount: data.startingAmount, endDate: new Date(data.endDate).toISOString() }),
    });
    if (res.ok) {
      setStartError(null);
      setCycle(await res.json());
      return;
    }
    let body: { error?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body (e.g. a gateway timeout page) — fall back to a generic message
    }
    setStartError(body.error ?? 'Something went wrong');
  }

  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || cycle === undefined || cycle === null || cycle === 'error') return;

    const messageText = chatInput;
    const previousCycle = cycle;
    setChatInput('');
    setChatError(null);
    setSendingChat(true);

    const optimisticUserMessage: CoachMessage = {
      id: `optimistic-${Date.now()}`,
      kind: 'USER',
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    // messages are ordered newest-first (server convention), so the new message goes at the front
    setCycle({ ...previousCycle, messages: [optimisticUserMessage, ...previousCycle.messages] });

    try {
      const res = await fetch('/api/cycles/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });

      if (!res.ok) {
        setCycle(previousCycle);
        setChatError('Something went wrong sending that message. Try again.');
        return;
      }

      const refreshed = await fetch('/api/cycles/active');
      if (refreshed.ok) {
        setCycle(await refreshed.json());
      } else {
        setCycle(previousCycle);
        setChatError('Something went wrong sending that message. Try again.');
      }
    } catch {
      setCycle(previousCycle);
      setChatError('Something went wrong sending that message. Try again.');
    } finally {
      setSendingChat(false);
    }
  }

  if (cycle === undefined) {
    return null; // loading — avoid a flash of the empty-state form before the fetch resolves
  }

  if (cycle === 'error') {
    return (
      <Card>
        <p className="text-sm text-muted">Couldn&apos;t load your Money Coach right now. Try refreshing.</p>
      </Card>
    );
  }

  if (cycle === null) {
    return (
      <Card>
        <h2 className="mb-3 font-heading font-medium text-foreground">Money Coach</h2>
        <StartCycleForm onSubmit={handleStart} />
        {startError && <p className="mt-2 text-sm text-destructive">{startError}</p>}
      </Card>
    );
  }

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
            {formatCurrency(cycle.remainingAmount)}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Days left</p>
          <p className="font-mono text-2xl font-semibold text-foreground">{cycle.daysRemaining}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Daily budget</p>
          <p className="font-mono text-2xl font-semibold text-foreground">{formatCurrency(cycle.safeToSpend)}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {cycle.messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-xl border px-4 py-3 text-sm text-foreground backdrop-blur-xl ${
              message.kind === 'USER' ? 'ml-8 border-primary bg-card' : 'border-border bg-card'
            }`}
          >
            <p>{message.content}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {message.kind === 'PLAN'
                ? 'Plan'
                : message.kind === 'CHECK_IN'
                  ? 'Check-in'
                  : message.kind === 'USER'
                    ? 'You'
                    : 'Coach'}{' '}
              · {new Date(message.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Tell the coach something — e.g. &quot;change it to $700&quot;"
          disabled={sendingChat}
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" disabled={sendingChat || !chatInput.trim()}>
          {sendingChat ? 'Sending…' : 'Send'}
        </Button>
      </form>
      {chatError && <p className="mt-2 text-sm text-destructive">{chatError}</p>}
    </Card>
  );
}
