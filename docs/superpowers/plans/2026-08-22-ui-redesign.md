# Budget Buddy UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the "Indigo Bento" visual system (colors, typography, shared components) and a motion/polish layer across all existing Budget Buddy pages, without changing any behavior, API, or data logic.

**Architecture:** Extend Tailwind's theme with design tokens (colors, fonts), build four small shared components (`Header`, `Card`, `Button`, `IconButton`) in `components/ui/`, then apply them page-by-page. A separate motion utility (`computeCountUpValue`) powers a count-up stat animation; CSS keyframes + Tailwind's `motion-reduce:` variant handle the staggered list entrance, both respecting `prefers-reduced-motion`.

**Tech Stack:** Next.js 14 App Router (existing), Tailwind CSS (existing, extended), `next/font/google` (Lexend, Source Sans 3), `@heroicons/react` (new dependency, outline icon set), Vitest + React Testing Library (existing).

## Global Constraints

- Colors (exact hex, from the spec): `primary` `#6366F1`, `primary-hover` `#4F46E5`, `accent` `#059669`, `background` `#F5F3FF`, `card` `#FFFFFF`, `foreground` `#1E1B4B`, `muted` `#64748B`, `border` `#E0E7FF`, `destructive` `#DC2626`.
- Typography: Lexend for headings (`font-heading`), Source Sans 3 for body (`font-sans`), both via `next/font/google`.
- Icons: `@heroicons/react` outline variant only, 16-20px, no emoji anywhere.
- All motion (count-up, staggered entrance) must respect `prefers-reduced-motion` — degrade to an instant, non-animated state.
- No new features, no API/schema/validation changes, no dark mode toggle, no layout restructuring beyond the shared `Header`.
- Existing test assertions must keep passing: `ExpenseForm.test.tsx` uses `getByLabelText(/amount|description|category|date/i)` and `getByRole('button', { name: /save/i })` — labels and button text must not change. `CategoryPieChart.test.tsx`/`MonthlyTrendChart.test.tsx` assert on text content (`/no expenses yet/i`, `/no spending history yet/i`, category names) and `data-testid="monthly-trend-chart"` — none of that text or the testid may change.

---

## File Structure

```
budget-buddy/
├── tailwind.config.ts               # MODIFY: add color/font/keyframe tokens
├── app/
│   ├── layout.tsx                   # MODIFY: next/font setup, new body classes
│   ├── login/page.tsx               # MODIFY: restyle with Card/Button
│   ├── signup/page.tsx              # MODIFY: restyle with Card/Button
│   ├── dashboard/page.tsx           # MODIFY: Header, Card, CountUpStat
│   └── expenses/
│       ├── page.tsx                 # MODIFY: Header
│       └── ExpensesClient.tsx       # MODIFY: Card/Button/IconButton, stagger
├── components/
│   ├── ui/
│   │   ├── Card.tsx                 # CREATE
│   │   ├── Button.tsx               # CREATE
│   │   ├── Button.test.tsx          # CREATE
│   │   ├── IconButton.tsx           # CREATE
│   │   ├── IconButton.test.tsx      # CREATE
│   │   ├── Header.tsx               # CREATE
│   │   ├── Header.test.tsx          # CREATE
│   │   └── CountUpStat.tsx          # CREATE
│   ├── expenses/
│   │   ├── ExpenseForm.tsx          # MODIFY: restyle with Button
│   │   └── ExpenseFilters.tsx       # MODIFY: restyle inputs
│   └── charts/
│       ├── CategoryPieChart.tsx     # MODIFY: chrome colors
│       └── MonthlyTrendChart.tsx    # MODIFY: chrome colors
└── lib/
    └── utils/
        ├── countUp.ts                # CREATE: pure count-up math
        └── countUp.test.ts           # CREATE
```

---

### Task 1: Tailwind Theme & Font Setup

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: Tailwind color tokens (`bg-primary`, `text-foreground`, `bg-background`, etc.), font tokens (`font-heading`, `font-sans`), and animation tokens (`animate-fade-slide-in`) — consumed by every later task in this plan.

