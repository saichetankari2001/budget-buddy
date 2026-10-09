'use client';

import { useCallback, useEffect, useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils/currency';
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';
import { SavingsGoalForm, CreateSavingsGoalInput } from './SavingsGoalForm';

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  contributedAmount: number;
}

export function SavingsGoalsPanel() {
  const [goals, setGoals] = useState<SavingsGoal[] | undefined>(undefined);
  const [showAddForm, setShowAddForm] = useState(false);
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');

  const refetch = useCallback(() => {
    fetch('/api/savings-goals')
      .then(async (res) => {
        if (!res.ok) return;
        setGoals(await res.json());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useRealtimeCycleUpdates(refetch);

  async function handleCreateGoal(data: CreateSavingsGoalInput) {
    const res = await fetch('/api/savings-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowAddForm(false);
      refetch();
    }
  }

  async function handleContribute(goal: SavingsGoal) {
    const amount = Number(contributionAmount);
    const res = await fetch(`/api/savings-goals/${goal.id}/contributions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalName: goal.name, amount }),
    });
    if (res.ok) {
      setContributingId(null);
      setContributionAmount('');
      refetch();
    }
  }

  if (goals === undefined) {
    return null;
  }

  return (
    <GlassPanel elevation={1}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-foreground">Savings goals</h2>
        <Button variant="secondary" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancel' : 'Add goal'}
        </Button>
      </div>

      {showAddForm && (
        <div className="mb-4">
          <SavingsGoalForm onSubmit={handleCreateGoal} />
        </div>
      )}

      {goals.length === 0 ? (
        <p className="text-sm text-muted">No savings goals yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => {
            const percent = Math.min((goal.contributedAmount / goal.targetAmount) * 100, 100);
            return (
              <li key={goal.id} className="rounded-xl border border-border bg-white/[0.03] px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{goal.name}</span>
                  <span className="font-mono text-muted">
                    {formatCurrency(goal.contributedAmount)} / {formatCurrency(goal.targetAmount)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-success transition-all duration-300" style={{ width: `${percent}%` }} />
                </div>
                {contributingId === goal.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="flex-1 text-sm text-foreground">
                      Amount
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={contributionAmount}
                        onChange={(e) => setContributionAmount(e.target.value)}
                        className="ml-2 w-24 rounded-lg border border-border bg-card px-2 py-1 text-sm"
                      />
                    </label>
                    <Button onClick={() => handleContribute(goal)}>Save</Button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => setContributingId(goal.id)} className="mt-2">
                    Add contribution
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
