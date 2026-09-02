# Budget Buddy

[![CI](https://github.com/saichetankari2001/budget-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/saichetankari2001/budget-buddy/actions/workflows/ci.yml)

A full-stack, installable personal expense tracker — built solo, end to end,
with a spec → design → test-driven implementation → code review cycle
behind every feature.

## Features

**Core tracking**
- Email/password auth with `httpOnly` JWT cookies (`jose`, `bcryptjs`)
- Expense CRUD with categories, filtering by category/date range
- Dashboard with category and 6-month spending trend charts

**Budgets & recurring expenses**
- Per-category monthly budgets with over-budget progress indicators
- Weekly/monthly/yearly recurring expenses, generated lazily on load —
  correctly handles calendar month-end edge cases (e.g. a 31st-of-the-month
  expense recovers to the 31st again once the month is long enough, rather
  than drifting to the 28th forever) and catches up automatically on missed
  periods

**Data portability**
- CSV export of full expense history
- CSV import with per-row validation, auto-categorization, and a clear
  summary of any rows that couldn't be imported

**Australian-market compliance**
- AUD currency formatting via `Intl.NumberFormat`
- Category-level GST tracking with a "GST paid this month" dashboard stat
- A real, reachable Privacy Act 1988–informed privacy policy page

**Accessibility**
- WCAG 2.1 AA compliant, verified with automated `axe-core` scans (not just
  asserted) and locked in permanently via a CI-gated Playwright test suite
  covering every page in the app

**Installable PWA**
- Home-screen installable with a standalone window
- A hand-rolled service worker: static assets load instantly from cache,
  while API requests and page navigations always go straight to the network
  first — a finance app should never show stale or cached financial data,
  so nothing under `/api/` is ever cacheable

## Tech Stack

Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL ([Neon](https://neon.tech))
· Tailwind CSS · Vitest · Playwright · `axe-core` · GitHub Actions · Vercel

## Getting Started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (Neon) and JWT_SECRET
npm run prisma:migrate
npm run dev
```

The app runs at `http://localhost:3000`.

## Testing

```bash
npm test           # unit/component tests (Vitest)
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test:e2e    # end-to-end + accessibility suite (Playwright)
```

`test:e2e` runs against a real production build (`npm run build && npm run
start`), not the dev server — this matches exactly what CI runs on every
push, so a green run locally means a green run in CI.

## Project Structure

```
app/                  Next.js App Router routes (pages + API routes)
components/           Shared UI components (Indigo Bento design system)
lib/                  Business logic — validation, auth, pure utility
                       functions kept separate from their Prisma-touching
                       wrappers for easy unit testing
prisma/               Database schema and migrations
e2e/                  Playwright end-to-end and accessibility tests
docs/superpowers/     Design specs and implementation plans for every
                       feature — the full "why", not just the "what"
```

## Deployment

1. Push this repo to GitHub.
2. In Vercel, "Import Project" from the GitHub repo.
3. Set environment variables in Vercel: `DATABASE_URL` (Neon), `JWT_SECRET`.
4. Deploy — Vercel auto-builds on every push to `main`.
5. Run `npx prisma migrate deploy` locally (pointed at the production
   `DATABASE_URL`) after the first deploy, and after any future schema
   change.

## Privacy

The app ships its own privacy policy at the `/privacy` route, describing
what data is collected and how it's handled — see
[`app/privacy/page.tsx`](app/privacy/page.tsx).
