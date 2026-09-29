# Futuristic Liquid-Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Budget Buddy's visual layer into a futuristic "liquid glass" aesthetic (depth, motion, two scoped WebGL accents, a new animated cash-flow chart) plus a scoped realtime backend addition (live sync via Ably), without changing any existing schema, validation, business logic, or response shape.

**Architecture:** Additive Tailwind tokens + a small set of reusable glass/motion primitives (`GlassPanel`, `AmbientBlobs`) consumed by every page; two Three.js accents behind a single fallback-handling wrapper (`WebGLAccent`); a fire-and-forget Ably publish added to five existing write paths, paired with a client hook that re-triggers each page's existing data-refresh mechanism.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Framer Motion (new), Three.js + @react-three/fiber + @react-three/drei (new), Ably (new), Recharts (existing), Vitest + Testing Library, Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-09-29-futuristic-glass-redesign-design.md`

## Global Constraints

- No Prisma schema changes. `prisma/schema.prisma` is untouched by this plan.
- No changes to any existing endpoint's validation, business logic, or response shape, except: each of `addBill`, `markBillPaid` (`lib/bills/actions.ts`), `addIncomeSource`, `logIncomeEntry` (`lib/income/actions.ts`), `updateCycleAmount` (`lib/moneyCycle/actions.ts`), and `POST /api/cycles` (`app/api/cycles/route.ts`) gains exactly one new line — an `await publishCycleUpdate(userId)` call after its existing write succeeds. Nothing else in these files changes.
- Existing design tokens (`primary`, `accent`, `background`, `card`, `foreground`, `muted`, `border`, `destructive`, `success`) keep their current values and meaning. New tokens are added alongside them, never replacing them.
- `card`, `border`, and the new `glass-1`/`glass-2`/`glass-3`/`border-glass` tokens are raw `rgba()` strings. Tailwind's `/<opacity>` modifier cannot decompose a raw `rgba()` string — `bg-card/50` silently compiles to a literal 50%-opaque white instead of scaling the token's own alpha (this has already caused a real WCAG contrast bug in this codebase, fixed in `CashFlowClient.tsx`/`ProjectionList.tsx` via `bg-white/[0.03]`). Use these tokens bare (`bg-glass-2`), never with a `/<number>` suffix.
- New dependencies: `framer-motion`, `three`, `@react-three/fiber`, `@react-three/drei`, `ably`. WebGL libraries are dynamically imported with `next/dynamic({ ssr: false })` so only the dashboard, login, and signup bundles include Three.js.
- WebGL accents are scoped to exactly two pages (dashboard hero orb; login/signup hero scene) — no other page gets a WebGL element. All three fallback paths (`prefers-reduced-motion: reduce`, narrow viewport, WebGL error) render the same kind of static CSS-gradient fallback, and the rest of the page must render normally regardless of which path triggers.
- All 8 existing pages (`dashboard`, `budgets`, `cashflow`, `expenses`, `login`, `signup`, `offline`, `privacy`) move to the extended glass system. `offline` and `privacy` are restyle-only — no new motion, no WebGL.
- Every custom animation (tilt, drift, spring transitions, chart draw-in) respects `prefers-reduced-motion: reduce` with a real, tested fallback — not just an untested CSS media query.
- Custom animations use `transform`/`opacity` only — never `width`/`height`/`top`/`left`.
- `ABLY_API_KEY` is a server-only secret (same convention as `CRON_SECRET`, `GEMINI_API_KEY`) — only a short-lived, per-user-scoped client token ever reaches the browser. A token minted for one user must never grant access to another user's realtime channel — this needs its own explicit test.
- WCAG 2.1 AA must be maintained on every touched page (axe-core, CI-enforced) — this does not lower for this plan.
- Work happens directly on `main`, no worktree/feature branch. Push to GitHub after each task. Every subagent's report gets independently re-verified (diff review, real test re-runs, real push-sync checks, live browser verification for anything mocked tests can't prove) before being trusted — standing practice on this project.
- Ably's free tier (6M messages/month, 200 concurrent connections) must not be exceeded by anything this plan builds — no code should require a paid tier.

---

### Task 1: Dependencies and Design Tokens

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.ts`
- Modify: `vitest.setup.ts`

**Interfaces:**
- Produces: Tailwind utilities `bg-glass-1`, `bg-glass-2`, `bg-glass-3`, `border-border-glass`, `backdrop-blur-glass`, `backdrop-blur-hero`, `backdrop-saturate-180`, `shadow-depth` — every later task's styling depends on these exact class names.
- Produces: a `window.matchMedia` polyfill in the Vitest environment (default `matches: false`) — every later task's tests that render a Framer Motion component depend on this existing, since `useReducedMotion()` calls `window.matchMedia` on every render and jsdom does not implement it.

- [ ] **Step 1: Install the new dependencies**

Run:
```bash
npm install framer-motion three @react-three/fiber @react-three/drei ably
npm install --save-dev @types/three
```

- [ ] **Step 2: Verify `package.json` picked up the new dependencies**

Run: `cat package.json`
Expected: `framer-motion`, `three`, `@react-three/fiber`, `@react-three/drei`, `ably` appear under `dependencies`; `@types/three` appears under `devDependencies`.

- [ ] **Step 3: Extend `tailwind.config.ts` with the new tokens**

Replace the full file with:

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
        // Liquid-glass redesign (2026-09-29): additional glass elevations + a neutral glass edge,
        // layered alongside the tokens above (which keep their current values/meaning unchanged).
        // These are raw rgba() strings, exactly like `card`/`border` above — Tailwind's `/<opacity>`
        // modifier cannot decompose a raw rgba() string (see the documented bg-card/50 bug in
        // CashFlowClient.tsx/ProjectionList.tsx), so use these bare, never with a `/<number>` suffix.
        'glass-1': 'rgba(255,255,255,0.06)',
        'glass-2': 'rgba(255,255,255,0.1)',
        'glass-3': 'rgba(255,255,255,0.15)',
        'border-glass': 'rgba(255,255,255,0.18)',
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
      backdropBlur: {
        glass: '24px',
        hero: '40px',
      },
      backdropSaturate: {
        180: '1.8',
      },
      boxShadow: {
        depth: '0 8px 32px rgba(0,0,0,0.28)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Add the `matchMedia` polyfill to `vitest.setup.ts`**

Replace the full file with:

```ts
import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for Recharts compatibility with jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill matchMedia: jsdom doesn't implement it, but Framer Motion's useReducedMotion() (used
// throughout the liquid-glass redesign) calls window.matchMedia('(prefers-reduced-motion: reduce)')
// on every render, and the WebGLAccent wrapper calls it for its own viewport check. Defaults to
// "not reduced, not narrow" (matches: false); individual tests override this to exercise those paths.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
```

- [ ] **Step 5: Run typecheck and the existing test suite to confirm nothing broke**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all 297 existing tests still pass (no new tests yet — this step only confirms the new tokens/polyfill didn't break anything existing).

- [ ] **Step 6: Commit and push**

```bash
git add package.json package-lock.json tailwind.config.ts vitest.setup.ts
git commit -m "chore: add liquid-glass redesign dependencies and design tokens"
git push
```

---

### Task 2: Shared Glass/Motion Primitives

**Files:**
- Create: `components/ui/GlassPanel.tsx`
- Create: `components/ui/GlassPanel.test.tsx`
- Create: `components/ui/AmbientBlobs.tsx`
- Create: `components/ui/AmbientBlobs.test.tsx`

**Interfaces:**
- Consumes: Tailwind tokens from Task 1 (`bg-glass-1/2/3`, `border-border-glass`, `backdrop-blur-glass`, `backdrop-saturate-180`, `shadow-depth`).
- Produces: `GlassPanel` — `function GlassPanel({ elevation?: 1 | 2 | 3, hoverable?: boolean, className?: string, children: ReactNode, ...HTMLAttributes<HTMLDivElement> }): JSX.Element`. Every later page-restyling task (5, 6, 7, 8) replaces the existing `Card` component with `GlassPanel` and depends on this exact prop signature.
- Produces: `AmbientBlobs` — `function AmbientBlobs({ className?: string }): JSX.Element`. Tasks 6 and 7 render this behind their hero sections.

- [ ] **Step 1: Write `GlassPanel.tsx`**

```tsx
'use client';

import { HTMLAttributes, ReactNode, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

type GlassElevation = 1 | 2 | 3;

interface GlassPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  elevation?: GlassElevation;
  hoverable?: boolean;
  children: ReactNode;
}

const ELEVATION_BG: Record<GlassElevation, string> = {
  1: 'bg-glass-1',
  2: 'bg-glass-2',
  3: 'bg-glass-3',
};

const TILT_RANGE_DEG = 4;

/**
 * The shared glass surface for the liquid-glass redesign — a drop-in replacement for the existing
 * `Card` component, adding depth (blur/saturate/shadow), a subtle pointer-tracked 3D tilt on hover,
 * and a spring entrance. Every effect above the static glass look is disabled under
 * prefers-reduced-motion, matching this app's existing accessibility bar.
 */
export function GlassPanel({
  elevation = 1,
  hoverable = false,
  className = '',
  children,
  ...rest
}: GlassPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const springX = useSpring(pointerX, { damping: 20, stiffness: 90 });
  const springY = useSpring(pointerY, { damping: 20, stiffness: 90 });
  const rotateX = useTransform(springY, [0, 1], [TILT_RANGE_DEG, -TILT_RANGE_DEG]);
  const rotateY = useTransform(springX, [0, 1], [-TILT_RANGE_DEG, TILT_RANGE_DEG]);

  const tiltEnabled = hoverable && !prefersReducedMotion;

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!tiltEnabled || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  }

  function handlePointerLeave() {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      data-testid="glass-panel"
      className={`rounded-2xl border border-border-glass ${ELEVATION_BG[elevation]} p-6 shadow-depth backdrop-blur-glass backdrop-saturate-180 ${className}`}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      whileTap={tiltEnabled ? { scale: 0.97 } : undefined}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 90 }}
      style={tiltEnabled ? { rotateX, rotateY, transformPerspective: 800 } : undefined}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Write `GlassPanel.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassPanel } from './GlassPanel';

describe('GlassPanel', () => {
  it('renders its children', () => {
    render(<GlassPanel>Hello</GlassPanel>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies the requested elevation background class', () => {
    render(<GlassPanel elevation={3}>Content</GlassPanel>);
    expect(screen.getByTestId('glass-panel')).toHaveClass('bg-glass-3');
  });

  it('defaults to elevation 1', () => {
    render(<GlassPanel>Content</GlassPanel>);
    expect(screen.getByTestId('glass-panel')).toHaveClass('bg-glass-1');
  });

  it('renders without crashing when prefers-reduced-motion is set', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    render(
      <GlassPanel hoverable>Reduced motion content</GlassPanel>
    );
    expect(screen.getByText('Reduced motion content')).toBeInTheDocument();

    window.matchMedia = original;
  });
});
```

