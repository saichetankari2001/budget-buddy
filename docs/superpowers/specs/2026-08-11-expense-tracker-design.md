# Budget Buddy — Expense Tracker Design

## Purpose

A full-stack personal expense tracker, built as a portfolio/upskilling project. The primary goal is
learning: this is the user's first Next.js project, deliberately chosen to learn the App Router /
Route Handlers / Server Component model instead of reusing a familiar stack. Secondary goal is a
polished, deployed, demoable app for job applications.

Entirely free-tier: Next.js on Vercel, Postgres on Neon, no paid services anywhere.

## Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript
- **Database/ORM:** Prisma + Neon (free-tier Postgres)
- **Backend:** Route Handlers (`app/api/**/route.ts`)
- **Rendering:** Server Components for initial data loads (dashboard, expense list); Client
  Components for interactive UI (forms, charts)
- **Styling:** Tailwind CSS
- **Validation:** Zod on all API inputs
- **Charts:** Recharts (category breakdown pie chart, monthly trend line chart)
- **Testing:** Vitest + React Testing Library (unit/component), Playwright (one e2e smoke test)
- **CI:** GitHub Actions — lint, typecheck, test on every push
- **Deploy:** Vercel (auto-deploy from `main`) + Neon; secrets (`DATABASE_URL`, `JWT_SECRET`) set in
  Vercel dashboard, never committed

### Why App Router over Pages Router

Pages Router (`pages/api/*`) would have been a gentler bridge from the user's Express background —
each handler is basically `(req, res) => {}`, same mental model as booking-api. App Router was chosen
anyway because the entire reason for picking Next.js was to learn something genuinely new (the
Server/Client Component boundary), and that pattern is what current Next.js codebases and job
postings actually use.

## Data Model (Prisma schema, conceptual)

- **User** — id, email (unique), passwordHash, createdAt
- **Category** — id, userId, name, color; defaults (Food, Transport, Housing, Utilities,
  Entertainment, Other) auto-created on signup, user can add more
- **Expense** — id, userId, categoryId, amount, description, date, isRecurring (bool),
  recurrenceInterval (nullable enum, e.g. MONTHLY), createdAt
- **Budget** — id, userId, categoryId, monthlyLimit — one ongoing limit per category, evaluated
  against the current month's actual spend (not a row per month)

No refresh-token table. See Auth below for why.

## Auth

Rolled by hand (not Auth.js), but intentionally simpler than booking-api's access+refresh-token
setup — the new learning here is Next.js's cookie/middleware model, not token rotation, which the
user already built once in booking-api.

- **Signup** — `POST /api/auth/signup`: bcrypt-hash password, create user + default categories, sign
  a JWT, set as an httpOnly + secure cookie
- **Login** — `POST /api/auth/login`: verify password (bcrypt), sign JWT, set cookie
- **Logout** — `POST /api/auth/logout`: clear cookie
- **Route protection** — `middleware.ts` validates the JWT on every request to protected
  pages/API routes, redirects to `/login` if missing/invalid
- JWT expires in 7 days; single token, no refresh rotation

Errors follow a consistent shape via a custom `AppError` class and centralized handling per route,
same convention as booking-api. All inputs validated with Zod before touching Prisma.

## Feature Phasing

Each phase is a complete, working increment — not a partial build. Chosen over building all
features simultaneously to reduce the risk of ending up with four half-finished features on a first
Next.js project, and because sequencing/scoping work this way mirrors real sprint-based delivery.

- **v1 (MVP):** auth (signup/login/logout), categories (defaults + custom), expense CRUD
  (add/edit/delete, amount/category/date/description), dashboard (category breakdown pie chart for
  current month, 6-month spend trend line chart, total-spent-this-month stat), filterable expense
  list (by category, date range)
- **v1.1:** budgets — set a monthly limit per category, dashboard shows progress bars and
  over-budget warnings
- **v1.2:** recurring expenses — mark an expense as recurring (e.g. monthly); new instances are
  generated lazily on dashboard/login load rather than via a real cron job, keeping the app
  100% free with no extra infrastructure
- **v1.3:** CSV export (download expenses as CSV) and import (upload a CSV, preview parsed rows,
  confirm import)

## Testing & Quality

Testing is core scope for v1, not optional — addressing the gap that AI-assisted ("vibe") coding
tends to leave, and because test strategy is a common interview topic.

- Vitest for unit tests: route handlers (Prisma mocked), utility functions (e.g. recurrence date
  math)
- React Testing Library for component tests (forms, chart data transforms)
- One Playwright end-to-end smoke test: signup → add an expense → see it reflected on the dashboard
  chart
- GitHub Actions runs lint, typecheck, and all tests on every push/PR

## Deployment

- Vercel, connected to the GitHub repo, auto-deploys `main`
- Neon free-tier Postgres, connected via `DATABASE_URL`
- `JWT_SECRET` and `DATABASE_URL` set as Vercel environment variables, never committed to the repo

## Explicitly Out of Scope (for now)

- OAuth/social login
- Multi-currency support
- Shared/family budgets (multi-user per account)
- Real cron-based recurring generation (Vercel Cron) — noted as a possible later exercise, not v1-v1.3