- [ ] **Step 1: Update `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366F1', hover: '#4F46E5' },
        accent: '#059669',
        background: '#F5F3FF',
        card: '#FFFFFF',
        foreground: '#1E1B4B',
        muted: '#64748B',
        border: '#E0E7FF',
        destructive: '#DC2626',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
      },
      keyframes: {
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-slide-in': 'fadeSlideIn 300ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Update `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const lexend = Lexend({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const sourceSans = Source_Sans_3({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lexend.variable} ${sourceSans.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
```

**Rationale:** `next/font/google` self-hosts the font files at build time (no runtime request to Google Fonts, better privacy and performance than a `<link>` tag), and exposes each font as a CSS variable (`--font-heading`, `--font-body`) that Tailwind's `fontFamily` tokens reference — this is the standard Next.js App Router pattern for custom fonts.

- [ ] **Step 3: Verify nothing crashes**

```bash
npm run dev &
sleep 4
curl -s -o /dev/null -w "login status: %{http_code}\n" http://localhost:3000/login
npx tsc --noEmit
kill %1
```

Expected: `login status: 200`, no type errors. The page will look visually different (new background/font) but all existing text/behavior is unchanged — this task only adds tokens, no page uses them yet.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/layout.tsx
git commit -m "feat: add Indigo Bento design tokens (colors, fonts)"
```

---

### Task 2: Shared UI — Card, Button, IconButton

**Files:**
- Create: `components/ui/Card.tsx`, `components/ui/Button.tsx`, `components/ui/Button.test.tsx`, `components/ui/IconButton.tsx`, `components/ui/IconButton.test.tsx`
- Modify: `package.json` (add `@heroicons/react`)

**Interfaces:**
- Consumes: Tailwind tokens from Task 1 (`primary`, `border`, `card`, `foreground`, `destructive`).
- Produces:
  - `Card({ hoverable?: boolean, className?: string, children, ...divProps }): JSX.Element`
  - `Button({ variant?: 'primary' | 'secondary' | 'destructive', className?: string, children, ...buttonProps }): JSX.Element`
  - `IconButton({ icon: ComponentType<SVGProps<SVGSVGElement>>, label: string, onClick?: () => void, variant?: 'default' | 'destructive' }): JSX.Element`

- [ ] **Step 1: Install the icon library**

```bash
npm install @heroicons/react
```

- [ ] **Step 2: Create `components/ui/Card.tsx`**

```tsx
import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ hoverable = false, className = '', children, ...rest }: CardProps) {
  const hoverClasses = hoverable
    ? 'transition duration-200 hover:scale-[1.02] hover:shadow-md motion-reduce:hover:scale-100'
    : '';

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-6 shadow-sm ${hoverClasses} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Write the failing test for `Button`**

`components/ui/Button.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children and calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run components/ui/Button.test.tsx
```

Expected: FAIL — `./Button` module not found.

- [ ] **Step 5: Create `components/ui/Button.tsx`**

```tsx
import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-indigo-500 text-white hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]',
  secondary: 'bg-white text-foreground border border-border hover:bg-background',
  destructive: 'bg-destructive text-white hover:bg-red-700',
};

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-xl px-4 py-2 text-sm font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

**Rationale:** The gradient + glow shadow is deliberately only on the `primary` variant, applied via `hover:shadow-[...]` (an arbitrary Tailwind value) — this is the one "futuristic" accent in the whole system, kept to primary CTAs only so it reads as intentional rather than every button glowing.

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run components/ui/Button.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 7: Write the failing test for `IconButton`**

`components/ui/IconButton.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders the label and calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<IconButton icon={TrashIcon} label="Delete" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

```bash
npx vitest run components/ui/IconButton.test.tsx
```

Expected: FAIL — `./IconButton` module not found.

- [ ] **Step 9: Create `components/ui/IconButton.tsx`**

```tsx
import { ComponentType, SVGProps } from 'react';

interface IconButtonProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'destructive';
}

export function IconButton({ icon: Icon, label, onClick, variant = 'default' }: IconButtonProps) {
  const colorClasses =
    variant === 'destructive' ? 'text-destructive hover:bg-red-50' : 'text-primary hover:bg-background';

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium transition duration-150 ${colorClasses}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

```bash
npx vitest run components/ui/IconButton.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 11: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 56/56 passing (53 existing + 3 new).

- [ ] **Step 12: Commit**

```bash
git add components/ui/Card.tsx components/ui/Button.tsx components/ui/Button.test.tsx components/ui/IconButton.tsx components/ui/IconButton.test.tsx package.json package-lock.json
git commit -m "feat: add Card, Button, and IconButton shared components"
```

---

### Task 3: Header Component (with working logout)

**Files:**
- Create: `components/ui/Header.tsx`, `components/ui/Header.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/logout` (existing route, no request body, clears the session cookie).
- Produces: `Header(): JSX.Element` — a Client Component with no props, consumed by `app/dashboard/page.tsx` and `app/expenses/page.tsx` in later tasks.

**Rationale:** This closes a real functional gap — there has been no logout button anywhere in the UI since the logout API route was built in Task 8 of the original v1 plan. It was always reachable only via `curl`.

- [ ] **Step 1: Write the failing test**

`components/ui/Header.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('renders nav links and a logout button', () => {
    render(<Header />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('calls the logout API and redirects to /login on click', async () => {
    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    );
    expect(pushMock).toHaveBeenCalledWith('/login');
    expect(refreshMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/ui/Header.test.tsx
```

Expected: FAIL — `./Header` module not found.

- [ ] **Step 3: Create `components/ui/Header.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/expenses', label: 'Expenses' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <span className="font-heading text-lg font-semibold text-foreground">Budget Buddy</span>
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium ${
                pathname === link.href ? 'text-primary' : 'text-muted hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm font-medium text-muted hover:text-destructive"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/ui/Header.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 58/58 passing.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Header.tsx components/ui/Header.test.tsx
git commit -m "feat: add Header component with working logout"
```

---

### Task 4: Count-Up Stat Animation

**Files:**
- Create: `lib/utils/countUp.ts`, `lib/utils/countUp.test.ts`, `components/ui/CountUpStat.tsx`

**Interfaces:**
- Produces:
  - `computeCountUpValue(elapsedMs: number, durationMs: number, target: number): number` — pure function, unit tested.
  - `CountUpStat({ value: number, prefix?: string }): JSX.Element` — Client Component wiring the pure function to `requestAnimationFrame`, consumed by `app/dashboard/page.tsx` in Task 6.

**Rationale:** The `requestAnimationFrame`-driven wiring itself is not unit tested — jsdom's timer/animation-frame behavior makes precise frame-by-frame testing unreliable and low-value, the same reasoning the original v1 plan used for not testing `middleware.ts` directly. The actual math (`computeCountUpValue`) is extracted into a pure function specifically so the part that *can* be deterministically tested, is.

- [ ] **Step 1: Write the failing test**

`lib/utils/countUp.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeCountUpValue } from './countUp';

describe('computeCountUpValue', () => {
  it('returns 0 before any time has elapsed', () => {
    expect(computeCountUpValue(0, 600, 100)).toBe(0);
  });

  it('returns the target once elapsed time reaches or exceeds the duration', () => {
    expect(computeCountUpValue(600, 600, 100)).toBe(100);
    expect(computeCountUpValue(1000, 600, 100)).toBe(100);
  });

  it('returns a value strictly between 0 and the target partway through', () => {
    const value = computeCountUpValue(300, 600, 100);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/utils/countUp.test.ts
```

Expected: FAIL — `./countUp` module not found.

- [ ] **Step 3: Create `lib/utils/countUp.ts`**

```ts
export function computeCountUpValue(elapsedMs: number, durationMs: number, target: number): number {
  if (elapsedMs >= durationMs) return target;
  if (elapsedMs <= 0) return 0;

  const progress = elapsedMs / durationMs;
  const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
  return target * eased;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/utils/countUp.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Create `components/ui/CountUpStat.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { computeCountUpValue } from '@/lib/utils/countUp';

const DURATION_MS = 600;

export function CountUpStat({ value, prefix = '$' }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    let frame: number;
    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      setDisplay(computeCountUpValue(elapsed, DURATION_MS, value));
      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <p className="font-heading text-3xl font-semibold text-foreground">
      {prefix}
      {display.toFixed(2)}
    </p>
  );
}
```

- [ ] **Step 6: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 61/61 passing.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/countUp.ts lib/utils/countUp.test.ts components/ui/CountUpStat.tsx
git commit -m "feat: add count-up stat animation utility and component"
```

---

### Task 5: Restyle Login & Signup Pages

**Files:**
- Modify: `app/login/page.tsx`, `app/signup/page.tsx`

**Interfaces:**
- Consumes: `Card` and `Button` from Task 2.

- [ ] **Step 1: Rewrite `app/login/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Rewrite `app/signup/page.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

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
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card>
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Create your account</h1>
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
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Already have an account?{' '}
          <a href="/login" className="text-primary underline">
            Log in
          </a>
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify via curl**

```bash
npm run dev &
sleep 4
curl -s http://localhost:3000/login | grep -o 'Log in' | head -1
curl -s http://localhost:3000/signup | grep -o 'Create your account'
kill %1
```

Expected: both greps find a match, confirming the pages still render their core text after the restyle.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/signup/page.tsx
git commit -m "style: restyle login and signup pages with Indigo Bento system"
```

---

### Task 6: Restyle Dashboard Page

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `Header` (Task 3), `Card` (Task 2), `CountUpStat` (Task 4).

- [ ] **Step 1: Rewrite `app/dashboard/page.tsx`**

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory, aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { CountUpStat } from '@/components/ui/CountUpStat';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // middleware.ts already guarantees `user` is non-null for this route;
  // this check exists only to satisfy TypeScript.
  if (!user) return null;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const expenses = await prisma.expense.findMany({
    where: { userId: user.userId, date: { gte: sixMonthsAgo } },
    include: { category: true },
  });

  const expensesForAggregation = expenses.map((e) => ({
    amount: Number(e.amount),
    date: e.date,
    category: e.category,
  }));

  const now = new Date();
  const currentMonthExpenses = expensesForAggregation.filter(
    (e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth()
  );

  const categoryTotals = aggregateByCategory(currentMonthExpenses);
  const monthlyTotals = aggregateByMonth(expensesForAggregation, 6);
  const totalThisMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Dashboard</h1>

        <Card className="mb-8">
          <p className="text-sm text-muted">Total spent this month</p>
          <CountUpStat value={totalThisMonth} />
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card hoverable>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </Card>
          <Card hoverable>
            <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
            <MonthlyTrendChart data={monthlyTotals} />
          </Card>
        </div>
      </main>
    </>
  );
}
```

Note: the old "View all expenses" text link is removed — `Header`'s "Expenses" nav link now covers that navigation, so keeping both would be redundant.

- [ ] **Step 2: Verify via curl (signup, then authenticated request)**

```bash
npm run dev &
sleep 4
curl -s -c /tmp/dash-redesign-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"dash-redesign-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"
curl -s -b /tmp/dash-redesign-cookies.txt http://localhost:3000/dashboard -o /tmp/dash-redesign.html \
  -w "dashboard status: %{http_code}\n"
grep -o 'Total spent this month' /tmp/dash-redesign.html
grep -o 'Spending by category' /tmp/dash-redesign.html
grep -o '6-month trend' /tmp/dash-redesign.html
grep -o 'Budget Buddy' /tmp/dash-redesign.html
grep -o 'Log out' /tmp/dash-redesign.html
rm -f /tmp/dash-redesign-cookies.txt /tmp/dash-redesign.html
kill %1
```

Expected: `200` for both requests, and all five greps find a match — confirms the page still renders its core content AND the new `Header` (logo + logout) is present.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "style: restyle dashboard page with Header, Card, and count-up stat"
```

---

### Task 7: Restyle Expenses Page (Filters, List, Form)

**Files:**
- Modify: `app/expenses/page.tsx`, `app/expenses/ExpensesClient.tsx`, `components/expenses/ExpenseForm.tsx`, `components/expenses/ExpenseFilters.tsx`

**Interfaces:**
- Consumes: `Header`, `Card`, `Button`, `IconButton` (Tasks 2-3).

- [ ] **Step 1: Modify `app/expenses/page.tsx`**

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from './ExpensesClient';
import { Header } from '@/components/ui/Header';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { categoryId?: string; from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });

  const where: { userId: string; categoryId?: string; date?: { gte?: Date; lte?: Date } } = {
    userId: user.userId,
  };
  if (searchParams.categoryId) where.categoryId = searchParams.categoryId;
  if (searchParams.from || searchParams.to) {
    where.date = {
      ...(searchParams.from ? { gte: new Date(searchParams.from) } : {}),
      ...(searchParams.to ? { lte: new Date(searchParams.to) } : {}),
    };
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  const serialized = expenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    description: e.description,
    date: e.date.toISOString(),
    category: { id: e.category.id, name: e.category.name, color: e.category.color },
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Expenses</h1>
        <ExpenseFilters categories={categories} />
        <ExpensesClient categories={categories} initialExpenses={serialized} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Modify `components/expenses/ExpenseFilters.tsx`**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function ExpenseFilters({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/expenses?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3 text-sm">
      <select
        value={searchParams.get('categoryId') ?? ''}
        onChange={(e) => updateFilter('categoryId', e.target.value)}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={searchParams.get('from') ?? ''}
        onChange={(e) => updateFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <input
        type="date"
        value={searchParams.get('to') ?? ''}
        onChange={(e) => updateFilter('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
```

- [ ] **Step 3: Modify `components/expenses/ExpenseForm.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';
import { Button } from '@/components/ui/Button';

interface ExpenseFormProps {
  categories: { id: string; name: string }[];
  initialValues?: { amount?: number; description?: string; categoryId?: string; date?: string };
  onSubmit: (data: CreateExpenseInput) => Promise<void>;
}

export function ExpenseForm({ categories, initialValues, onSubmit }: ExpenseFormProps) {
  const [amount, setAmount] = useState(initialValues?.amount?.toString() ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [date, setDate] = useState(initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      amount: Number(amount),
      description,
      categoryId,
      date: new Date(date).toISOString(),
    });
    setSubmitting(false);
  }

  const inputClasses =
    'rounded-xl border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm text-foreground">
        Amount
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Description
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClasses}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm text-foreground">
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClasses}
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run `ExpenseForm.test.tsx` to confirm the restyle didn't break it**

```bash
npx vitest run components/expenses/ExpenseForm.test.tsx
```

Expected: PASS (2 tests) — labels ("Amount", "Description", "Category", "Date") and button text ("Save"/"Saving…") are unchanged, only `className` values changed, so `getByLabelText`/`getByRole` still find the same elements.

- [ ] **Step 5: Modify `app/expenses/ExpensesClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';

interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  category: { id: string; name: string; color: string };
}

export function ExpensesClient({
  categories,
  initialExpenses,
}: {
  categories: { id: string; name: string; color: string }[];
  initialExpenses: Expense[];
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleCreate(data: CreateExpenseInput) {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save expense');
      return;
    }
    const created = await res.json();
    const category = categories.find((c) => c.id === created.categoryId)!;
    setExpenses((prev) => [{ ...created, amount: Number(created.amount), category }, ...prev]);
    setShowAddForm(false);
  }

  async function handleUpdate(id: string, data: CreateExpenseInput) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to save expense');
      return;
    }
    const category = categories.find((c) => c.id === data.categoryId)!;
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, amount: data.amount, description: data.description, date: data.date, category }
          : e
      )
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to delete expense');
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <Button onClick={() => setShowAddForm((v) => !v)} variant="secondary" className="mb-4">
        {showAddForm ? 'Cancel' : 'Add expense'}
      </Button>

      {showAddForm && (
        <Card className="mb-6">
          <ExpenseForm categories={categories} onSubmit={handleCreate} />
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {expenses.map((expense, index) =>
          editingId === expense.id ? (
            <li key={expense.id}>
              <Card>
                <ExpenseForm
                  categories={categories}
                  initialValues={{
                    amount: expense.amount,
                    description: expense.description,
                    categoryId: expense.category.id,
                    date: expense.date.slice(0, 10),
                  }}
                  onSubmit={(data) => handleUpdate(expense.id, data)}
                />
              </Card>
            </li>
          ) : (
            <li
              key={expense.id}
              className="animate-fade-slide-in motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
            >
              <Card className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{expense.description}</p>
                  <p className="text-muted">
                    {expense.category.name} · {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">${expense.amount.toFixed(2)}</span>
                  <IconButton icon={PencilIcon} label="Edit" onClick={() => setEditingId(expense.id)} />
                  <IconButton
                    icon={TrashIcon}
                    label="Delete"
                    variant="destructive"
                    onClick={() => handleDelete(expense.id)}
                  />
                </div>
              </Card>
            </li>
          )
        )}
        {expenses.length === 0 && <p className="text-sm text-muted">No expenses match these filters.</p>}
      </ul>
    </div>
  );
}
```

**Rationale:** The stagger delay is capped at `Math.min(index, 10) * 30`ms so a long expense list doesn't force the last row to wait several seconds to appear — everything past the 10th row animates in alongside it, matching the spec's "capped at the first ~10 rows" note.

- [ ] **Step 6: Verify via curl (signup, seed an expense, confirm rendering)**

```bash
npm run dev &
sleep 4
curl -s -c /tmp/exp-redesign-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"exp-redesign-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"
CATEGORY_ID=$(curl -s -b /tmp/exp-redesign-cookies.txt http://localhost:3000/api/categories | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s -b /tmp/exp-redesign-cookies.txt -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d "{\"amount\":15.00,\"description\":\"Redesign Verify\",\"categoryId\":\"$CATEGORY_ID\",\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}" \
  -o /dev/null -w "create status: %{http_code}\n"
curl -s -b /tmp/exp-redesign-cookies.txt http://localhost:3000/expenses -o /tmp/exp-redesign.html \
  -w "expenses page status: %{http_code}\n"
grep -o 'Redesign Verify' /tmp/exp-redesign.html
grep -o 'Add expense' /tmp/exp-redesign.html
grep -o 'Budget Buddy' /tmp/exp-redesign.html
rm -f /tmp/exp-redesign-cookies.txt /tmp/exp-redesign.html
kill %1
```

Expected: `200` for both requests, all three greps find a match.

- [ ] **Step 7: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 61/61 passing (unchanged count — no new tests in this task, just restyling).

- [ ] **Step 8: Commit**

```bash
git add app/expenses/page.tsx app/expenses/ExpensesClient.tsx components/expenses/ExpenseForm.tsx components/expenses/ExpenseFilters.tsx
git commit -m "style: restyle expenses page, filters, list, and form"
```

---

### Task 8: Restyle Chart Chrome Colors

**Files:**
- Modify: `components/charts/CategoryPieChart.tsx`, `components/charts/MonthlyTrendChart.tsx`

**Interfaces:**
- No new interfaces — same `CategoryTotal`/`MonthlyTotal` props as before, only internal styling changes.

- [ ] **Step 1: Modify `components/charts/CategoryPieChart.tsx`**

```tsx
'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CategoryTotal } from '@/lib/utils/expenseAggregation';

export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No expenses yet this month.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="categoryName" innerRadius={50} outerRadius={90}>
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => `$${value.toFixed(2)}`}
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E7FF', borderRadius: '0.75rem' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-3 text-sm text-foreground">
        {data.map((entry) => (
          <li key={entry.categoryId} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.categoryName}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Modify `components/charts/MonthlyTrendChart.tsx`**

```tsx
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MonthlyTotal } from '@/lib/utils/expenseAggregation';

export function MonthlyTrendChart({ data }: { data: MonthlyTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No spending history yet.</p>;
  }

  return (
    <div data-testid="monthly-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E0E7FF" />
          <XAxis dataKey="month" stroke="#64748B" tick={{ fill: '#64748B', fontSize: 12 }} />
          <YAxis stroke="#64748B" tick={{ fill: '#64748B', fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => `$${value.toFixed(2)}`}
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E7FF', borderRadius: '0.75rem' }}
          />
          <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Note: category slice colors (`fill={entry.color}`) are untouched — they come from each category's stored `color` field, which is user data, not a design-system token, exactly as the spec calls out.

- [ ] **Step 3: Run the chart tests to confirm the restyle didn't break them**

```bash
npx vitest run components/charts/CategoryPieChart.test.tsx components/charts/MonthlyTrendChart.test.tsx
```

Expected: PASS (4 tests total) — the tests assert on text content (`/no expenses yet/i`, category names) and `data-testid="monthly-trend-chart"`, none of which changed.

- [ ] **Step 4: Commit**

```bash
git add components/charts/CategoryPieChart.tsx components/charts/MonthlyTrendChart.tsx
git commit -m "style: restyle chart chrome colors to match Indigo Bento palette"
```

---

### Task 9: Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: 61/61 passing, pristine output.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either.

- [ ] **Step 3: Full manual smoke test across all four pages**

```bash
npm run dev &
sleep 4

echo "--- unauthenticated dashboard should redirect ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard

echo "--- signup ---"
curl -s -c /tmp/final-redesign-cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"final-redesign-$(date +%s)@example.com\",\"password\":\"longenough123\"}" \
  -o /dev/null -w "signup status: %{http_code}\n"

echo "--- dashboard (authenticated) ---"
curl -s -b /tmp/final-redesign-cookies.txt http://localhost:3000/dashboard -o /tmp/final-dash.html \
  -w "%{http_code}\n"
grep -o 'Budget Buddy' /tmp/final-dash.html
grep -o 'Log out' /tmp/final-dash.html
grep -o 'Total spent this month' /tmp/final-dash.html

echo "--- expenses (authenticated) ---"
curl -s -b /tmp/final-redesign-cookies.txt http://localhost:3000/expenses -o /tmp/final-exp.html \
  -w "%{http_code}\n"
grep -o 'Add expense' /tmp/final-exp.html

rm -f /tmp/final-redesign-cookies.txt /tmp/final-dash.html /tmp/final-exp.html
kill %1
```

Expected: unauthenticated dashboard returns a redirect (`307`/`308`), signup returns `201`, both authenticated page requests return `200` with all greps matching.

- [ ] **Step 4: Commit (if any fixes were needed) and push**

```bash
git push origin main
```

If Steps 1-3 all passed cleanly with no fixes needed, there's nothing new to commit here — just push whatever was committed in Tasks 1-8 if it hasn't been pushed yet.

---

## End of UI Redesign Pass

At this point: Budget Buddy has a consistent Indigo Bento visual identity across every
page, a working logout button (previously missing from the UI entirely), and a light
motion layer that respects `prefers-reduced-motion`. v1.1 (budgets), v1.2 (recurring
expenses), and v1.3 (CSV import/export) can now be built directly in this established
style. The Australian-standards scope (AUD formatting, GST tracking, WCAG 2.1 AA audit,
Privacy Act data-handling notes) and the PWA mobile pass come after those three feature
phases, each as its own spec → plan → build cycle.