- [ ] **Step 3: Run the new GlassPanel tests**

Run: `npx vitest run components/ui/GlassPanel.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 4: Write `AmbientBlobs.tsx`**

```tsx
'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface Blob {
  color: string;
  size: number;
  top: string;
  left: string;
  duration: number;
}

const BLOBS: Blob[] = [
  { color: 'rgba(139,92,246,0.35)', size: 420, top: '-10%', left: '5%', duration: 22 },
  { color: 'rgba(34,211,238,0.25)', size: 360, top: '30%', left: '60%', duration: 26 },
  { color: 'rgba(139,92,246,0.2)', size: 300, top: '65%', left: '15%', duration: 30 },
];

/**
 * A decorative, slowly-drifting blurred gradient background for hero sections. Purely CSS/Framer
 * Motion (no WebGL) — this is the "liquid" ambient layer every full-treatment page gets, distinct
 * from the two scoped WebGL accents (dashboard orb, login/signup hero scene). Always aria-hidden:
 * it carries no information, only mood.
 */
export function AmbientBlobs({ className = '' }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      data-testid="ambient-blobs"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      {BLOBS.map((blob, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full blur-3xl"
          style={{ width: blob.size, height: blob.size, top: blob.top, left: blob.left, background: blob.color }}
          animate={prefersReducedMotion ? undefined : { x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
          transition={prefersReducedMotion ? undefined : { duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write `AmbientBlobs.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AmbientBlobs } from './AmbientBlobs';

describe('AmbientBlobs', () => {
  it('renders as a decorative, non-interactive background', () => {
    render(<AmbientBlobs />);
    const el = screen.getByTestId('ambient-blobs');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('pointer-events-none');
  });

  it('renders without crashing when prefers-reduced-motion is set', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    render(<AmbientBlobs />);
    expect(screen.getByTestId('ambient-blobs')).toBeInTheDocument();

    window.matchMedia = original;
  });
});
```

- [ ] **Step 6: Run the new AmbientBlobs tests, then the full suite**

Run: `npx vitest run components/ui/AmbientBlobs.test.tsx && npm test`
Expected: 2 new tests pass; full suite (303 tests) passes; `npm run typecheck` clean.

- [ ] **Step 7: Commit and push**

```bash
git add components/ui/GlassPanel.tsx components/ui/GlassPanel.test.tsx components/ui/AmbientBlobs.tsx components/ui/AmbientBlobs.test.tsx
git commit -m "feat: add GlassPanel and AmbientBlobs liquid-glass primitives"
git push
```

---

### Task 3: Backend Live-Sync (Ably)

**Files:**
- Create: `lib/realtime/publish.ts`
- Create: `lib/realtime/publish.test.ts`
- Create: `app/api/realtime/token/route.ts`
- Create: `app/api/realtime/token/route.test.ts`
- Modify: `lib/bills/actions.ts` (`addBill`, `markBillPaid`)
- Modify: `lib/income/actions.ts` (`addIncomeSource`, `logIncomeEntry`)
- Modify: `lib/moneyCycle/actions.ts` (`updateCycleAmount`)
- Modify: `app/api/cycles/route.ts` (`POST`)
- Modify: `lib/bills/actions.test.ts`, `lib/income/actions.test.ts`, `lib/moneyCycle/actions.test.ts`, `app/api/cycles/route.test.ts`

**Interfaces:**
- Produces: `channelNameForUser(userId: string): string` and `publishCycleUpdate(userId: string): Promise<void>` from `lib/realtime/publish.ts` — Task 4's client hook subscribes to the same channel-name shape this function defines (`user:{userId}:cycle-updates`), and every write path below calls `publishCycleUpdate`.
- Produces: `GET /api/realtime/token` — returns an Ably `TokenRequest` JSON object scoped to the caller's own channel with `['subscribe']` capability only. Task 4's hook calls this via Ably's `authUrl` option.

**Important note on why this exists and why it's designed this way:** the dashboard orb and the new cash-flow chart (Task 5, 6) should update live when data changes elsewhere (another tab, the AI coach chat). Raw Redis pub/sub can't do this cleanly on Vercel's serverless model — nothing would hold an open subscribing connection to relay messages onward. Ably (like Pusher) solves the actual shape of the problem: the serverless backend does a simple REST call to publish; Ably's own infrastructure relays it to the browser. `chat tool handlers` in `app/api/cycles/chat/route.ts` are thin wrappers that call the exact same `addBill`/`markBillPaid`/`addIncomeSource`/`logIncomeEntry`/`updateCycleAmount` functions modified below — putting the publish call inside those shared functions means both the REST routes and the chat path get live sync automatically, with no separate change needed in the chat route file.

- [ ] **Step 1: Write `lib/realtime/publish.ts`**

```ts
import Ably from 'ably';

let restClient: Ably.Rest | null = null;

function getClient(): Ably.Rest {
  if (!restClient) {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('ABLY_API_KEY is not configured');
    }
    restClient = new Ably.Rest(apiKey);
  }
  return restClient;
}

/**
 * The one place that defines a user's private realtime channel name. Both this file's publisher and
 * the token route (app/api/realtime/token/route.ts) must agree on this exact string, so it's exported
 * rather than duplicated in both places.
 */
export function channelNameForUser(userId: string): string {
  return `user:${userId}:cycle-updates`;
}

/**
 * Notifies any open tab for this user that their cash-flow data changed, so the dashboard orb and
 * cashflow chart can re-fetch and animate to the new values. Never throws: a failed publish is
 * logged and swallowed — live sync to *other* tabs/devices is additive, not load-bearing, since the
 * caller's own mutation has already succeeded and its own response already reflects the change.
 * Callers should still `await` this (rather than leave the promise dangling) so the publish attempt
 * actually completes before a serverless function's invocation ends.
 */
export async function publishCycleUpdate(userId: string): Promise<void> {
  try {
    const channel = getClient().channels.get(channelNameForUser(userId));
    await channel.publish('cycle-updated', {});
  } catch (error) {
    console.error(`Failed to publish cycle-updated event for user ${userId}:`, error);
  }
}
```

- [ ] **Step 2: Write `lib/realtime/publish.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const publishMock = vi.fn();
const channelsGetMock = vi.fn(() => ({ publish: publishMock }));

vi.mock('ably', () => ({
  default: {
    Rest: vi.fn().mockImplementation(() => ({
      channels: { get: channelsGetMock },
    })),
  },
}));

import { publishCycleUpdate, channelNameForUser } from './publish';

describe('channelNameForUser', () => {
  it('scopes the channel name to the given user id', () => {
    expect(channelNameForUser('user-123')).toBe('user:user-123:cycle-updates');
  });
});

describe('publishCycleUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ABLY_API_KEY = 'test-key';
    publishMock.mockResolvedValue(undefined);
  });

  it("publishes a cycle-updated event to the caller's own channel", async () => {
    await publishCycleUpdate('user-123');
    expect(channelsGetMock).toHaveBeenCalledWith('user:user-123:cycle-updates');
    expect(publishMock).toHaveBeenCalledWith('cycle-updated', {});
  });

  it('never throws when the underlying publish call fails', async () => {
    publishMock.mockRejectedValueOnce(new Error('Ably unreachable'));
    await expect(publishCycleUpdate('user-123')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the new publish tests**

Run: `npx vitest run lib/realtime/publish.test.ts`
Expected: 3 tests pass. **If the `ably` import shape errors** (e.g. `Ably.Rest` is not a constructor under the installed version's types), read `node_modules/ably/ably.d.ts` to find the actual exported shape for the Node REST client and adjust the import/usage accordingly — this plan's assumed API surface is based on Ably's documented pattern but must be verified against whatever version `npm install` actually resolved in Task 1.

- [ ] **Step 4: Write `app/api/realtime/token/route.ts`**

```ts
import { NextResponse } from 'next/server';
import Ably from 'ably';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { channelNameForUser } from '@/lib/realtime/publish';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new AppError(500, 'ABLY_API_KEY is not configured');
    }

    const client = new Ably.Rest(apiKey);
    // Scoped to exactly this user's own channel, resolved server-side from the session — never from
    // a client-supplied id — so a token minted here can never grant access to another user's
    // realtime updates. Same IDOR-safe pattern as every other route in this app. `subscribe`-only:
    // the browser never needs to publish.
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: user.userId,
      capability: {
        [channelNameForUser(user.userId)]: ['subscribe'],
      },
    });

    return NextResponse.json(tokenRequest);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 5: Write `app/api/realtime/token/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createTokenRequestMock = vi.fn();

vi.mock('ably', () => ({
  default: {
    Rest: vi.fn().mockImplementation(() => ({
      auth: { createTokenRequest: createTokenRequestMock },
    })),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth/session';

describe('GET /api/realtime/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ABLY_API_KEY = 'test-key';
    createTokenRequestMock.mockResolvedValue({ keyName: 'test', mac: 'x' });
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("requests a token scoped only to the caller's own channel, resolved server-side", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-123', email: 'a@example.com' });
    await GET();
    expect(createTokenRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'user-123',
        capability: { 'user:user-123:cycle-updates': ['subscribe'] },
      })
    );
  });

  it("never grants capability on a channel other than the caller's own, even implicitly", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'attacker-999', email: 'b@example.com' });
    await GET();
    const call = createTokenRequestMock.mock.calls[0][0];
    expect(Object.keys(call.capability)).toEqual(['user:attacker-999:cycle-updates']);
  });
});
```

- [ ] **Step 6: Run the new token route tests**

Run: `npx vitest run app/api/realtime/token/route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 7: Wire `publishCycleUpdate` into `lib/bills/actions.ts`**

In `lib/bills/actions.ts`, add the import:

```ts
import { publishCycleUpdate } from '@/lib/realtime/publish';
```

In `addBill`, change the success path from:

```ts
    return { success: true, id: created.id };
```

to:

```ts
    await publishCycleUpdate(userId);
    return { success: true, id: created.id };
```

In `markBillPaid`, change the final two lines from:

```ts
  return { success: true, expenseId };
```

to:

```ts
  await publishCycleUpdate(userId);
  return { success: true, expenseId };
```

- [ ] **Step 8: Add realtime assertions to `lib/bills/actions.test.ts`**

Read the existing file fully first — it already mocks `@/tests/mocks/prisma`. Add, near the top, a mock for the new import:

```ts
vi.mock('@/lib/realtime/publish', () => ({
  publishCycleUpdate: vi.fn().mockResolvedValue(undefined),
}));
```

Then add these two test cases (one in the `describe('addBill', ...)` block, one in `describe('markBillPaid', ...)`):

```ts
  it('publishes a cycle-updated event after a successful create', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
    prismaMock.bill.create.mockResolvedValue({ id: 'bill_1' } as never);

    await addBill('user_1', { name: 'Rent', amount: 800, dueDate: new Date('2026-09-30T00:00:00.000Z') });

    expect(publishCycleUpdate).toHaveBeenCalledWith('user_1');
  });
```

```ts
  it('still succeeds even if the realtime publish itself rejects', async () => {
    const { publishCycleUpdate } = await import('@/lib/realtime/publish');
    vi.mocked(publishCycleUpdate).mockRejectedValueOnce(new Error('Ably down'));
    prismaMock.bill.create.mockResolvedValue({ id: 'bill_1' } as never);

    const result = await addBill('user_1', { name: 'Rent', amount: 800, dueDate: new Date('2026-09-30T00:00:00.000Z') });

    expect(result).toEqual({ success: true, id: 'bill_1' });
  });
```

(Add the equivalent two-test pattern — publish-fires-on-success, mutation-still-succeeds-if-publish-rejects — to whichever `markBillPaid` test in the same file sets up a fully successful payment, using its existing mock setup for `prismaMock.bill.findFirst`/`$transaction`.)

- [ ] **Step 9: Wire `publishCycleUpdate` into `lib/income/actions.ts`**

Add the import:

```ts
import { publishCycleUpdate } from '@/lib/realtime/publish';
```

In `addIncomeSource`, change the success return from `return { success: true, id: created.id };` to:

```ts
    await publishCycleUpdate(userId);
    return { success: true, id: created.id };
```

In `logIncomeEntry`, change `return { success: true, id: created.id };` to:

```ts
  await publishCycleUpdate(userId);
  return { success: true, id: created.id };
```

- [ ] **Step 10: Add the same two-test pattern to `lib/income/actions.test.ts`**

Read the existing file fully first, add the same `vi.mock('@/lib/realtime/publish', ...)` block, and add a "publishes on success" + "still succeeds if publish rejects" test pair for both `addIncomeSource` and `logIncomeEntry`, following the exact pattern from Step 8.

- [ ] **Step 11: Wire `publishCycleUpdate` into `lib/moneyCycle/actions.ts`**

Add the import:

```ts
import { publishCycleUpdate } from '@/lib/realtime/publish';
```

Change the end of `updateCycleAmount` from:

```ts
  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { startingAmount: newAmount } });

  return { success: true, remainingAmount, daysRemaining, safeToSpend };
```

to:

```ts
  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { startingAmount: newAmount } });
  await publishCycleUpdate(userId);

  return { success: true, remainingAmount, daysRemaining, safeToSpend };
