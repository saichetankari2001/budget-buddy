# Budget Buddy Mobile (Flutter) — Design Spec

**Status:** New project. Spans two repositories: a small, additive companion change to the existing `budget-buddy` repo (this one), and a brand-new `budget-buddy-mobile` repo (Flutter) created as part of implementing this spec. This spec lives here because `budget-buddy-mobile` doesn't exist yet.

## Context

Budget Buddy's web app (Next.js 14, Prisma/Neon Postgres, deployed on Vercel) is fully built and live. The user wants a mobile companion app now that the web feature/redesign work has settled. Confirmed via user decisions during brainstorming:

- **Stack:** Flutter (not React Native), despite React Native's closer fit to the user's existing React/Next.js background — the user's explicit choice.
- **V1 scope:** the "core loop" — login/signup, dashboard (spending this month + financial health score), view/add expenses, and the AI Money Coach chat. Budgets, cash-flow forecasting, and savings goals are explicitly deferred to a later round.
- **Repo:** a new local folder (`~/Downloads/budget-buddy-mobile`) with its own GitHub repo under the same `saichetankari2001` account, mirroring how `budget-buddy` itself is set up.

The mobile app is a pure client. **No new backend, no new database** — it reads and writes the exact same Neon Postgres data as the web app, through the existing Next.js API, so a user's data is identical and in sync across both. This also means the AI Money Coach (now on Groq, see the project's recent migration) behaves identically from mobile — same tools, same system prompt, same backend.

## Goals

- A real, usable Flutter app covering: sign in / sign up, a dashboard (total spent this month, financial health score, a start-cycle flow when no cycle is active), viewing and adding expenses, and chatting with the Money Coach.
- Zero duplicated business logic. Every number the mobile app shows is computed server-side by the same functions the web app already uses (`computeHealthScore`, `projectCycle`, `aggregateByCategory`, etc.) — the mobile app's job is to call an endpoint and render JSON, never to re-derive a financial figure itself.
- A clean, documented API boundary between the two repos, so each can be worked on (and reviewed) independently.

## Non-goals (V1)

- Budgets, cash-flow forecasting, savings goals — deferred to a follow-up round once the core loop is proven on a real device.
- Offline mode / local caching beyond what's needed for a smooth loading state.
- Push notifications (web already has its own via VAPID; mobile push is a separate, later concern).
- Biometric login (Face ID / fingerprint) — plain email/password for V1, matching web.
- Any change to the data model, Prisma schema, or existing web behavior. Every backend change below is additive.

## Architecture

```
┌─────────────────────┐        HTTPS / JSON         ┌──────────────────────────┐
│  budget-buddy-mobile │  ──────────────────────────▶│  budget-buddy (Next.js)  │
│  (Flutter, new repo) │ ◀────────────────────────────│  existing API routes     │
└─────────────────────┘                              └──────────┬───────────────┘
                                                                  │
                                                          Prisma / Neon Postgres
                                                           (unchanged, shared)
```

The mobile app is additive to the existing system — it's a second client in front of the same backend, the same way a second browser tab would be, except it needs its own auth transport (see below) since it has no cookie jar.

## Part 1: Backend companion changes (in `budget-buddy`, this repo)

Two small, additive changes. Neither touches existing web behavior.

### 1a. Dual-mode auth: cookie (web) + Bearer header (mobile)

Today, `lib/auth/session.ts`'s `getCurrentUser()` only reads the `token` httpOnly cookie. Mobile has no browser cookie jar, so it needs a token it can store itself (in `flutter_secure_storage`, the Keychain/Keystore-backed standard) and attach manually.

- `getCurrentUser()` tries the existing cookie first (unchanged path for web), then falls back to parsing `Authorization: Bearer <token>` from the request headers when no cookie is present. This requires passing the `Request`/`Headers` into `getCurrentUser()` — currently it takes no arguments and reads `cookies()` from `next/headers`, which only works inside a request context; the Bearer-header fallback needs the actual incoming `Request` object, so each route that calls `getCurrentUser()` needs to pass its `request` through.
- **Scoped to only the routes V1 mobile actually calls** (the eight listed in the API contracts table below, plus the new `/api/dashboard/summary`) — not every route file in the app. Routes mobile never touches (bills, income sources, budgets, savings goals, push subscriptions, etc.) stay cookie-only for now; they get the same treatment later if/when mobile grows into those features. Each change is mechanical (pass `request` in, read the header out) with zero logic change for the existing cookie path.
- `POST /api/auth/login` and `POST /api/auth/signup` additionally return the signed token in the JSON body (`{ id, email, token }`) alongside the existing `Set-Cookie` header. Web ignores the extra `token` field (it already works via the cookie); mobile reads it and stores it.

### 1b. New endpoint: `GET /api/dashboard/summary`

The web dashboard's "Total spent this month" and "financial health score" are currently computed inline inside `app/dashboard/page.tsx` (a React Server Component) — there's no REST endpoint exposing them today, because the web app never needed one. Mobile can't run a Next.js Server Component, so this needs a thin new route that calls the exact same existing functions and returns their result as JSON:

