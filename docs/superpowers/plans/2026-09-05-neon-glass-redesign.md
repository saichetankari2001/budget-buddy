# Neon Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin Budget Buddy from the light "Indigo Bento" design to a dark "Neon Glass" system (glassmorphic cards, glowing violet/cyan accents, gradient text on stat numbers) with zero data, logic, or route behavior changes.

**Architecture:** Every existing color/font token in `tailwind.config.ts` keeps its name but gets a new dark-palette value, so the large majority of the app (every page that only ever used token classes like `bg-card`, `text-muted`, `border-border`) inherits the new look automatically with no per-file edits. Only files with **hardcoded** colors that bypass the token system need direct changes — there are exactly 5, found by grepping the whole app for literal hex values and hardcoded Tailwind color utilities (`bg-white`, `to-indigo-500`, etc.) before writing this plan.

**Tech Stack:** Next.js 14, Tailwind CSS, `next/font/google` (Inter, JetBrains Mono), Recharts (chart inline styles, which can't use Tailwind classes). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-neon-glass-redesign-design.md`

## Global Constraints

- Dark-only palette, no light/dark toggle: `background:#05050f`, `card` (glass surface fill): `rgba(255,255,255,0.06)`, `border` (glow-tinted): `rgba(139,92,246,0.35)`, `foreground:#e5e7ff`, `muted:#94a3b8`, `primary:#8b5cf6` (violet-500), `primary-hover:#a78bfa` (violet-400 — LIGHTER for hover, since this is a dark background), `accent:#22d3ee` (cyan-400), `destructive:#f87171` (red-400), new token `success:#34d399` (emerald-400).
- Typography: Inter for both heading and body font families (single-family system), plus a new `font-mono` token using JetBrains Mono, applied specifically to rendered money amounts and dates.
- Glass card treatment: `bg-card` (now translucent) + `backdrop-blur-xl` + `border border-border` + a soft violet glow box-shadow, replacing the current plain `shadow-sm`.
- Every animation/hover-motion addition must have a `motion-reduce:` guard — no exceptions. `components/ui/Card.tsx`'s existing `motion-reduce:hover:scale-100` is the reference pattern.
- The full Vitest suite (137 tests) and full Playwright suite (8 tests, including all 7 axe-core WCAG 2.1 AA accessibility tests) must stay green after every task. The accessibility suite is the real acceptance test for the new palette's contrast — not a subjective visual check.
- Work happens directly on `main`. No worktree, no feature branch. Push after every task.
- No new npm dependencies — everything here is Tailwind utilities, plain CSS, and Recharts' existing inline-style props.

---

### Task 1: Design tokens, fonts, and typography

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: the token names every later task and every untouched page relies on — `bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted`, `text-primary`, `text-primary-hover`, `bg-primary`, `text-accent`, `bg-accent`, `text-destructive`, `bg-destructive`, `text-success`, `bg-success`, `font-heading`, `font-sans`, `font-mono`.

- [ ] **Step 1: Replace the color palette in `tailwind.config.ts`**

Current file (read fresh — confirmed content as of this plan):

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

Replace it with:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#8b5cf6', hover: '#a78bfa' },
        accent: '#22d3ee',
        background: '#05050f',
        card: 'rgba(255,255,255,0.06)',
        foreground: '#e5e7ff',
        muted: '#94a3b8',
        border: 'rgba(139,92,246,0.35)',
        destructive: '#f87171',
        success: '#34d399',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
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

Note: `primary.hover` is now **lighter** than `primary` (`#a78bfa` vs `#8b5cf6`) — correct for a dark background, where hovering should brighten, not darken. This is a deliberate flip from the old light-theme convention where hover was darker.

- [ ] **Step 2: Swap fonts in `app/layout.tsx`**

Current file (read fresh):

```tsx
import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import { Footer } from '@/components/ui/Footer';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
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
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
```

Replace with:

```tsx
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Footer } from '@/components/ui/Footer';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const interBody = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interBody.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
```

(Two `Inter` instances with different CSS variable names is deliberate and matches the existing two-variable pattern — `--font-heading` and `--font-body` stay as separate variables so `font-heading`/`font-sans` Tailwind classes keep working unchanged everywhere they're already used, even though both now resolve to the same font family.)

- [ ] **Step 3: Verify `app/globals.css` needs no change**

Run: `cat app/globals.css`
Expected: still exactly the 3 `@tailwind` directives (`base`, `components`, `utilities`) with nothing else — confirmed during planning. If it has drifted from that, stop and report rather than assuming — do not add anything to it as part of this task.

- [ ] **Step 4: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: 137/137 Vitest tests pass, typecheck clean, lint clean. This task only changes config/tokens, so no test should need updating.

- [ ] **Step 5: Commit and push**

```bash
git add tailwind.config.ts app/layout.tsx
git commit -m "feat: switch to Neon Glass dark color palette and Inter/JetBrains Mono fonts"
git push
```

---

### Task 2: Shared UI components — glass surfaces and hardcoded-color fixes

**Files:**
- Modify: `components/ui/Card.tsx`
- Modify: `components/ui/Header.tsx`
- Modify: `components/ui/Button.tsx`
- Modify: `components/ui/IconButton.tsx`
- Modify: `components/ui/CountUpStat.tsx`
- Modify: `components/ui/BudgetProgress.tsx`

**Interfaces:**
- Consumes: the token names from Task 1 (`bg-card`, `border-border`, `bg-primary`, `text-primary-hover`, `font-mono`, etc.) — Task 1 must be complete and pushed before this task starts.
- Produces: no prop or behavior changes to any of these components — every existing consumer (pages, other components) needs zero changes as a result of this task.

- [ ] **Step 1: Give `Card` the glass treatment**

Current file (read fresh):

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

Replace the returned `<div>`'s className with the glass treatment — `backdrop-blur-xl` for the frosted-glass effect, and a soft violet glow shadow instead of the old plain `shadow-sm`:

```tsx
import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ hoverable = false, className = '', children, ...rest }: CardProps) {
  const hoverClasses = hoverable
    ? 'transition duration-200 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(139,92,246,0.25)] motion-reduce:hover:scale-100'
    : '';

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-6 shadow-[0_0_20px_rgba(139,92,246,0.12)] backdrop-blur-xl ${hoverClasses} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Give `Header` the same glass treatment**

Current file (read fresh):

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/budgets', label: 'Budgets' },
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
                pathname === link.href ? 'text-primary-hover' : 'text-muted hover:text-foreground'
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

Change only the `<header>` element's className (everything else — nav logic, links, logout — is unchanged):

```tsx
  return (
    <header className="border-b border-border bg-card backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
```

- [ ] **Step 3: Fix `Button`'s hardcoded colors**

Current file (read fresh):

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

`to-indigo-500` (a hardcoded Tailwind color, not a token) and the glow shadow's `rgba(99,102,241,...)` (the OLD primary's RGB values) both need updating to match the new primary. `bg-white` on the secondary variant needs to become a glass surface. `hover:bg-red-700` is a hardcoded Tailwind red that no longer relates to the new `destructive` token at all. Replace the `VARIANT_CLASSES` object:

```tsx
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-accent text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]',
  secondary: 'bg-card text-foreground border border-border backdrop-blur-xl hover:bg-white/10',
  destructive: 'bg-destructive text-white hover:shadow-[0_0_20px_rgba(248,113,113,0.4)]',
};
```

(Primary's gradient now goes violet → cyan, matching the mockup's gradient-text direction, instead of violet → a hardcoded indigo. Destructive keeps a flat `bg-destructive` fill but gains a matching glow on hover instead of darkening to a hardcoded red that doesn't track the token.)

- [ ] **Step 4: Fix `IconButton`'s hardcoded hover colors**

Current file (read fresh):

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
      className={`flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition duration-150 ${colorClasses}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
```

`hover:bg-red-50` (an almost-white red tint) is illegible/wrong on a near-black background, and `hover:bg-background` now means "hover to the same near-black page background," which reads as no visible hover state at all. Both need to become a translucent white overlay instead — a standard dark-UI hover pattern that works regardless of the exact background underneath:

```tsx
  const colorClasses =
    variant === 'destructive' ? 'text-destructive hover:bg-white/5' : 'text-primary hover:bg-white/5';
```

- [ ] **Step 5: Add gradient text + mono font to `CountUpStat`**

Current file (read fresh):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { computeCountUpValue } from '@/lib/utils/countUp';
import { formatCurrency } from '@/lib/utils/currency';

const DURATION_MS = 600;

export function CountUpStat({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
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
      {formatCurrency(display)}
    </p>
  );
}
```

This is exactly the "large stat number" the spec calls for gradient text on, and it displays a money amount, so it also gets `font-mono`. Only the returned JSX changes — none of the counting logic:

```tsx
  return (
    <p className="bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
      {formatCurrency(display)}
    </p>
  );
```

- [ ] **Step 6: Add mono font to money amounts in `BudgetProgress`**

Current file (read fresh):

```tsx
import { formatCurrency } from '@/lib/utils/currency';

export interface BudgetProgressItem {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
}

export function BudgetProgress({ items }: { items: BudgetProgressItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">No budgets set yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const percent = Math.min((item.spent / item.limit) * 100, 100);
        const overBudget = item.spent > item.limit;

        return (
          <li key={item.categoryId}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{item.categoryName}</span>
              <span className={overBudget ? 'font-medium text-destructive' : 'text-muted'}>
                {formatCurrency(item.spent)} / {formatCurrency(item.limit)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overBudget ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            {overBudget && (
              <p className="mt-1 text-xs text-destructive">
                {formatCurrency(item.spent - item.limit)} over budget
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

Add `font-mono` to the two `<span>`/`<p>` elements that render money amounts (the category name stays in the regular font — only the numbers get mono):

```tsx
              <span className={`font-mono ${overBudget ? 'font-medium text-destructive' : 'text-muted'}`}>
                {formatCurrency(item.spent)} / {formatCurrency(item.limit)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overBudget ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            {overBudget && (
              <p className="mt-1 font-mono text-xs text-destructive">
                {formatCurrency(item.spent - item.limit)} over budget
              </p>
            )}
```

(Only those two elements' className changes — the rest of the file, including the `overBudget`/`percent` logic and the progress bar div, is unchanged.)

- [ ] **Step 7: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: 137/137 Vitest tests pass (Button.test.tsx, IconButton.test.tsx, Header.test.tsx, BudgetProgress.test.tsx all assert behavior via testing-library queries, not exact class strings, so none should need edits — if any fail, read the failure before assuming it's unrelated). Typecheck and lint clean.

- [ ] **Step 8: Commit and push**

```bash
git add components/ui/Card.tsx components/ui/Header.tsx components/ui/Button.tsx components/ui/IconButton.tsx components/ui/CountUpStat.tsx components/ui/BudgetProgress.tsx
git commit -m "feat: apply Neon Glass styling to shared UI components"
git push
```

---

### Task 3: Chart colors

**Files:**
- Modify: `components/charts/CategoryPieChart.tsx`
- Modify: `components/charts/MonthlyTrendChart.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (Recharts' `contentStyle`/`stroke` props take literal CSS values, not Tailwind classes, so these can't reference the token system directly — the literal hex/rgba values below are chosen to match Task 1's token values exactly).
- Produces: no prop or data changes — `CategoryPieChart`'s and `MonthlyTrendChart`'s props (`data: CategoryTotal[]` / `data: MonthlyTotal[]`) are unchanged.

- [ ] **Step 1: Update `CategoryPieChart`'s tooltip**

Current file (read fresh):

```tsx
'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CategoryTotal } from '@/lib/utils/expenseAggregation';
import { formatCurrency } from '@/lib/utils/currency';

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
            formatter={(value: number) => formatCurrency(value)}
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

Per-category colors (`entry.color`) are user-owned data (chosen when a category was created) — out of scope, unchanged. Only the tooltip's hardcoded light-mode `contentStyle` changes. Recharts renders tooltip text in black by default, which would be invisible on a dark background, so `itemStyle`/`labelStyle` must also be set explicitly — this is a real bug to avoid, not an optional polish step:

```tsx
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: '#13111f',
              borderColor: 'rgba(139,92,246,0.35)',
              borderRadius: '0.75rem',
            }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
```

- [ ] **Step 2: Update `MonthlyTrendChart`'s axis, grid, line, and tooltip colors**

Current file (read fresh):

```tsx
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MonthlyTotal } from '@/lib/utils/expenseAggregation';
import { formatCurrency } from '@/lib/utils/currency';

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
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E7FF', borderRadius: '0.75rem' }}
          />
          <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Replace every hardcoded color — grid/axis lines move to the new border/muted values, the line moves to the new primary, and the tooltip gets the same fix (and same `itemStyle`/`labelStyle` text-color addition) as `CategoryPieChart`:

```tsx
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.35)" />
          <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: '#13111f',
              borderColor: 'rgba(139,92,246,0.35)',
              borderRadius: '0.75rem',
            }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
          <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} dot />
        </LineChart>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: `CategoryPieChart.test.tsx` and `MonthlyTrendChart.test.tsx` (and all other 135 tests) still pass — these tests assert on rendered data (labels, values), not exact color strings, so should be unaffected. If either fails, read why before assuming it's unrelated flakiness.

- [ ] **Step 4: Commit and push**

```bash
git add components/charts/CategoryPieChart.tsx components/charts/MonthlyTrendChart.tsx
git commit -m "feat: update chart colors for Neon Glass dark theme"
git push
```

---

### Task 4: Expenses page — remaining hardcoded colors and mono font on money/dates

**Files:**
- Modify: `app/expenses/ExpensesClient.tsx`

**Interfaces:**
- Consumes: nothing new — this component's props (`categories`, `initialExpenses`) are unchanged.
- Produces: no changes to any exported function or prop shape.

- [ ] **Step 1: Fix the two hardcoded `bg-white` pseudo-buttons**

Current relevant lines (read fresh, full file confirmed at planning time — only these two lines and the money/date display below need changes; every other line in this ~260-line file is unchanged):

```tsx
        <a
          href="/api/expenses/export"
          className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition duration-200 hover:bg-background"
        >
          Export CSV
        </a>
        <label className="cursor-pointer rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition duration-200 hover:bg-background">
          Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
```

`bg-white` is a literal white fill that would look like a bright rectangle on the new dark background — completely inconsistent with every other secondary-style surface in the app, which now uses the glass `bg-card` treatment. `hover:bg-background` (hovering to the near-black page color) also no longer reads as a visible hover state. Replace both:

```tsx
        <a
          href="/api/expenses/export"
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground backdrop-blur-xl transition duration-200 hover:bg-white/10"
        >
          Export CSV
        </a>
        <label className="cursor-pointer rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground backdrop-blur-xl transition duration-200 hover:bg-white/10">
          Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
```

- [ ] **Step 2: Add mono font to the displayed amount and date**

Current relevant lines (inside the expense list item, read fresh):

```tsx
                  <p className="text-muted">
                    {expense.category.name} · {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">{formatCurrency(expense.amount)}</span>
```

The category name is prose, but the date after the `·` and the money amount are both data values the spec calls out for mono. Wrap only the date portion in its own `<span>` so the category name keeps the regular font:

```tsx
                  <p className="text-muted">
                    {expense.category.name} · <span className="font-mono">{new Date(expense.date).toLocaleDateString()}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-foreground">{formatCurrency(expense.amount)}</span>
```

- [ ] **Step 3: Check for an existing test file and run the full suite**

Run: `ls app/expenses/*.test.tsx 2>/dev/null; npm test -- --run && npm run typecheck && npm run lint`
Expected: if an `ExpensesClient.test.tsx` exists, it must still pass (it would assert behavior via testing-library queries, not class strings). All 137 Vitest tests pass either way, typecheck and lint clean.

- [ ] **Step 4: Commit and push**

```bash
git add app/expenses/ExpensesClient.tsx
git commit -m "feat: apply Neon Glass styling to the expenses page's remaining hardcoded colors"
git push
```

---

### Task 5: Final whole-app verification

**Files:** none modified — this task is verification only, across every page, since Tasks 1-4 changed shared tokens that every page (including ones with zero direct edits) inherits.

**Interfaces:** N/A — no code changes.

- [ ] **Step 1: Run the full automated suite one more time from a clean build**

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 1
lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
npm test -- --run
npm run typecheck
npm run lint
rm -rf .next
CI=true npm run build
CI=true npm run test:e2e
```

Expected: 137/137 Vitest tests, clean typecheck, clean lint, a clean production build, and **all 8 Playwright tests passing — including all 7 axe-core WCAG 2.1 AA accessibility tests** covering signup, login, dashboard, expenses, expenses-with-form, budgets, and privacy. This is the real, non-negotiable acceptance gate for every color choice made across all four prior tasks. If any accessibility test fails, that is a contrast bug in the new palette to fix — not a test to weaken or skip.

- [ ] **Step 2: Live visual check of every page, including the ones with zero direct code changes**

Using the Playwright MCP browser tools (or equivalent), sign up a fresh test account and navigate to, and screenshot, each of: `/login`, `/signup`, `/dashboard`, `/expenses` (including opening the Add Expense form and the date-filter row), `/budgets`, `/privacy`, `/offline` (simulate offline mode). `login`, `signup`, `budgets`, `privacy`, `offline`, plus the `Footer` and `DateField` components received **no direct code changes** in this plan — they must be confirmed to render correctly purely from Task 1's token replacement. If any of them still show light-theme colors or broken contrast, that is a real gap this plan missed, not something to wave through.

Expected: every page shows the dark background, glass cards with visible blur and a soft glow border, violet/cyan accents, and legible text — no leftover white rectangles, no invisible dark-on-dark text, no light-mode artifacts anywhere.

- [ ] **Step 3: Clean up any leftover test data**

If Step 2's live check ran against the production database (not just `localhost`), delete the throwaway signup account it created:

```bash
node -e "
import('@prisma/client').then(async ({ PrismaClient }) => {
  const p = new PrismaClient();
  const r = await p.user.deleteMany({ where: { email: { contains: 'REPLACE_WITH_THE_TEST_EMAIL_USED' } } });
  console.log('deleted:', r.count);
  await p.\$disconnect();
});
"
```

Replace `REPLACE_WITH_THE_TEST_EMAIL_USED` with the actual email (or a shared substring, e.g. a timestamp prefix) used in Step 2 before running. Skip this step entirely if Step 2's check ran only against a local dev server.

- [ ] **Step 4: Report completion**

No commit needed for this task (verification only) unless Step 2 surfaces a real bug — if it does, fix it, add it as a follow-up step here, and re-run Steps 1-2 before considering this task, and the whole plan, done.