```

(`cancelCycle` is intentionally left unmodified — there is no active-cycle data left to sync once cancelled.)

- [ ] **Step 12: Add the same two-test pattern to `lib/moneyCycle/actions.test.ts`**

Read the existing file fully first (it already sets up `vi.useFakeTimers()` and default `prismaMock` mocks for `updateCycleAmount`'s tests), add the `vi.mock('@/lib/realtime/publish', ...)` block, and add a "publishes on success" + "still succeeds if publish rejects" test pair inside `describe('updateCycleAmount', ...)`, reusing the existing fully-mocked-success test's setup as a base.

- [ ] **Step 13: Wire `publishCycleUpdate` into `POST /api/cycles`**

In `app/api/cycles/route.ts`, add the import:

```ts
import { publishCycleUpdate } from '@/lib/realtime/publish';
```

After the `$transaction` block succeeds and `const { cycle, message } = result;` line, before the `return NextResponse.json(...)`, add:

```ts
    await publishCycleUpdate(user.userId);
```

- [ ] **Step 14: Add the same two-test pattern to `app/api/cycles/route.test.ts`**

Read the existing file fully first, add the `vi.mock('@/lib/realtime/publish', ...)` block, and add a "publishes on success" + "still succeeds if publish rejects" test pair to the existing successful-creation test's setup.

- [ ] **Step 15: Run every test file touched this task, then the full suite**

Run:
```bash
npx vitest run lib/realtime lib/bills/actions.test.ts lib/income/actions.test.ts lib/moneyCycle/actions.test.ts app/api/cycles/route.test.ts app/api/realtime
npm test
npm run typecheck
```
Expected: all new + modified tests pass, full suite passes, typecheck clean.

- [ ] **Step 16: Set `ABLY_API_KEY` for local/CI use**

Create a free Ably account (if one doesn't already exist for this project) and add `ABLY_API_KEY=<key>` to `.env` locally and to the Vercel project's environment variables (same place `CRON_SECRET`/`GEMINI_API_KEY` already live) — this step is manual/environment setup, not code; note in the task report that it was done, since Task 9's live two-tab verification depends on it being configured in both places.

- [ ] **Step 17: Commit and push**

```bash
git add lib/realtime app/api/realtime lib/bills/actions.ts lib/bills/actions.test.ts lib/income/actions.ts lib/income/actions.test.ts lib/moneyCycle/actions.ts lib/moneyCycle/actions.test.ts app/api/cycles/route.ts app/api/cycles/route.test.ts
git commit -m "feat: add Ably-based live cash-flow sync"
git push
```

---

### Task 4: Realtime Client Hook

**Files:**
- Create: `hooks/useRealtimeCycleUpdates.ts`
- Create: `hooks/useRealtimeCycleUpdates.test.ts`
- Modify: `app/cashflow/CashFlowClient.tsx`
- Modify: `components/coach/CoachCard.tsx`

**Interfaces:**
- Consumes: `GET /api/realtime/token` from Task 3.
- Produces: `useRealtimeCycleUpdates(onUpdate: () => void): void` — subscribes to the signed-in user's own realtime channel (identity resolved server-side by the token endpoint; this hook never takes or needs a userId) and calls `onUpdate` on every `cycle-updated` event. Task 6's `DashboardHeroOrb` also consumes this hook directly.

- [ ] **Step 1: Write `hooks/useRealtimeCycleUpdates.ts`**

```ts
'use client';

