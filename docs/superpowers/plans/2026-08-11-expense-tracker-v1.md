# Budget Buddy v1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 MVP of Budget Buddy: signup/login/logout, categories, expense CRUD, and a dashboard with a category-breakdown pie chart, a 6-month trend line chart, and a filterable expense list — as a Next.js 14 App Router app backed by Prisma + Neon Postgres.

**Architecture:** Next.js App Router with Route Handlers (`app/api/**/route.ts`) as the backend, Prisma as the ORM against Neon Postgres, Server Components for initial data loads, Client Components for forms/charts/filters. Auth is a hand-rolled JWT (signed/verified with `jose`, not `jsonwebtoken`) stored in an httpOnly cookie, checked in `middleware.ts` for route protection.

**Tech Stack:** Next.js 14 (App Router) + TypeScript, Prisma + Neon Postgres, Tailwind CSS, Zod, `jose` (JWT), `bcryptjs` (password hashing), Recharts, Vitest + React Testing Library + `vitest-mock-extended`, Playwright, GitHub Actions.

## Global Constraints

- Every route handler validates input with Zod before touching Prisma (per spec Auth/Data Model sections).
- Errors return a consistent JSON shape via `AppError` + `handleRouteError` (per spec Auth section).
- No paid services — Neon free tier, Vercel free tier only (per spec Purpose).
- `amount` is stored as `Decimal(10,2)`, never `Float` — money must not use binary floating point.
- v1 scope only: **no** `isRecurring`/`recurrenceInterval` fields on `Expense` and **no** `Budget` model yet — those are added in the v1.1/v1.2 follow-on plans (per spec Feature Phasing). Do not add them now.
- As each task is implemented, the engineer explaining it to the user should state *why* the chosen approach was used over the obvious alternative (e.g., why `jose` not `jsonwebtoken`, why `bcryptjs` not `bcrypt`) — this is a deliberate learning project, not just a deliverable. See rationale notes inline in each task.

---

## File Structure

