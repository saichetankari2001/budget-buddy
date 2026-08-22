'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? 'Something went wrong');
      setSubmitting(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card>
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Log in</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          No account?{' '}
          <a href="/signup" className="text-primary underline">
            Sign up
          </a>
        </p>
      </Card>
    </main>
  );
}