import { useEffect, useRef } from 'react';
import Ably from 'ably';

/**
 * Subscribes to this signed-in user's private realtime channel and calls `onUpdate` whenever their
 * cash-flow data changes elsewhere (another tab, the AI coach chat, a bill/income mutation). The
 * token endpoint resolves the caller's own identity server-side via the session cookie — this hook
 * never accepts a user id, matching this app's existing IDOR-safe convention. `onUpdate` is expected
 * to trigger whatever refetch mechanism the calling component already has (e.g. bumping a
 * `refreshKey` state), not to carry the new data itself.
 */
export function useRealtimeCycleUpdates(onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: '/api/realtime/token' });

    client.auth.authorize().then((tokenDetails) => {
      // The token's own capability grant names exactly one channel — this user's own — so the
      // client learns its channel name from the grant itself rather than constructing it
      // independently, keeping channelNameForUser (lib/realtime/publish.ts) the single source of
      // truth for that string.
      const capability = JSON.parse(tokenDetails.capability) as Record<string, string[]>;
      const channelName = Object.keys(capability)[0];
      if (!channelName) return;
      const channel = client.channels.get(channelName);
      channel.subscribe('cycle-updated', () => onUpdateRef.current());
    });

    return () => {
      client.close();
    };
  }, []);
}
```

**Note:** verify `tokenDetails.capability`'s exact field name/type against `node_modules/ably/ably.d.ts` once installed — this plan's assumed shape follows Ably's documented `TokenDetails` interface but must be checked against whatever version Task 1 actually resolved, per this project's standing practice of verifying third-party API surfaces empirically rather than assuming.

- [ ] **Step 2: Write `hooks/useRealtimeCycleUpdates.test.ts`**

```ts
import { describe, it, expect, vi, waitFor } from 'vitest';
import { renderHook } from '@testing-library/react';

const subscribeMock = vi.fn();
const channelsGetMock = vi.fn(() => ({ subscribe: subscribeMock }));
const authorizeMock = vi.fn();
const closeMock = vi.fn();

vi.mock('ably', () => ({
  default: {
    Realtime: vi.fn().mockImplementation(() => ({
      auth: { authorize: authorizeMock },
      channels: { get: channelsGetMock },
      close: closeMock,
    })),
  },
}));

import Ably from 'ably';
import { useRealtimeCycleUpdates } from './useRealtimeCycleUpdates';

