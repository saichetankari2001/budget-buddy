'use client';

import { useState } from 'react';
import type { RecurrenceInterval, IncomeSourceType } from '@prisma/client';
import { IncomeSourceForm, CreateIncomeSourceInput } from '@/components/income/IncomeSourceForm';
import { BillForm, CreateBillInput } from '@/components/bills/BillForm';
import { ProjectionList } from '@/components/cashflow/ProjectionList';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils/currency';

interface IncomeSource {
  id: string;
  name: string;
  type: IncomeSourceType;
  amount: number | null;
  recurrenceInterval?: RecurrenceInterval;
  startDate: string;
}

interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  recurrenceInterval?: RecurrenceInterval;
  isPaidThisPeriod: boolean;
}

export function CashFlowClient({
  initialIncomeSources,
  initialBills,
}: {
  initialIncomeSources: IncomeSource[];
  initialBills: Bill[];
}) {
  const [incomeSources, setIncomeSources] = useState(initialIncomeSources);
  const [bills, setBills] = useState(initialBills);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);

  async function refreshIncomeSources() {
    const res = await fetch('/api/income-sources');
    if (res.ok) setIncomeSources(await res.json());
  }

  async function refreshBills() {
    const res = await fetch('/api/bills');
    if (res.ok) setBills(await res.json());
  }

  async function handleCreateIncomeSource(data: CreateIncomeSourceInput) {
    const res = await fetch('/api/income-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save income source');
      return;
    }
    await refreshIncomeSources();
    setShowIncomeForm(false);
  }

  async function handleCreateBill(data: CreateBillInput) {
    const res = await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save bill');
      return;
    }
    await refreshBills();
    setShowBillForm(false);
  }

  async function handleMarkPaid(bill: Bill) {
    const res = await fetch(`/api/bills/${encodeURIComponent(bill.name)}/pay`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to mark bill paid');
      return;
    }
    await refreshBills();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-foreground">Income sources</h2>
          <Button variant="secondary" onClick={() => setShowIncomeForm((v) => !v)}>
            {showIncomeForm ? 'Cancel' : 'Add income source'}
          </Button>
        </div>

        {showIncomeForm && (
          <div className="mb-4">
            <IncomeSourceForm onSubmit={handleCreateIncomeSource} />
          </div>
        )}

        {incomeSources.length === 0 ? (
          <p className="text-sm text-muted">No income sources yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incomeSources.map((source, index) => (
              <li
                key={source.id}
                // bg-white/[0.03] (not bg-card/50): `card` is a plain rgba() string in
                // tailwind.config.ts, which Tailwind's `/<opacity>` modifier can't decompose —
                // `bg-card/50` silently compiled to a literal 50% opaque white (found via
                // axe-core: it failed WCAG contrast against text-foreground) instead of the
                // intended ~3% tint. `white` is a real Tailwind color, so its modifier works
                // correctly; `[0.03]` reproduces the originally-intended half-as-opaque-as-Card look.
                className="animate-fade-slide-in flex items-center justify-between rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              >
                <div>
                  <p className="font-medium text-foreground">{source.name}</p>
                  <p className="text-muted">
                    {source.type === 'FIXED'
                      ? `Fixed · repeats ${source.recurrenceInterval?.toLowerCase()}`
                      : 'Irregular'}
                  </p>
                </div>
                {source.amount !== null && (
                  <span className="font-mono font-medium text-foreground">{formatCurrency(source.amount)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-foreground">Bills</h2>
          <Button variant="secondary" onClick={() => setShowBillForm((v) => !v)}>
            {showBillForm ? 'Cancel' : 'Add bill'}
          </Button>
        </div>

        {showBillForm && (
          <div className="mb-4">
            <BillForm onSubmit={handleCreateBill} />
          </div>
        )}

        {bills.length === 0 ? (
          <p className="text-sm text-muted">No bills yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bills.map((bill, index) => (
              <li
                key={bill.id}
                // bg-white/[0.03] — see the income-sources list above for why this replaces
                // bg-card/50.
                className="animate-fade-slide-in flex items-center justify-between rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              >
                <div>
                  <p className="font-medium text-foreground">{bill.name}</p>
                  <p className="text-muted">
                    {/* Explicit 'en-AU' locale (matching lib/utils/currency.ts's convention): Node's
                        default Intl locale resolves to en-US regardless of server timezone/OS locale,
                        while the browser resolves its own default — an unpinned toLocaleDateString()
                        here renders "9/30/2026" server-side vs "30/09/2026" client-side, a real
                        SSR/client hydration mismatch (confirmed: this component receives bills as
                        props pre-rendered by the server component, unlike ProjectionList's
                        client-only self-fetch, so this text is genuinely rendered on both sides). */}
                    Due <span className="font-mono">{new Date(bill.dueDate).toLocaleDateString('en-AU')}</span>
                    {bill.recurrenceInterval && ` · repeats ${bill.recurrenceInterval.toLowerCase()}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-foreground">{formatCurrency(bill.amount)}</span>
                  <Button variant="secondary" onClick={() => handleMarkPaid(bill)}>
                    Mark paid
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ProjectionList />
    </div>
  );
}
