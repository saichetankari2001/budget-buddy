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