```ts
// GET /api/dashboard/summary
{
  totalSpentThisMonth: number;
  healthScore: { value: number; hasScore: boolean }; // hasScore=false when there's no active cycle yet
}
```

Implementation is a direct lift of `app/dashboard/page.tsx`'s existing logic (`getCurrentMonthRange`, `aggregateByCategory`, `computeHealthScore`) into a route handler — no new business logic, no new tests for the underlying computations (already tested where they live), just a route test confirming the JSON shape and the 401/no-cycle cases.

## Part 2: The Flutter app (`budget-buddy-mobile`, new repo)

### Tech choices

- **Flutter + Dart**, user's explicit choice over React Native.
- **Riverpod** for state management — current Flutter-community default, less boilerplate than Bloc, more testable than plain `Provider`, and maps naturally onto "fetch this, show loading/error/data" which is most of what this app does.
- **`dio`** as the HTTP client (over bare `http`) — built-in interceptor support, which is exactly what's needed to attach the Bearer token to every request in one place rather than repeating it per call.
- **`flutter_secure_storage`** to persist the auth token between app launches (Keychain on iOS, Keystore on Android).

### App structure

```
lib/
  main.dev.dart / main.dart       # entry point, Riverpod ProviderScope
  core/
    api_client.dart               # dio instance + auth interceptor; base URL config
    auth_storage.dart             # read/write the token via flutter_secure_storage
  features/
    auth/                          # login + signup screens, auth state provider
    dashboard/                     # dashboard screen, start-cycle form (no-cycle state)
    expenses/                      # expense list, add-expense form, category dropdown
    coach/                         # chat screen, message list, composer
  shared/
    models/                        # plain Dart classes mirroring API JSON shapes
    widgets/                       # shared UI (loading spinner, error banner, etc.)
```

Navigation: a bottom `NavigationBar` with three tabs (Dashboard, Expenses, Coach), sitting behind a login/signup flow — unauthenticated users never see the tabs.

### API contracts V1 actually uses

| Purpose | Method + path | Request | Response |
|---|---|---|---|
| Sign up | `POST /api/auth/signup` | `{email, password}` | `{id, email, token}` |
| Log in | `POST /api/auth/login` | `{email, password}` | `{id, email, token}` |
| Dashboard summary | `GET /api/dashboard/summary` | — | `{totalSpentThisMonth, healthScore}` (new, Part 1b) |
| Active cycle | `GET /api/cycles/active` | — | cycle details or `null` (existing route, unchanged) |
| Start a cycle | `POST /api/cycles` | `{startingAmount, endDate}` | created cycle (existing route, unchanged) |
| List expenses | `GET /api/expenses` | query: `categoryId?, from?, to?` | `Expense[]` (existing route, unchanged) |
| Add expense | `POST /api/expenses` | `{amount, description, categoryId, date, isRecurring?, recurrenceInterval?}` | created `Expense` (existing route, unchanged) |
| List categories | `GET /api/categories` | — | `Category[]` (existing route, unchanged; needed for the add-expense form's dropdown) |
| Chat with coach | `POST /api/cycles/chat` | `{message}` | `{reply}` (existing route, unchanged) |

Every row marked "existing route, unchanged" needs zero backend work beyond the dual-mode auth change in Part 1a — they already return exactly the JSON the Flutter app needs.

### Error handling

- Any `401` response clears the stored token and routes back to the login screen — the same "session expired" handling the web app gets for free from its cookie's own expiry, done explicitly here since mobile has to manage that itself.
- Network/timeout errors on an explicit user action (adding an expense, sending a chat message) surface a visible error with a retry affordance — unlike the web Coach chat's fail-soft fallback text (appropriate there because Gemini/Groq calls are expected to occasionally fail), a failed expense save on mobile must not look like it succeeded.
- The dashboard's `hasScore: false` state (no active cycle) renders the same start-cycle form web shows via `CoachCard`, not an error state — it's an expected, common state for a new user.

### Testing

- `flutter_test` + `mocktail` for unit tests of the API client and Riverpod providers (mocking `dio` responses).
- Widget tests for each screen's loading/error/data states.
- No CI workflow in V1 (the `budget-buddy` web repo didn't have one at this stage either) — can be added once the app is running on a real device and the team wants to formalize it.

## Testing the backend changes (this repo)

- `lib/auth/session.ts`'s updated `getCurrentUser()`: unit tests for cookie-present, Bearer-header-present, both-absent, and malformed-header cases.
- Each of the eight updated route files: its existing test suite continues to pass unchanged (the cookie path is untouched) plus one new test confirming the Bearer-header path also authenticates correctly.
- `GET /api/dashboard/summary`: route tests mirroring `app/dashboard/page.tsx`'s own existing test coverage (if any) or `category-breakdown/route.ts`'s test style — 401 when unauthenticated, correct shape when authenticated, `hasScore: false` when no active cycle exists.
