import { Card } from '@/components/ui/Card';

export default function OfflinePage() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card>
        <h1 className="mb-2 font-heading text-2xl font-semibold text-foreground">
          You&apos;re offline
        </h1>
        <p className="text-sm text-muted">
          Budget Buddy needs an internet connection to show your up-to-date expenses, budgets, and
          balances. Reconnect and try again.
        </p>
      </Card>
    </main>
  );
}