```
budget-buddy/
├── app/
│   ├── layout.tsx                  # root layout, imports globals.css
│   ├── page.tsx                    # redirects to /dashboard or /login
│   ├── globals.css
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── dashboard/page.tsx          # Server Component: charts + stats
│   ├── expenses/page.tsx           # Server Component: filterable list + form
│   └── api/
│       ├── auth/
│       │   ├── signup/route.ts
│       │   ├── login/route.ts
│       │   └── logout/route.ts
│       ├── categories/route.ts     # GET, POST
│       └── expenses/
│           ├── route.ts            # GET (filtered list), POST
│           └── [id]/route.ts       # PATCH, DELETE
├── components/
│   ├── charts/
│   │   ├── CategoryPieChart.tsx
│   │   └── MonthlyTrendChart.tsx
│   └── expenses/
│       ├── ExpenseForm.tsx
│       └── ExpenseFilters.tsx
├── lib/
│   ├── prisma.ts
│   ├── constants.ts                 # DEFAULT_CATEGORIES
│   ├── auth/
│   │   ├── password.ts
│   │   ├── jwt.ts
│   │   └── session.ts
│   ├── errors/
│   │   ├── AppError.ts
│   │   └── handleRouteError.ts
│   ├── validation/
│   │   ├── auth.schema.ts
│   │   ├── category.schema.ts
│   │   └── expense.schema.ts
│   └── utils/
│       └── expenseAggregation.ts
├── tests/mocks/prisma.ts            # vitest-mock-extended Prisma mock
├── e2e/dashboard.spec.ts            # Playwright smoke test
├── prisma/schema.prisma
├── middleware.ts
├── .github/workflows/ci.yml
├── vitest.config.ts
├── playwright.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── next.config.mjs
├── tsconfig.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `README.md`

**Interfaces:**
- Produces: a running Next.js dev server at `localhost:3000`, path alias `@/*` → project root, Tailwind available in `app/globals.css`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "budget-buddy",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@prisma/client": "^5.19.1",
    "zod": "^3.23.8",
    "jose": "^5.6.3",
    "bcryptjs": "^2.4.3",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/node": "^20.14.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/bcryptjs": "^2.4.6",
    "tailwindcss": "^3.4.4",
    "postcss": "^8.4.38",
    "autoprefixer": "^10.4.19",
    "prisma": "^5.19.1",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.5",
    "vitest": "^1.6.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "@testing-library/react": "^15.0.7",
    "@testing-library/jest-dom": "^6.4.6",
    "vitest-mock-extended": "^1.3.1",
    "@playwright/test": "^1.44.1"
  }
}
```

- [ ] **Step 2: Run `npm install`**

```bash
cd /Users/saichetankari/Downloads/budget-buddy
npm install
```

Expected: installs without errors, creates `package-lock.json` and `node_modules/`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 4b: Create `vitest.config.ts` and `vitest.setup.ts`**

Created now (not later) because Task 6 onward writes tests that import via the `@/` alias (e.g. `@/lib/prisma`, `@/tests/mocks/prisma`) — Vitest doesn't read `tsconfig.json`'s `paths` automatically, so this alias must be configured before the first such test runs.

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
```

`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create Tailwind config**

`postcss.config.js`:
```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
.next/
.env
.env.local
*.tsbuildinfo
coverage/
playwright-report/
test-results/
```

- [ ] **Step 7: Create `.env.example`**

```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
JWT_SECRET="replace-with-a-long-random-string"
```

- [ ] **Step 8: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Create `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
```

`/dashboard` is behind auth middleware (Task 8), so unauthenticated visitors land here and get bounced to `/login` automatically — this page itself needs no auth check.

- [ ] **Step 11: Create `README.md`**

```markdown
# Budget Buddy

Full-stack expense tracker built with Next.js (App Router), Prisma, and Neon Postgres.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (Neon) and `JWT_SECRET`
3. `npm run prisma:migrate`
4. `npm run dev`

## Testing

- `npm test` — unit/component tests (Vitest)
- `npm run test:e2e` — end-to-end smoke test (Playwright, requires `npm run dev` running)
```

- [ ] **Step 12: Verify dev server runs**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no errors. Stop it with Ctrl+C before continuing.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind and TypeScript"
```

---

### Task 2: Prisma Schema & Neon Connection

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`

**Interfaces:**
- Produces: `prisma.user`, `prisma.category`, `prisma.expense` client models; `export const prisma: PrismaClient` from `lib/prisma.ts`.

**Rationale:** `lib/prisma.ts` uses the standard Next.js Prisma singleton pattern — without it, every hot-reload in dev creates a new `PrismaClient` and a new DB connection pool, which exhausts Neon's connection limit within a few edits. This is a Next.js-specific gotcha worth knowing for interviews.

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  createdAt    DateTime   @default(now())
  categories   Category[]
  expenses     Expense[]
}

model Category {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  color     String
  createdAt DateTime  @default(now())
  expenses  Expense[]

  @@unique([userId, name])
}

model Expense {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  amount      Decimal  @db.Decimal(10, 2)
  description String
  date        DateTime
  createdAt   DateTime @default(now())

  @@index([userId, date])
}
```

- [ ] **Step 2: Set up Neon and local `.env`**

Create a free Neon project at neon.tech, copy the pooled connection string, then:

```bash
cp .env.example .env
```

Edit `.env` and paste the Neon connection string as `DATABASE_URL`, and set `JWT_SECRET` to a random 32+ character string (e.g. `openssl rand -base64 32`).

- [ ] **Step 3: Run the first migration**

```bash
npm run prisma:migrate -- --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/`, applies it to Neon, prints "Your database is now in sync with your schema."

- [ ] **Step 4: Create `lib/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Verify Prisma Client generates and connects**

```bash
npm run prisma:generate
npx prisma studio
```

Expected: Prisma Studio opens in the browser showing empty `User`, `Category`, `Expense` tables. Close it with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema and Neon connection"
```

---

### Task 3: Error Handling Utilities

**Files:**
- Create: `lib/errors/AppError.ts`, `lib/errors/handleRouteError.ts`, `lib/errors/handleRouteError.test.ts`

**Interfaces:**
- Produces: `class AppError extends Error { constructor(statusCode: number, message: string, code?: string) }`, `function handleRouteError(error: unknown): NextResponse`

- [ ] **Step 1: Create `lib/errors/AppError.ts`**

```ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 2: Write the failing test for `handleRouteError`**

`lib/errors/handleRouteError.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import { handleRouteError } from './handleRouteError';
import { AppError } from './AppError';

describe('handleRouteError', () => {
  it('maps AppError to its status code and message', async () => {
    const res = handleRouteError(new AppError(409, 'Email already in use', 'EMAIL_TAKEN'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Email already in use', code: 'EMAIL_TAKEN' });
  });

  it('maps ZodError to 400 with validation details', async () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
    const res = handleRouteError((result as { success: false; error: ZodError }).error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('maps unknown errors to 500', async () => {
    const res = handleRouteError(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/errors/handleRouteError.test.ts
```

Expected: FAIL — `handleRouteError` module not found.

- [ ] **Step 4: Create `lib/errors/handleRouteError.ts`**

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './AppError';

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: error.flatten() },
      { status: 400 }
    );
  }

  console.error(error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/errors/handleRouteError.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add AppError and centralized route error handling"
```

---

### Task 4: Password & JWT Utilities

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/password.test.ts`, `lib/auth/jwt.ts`, `lib/auth/jwt.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, hash: string): Promise<boolean>`
  - `interface TokenPayload { userId: string; email: string }`
  - `signToken(payload: TokenPayload): Promise<string>`
  - `verifyToken(token: string): Promise<TokenPayload | null>`

**Rationale (state this when explaining the task):**
- **`bcryptjs` instead of `bcrypt`:** `bcrypt` uses native C++ bindings, which can fail to install/build on Vercel's serverless build environment. `bcryptjs` is a pure-JS reimplementation — slightly slower, but zero native-dependency risk in a serverless deploy target. booking-api used `bcrypt` because it runs on a normal Node server, not serverless — different deploy target, different trade-off.
- **`jose` instead of `jsonwebtoken`:** `middleware.ts` (Task 8) runs on Next.js's **Edge Runtime** by default, which doesn't have Node's `crypto` module that `jsonwebtoken` depends on. `jose` is built on Web Crypto APIs, so the exact same code works in Edge Runtime (middleware) and Node runtime (route handlers, Server Components) — one library instead of two.

- [ ] **Step 1: Write the failing test for password hashing**

`lib/auth/password.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes a password to a different string', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/auth/password.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/auth/password.ts`**

```ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/auth/password.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for JWT sign/verify**

`lib/auth/jwt.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { signToken, verifyToken } from './jwt';

describe('JWT sign/verify', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('signs a payload and verifies it back', async () => {
    const token = await signToken({ userId: 'user_123', email: 'a@example.com' });
    const payload = await verifyToken(token);
    expect(payload).toMatchObject({ userId: 'user_123', email: 'a@example.com' });
  });

  it('returns null for a garbage token', async () => {
    expect(await verifyToken('not-a-real-token')).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signToken({ userId: 'user_123', email: 'a@example.com' });
    process.env.JWT_SECRET = 'a-completely-different-secret-value-here';
    expect(await verifyToken(token)).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run lib/auth/jwt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Create `lib/auth/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  userId: string;
  email: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run lib/auth/jwt.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add password hashing and JWT sign/verify utilities"
```

---

### Task 5: Auth Validation Schemas

**Files:**
- Create: `lib/validation/auth.schema.ts`, `lib/validation/auth.schema.test.ts`

**Interfaces:**
- Consumes: `zod` (`z`)
- Produces: `signupSchema`, `loginSchema` (Zod schemas), `type SignupInput`, `type LoginInput`

- [ ] **Step 1: Write the failing test**

`lib/validation/auth.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema } from './auth.schema';

describe('signupSchema', () => {
  it('accepts a valid email and an 8+ char password', () => {
    const result = signupSchema.safeParse({ email: 'a@example.com', password: 'longenough' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = signupSchema.safeParse({ email: 'not-an-email', password: 'longenough' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({ email: 'a@example.com', password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts any non-empty password with a valid email', () => {
    const result = loginSchema.safeParse({ email: 'a@example.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'a@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/validation/auth.schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/validation/auth.schema.ts`**

```ts
import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/validation/auth.schema.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add signup/login Zod validation schemas"
```

---

### Task 6: Signup Route + Default Categories

**Files:**
- Create: `lib/constants.ts`, `tests/mocks/prisma.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/signup/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`), `signupSchema` (`lib/validation/auth.schema.ts`), `hashPassword` (`lib/auth/password.ts`), `signToken` (`lib/auth/jwt.ts`), `AppError`/`handleRouteError` (`lib/errors/*`)
- Produces: `POST /api/auth/signup` handler; `prismaMock` (`tests/mocks/prisma.ts`) reused by all later route-handler tests; `DEFAULT_CATEGORIES: { name: string; color: string }[]` (`lib/constants.ts`)

**Rationale:** Route handler tests mock Prisma with `vitest-mock-extended` rather than hitting the real Neon database — keeps unit tests fast and independent of network/DB state. Real end-to-end DB behavior is covered once, by the Playwright smoke test in Task 17.

- [ ] **Step 1: Create `lib/constants.ts`**

```ts
export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Food', color: '#f97316' },
  { name: 'Transport', color: '#3b82f6' },
  { name: 'Housing', color: '#8b5cf6' },
  { name: 'Utilities', color: '#10b981' },
  { name: 'Entertainment', color: '#ec4899' },
  { name: 'Other', color: '#6b7280' },
];
```

- [ ] **Step 2: Create the shared Prisma mock helper**

`tests/mocks/prisma.ts`:
```ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';
import { beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

// eslint-disable-next-line import/first
import { prisma } from '@/lib/prisma';

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});
```

- [ ] **Step 3: Write the failing test for signup**

`app/api/auth/signup/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('creates a user with default categories and sets a session cookie', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      passwordHash: 'hashed',
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'longenough' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 'user_1', email: 'a@example.com' });
    expect(res.cookies.get('token')?.value).toBeTruthy();
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'a@example.com',
          categories: { create: expect.arrayContaining([{ name: 'Food', color: '#f97316' }]) },
        }),
      })
    );
  });

  it('returns 409 when the email is already taken', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'existing',
      email: 'a@example.com',
      passwordHash: 'x',
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'longenough' }));

    expect(res.status).toBe(409);
  });

  it('returns 400 for an invalid payload', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', password: 'short' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run app/api/auth/signup/route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 5: Create `app/api/auth/signup/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signupSchema } from '@/lib/validation/auth.schema';
import { hashPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = signupSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        categories: { create: DEFAULT_CATEGORIES },
      },
    });

    const token = await signToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run app/api/auth/signup/route.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add signup route with default categories and session cookie"
```

---

### Task 7: Login Route

**Files:**
- Create: `app/api/auth/login/route.ts`, `app/api/auth/login/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `loginSchema`, `verifyPassword`, `signToken`, `AppError`/`handleRouteError`
- Produces: `POST /api/auth/login` handler

- [ ] **Step 1: Write the failing test**

`app/api/auth/login/route.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';
import { hashPassword } from '@/lib/auth/password';
import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    const passwordHash = await hashPassword('correct-password');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      passwordHash,
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'correct-password' }));

    expect(res.status).toBe(200);
    expect(res.cookies.get('token')?.value).toBeTruthy();
  });

  it('returns 401 for a wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      passwordHash,
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'a@example.com', password: 'wrong-password' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ email: 'nobody@example.com', password: 'whatever' }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/auth/login/route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Create `app/api/auth/login/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/validation/auth.schema';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = await signToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({ id: user.id, email: user.email }, { status: 200 });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/auth/login/route.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add login route"
```

---

### Task 8: Logout Route, Session Helper, and Middleware

**Files:**
- Create: `app/api/auth/logout/route.ts`, `lib/auth/session.ts`, `lib/auth/session.test.ts`, `middleware.ts`

**Interfaces:**
- Consumes: `verifyToken`, `TokenPayload` (`lib/auth/jwt.ts`)
- Produces: `POST /api/auth/logout` handler; `getCurrentUser(): Promise<TokenPayload | null>` (used by Server Components in Tasks 14/16); Edge middleware protecting `/dashboard` and `/expenses`

**Rationale:** `getCurrentUser()` and `middleware.ts` both call the same `verifyToken` from Task 4 — because it's built on `jose`, it runs correctly in both the Edge runtime (middleware) and the Node runtime (Server Components), so there's no duplicate verification logic to maintain.

- [ ] **Step 1: Create `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('token', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
```

- [ ] **Step 2: Write the failing test for the session helper**

`lib/auth/session.test.ts`:
```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import { signToken } from './jwt';
import { getCurrentUser } from './session';

describe('getCurrentUser', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  });

  it('returns the payload for a valid cookie token', async () => {
    const token = await signToken({ userId: 'user_1', email: 'a@example.com' });
    vi.mocked(cookies).mockReturnValue({
      get: () => ({ value: token }),
    } as never);

    const user = await getCurrentUser();
    expect(user).toEqual({ userId: 'user_1', email: 'a@example.com' });
  });

  it('returns null when there is no cookie', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);

    expect(await getCurrentUser()).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/auth/session.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `lib/auth/session.ts`**

```ts
import { cookies } from 'next/headers';
import { verifyToken, TokenPayload } from './jwt';

export async function getCurrentUser(): Promise<TokenPayload | null> {
  const token = cookies().get('token')?.value;
  if (!token) {
    return null;
  }
  return verifyToken(token);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/auth/session.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Create `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/expenses/:path*'],
};
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add logout route, session helper, and auth middleware"
```

---

### Task 9: Signup & Login Pages

**Files:**
- Create: `app/signup/page.tsx`, `app/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/signup`, `POST /api/auth/login`
- Produces: `/signup` and `/login` pages (Client Components)

- [ ] **Step 1: Create `app/signup/page.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
      <h1 className="mb-6 text-2xl font-semibold">Create your account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Already have an account? <a href="/login" className="underline">Log in</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Create `app/login/page.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        No account? <a href="/signup" className="underline">Sign up</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify the auth flow end-to-end**

```bash
npm run dev
```

Visit `http://localhost:3000`, confirm it redirects to `/login`. Sign up with a new email, confirm it redirects to `/dashboard` (a blank 404-ish page is fine — Task 14 builds it). Check the browser's Application/cookies tab for an httpOnly `token` cookie. Stop the server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add signup and login pages"
```

---

### Task 10: Categories API

**Files:**
- Create: `lib/validation/category.schema.ts`, `lib/validation/category.schema.test.ts`, `app/api/categories/route.ts`, `app/api/categories/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getCurrentUser` (`lib/auth/session.ts`), `AppError`/`handleRouteError`
- Produces: `createCategorySchema`, `type CreateCategoryInput`; `GET /api/categories`, `POST /api/categories`

- [ ] **Step 1: Write the failing test for the category schema**

`lib/validation/category.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createCategorySchema } from './category.schema';

describe('createCategorySchema', () => {
  it('accepts a name and a hex color', () => {
    const result = createCategorySchema.safeParse({ name: 'Travel', color: '#1a2b3c' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-hex color', () => {
    const result = createCategorySchema.safeParse({ name: 'Travel', color: 'blue' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = createCategorySchema.safeParse({ name: '', color: '#1a2b3c' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/validation/category.schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/validation/category.schema.ts`**

```ts
import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex code, e.g. #1a2b3c'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/validation/category.schema.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for the categories route**

`app/api/categories/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { GET, POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/categories', () => {
  it("returns the current user's categories", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat_1', userId: 'user_1', name: 'Food', color: '#f97316', createdAt: new Date() },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe('POST /api/categories', () => {
  it('creates a category for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.category.create.mockResolvedValue({
      id: 'cat_2',
      userId: 'user_1',
      name: 'Travel',
      color: '#1a2b3c',
      createdAt: new Date(),
    });

    const res = await POST(makePostRequest({ name: 'Travel', color: '#1a2b3c' }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for an invalid payload', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    const res = await POST(makePostRequest({ name: '', color: 'not-a-color' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run app/api/categories/route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 7: Create `app/api/categories/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createCategorySchema } from '@/lib/validation/category.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const categories = await prisma.category.findMany({ where: { userId: user.userId } });
    return NextResponse.json(categories);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { name, color } = createCategorySchema.parse(body);

    const category = await prisma.category.create({
      data: { userId: user.userId, name, color },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run app/api/categories/route.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add categories API (list and create)"
```

---

### Task 11: Expense Validation Schemas + List/Create Route

**Files:**
- Create: `lib/validation/expense.schema.ts`, `lib/validation/expense.schema.test.ts`, `app/api/expenses/route.ts`, `app/api/expenses/route.test.ts`

**Interfaces:**
- Produces: `createExpenseSchema`, `expenseFiltersSchema`, `type CreateExpenseInput`; `GET /api/expenses?categoryId=&from=&to=`, `POST /api/expenses`

- [ ] **Step 1: Write the failing test for expense schemas**

`lib/validation/expense.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createExpenseSchema, expenseFiltersSchema } from './expense.schema';

describe('createExpenseSchema', () => {
  it('accepts a valid expense', () => {
    const result = createExpenseSchema.safeParse({
      amount: 42.5,
      description: 'Groceries',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive amount', () => {
    const result = createExpenseSchema.safeParse({
      amount: 0,
      description: 'Groceries',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty description', () => {
    const result = createExpenseSchema.safeParse({
      amount: 10,
      description: '',
      categoryId: 'cat_1',
      date: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('expenseFiltersSchema', () => {
  it('allows all filters to be omitted', () => {
    expect(expenseFiltersSchema.safeParse({}).success).toBe(true);
  });

  it('accepts categoryId and date range filters', () => {
    const result = expenseFiltersSchema.safeParse({
      categoryId: 'cat_1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/validation/expense.schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/validation/expense.schema.ts`**

```ts
import { z } from 'zod';

export const createExpenseSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  date: z.string().datetime(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const expenseFiltersSchema = z.object({
  categoryId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/validation/expense.schema.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing test for the expenses list/create route**

`app/api/expenses/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { GET, POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('GET /api/expenses', () => {
  it('lists expenses for the current user with no filters', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost/api/expenses'));
    expect(res.status).toBe(200);
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });

  it('applies categoryId and date range filters from the query string', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);

    const url =
      'http://localhost/api/expenses?categoryId=cat_1&from=2026-08-01T00:00:00.000Z&to=2026-08-31T00:00:00.000Z';
    await GET(new NextRequest(url));

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user_1',
          categoryId: 'cat_1',
          date: { gte: new Date('2026-08-01T00:00:00.000Z'), lte: new Date('2026-08-31T00:00:00.000Z') },
        },
      })
    );
  });
});

describe('POST /api/expenses', () => {
  it('creates an expense for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.create.mockResolvedValue({
      id: 'exp_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: { toString: () => '42.50' } as never,
      description: 'Groceries',
      date: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date(),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          amount: 42.5,
          description: 'Groceries',
          categoryId: 'cat_1',
          date: '2026-08-01T00:00:00.000Z',
        }),
      })
    );

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run app/api/expenses/route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 7: Create `app/api/expenses/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { createExpenseSchema, expenseFiltersSchema } from '@/lib/validation/expense.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { categoryId, from, to } = expenseFiltersSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const where: Prisma.ExpenseWhereInput = { userId: user.userId };
    if (categoryId) where.categoryId = categoryId;
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: { category: true },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(expenses);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const { amount, description, categoryId, date } = createExpenseSchema.parse(body);

    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: user.userId },
    });
    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    const expense = await prisma.expense.create({
      data: { userId: user.userId, categoryId, amount, description, date: new Date(date) },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run app/api/expenses/route.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add expenses list/create API with filtering"
```

---

### Task 12: Expense Update & Delete Route

**Files:**
- Create: `app/api/expenses/[id]/route.ts`, `app/api/expenses/[id]/route.test.ts`

**Interfaces:**
- Consumes: `updateExpenseSchema` (`lib/validation/expense.schema.ts`)
- Produces: `PATCH /api/expenses/:id`, `DELETE /api/expenses/:id`

**Rationale:** Both handlers scope the Prisma query to `{ id, userId }` together, not just `{ id }` — this is what stops one logged-in user from editing or deleting another user's expense by guessing an ID. Point this out explicitly; it's a classic authorization bug (IDOR) and a common interview question.

- [ ] **Step 1: Write the failing test**

`app/api/expenses/[id]/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/session';
import { PATCH, DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('PATCH /api/expenses/[id]', () => {
  it('updates an expense scoped to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.expense.findFirst.mockResolvedValue({
      id: 'exp_1',
      userId: 'user_1',
      categoryId: 'cat_1',
      amount: { toString: () => '10.00' } as never,
      description: 'Updated',
      date: new Date(),
      createdAt: new Date(),
    });

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Updated' }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(200);
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
      data: { description: 'Updated' },
    });
  });

  it("returns 404 when the expense doesn't belong to the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.updateMany.mockResolvedValue({ count: 0 });

    const req = new NextRequest('http://localhost/api/expenses/exp_1', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Updated' }),
    });
    const res = await PATCH(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/expenses/[id]', () => {
  it('deletes an expense scoped to the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.deleteMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/expenses/exp_1', { method: 'DELETE' });
    const res = await DELETE(req, { params: { id: 'exp_1' } });

    expect(res.status).toBe(204);
    expect(prismaMock.expense.deleteMany).toHaveBeenCalledWith({
      where: { id: 'exp_1', userId: 'user_1' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/expenses/[id]/route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Create `app/api/expenses/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { updateExpenseSchema } from '@/lib/validation/expense.schema';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const body = await request.json();
    const data = updateExpenseSchema.parse(body);

    const { count } = await prisma.expense.updateMany({
      where: { id: params.id, userId: user.userId },
      data: { ...data, ...(data.date ? { date: new Date(data.date) } : {}) },
    });

    if (count === 0) {
      throw new AppError(404, 'Expense not found');
    }

    const expense = await prisma.expense.findFirst({ where: { id: params.id, userId: user.userId } });
    return NextResponse.json(expense);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    await prisma.expense.deleteMany({ where: { id: params.id, userId: user.userId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/expenses/[id]/route.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add expense update/delete API scoped to current user"
```

---

### Task 13: Expense Aggregation Utilities

**Files:**
- Create: `lib/utils/expenseAggregation.ts`, `lib/utils/expenseAggregation.test.ts`

**Interfaces:**
- Produces:
  - `interface ExpenseWithCategory { amount: number; date: Date; category: { id: string; name: string; color: string } }`
  - `interface CategoryTotal { categoryId: string; categoryName: string; color: string; total: number }`
  - `interface MonthlyTotal { month: string; total: number }` (`month` is `'YYYY-MM'`)
  - `aggregateByCategory(expenses: ExpenseWithCategory[]): CategoryTotal[]`
  - `aggregateByMonth(expenses: ExpenseWithCategory[], monthsBack: number): MonthlyTotal[]`

- [ ] **Step 1: Write the failing tests**

`lib/utils/expenseAggregation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { aggregateByCategory, aggregateByMonth, ExpenseWithCategory } from './expenseAggregation';

const food = { id: 'cat_food', name: 'Food', color: '#f97316' };
const transport = { id: 'cat_transport', name: 'Transport', color: '#3b82f6' };

const expenses: ExpenseWithCategory[] = [
  { amount: 20, date: new Date('2026-08-05'), category: food },
  { amount: 30, date: new Date('2026-08-10'), category: food },
  { amount: 15, date: new Date('2026-08-12'), category: transport },
  { amount: 40, date: new Date('2026-07-01'), category: food },
];

describe('aggregateByCategory', () => {
  it('sums amounts per category', () => {
    const result = aggregateByCategory(expenses);
    expect(result).toEqual(
      expect.arrayContaining([
        { categoryId: 'cat_food', categoryName: 'Food', color: '#f97316', total: 90 },
        { categoryId: 'cat_transport', categoryName: 'Transport', color: '#3b82f6', total: 15 },
      ])
    );
  });

  it('returns an empty array for no expenses', () => {
    expect(aggregateByCategory([])).toEqual([]);
  });
});

describe('aggregateByMonth', () => {
  it('sums amounts per month, oldest first, for the requested window', () => {
    const result = aggregateByMonth(expenses, 2);
    expect(result).toEqual([
      { month: '2026-07', total: 40 },
      { month: '2026-08', total: 65 },
    ]);
  });

  it('includes months with zero spend in the window', () => {
    const result = aggregateByMonth(
      [{ amount: 10, date: new Date('2026-08-01'), category: food }],
      3
    );
    expect(result).toEqual([
      { month: '2026-06', total: 0 },
      { month: '2026-07', total: 0 },
      { month: '2026-08', total: 10 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/utils/expenseAggregation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/utils/expenseAggregation.ts`**

```ts
export interface ExpenseWithCategory {
  amount: number;
  date: Date;
  category: { id: string; name: string; color: string };
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
}

export interface MonthlyTotal {
  month: string; // 'YYYY-MM'
  total: number;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function aggregateByCategory(expenses: ExpenseWithCategory[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();

  for (const expense of expenses) {
    const existing = totals.get(expense.category.id);
    if (existing) {
      existing.total += expense.amount;
    } else {
      totals.set(expense.category.id, {
        categoryId: expense.category.id,
        categoryName: expense.category.name,
        color: expense.category.color,
        total: expense.amount,
      });
    }
  }

  return Array.from(totals.values());
}

export function aggregateByMonth(expenses: ExpenseWithCategory[], monthsBack: number): MonthlyTotal[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }

  const totals = new Map<string, number>(months.map((m) => [m, 0]));

  for (const expense of expenses) {
    const key = monthKey(expense.date);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + expense.amount);
    }
  }

  return months.map((month) => ({ month, total: totals.get(month) ?? 0 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Note: the second `aggregateByMonth` test is relative to "now" (`new Date()`), so it will only pass when run in/around August 2026 as written. This is acceptable for this project's timeframe; if it's run later, replace the hardcoded `2026-08-01` dates with dates relative to `new Date()` (e.g. `new Date(new Date().getFullYear(), new Date().getMonth(), 1)`).

```bash
npx vitest run lib/utils/expenseAggregation.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add expense aggregation utilities for charts"
```

---

### Task 14: Chart Components

**Files:**
- Create: `components/charts/CategoryPieChart.tsx`, `components/charts/CategoryPieChart.test.tsx`, `components/charts/MonthlyTrendChart.tsx`, `components/charts/MonthlyTrendChart.test.tsx`

**Interfaces:**
- Consumes: `CategoryTotal`, `MonthlyTotal` (`lib/utils/expenseAggregation.ts`)
- Produces: `CategoryPieChart({ data: CategoryTotal[] })`, `MonthlyTrendChart({ data: MonthlyTotal[] })`

`vitest.config.ts` and `vitest.setup.ts` already exist from Task 1 — nothing to do for them here.

- [ ] **Step 1: Write the failing test for `CategoryPieChart`**

`components/charts/CategoryPieChart.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryPieChart } from './CategoryPieChart';

describe('CategoryPieChart', () => {
  it('shows an empty state when there is no data', () => {
    render(<CategoryPieChart data={[]} />);
    expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
  });

  it('renders a legend entry per category', () => {
    render(
      <CategoryPieChart
        data={[
          { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 90 },
          { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', total: 15 },
        ]}
      />
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/charts/CategoryPieChart.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/charts/CategoryPieChart.tsx`**

```tsx
'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CategoryTotal } from '@/lib/utils/expenseAggregation';

export function CategoryPieChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">No expenses yet this month.</p>;
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
          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-3 flex flex-wrap gap-3 text-sm">
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

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/charts/CategoryPieChart.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `MonthlyTrendChart`**

`components/charts/MonthlyTrendChart.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlyTrendChart } from './MonthlyTrendChart';

describe('MonthlyTrendChart', () => {
  it('shows an empty state when there is no data', () => {
    render(<MonthlyTrendChart data={[]} />);
    expect(screen.getByText(/no spending history yet/i)).toBeInTheDocument();
  });

  it('renders without crashing when given monthly totals', () => {
    render(
      <MonthlyTrendChart
        data={[
          { month: '2026-07', total: 100 },
          { month: '2026-08', total: 150 },
        ]}
      />
    );
    expect(screen.getByTestId('monthly-trend-chart')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run components/charts/MonthlyTrendChart.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 7: Create `components/charts/MonthlyTrendChart.tsx`**

```tsx
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MonthlyTotal } from '@/lib/utils/expenseAggregation';

export function MonthlyTrendChart({ data }: { data: MonthlyTotal[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">No spending history yet.</p>;
  }

  return (
    <div data-testid="monthly-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
          <Line type="monotone" dataKey="total" stroke="#111827" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run components/charts/MonthlyTrendChart.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add category pie chart and monthly trend line chart"
```

---

### Task 15: Dashboard Page

**Files:**
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `prisma`, `aggregateByCategory`, `aggregateByMonth`, `CategoryPieChart`, `MonthlyTrendChart`
- Produces: `/dashboard` page (Server Component)

- [ ] **Step 1: Create `app/dashboard/page.tsx`**

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { aggregateByCategory, aggregateByMonth } from '@/lib/utils/expenseAggregation';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { MonthlyTrendChart } from '@/components/charts/MonthlyTrendChart';

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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <a href="/expenses" className="text-sm underline">
          View all expenses
        </a>
      </div>

      <div className="mb-8 rounded border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Total spent this month</p>
        <p className="text-3xl font-semibold">${totalThisMonth.toFixed(2)}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">Spending by category (this month)</h2>
          <CategoryPieChart data={categoryTotals} />
        </section>
        <section className="rounded border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">6-month trend</h2>
          <MonthlyTrendChart data={monthlyTotals} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify**

```bash
npm run dev
```

Log in, visit `/dashboard`. Expect: "Total spent this month" card and two empty-state chart sections (no expenses exist yet — Task 16 adds the form to create them). Stop the server.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add dashboard page with charts and monthly total"
```

---

### Task 16: Expense Form Component

**Files:**
- Create: `components/expenses/ExpenseForm.tsx`, `components/expenses/ExpenseForm.test.tsx`

**Interfaces:**
- Consumes: `CreateExpenseInput` (`lib/validation/expense.schema.ts`)
- Produces: `ExpenseForm({ categories, initialValues, onSubmit }: { categories: { id: string; name: string }[]; initialValues?: { amount?: number; description?: string; categoryId?: string; date?: string }; onSubmit: (data: CreateExpenseInput) => Promise<void> })`

- [ ] **Step 1: Write the failing test**

`components/expenses/ExpenseForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpenseForm } from './ExpenseForm';

const categories = [
  { id: 'cat_1', name: 'Food' },
  { id: 'cat_2', name: 'Transport' },
];

describe('ExpenseForm', () => {
  it('submits the entered values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '25.50' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Lunch' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'cat_2' } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-08-10' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25.5, description: 'Lunch', categoryId: 'cat_2' })
    );
  });

  it('pre-fills fields from initialValues when editing', () => {
    render(
      <ExpenseForm
        categories={categories}
        initialValues={{ amount: 10, description: 'Coffee', categoryId: 'cat_1', date: '2026-08-01' }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/description/i)).toHaveValue('Coffee');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/expenses/ExpenseForm.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/expenses/ExpenseForm.tsx`**

```tsx
'use client';

import { useState, FormEvent } from 'react';
import { CreateExpenseInput } from '@/lib/validation/expense.schema';

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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col text-sm">
        Amount
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col text-sm">
        Description
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col text-sm">
        Category
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm">
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/expenses/ExpenseForm.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add expense form component"
```

---

### Task 17: Expenses Page (Filterable List, Add/Edit/Delete)

**Files:**
- Create: `components/expenses/ExpenseFilters.tsx`, `app/expenses/page.tsx`

**Interfaces:**
- Consumes: `ExpenseForm`, `GET/POST /api/expenses`, `PATCH/DELETE /api/expenses/:id`, `GET /api/categories`
- Produces: `/expenses` page

- [ ] **Step 1: Create `components/expenses/ExpenseFilters.tsx`**

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
        className="rounded border border-gray-300 px-2 py-1"
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
        className="rounded border border-gray-300 px-2 py-1"
      />
      <input
        type="date"
        value={searchParams.get('to') ?? ''}
        onChange={(e) => updateFilter('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded border border-gray-300 px-2 py-1"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `app/expenses/page.tsx`**

```tsx
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters';
import { ExpensesClient } from './ExpensesClient';

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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <a href="/dashboard" className="text-sm underline">
          Back to dashboard
        </a>
      </div>
      <ExpenseFilters categories={categories} />
      <ExpensesClient categories={categories} initialExpenses={serialized} />
    </main>
  );
}
```

- [ ] **Step 3: Create `app/expenses/ExpensesClient.tsx`**

This is the interactive part (add form, edit, delete) — split out as its own Client Component so the page above can stay a Server Component that fetches data directly from Prisma.

```tsx
'use client';

import { useState } from 'react';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
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
  categories: { id: string; name: string }[];
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
    const created = await res.json();
    const category = categories.find((c) => c.id === created.categoryId)!;
    setExpenses((prev) => [
      { ...created, amount: Number(created.amount), category: { ...category, color: '' } },
      ...prev,
    ]);
    setShowAddForm(false);
  }

  async function handleUpdate(id: string, data: CreateExpenseInput) {
    await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, amount: data.amount, description: data.description, date: data.date }
          : e
      )
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <button
        onClick={() => setShowAddForm((v) => !v)}
        className="mb-4 rounded bg-gray-900 px-3 py-2 text-sm text-white"
      >
        {showAddForm ? 'Cancel' : 'Add expense'}
      </button>

      {showAddForm && (
        <div className="mb-6 rounded border border-gray-200 p-4">
          <ExpenseForm categories={categories} onSubmit={handleCreate} />
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {expenses.map((expense) =>
          editingId === expense.id ? (
            <li key={expense.id} className="rounded border border-gray-200 p-4">
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
            </li>
          ) : (
            <li
              key={expense.id}
              className="flex items-center justify-between rounded border border-gray-200 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{expense.description}</p>
                <p className="text-gray-500">
                  {expense.category.name} · {new Date(expense.date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">${expense.amount.toFixed(2)}</span>
                <button onClick={() => setEditingId(expense.id)} className="underline">
                  Edit
                </button>
                <button onClick={() => handleDelete(expense.id)} className="text-red-600 underline">
                  Delete
                </button>
              </div>
            </li>
          )
        )}
        {expenses.length === 0 && <p className="text-sm text-gray-500">No expenses match these filters.</p>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Manually verify the full flow**

```bash
npm run dev
```

Log in, go to `/expenses`, add an expense, edit it, filter by category, delete it. Then go to `/dashboard` and confirm the charts reflect a newly-added expense (add one and refresh). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add expenses page with filters, add, edit, and delete"
```

---

### Task 18: CI, E2E Smoke Test, and Deployment Setup

**Files:**
- Create: `playwright.config.ts`, `e2e/dashboard.spec.ts`, `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run test:e2e` runnable locally; GitHub Actions workflow gating pushes/PRs to `main`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Install Playwright browsers**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 3: Write the e2e smoke test**

`e2e/dashboard.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('signup, add an expense, and see it on the dashboard', async ({ page }) => {
  const email = `test-${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
  await page.getByRole('button', { name: /sign up/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/expenses');
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/amount/i).fill('42.50');
  await page.getByLabel(/description/i).fill('Test lunch');
  await page.getByRole('button', { name: /save/i }).click();

  await expect(page.getByText('Test lunch')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByText('$42.50')).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e test against a real Neon database**

```bash
npm run test:e2e
```

Expected: PASS (1 test). This hits your real `DATABASE_URL` from `.env` — each run creates a new throwaway user (`test-<timestamp>@example.com`), so it's safe to re-run.

- [ ] **Step 5: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      JWT_SECRET: ${{ secrets.JWT_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run prisma:generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 6: Add repo secrets**

In the GitHub repo (`https://github.com/saichetankari2001/budget-buddy`) → Settings → Secrets and variables → Actions, add `DATABASE_URL` (Neon connection string) and `JWT_SECRET` (same random string used locally), so CI can run tests. Note: this plan intentionally leaves the Playwright e2e test and `prisma migrate deploy` out of CI to keep the pipeline simple for v1 — CI here only runs lint/typecheck/unit tests.

- [ ] **Step 7: Update `README.md` with deployment steps**

Add this section to `README.md`:

```markdown
## Deployment

1. Push this repo to GitHub (already done).
2. In Vercel, "Import Project" from the GitHub repo.
3. Set environment variables in Vercel: `DATABASE_URL` (Neon), `JWT_SECRET`.
4. Deploy — Vercel auto-builds on every push to `main`.
5. Run `npx prisma migrate deploy` locally (pointed at the production `DATABASE_URL`) after the first deploy, and after any future schema change.
```

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "ci: add GitHub Actions pipeline and Playwright e2e smoke test"
git push origin main
```

- [ ] **Step 9: Verify CI passes**

```bash
gh run watch
```

Expected: the workflow triggered by the push completes with all steps green. If it fails, read the failing step's log and fix before moving on — don't merge/ship with a red pipeline.

---

## End of v1

At this point: a deployed (once you complete Vercel setup), tested, working expense tracker with auth, categories, expense CRUD, and a two-chart dashboard. v1.1 (budgets), v1.2 (recurring expenses), and v1.3 (CSV export/import) are separate follow-on plans, each written the same way (brainstorming → spec → plan) once v1 is shipped and working.
