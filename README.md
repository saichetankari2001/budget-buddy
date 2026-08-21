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

## Deployment

1. Push this repo to GitHub (already done).
2. In Vercel, "Import Project" from the GitHub repo.
3. Set environment variables in Vercel: `DATABASE_URL` (Neon), `JWT_SECRET`.
4. Deploy — Vercel auto-builds on every push to `main`.
5. Run `npx prisma migrate deploy` locally (pointed at the production `DATABASE_URL`) after the first deploy, and after any future schema change.
