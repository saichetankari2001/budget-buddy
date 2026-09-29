'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { Button } from '@/components/ui/Button';
import { WebGLAccent } from '@/components/three/WebGLAccent';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/auth/signup', {
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
    <main className="relative mx-auto mt-24 flex max-w-4xl items-center justify-center gap-12 overflow-hidden px-4">
      <AmbientBlobs />
      <GlassPanel elevation={2} className="w-full max-w-sm">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Create your account</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="password"
            required
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Already have an account?{' '}
          <a href="/login" className="text-primary-hover underline">
            Log in
          </a>
        </p>
        <p className="mt-2 text-sm text-muted">
          By creating an account, you agree to our{' '}
          <a href="/privacy" className="text-primary-hover underline">
            Privacy Policy
          </a>
          .
        </p>
      </GlassPanel>
      <div className="hidden h-64 w-64 shrink-0 sm:block">
        <WebGLAccent
          loadScene={() => import('@/components/three/GlassHeroScene')}
          alt="Decorative rotating glass torus"
        />
      </div>
    </main>
  );
}