describe('useRealtimeCycleUpdates', () => {
  it('authenticates via the token endpoint and subscribes to the granted channel', async () => {
    authorizeMock.mockResolvedValue({
      capability: JSON.stringify({ 'user:user-123:cycle-updates': ['subscribe'] }),
    });
    const onUpdate = vi.fn();

    renderHook(() => useRealtimeCycleUpdates(onUpdate));

    await waitFor(() => {
      expect(Ably.Realtime).toHaveBeenCalledWith({ authUrl: '/api/realtime/token' });
      expect(channelsGetMock).toHaveBeenCalledWith('user:user-123:cycle-updates');
    });

    expect(subscribeMock).toHaveBeenCalledWith('cycle-updated', expect.any(Function));
    const handler = subscribeMock.mock.calls[0][1];
    handler();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('closes the client on unmount', async () => {
    authorizeMock.mockResolvedValue({ capability: JSON.stringify({}) });
    const { unmount } = renderHook(() => useRealtimeCycleUpdates(() => {}));
    unmount();
    expect(closeMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new hook tests**

Run: `npx vitest run hooks/useRealtimeCycleUpdates.test.ts`
Expected: 2 tests pass. If `waitFor` is not exported from `vitest`, import it from `@testing-library/react` instead (`import { waitFor } from '@testing-library/react'`) — check `node_modules/vitest`'s actual exports if the first form errors.

- [ ] **Step 4: Wire the hook into `CashFlowClient.tsx`**

Add the import:

```ts
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';
```

Inside the `CashFlowClient` function body, after the existing `useState` declarations, add:

```ts
  // Live sync: another tab, or the AI coach chat, changing this user's bills/income re-triggers the
  // exact same refetch this component already does after its own local mutations.
  useRealtimeCycleUpdates(() => setProjectionRefreshKey((k) => k + 1));
```

- [ ] **Step 5: Wire the hook into `CoachCard.tsx`**

Add the import:

```ts
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';
```

Extract the existing mount-time fetch into a named function, then call it from both the mount effect and the realtime hook. Replace:

```ts
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
```

with:

```ts
  const refetchCycle = useCallback(() => {
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

  useEffect(() => {
    refetchCycle();
  }, [refetchCycle]);

  useRealtimeCycleUpdates(refetchCycle);
```

Add `useCallback` to the existing `import { useEffect, useState, FormEvent } from 'react';` line, making it `import { useCallback, useEffect, useState, FormEvent } from 'react';`.

- [ ] **Step 6: Update `components/coach/CoachCard.test.tsx` if it exists, or add one**

Run: `find components/coach -iname "CoachCard.test.tsx"`. If it exists, read it fully, add a `vi.mock('@/hooks/useRealtimeCycleUpdates', () => ({ useRealtimeCycleUpdates: vi.fn() }))` alongside its existing mocks, and confirm every existing test still passes unmodified (the refactor in Step 5 preserves the exact same mount-time fetch behavior). If no test file exists for `CoachCard`, skip creating one here — it isn't part of this plan's required coverage; Task 9's Playwright suite already exercises `CoachCard` indirectly via the dashboard/accessibility specs.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: all tests pass (including the 2 new hook tests + any `CoachCard` test file confirmed still green), typecheck clean.

- [ ] **Step 8: Commit and push**

```bash
git add hooks components/coach/CoachCard.tsx app/cashflow/CashFlowClient.tsx
git commit -m "feat: wire realtime cash-flow sync into cashflow page and Money Coach"
git push
```

---

### Task 5: Cash-Flow Trajectory Chart

**Files:**
- Create: `components/charts/CashFlowTrajectoryChart.tsx`
- Create: `components/charts/CashFlowTrajectoryChart.test.tsx`
- Modify: `app/cashflow/CashFlowClient.tsx`

**Interfaces:**
- Consumes: `GET /api/cycles/active`'s existing `projection: { date: string; balance: number; events: { label: string; amount: number }[] }[]` field (already returned today — no backend change).
- Consumes: `GlassPanel` from Task 2.
- Produces: `CashFlowTrajectoryChart` — `function CashFlowTrajectoryChart({ refreshKey?: number }): JSX.Element`, self-contained (does its own fetch of `/api/cycles/active`, mirroring `ProjectionList`'s existing `refreshKey`-driven fetch pattern exactly, including its cancellation guard) so it can be dropped into `CashFlowClient.tsx` with the same `refreshKey` prop already used for `ProjectionList`.

- [ ] **Step 1: Write `CashFlowTrajectoryChart.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceDot } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { formatCurrency } from '@/lib/utils/currency';

interface ProjectionDay {
  date: string;
  balance: number;
  events: { label: string; amount: number }[];
}

interface ActiveCycleProjection {
  projection: ProjectionDay[];
}

/**
 * `refreshKey` mirrors ProjectionList's existing pattern exactly (same prop name, same effect
 * dependency, same cancellation guard) so CashFlowClient.tsx can drive both from the same state.
 */
export function CashFlowTrajectoryChart({ refreshKey = 0 }: { refreshKey?: number }) {
  const [cycle, setCycle] = useState<ActiveCycleProjection | null | undefined | 'error'>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/cycles/active')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setCycle('error');
          return;
        }
        const json = await res.json();
        if (!cancelled) setCycle(json);
      })
      .catch(() => {
        if (!cancelled) setCycle('error');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (cycle === undefined || cycle === 'error' || cycle === null) {
    return null; // ProjectionList (rendered alongside this) already surfaces loading/error/empty states
  }

  const { projection } = cycle;
  if (projection.length === 0) {
    return null;
  }

  const chartData = projection.map((day) => ({ date: day.date, balance: day.balance }));
  const isShortfall = projection.some((day) => day.balance < 0);
  const lowestDay = projection.reduce((lowest, day) => (day.balance < lowest.balance ? day : lowest), projection[0]);

  return (
    <GlassPanel elevation={2} hoverable data-testid="cashflow-trajectory-chart">
      <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Balance trajectory</h2>
      {/* Accessible fallback matching the pattern axe-core already validates for
          MonthlyTrendChart/CategoryPieChart: a visually-hidden summary alongside the SVG chart. */}
      <p className="sr-only">
        Projected balance from {formatCurrency(projection[0].balance)} to {formatCurrency(projection[projection.length - 1].balance)}
        {isShortfall ? `, dipping below zero to a low of ${formatCurrency(lowestDay.balance)}` : ', staying positive throughout'}.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="trajectoryGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.35)" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
            contentStyle={{ backgroundColor: '#13111f', borderColor: 'rgba(139,92,246,0.35)', borderRadius: '0.75rem' }}
            itemStyle={{ color: '#e5e7ff' }}
            labelStyle={{ color: '#e5e7ff' }}
          />
          <ReferenceLine y={0} stroke="#f87171" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="url(#trajectoryGradient)"
            isAnimationActive
            animationDuration={600}
          />
          {isShortfall && (
            <ReferenceDot x={lowestDay.date} y={lowestDay.balance} r={5} fill="#f87171" stroke="#05050f" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </GlassPanel>
  );
}
```

- [ ] **Step 2: Write `CashFlowTrajectoryChart.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CashFlowTrajectoryChart } from './CashFlowTrajectoryChart';

describe('CashFlowTrajectoryChart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders nothing while loading and nothing on a null (no-cycle) response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => null })
    );
    const { container } = render(<CashFlowTrajectoryChart />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders the chart and a screen-reader summary for a populated, non-shortfall projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          projection: [
            { date: '2026-10-01T00:00:00.000Z', balance: 500, events: [] },
            { date: '2026-10-02T00:00:00.000Z', balance: 480, events: [] },
          ],
        }),
      })
    );

    render(<CashFlowTrajectoryChart />);

    expect(await screen.findByTestId('cashflow-trajectory-chart')).toBeInTheDocument();
    expect(screen.getByText(/staying positive throughout/)).toBeInTheDocument();
  });

  it('flags the shortfall in the screen-reader summary when the projection dips below zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          projection: [
            { date: '2026-10-01T00:00:00.000Z', balance: 100, events: [] },
            { date: '2026-10-05T00:00:00.000Z', balance: -50, events: [{ label: 'Rent', amount: -800 }] },
          ],
        }),
      })
    );

    render(<CashFlowTrajectoryChart />);

    expect(await screen.findByText(/dipping below zero to a low of/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the new chart tests**

Run: `npx vitest run components/charts/CashFlowTrajectoryChart.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 4: Wire the chart into `CashFlowClient.tsx`**

Add the import:

```ts
import { CashFlowTrajectoryChart } from '@/components/charts/CashFlowTrajectoryChart';
```

Change the final line of the component's JSX from:

```tsx
      <ProjectionList refreshKey={projectionRefreshKey} />
```

to:

```tsx
      <CashFlowTrajectoryChart refreshKey={projectionRefreshKey} />
      <ProjectionList refreshKey={projectionRefreshKey} />
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 6: Commit and push**

```bash
git add components/charts/CashFlowTrajectoryChart.tsx components/charts/CashFlowTrajectoryChart.test.tsx app/cashflow/CashFlowClient.tsx
git commit -m "feat: add animated cash-flow balance trajectory chart"
git push
```

---

### Task 6: Dashboard WebGL Orb, Fallback Wrapper, and Dashboard Restyle

**Files:**
- Create: `components/three/WebGLAccent.tsx`
- Create: `components/three/WebGLAccent.test.tsx`
- Create: `components/three/LiquidOrb.tsx`
- Create: `components/dashboard/DashboardHeroOrb.tsx`
- Create: `components/dashboard/DashboardHeroOrb.test.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `AmbientBlobs`, `GlassPanel` from Task 2; `useRealtimeCycleUpdates` from Task 4.
- Produces: `WebGLAccent` — `function WebGLAccent({ loadScene: () => Promise<{ default: ComponentType<Record<string, unknown>> }>, sceneProps?: Record<string, unknown>, alt: string, className?: string }): JSX.Element`. Task 7's login/signup hero scene also consumes this component directly.

- [ ] **Step 1: Write `components/three/WebGLAccent.tsx`**

```tsx
'use client';

import { Component, ComponentType, ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';

const NARROW_VIEWPORT_QUERY = '(max-width: 640px)'; // matches this app's existing sm: breakpoint

class WebGLErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('WebGL accent failed to render, falling back to a static gradient:', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
    setIsNarrow(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return isNarrow;
}

interface WebGLAccentProps {
  /** Only ever called when the accent will actually render — pages that never render a WebGLAccent
   * instance never fetch the Three.js bundle at all. */
  loadScene: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
  sceneProps?: Record<string, unknown>;
  /** Accessible label for the fallback (the real scene is purely decorative and aria-hidden). */
  alt: string;
  className?: string;
}

/**
 * The single wrapper both scoped WebGL accents (dashboard orb, login/signup hero scene) render
 * through. Handles all three required fallback paths from spec Section 4 — prefers-reduced-motion,
 * narrow viewport, and a WebGL/context-creation failure — falling back to the same kind of static
 * CSS-gradient shape in every case, never a raster image (no new binary asset needed).
 */
export function WebGLAccent({ loadScene, sceneProps = {}, alt, className = '' }: WebGLAccentProps) {
  const prefersReducedMotion = useReducedMotion();
  const isNarrowViewport = useIsNarrowViewport();

  const staticFallback = (
    <div
      data-testid="webgl-static-fallback"
      role="img"
      aria-label={alt}
      className={`rounded-full bg-gradient-to-br from-primary/40 via-accent/30 to-transparent blur-2xl ${className}`}
    />
  );

  if (prefersReducedMotion || isNarrowViewport) {
    return staticFallback;
  }

  const Scene = dynamic(loadScene, { ssr: false, loading: () => null });

  return (
    <WebGLErrorBoundary fallback={staticFallback}>
      <div data-testid="webgl-accent" aria-hidden="true" className={className}>
        <Scene {...sceneProps} />
      </div>
    </WebGLErrorBoundary>
  );
}
```

- [ ] **Step 2: Write `components/three/WebGLAccent.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebGLAccent } from './WebGLAccent';

function mockNarrowViewportMatch(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function mockReducedMotionMatch(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('WebGLAccent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the static fallback on a narrow viewport, never loading the scene', async () => {
    mockNarrowViewportMatch(true);
    const loadScene = vi.fn();

    render(<WebGLAccent loadScene={loadScene} alt="Decorative glass accent" />);

    expect(await screen.findByTestId('webgl-static-fallback')).toBeInTheDocument();
    expect(loadScene).not.toHaveBeenCalled();
  });

  it('renders the static fallback when prefers-reduced-motion is set, never loading the scene', async () => {
    mockReducedMotionMatch(true);
    const loadScene = vi.fn();

    render(<WebGLAccent loadScene={loadScene} alt="Decorative glass accent" />);

    expect(await screen.findByTestId('webgl-static-fallback')).toBeInTheDocument();
    expect(loadScene).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new WebGLAccent tests**

Run: `npx vitest run components/three/WebGLAccent.test.tsx`
Expected: 2 tests pass. (The third fallback path — a real WebGL context-creation failure — is not practically testable under jsdom, which has no real WebGL; it is verified live in a real browser in Task 9.)

- [ ] **Step 4: Write `components/three/LiquidOrb.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import type { Mesh } from 'three';

const ON_TRACK_COLOR = '#22d3ee'; // accent token
// A softer amber heads-up, not the app's `destructive` token — the orb's shortfall state is a
// gentle nudge, not an error state, so it intentionally doesn't reuse the destructive red.
const SHORTFALL_COLOR = '#f59e0b';

function AnimatedOrb({ isShortfall }: { isShortfall: boolean }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const speed = isShortfall ? 0.6 : 0.3;
    meshRef.current.rotation.x = state.clock.elapsedTime * speed * 0.2;
    meshRef.current.rotation.y = state.clock.elapsedTime * speed * 0.15;
  });

  return (
    <Sphere ref={meshRef} args={[1.4, 64, 64]}>
      <MeshDistortMaterial
        color={isShortfall ? SHORTFALL_COLOR : ON_TRACK_COLOR}
        distort={isShortfall ? 0.5 : 0.3}
        speed={isShortfall ? 2.5 : 1.2}
        roughness={0.2}
        metalness={0.1}
        transparent
        opacity={0.75}
      />
    </Sphere>
  );
}

/**
 * The dashboard hero accent — motion that means something, not pure decoration: color/intensity
 * reflect whether the signed-in user's cash-flow projection currently shows a shortfall.
 * `export default` is required here (not a named export) because WebGLAccent's `loadScene` calls
 * `next/dynamic(() => import('./LiquidOrb'))`, which expects a default export.
 */
export default function LiquidOrb({ isShortfall = false }: { isShortfall?: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0, 4] }} gl={{ alpha: true }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 3]} intensity={1.2} />
      <AnimatedOrb isShortfall={isShortfall} />
    </Canvas>
  );
}
```

No unit test for `LiquidOrb.tsx` itself: it renders a real WebGL canvas via `@react-three/fiber`, which jsdom cannot meaningfully execute (no real GPU context). It is only ever rendered through `WebGLAccent` (already tested for its fallback paths) and verified live in a real browser in Task 9.

- [ ] **Step 5: Write `components/dashboard/DashboardHeroOrb.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { WebGLAccent } from '@/components/three/WebGLAccent';
import { useRealtimeCycleUpdates } from '@/hooks/useRealtimeCycleUpdates';

interface ProjectionDay {
  balance: number;
}

/** Self-contained: fetches its own copy of the active cycle's projection (same endpoint
 * ProjectionList/CoachCard/CashFlowTrajectoryChart each already fetch independently — matching this
 * app's existing per-component-fetch convention rather than introducing new shared state for this
 * one boolean) and re-fetches on realtime events, deriving `isShortfall` from the projection array
 * that's already returned today (no backend response-shape change needed for this). */
export function DashboardHeroOrb() {
  const [isShortfall, setIsShortfall] = useState(false);

  const refetch = useCallback(() => {
    fetch('/api/cycles/active')
      .then(async (res) => {
        if (!res.ok) return;
        const json: { projection?: ProjectionDay[] } | null = await res.json();
        setIsShortfall(Boolean(json?.projection?.some((day) => day.balance < 0)));
      })
      .catch(() => {
        // Best-effort — the orb simply stays in its default "on track" appearance on a failed fetch.
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useRealtimeCycleUpdates(refetch);

  return (
    <div className="absolute inset-0 -z-10 flex items-center justify-end pr-8" data-testid="dashboard-hero-orb">
      <div className="h-64 w-64">
        <WebGLAccent
          loadScene={() => import('@/components/three/LiquidOrb')}
          sceneProps={{ isShortfall }}
          alt="Decorative animated glass orb reflecting your cash-flow status"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `components/dashboard/DashboardHeroOrb.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHeroOrb } from './DashboardHeroOrb';

vi.mock('@/hooks/useRealtimeCycleUpdates', () => ({
  useRealtimeCycleUpdates: vi.fn(),
}));

describe('DashboardHeroOrb', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the WebGL accent container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projection: [] }) })
    );

    render(<DashboardHeroOrb />);

    expect(await screen.findByTestId('dashboard-hero-orb')).toBeInTheDocument();
  });

  it('does not crash when the projection fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    render(<DashboardHeroOrb />);

    expect(await screen.findByTestId('dashboard-hero-orb')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the new dashboard orb tests**

Run: `npx vitest run components/dashboard/DashboardHeroOrb.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 8: Restyle `app/dashboard/page.tsx`**

Replace the file's imports and JSX to use `GlassPanel`/`AmbientBlobs`/`DashboardHeroOrb`. Full replacement:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory, aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { CountUpStat } from '@/components/ui/CountUpStat';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { CoachCard } from '@/components/coach/CoachCard';
import { DashboardHeroOrb } from '@/components/dashboard/DashboardHeroOrb';
import { generateDueRecurringExpenses } from '@/lib/generateDueRecurringExpenses';
import { computeGstPaid } from '@/lib/utils/gst';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // middleware.ts already guarantees `user` is non-null for this route;
  // this check exists only to satisfy TypeScript.
  if (!user) return null;

  try {
    await generateDueRecurringExpenses(user.userId);
  } catch (error) {
    // A generation hiccup (e.g. a transient DB error) shouldn't block the
    // user from viewing their existing dashboard data.
    console.error('Failed to generate recurring expenses:', error);
  }

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
  const gstPaidThisMonth = computeGstPaid(
    currentMonthExpenses.map((e) => ({ amount: e.amount, categoryIsGstFree: e.category.isGstFree }))
  );

  const budgets = await prisma.budget.findMany({
    where: { userId: user.userId },
    include: { category: true },
  });
  const spentByCategory = new Map(categoryTotals.map((c) => [c.categoryId, c.total]));
  const budgetItems = budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    spent: spentByCategory.get(budget.categoryId) ?? 0,
    limit: Number(budget.monthlyLimit),
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-4xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <DashboardHeroOrb />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Dashboard</h1>

        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          <GlassPanel elevation={2}>
            <p className="text-sm text-muted">Total spent this month</p>
            <CountUpStat value={totalThisMonth} />
          </GlassPanel>
          <GlassPanel elevation={2}>
            <p className="text-sm text-muted">GST paid this month</p>
            <CountUpStat value={gstPaidThisMonth} />
          </GlassPanel>
        </div>

        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          <GlassPanel elevation={1} hoverable>
            <h2 className="mb-3 font-heading font-medium text-foreground">
              Spending by category (this month)
            </h2>
            <CategoryPieChart data={categoryTotals} />
          </GlassPanel>
          <GlassPanel elevation={1} hoverable>
            <h2 className="mb-3 font-heading font-medium text-foreground">6-month trend</h2>
            <MonthlyTrendChart data={monthlyTotals} />
          </GlassPanel>
        </div>

        <GlassPanel elevation={1}>
          <h2 className="mb-3 font-heading font-medium text-foreground">Budget progress</h2>
          <BudgetProgress items={budgetItems} />
        </GlassPanel>

        <div className="mt-6">
          <CoachCard />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 9: Run the full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, typecheck clean, production build succeeds (this is the first task that actually renders a dynamically-imported Three.js scene in a real Next.js build — a build failure here would indicate an issue with the `next/dynamic`/`ssr:false` wiring, not just a test-level problem).

- [ ] **Step 10: Commit and push**

```bash
git add components/three components/dashboard app/dashboard/page.tsx
git commit -m "feat: add dashboard liquid-glass orb and restyle dashboard with GlassPanel"
git push
```

---

### Task 7: Login/Signup WebGL Hero Scene and Restyle

**Files:**
- Create: `components/three/GlassHeroScene.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/signup/page.tsx`

**Interfaces:**
- Consumes: `WebGLAccent` from Task 6, `AmbientBlobs`/`GlassPanel` from Task 2. Form logic (the `handleSubmit` functions, `fetch` calls, routing) in both pages is untouched — only the surrounding JSX/imports change.

- [ ] **Step 1: Write `components/three/GlassHeroScene.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Torus } from '@react-three/drei';
import type { Mesh } from 'three';

function FloatingGlassTorus() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.15;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.25;
  });

  return (
    <Torus ref={meshRef} args={[1.1, 0.4, 32, 100]}>
      <MeshTransmissionMaterial
        color="#8b5cf6"
        thickness={0.5}
        roughness={0.1}
        transmission={1}
        ior={1.3}
        chromaticAberration={0.03}
      />
    </Torus>
  );
}

/**
 * Purely decorative companion for the login/signup hero — never blocks, delays, or is required to
 * complete the form next to it. `export default` required for next/dynamic's expected shape.
 */
export default function GlassHeroScene() {
  return (
    <Canvas camera={{ position: [0, 0, 4] }} gl={{ alpha: true }}>
      <ambientLight intensity={0.7} />
      <pointLight position={[3, 3, 3]} intensity={1.4} />
      <FloatingGlassTorus />
    </Canvas>
  );
}
```

No unit test, for the same reason as `LiquidOrb.tsx` (Task 6, Step 4) — verified live in a real browser in Task 9.

- [ ] **Step 2: Restyle `app/login/page.tsx`**

Full replacement:

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { Button } from '@/components/ui/Button';
import { WebGLAccent } from '@/components/three/WebGLAccent';

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
    <main className="relative mx-auto mt-24 flex max-w-4xl items-center justify-center gap-12 overflow-hidden px-4">
      <AmbientBlobs />
      <GlassPanel elevation={2} className="w-full max-w-sm">
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Log in</h1>
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
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          No account?{' '}
          <a href="/signup" className="text-primary-hover underline">
            Sign up
          </a>
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
```

- [ ] **Step 3: Restyle `app/signup/page.tsx`**

Full replacement:

```tsx
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
```

- [ ] **Step 4: Run the full suite, including a production build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass (the existing signup/login E2E specs in `e2e/dashboard.spec.ts`/`e2e/accessibility.spec.ts` still rely on `getByPlaceholder('Email')` etc., which are unchanged — confirm this by reading those specs again if any Vitest/Playwright test references login/signup markup that moved), typecheck clean, build succeeds.

- [ ] **Step 5: Commit and push**

```bash
git add components/three/GlassHeroScene.tsx app/login/page.tsx app/signup/page.tsx
git commit -m "feat: add login/signup glass hero scene and restyle with GlassPanel"
git push
```

---

### Task 8: Restyle Remaining Pages

**Files:**
- Modify: `app/budgets/page.tsx`
- Modify: `app/expenses/page.tsx`
- Modify: `app/offline/page.tsx`
- Modify: `app/privacy/page.tsx`

**Interfaces:**
- Consumes: `GlassPanel`, `AmbientBlobs` from Task 2. `budgets` and `expenses` get full treatment (glass + ambient background); `offline` and `privacy` are restyle-only per spec Section 6 — `Card` becomes `GlassPanel`, but no `AmbientBlobs`, no `hoverable` motion.

- [ ] **Step 1: Restyle `app/budgets/page.tsx`**

Replace the `Card` import and usage. Full replacement:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Header } from '@/components/ui/Header';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';
import { BudgetsClient } from './BudgetsClient';

export default async function BudgetsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const categories = await prisma.category.findMany({ where: { userId: user.userId } });
  const budgets = await prisma.budget.findMany({ where: { userId: user.userId } });

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));

  const rows = categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    color: category.color,
    monthlyLimit: budgetByCategory.get(category.id) ?? null,
    isGstFree: category.isGstFree,
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-3xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Budgets</h1>
        <GlassPanel elevation={1}>
          <BudgetsClient rows={rows} />
        </GlassPanel>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Restyle `app/expenses/page.tsx`**

Full replacement:

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from './ExpensesClient';
import { Header } from '@/components/ui/Header';
import { AmbientBlobs } from '@/components/ui/AmbientBlobs';

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
    isRecurring: e.isRecurring,
    recurrenceInterval: e.recurrenceInterval ?? undefined,
    category: { id: e.category.id, name: e.category.name, color: e.category.color },
  }));

  return (
    <>
      <Header />
      <main className="relative mx-auto max-w-3xl overflow-hidden px-4 py-8">
        <AmbientBlobs />
        <h1 className="mb-6 font-heading text-2xl font-semibold text-foreground">Expenses</h1>
        <ExpenseFilters categories={categories} />
        <ExpensesClient categories={categories} initialExpenses={serialized} />
      </main>
    </>
  );
}
```

`ExpensesClient`/`ExpenseFilters` render their own internal `Card`-based rows/forms — read those two files fully and apply the same mechanical swap used everywhere else in this plan: replace `import { Card } from '@/components/ui/Card'` with `import { GlassPanel } from '@/components/ui/GlassPanel'`, and every `<Card ...>`/`</Card>` with `<GlassPanel elevation={1} ...>`/`</GlassPanel>` (add `hoverable` only where the existing usage already had `hoverable` on `Card`). Do the same for `components/bills/BillForm.tsx`, `components/income/IncomeSourceForm.tsx`, and `components/ui/BudgetProgress.tsx` if any of them import `Card` directly (`grep -rl "from '@/components/ui/Card'" components app` to find every remaining usage after Tasks 5-8's page-level changes, and apply the identical swap to each).

- [ ] **Step 3: Restyle `app/offline/page.tsx`** (restyle-only — no `AmbientBlobs`, no `hoverable`)

Full replacement:

```tsx
import { GlassPanel } from '@/components/ui/GlassPanel';

export default function OfflinePage() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <GlassPanel elevation={1}>
        <h1 className="mb-2 font-heading text-2xl font-semibold text-foreground">
          You&apos;re offline
        </h1>
        <p className="text-sm text-muted">
          Budget Buddy needs an internet connection to show your up-to-date expenses, budgets, and
          balances. Reconnect and try again.
        </p>
      </GlassPanel>
    </main>
  );
}
```

- [ ] **Step 4: Restyle `app/privacy/page.tsx`** (restyle-only)

Change only the import and the two `Card` tags — keep every section's content exactly as-is. Replace:

```tsx
import { Card } from '@/components/ui/Card';
```

with:

```tsx
import { GlassPanel } from '@/components/ui/GlassPanel';
```

and replace the opening `<Card>` / closing `</Card>` tags with `<GlassPanel elevation={1}>` / `</GlassPanel>`.

- [ ] **Step 5: Run the full suite, including a production build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, typecheck clean, build succeeds. If any existing test queries for a `Card`-specific class or test id that `GlassPanel` doesn't replicate, update that test to query by role/text/`data-testid="glass-panel"` instead — read the failure output and fix at the assertion level, not by reverting the component swap.

- [ ] **Step 6: Commit and push**

```bash
git add app/budgets/page.tsx app/expenses/page.tsx app/offline/page.tsx app/privacy/page.tsx components
git commit -m "feat: restyle remaining pages with GlassPanel"
git push
```

---

### Task 9: Whole-Feature Verification

**Files:**
- Modify: `e2e/accessibility.spec.ts` (extend existing tests' page coverage is already complete per-page from Tasks 5-8 — this task adds the reduced-motion-specific assertions)
- Create: new reduced-motion Playwright test(s) in `e2e/accessibility.spec.ts` or a new `e2e/reduced-motion.spec.ts`, implementer's choice

**Interfaces:**
- Consumes: every component/page produced by Tasks 1-8.

- [ ] **Step 1: Run the complete Vitest suite one more time from a clean state**

Run: `npm test`
Expected: every test across the whole project passes (this project started this plan at 297 tests; by this point it should be at least 297 + ~25 new tests added across Tasks 2-6 — confirm the exact count and note it in the task report).

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 3: Write `e2e/reduced-motion.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.describe('reduced motion fallback', () => {
  test.use({ reducedMotion: 'reduce' });

  test('dashboard shows the static glass fallback instead of the WebGL orb', async ({ page }) => {
    const email = `test-reduced-motion-dashboard-${Date.now()}@example.com`;
    await page.goto('/signup');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await expect(page.getByTestId('webgl-static-fallback')).toBeVisible();
    await expect(page.getByTestId('webgl-accent')).not.toBeVisible();
  });

  test('login page shows the static glass fallback instead of the WebGL hero scene', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('webgl-static-fallback')).toBeVisible();
    await expect(page.getByTestId('webgl-accent')).not.toBeVisible();
  });
});
```

- [ ] **Step 4: Run the new reduced-motion Playwright spec**

Run: `npx playwright test e2e/reduced-motion.spec.ts`
Expected: both tests pass. If `webgl-static-fallback` isn't found on `/login`'s narrow default viewport in CI, check `playwright.config.ts`'s default viewport width against the `640px` narrow-viewport threshold in `WebGLAccent.tsx` — the two fallback conditions (reduced-motion, narrow-viewport) are independent, but a CI default viewport under 640px would trigger the narrow-viewport path regardless of the `reducedMotion` emulation and the test would still pass for the right visible outcome, just not exercising the specific code path its name implies; note this in the task report either way.

- [ ] **Step 5: Run the full existing Playwright suite (confirms Tasks 5-8's restyling didn't break any existing flow)**

Run: `npm run test:e2e`
Expected: every existing spec in `e2e/accessibility.spec.ts` and `e2e/dashboard.spec.ts` still passes, including every axe-core WCAG 2.1 AA check, now against the restyled markup.

- [ ] **Step 6: Live browser verification — WebGL accents**

Using a real browser (not emulated), verify:
- Dashboard hero orb renders and animates on a normal-width viewport with motion not reduced.
- Orb color/intensity visibly differs between an account with no active cycle (default "on track" look) and one with a real projected shortfall (start a cycle with a starting amount smaller than a bill due before the cycle ends, confirm the orb shows the shortfall coloring).
- Login and signup pages show the glass torus scene on a normal-width viewport.
- Resizing the browser below 640px width switches both to the static fallback live, without a page reload.
- Enabling the OS/browser's reduced-motion setting and reloading shows the static fallback on both pages.

- [ ] **Step 7: Live browser verification — realtime sync**

Open the same account's dashboard and cashflow pages in two separate browser tabs. In one tab, mark a bill paid (or add a new bill). Confirm the *other* tab's `CashFlowTrajectoryChart` and `ProjectionList` update without a manual reload, within a few seconds. Confirm the dashboard orb's `DashboardHeroOrb` in the other tab also updates if the change flips the shortfall state.

- [ ] **Step 8: Lighthouse performance pass**

Run a Lighthouse audit (Chrome DevTools or `npx lighthouse`) against the production build (`npm run build && npm run start`, then audit `http://localhost:3000/dashboard` and `http://localhost:3000/login`). Compare the Performance score against this project's pre-redesign baseline (re-run the same audit against the previous production deployment at `https://budget-buddy-1aur.vercel.app` if a like-for-like local baseline isn't available). Note both scores in the task report — this is a comparison, not a hard pass/fail gate, but a regression of more than ~15 points on either page should be investigated (likely cause: an unintended non-dynamic Three.js import, or `AmbientBlobs`/`GlassPanel` stacking beyond the ~4-5-simultaneous-blur-layer guardrail from this plan's Global Constraints).

- [ ] **Step 9: Deploy and verify live**

Push the final commit (if not already pushed), confirm Vercel's GitHub integration deploys it, and repeat Steps 6-7's live verification against the real production URL (`https://budget-buddy-1aur.vercel.app`) rather than only localhost — this is where `ABLY_API_KEY`'s production environment-variable configuration (Task 3, Step 16) actually gets exercised for the first time.

- [ ] **Step 10: Commit and push the final test file**

```bash
git add e2e/reduced-motion.spec.ts
git commit -m "test: add reduced-motion WebGL fallback coverage and complete redesign verification"
git push
```

---

## Self-Review Notes

- **Spec coverage:** Section 3 (design tokens/primitives) → Tasks 1-2. Section 4 (WebGL accents, 3 fallback paths) → Task 6 (`WebGLAccent`) + Tasks 6-7 (consumers). Section 5 (trajectory chart) → Task 5. Section 6 (page-by-page table) → Tasks 6-8 (every page and its exact treatment level). Section 7 (testing/accessibility) → woven into every task's own test steps + Task 9's whole-suite pass. Section 8 (performance guardrails) → Task 1 (dynamic import setup), Task 9 Step 8 (Lighthouse). Section 9 (live sync) → Tasks 3-4. Section 10 (out of scope) → respected throughout (no schema/route-shape changes beyond the one-line publish additions). Section 11 (rollout) → every task pushes directly to `main`.
- **Placeholder scan:** no "TBD"/"add error handling"/"similar to Task N" — Task 8's `ExpensesClient`/`BillForm`/etc. instruction specifies the exact, unambiguous mechanical transformation rule rather than writing out every file's full diff, which was a deliberate scoping choice (noted inline) rather than a placeholder, since the transformation itself is fully and concretely specified.
- **Type consistency:** `GlassPanel`'s prop shape (`elevation`, `hoverable`, `className`, `children`) is used identically in Tasks 5, 6, 7, 8. `WebGLAccent`'s `loadScene`/`sceneProps`/`alt` shape is used identically in Tasks 6 and 7. `useRealtimeCycleUpdates(onUpdate)` signature is used identically in Task 4 (CashFlowClient, CoachCard) and Task 6 (DashboardHeroOrb). `channelNameForUser`/`publishCycleUpdate` from Task 3 are the same functions Task 4's hook test double implicitly relies on via the token route's capability shape.
- **Corrected precision vs. the spec text:** the spec's Section 9 described "the four chat tool handlers" as if they needed separate wiring from the five lib/route write paths. Reading `app/api/cycles/chat/route.ts` (done before writing this plan) confirmed the chat handlers are thin closures calling the exact same `addBill`/`markBillPaid`/`addIncomeSource`/`logIncomeEntry`/`updateCycleAmount` functions the REST routes call — so Task 3 wires the publish call into those shared functions once, and both paths get live sync for free, with no separate chat-route change needed. This is a refinement the spec's author (writing before reading that file) didn't have visibility into; it doesn't change the spec's intent, only removes redundant work.
