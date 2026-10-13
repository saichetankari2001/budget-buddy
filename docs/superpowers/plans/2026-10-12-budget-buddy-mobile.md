# Budget Buddy Mobile (Flutter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Flutter mobile app ("budget-buddy-mobile", a new repo) covering Budget Buddy's core loop — login/signup, a dashboard, viewing/adding expenses, and chatting with the Money Coach — backed by the existing `budget-buddy` Next.js API via a small, additive dual-mode-auth change.

**Architecture:** The mobile app is a pure client with no new backend or database — it calls `budget-buddy`'s existing API routes over HTTPS, reading/writing the same Neon Postgres data as the web app. Because mobile has no browser cookie jar, `budget-buddy` gains an additive `Authorization: Bearer <token>` fallback on the 8 routes mobile uses; existing cookie-based web behavior is unchanged everywhere, including the 21 other call sites of `getCurrentUser()` this plan never touches.

**Tech Stack:** Flutter + Dart (mobile), Riverpod (state), `dio` (HTTP) + `flutter_secure_storage` (token storage) on the mobile side; the existing Next.js 14 / Prisma / Neon stack, unchanged, on the backend side.

**Spec:** `docs/superpowers/specs/2026-10-12-budget-buddy-mobile-design.md`

## Global Constraints

- Zero changes to existing web cookie-based auth behavior — every backend change is additive. `getCurrentUser()`'s new `request` parameter is **optional**; omitting it (all 21 other call sites, left untouched) behaves exactly as today, cookie-only.
- The dual-mode auth change touches ONLY the 8 routes mobile V1 uses: `/api/auth/signup`, `/api/auth/login`, `/api/dashboard/summary` (new), `/api/cycles/active`, `/api/cycles` (POST), `/api/expenses` (GET+POST), `/api/categories` (GET), `/api/cycles/chat` (POST).
- Zero new business logic in `/api/dashboard/summary` — it only calls existing functions (`computeHealthScore`, `getCurrentMonthRange`) that already compute these exact figures inline in `app/dashboard/page.tsx`.
- Flutter: Riverpod for state management, `dio` for HTTP, `flutter_secure_storage` for the auth token. No other state-management or HTTP library.
- V1 feature scope is fixed: auth, dashboard (summary stat + start-cycle flow), expenses (list + add), coach chat. Budgets, cash-flow forecasting, and savings goals are explicitly out of scope for V1.
- Repo A (`budget-buddy`): commit locally per task; ONE batched `git push` at the end of Task 5, not per task (standing project convention — Vercel's free-tier deploy quota is limited).
- Repo A: work happens directly on `main`, no worktree. Never pass `isolation:"worktree"` to an Agent-tool dispatch on this repo.
- Repo B (`budget-buddy-mobile`): a brand-new repo with no Vercel project attached — no deploy-quota concern, so each task may commit and push as it finishes.
- TDD throughout Repo A (failing test first, this project's established convention). Repo B: test-alongside is acceptable given the UI-heavy nature of Flutter widget code, but every task ends with real, passing test coverage before being marked complete — never skip the test step to "come back to it later."
- Live verification in Tasks 5 and 12 uses the throwaway test account `nalinijarugula@gmail.com` / `Pravs@1112` — never a real user account.

## Review Focus

1. **Expired or garbage Bearer token** — a mobile request with a malformed or expired token must 401 cleanly, the same as no token at all, never throw an unhandled error or get treated as authenticated.
2. **Both cookie and Bearer header absent** — the existing "not authenticated" 401 path must still work identically after the Bearer fallback is added; this is the literal definition of "additive."
3. **`/api/dashboard/summary` with no active cycle** — must return `{ totalSpentThisMonth, healthScore: { value: 0, hasScore: false } }`, never throw, never silently return a healthScore that looks like real data (a score of exactly `0` with `hasScore: true` would be misleading — the dashboard's own existing em-dash-instead-of-100 comment in `app/dashboard/page.tsx` explains why this distinction matters).
4. **A 401 from any authenticated call, on the Flutter side** — must clear the stored token and route back to the login screen, not loop silently or show stale cached data as if it were current.
5. **A failed `POST /api/expenses` on the Flutter side (network error or non-2xx)** — must show a visible, retriable error. Unlike the web Coach chat's intentional fail-soft fallback (appropriate because an LLM call is expected to occasionally fail), a failed expense save must never look like it succeeded — the user would believe money was tracked that wasn't.

---

## Repo A: `budget-buddy` backend changes

### Task 1: Install and verify the Flutter SDK

**Files:** none (machine environment only — no repo changes, no commit).

**Interfaces:**
- Produces: a working `flutter` command on this machine, confirmed via `flutter doctor`, that every later Repo B task depends on.

This task has no git repo of its own — it's pure local environment setup, done once, before any Repo B work begins.

- [ ] **Step 1: Install the Flutter SDK via Homebrew**

```bash
brew install --cask flutter
```

- [ ] **Step 2: Install the Android command-line SDK tools (not the full Android Studio GUI)**

V1 targets **Android only** — full Xcode (needed for iOS) is a 10+ GB App Store download requiring an interactive Apple ID sign-in that can't be scripted, and isn't installed on this machine. Android's command-line tools are scriptable end-to-end and sufficient for an emulator or a physical Android device over USB.

```bash
brew install --cask android-commandlinetools
```

- [ ] **Step 3: Accept Android SDK licenses and install the platform + build tools**

```bash
export ANDROID_SDK_ROOT="$(brew --prefix android-commandlinetools)/libexec"
yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;arm64-v8a"
flutter config --android-sdk "$ANDROID_SDK_ROOT"
```

(Apple Silicon Macs need the `arm64-v8a` system image, not `x86_64` — Rosetta emulation of an x86 Android image is noticeably slower. If this machine is Intel, swap to `system-images;android-34;google_apis;x86_64` instead; check with `uname -m` first.)

- [ ] **Step 4: Create one Android Virtual Device (AVD) for later development/testing**

```bash
echo "no" | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd -n budget_buddy_test -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_6
```

- [ ] **Step 5: Run `flutter doctor` and resolve anything it flags**

```bash
flutter doctor -v
```

Expected: Flutter, Android toolchain, and Android Studio/emulator lines all show a green checkmark (Android Studio itself doesn't need to be installed — `flutter doctor` only needs the SDK and licenses, which the steps above provide). The Xcode line will show an issue ("Xcode not installed") — that's expected and fine, since V1 is Android-only; do not attempt to resolve it.

If `flutter doctor` reports a problem this plan didn't anticipate: fix it following `flutter doctor`'s own suggested command where one is given, and note what was needed in this task's completion report so later tasks (and the user) know the environment needed an unplanned fix.

No commit for this task — proceed directly to Task 2.

---

### Task 2: Add an optional Bearer-token fallback to `getCurrentUser()`

**Files:**
- Modify: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

**Interfaces:**
- Produces: `getCurrentUser(request?: NextRequest): Promise<TokenPayload | null>` — the `request` parameter is new and **optional**. Every one of the 21 existing call sites that doesn't pass it keeps compiling and behaving identically (cookie-only). Task 3's 8 routes are the only callers that will pass it.

Current file (read fresh before editing — do not assume this is still exact):

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

- [ ] **Step 1: Write the failing tests**

Add these to the existing `describe('getCurrentUser', ...)` block in `lib/auth/session.test.ts` (which already has a `vi.mock('next/headers', ...)` and a "returns the payload for a valid cookie token" / "returns null when there is no cookie" pair — keep those two exactly as they are, since the cookie-only path must stay provably unchanged):

```ts
  it('falls back to the Authorization Bearer header when there is no cookie and a request is passed', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);
    const token = await signToken({ userId: 'user_2', email: 'b@example.com' });
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getCurrentUser(request);
    expect(user).toEqual({ userId: 'user_2', email: 'b@example.com' });
  });

  it('prefers the cookie over the Bearer header when both are present', async () => {
    const cookieToken = await signToken({ userId: 'cookie_user', email: 'cookie@example.com' });
    const headerToken = await signToken({ userId: 'header_user', email: 'header@example.com' });
    vi.mocked(cookies).mockReturnValue({
      get: () => ({ value: cookieToken }),
    } as never);
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: `Bearer ${headerToken}` },
    });

    const user = await getCurrentUser(request);
    expect(user).toEqual({ userId: 'cookie_user', email: 'cookie@example.com' });
  });

  it('returns null when there is no cookie and no request is passed at all (every existing call site)', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);

    expect(await getCurrentUser()).toBeNull();
  });

  it('returns null for a malformed Authorization header (no Bearer prefix)', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: 'not-a-bearer-token' },
    });

    expect(await getCurrentUser(request)).toBeNull();
  });

  it('returns null for a well-formed but invalid/expired Bearer token', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => undefined,
    } as never);
    const request = new Request('http://localhost/api/expenses', {
      headers: { Authorization: 'Bearer this-is-not-a-real-jwt' },
    });

    expect(await getCurrentUser(request)).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: the 2 pre-existing tests PASS; the 5 new ones FAIL (either a TypeScript error on the extra argument, or `getCurrentUser` ignoring it and returning `null`).

- [ ] **Step 3: Implement the fallback**

```ts
import { cookies } from 'next/headers';
import { verifyToken, TokenPayload } from './jwt';

export async function getCurrentUser(request?: Request): Promise<TokenPayload | null> {
  const cookieToken = cookies().get('token')?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  const authHeader = request?.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const headerToken = authHeader.slice('Bearer '.length);
  return verifyToken(headerToken);
}
```

Note the parameter type is the plain `Request` type (not `NextRequest`) — `NextRequest` extends `Request` and both expose the same `.headers.get(...)`, so typing the parameter as the broader `Request` keeps this function framework-agnostic and matches what `new Request(...)` produces in the tests above.

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit (locally — do not push)**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts
git commit -m "feat: add optional Bearer-token fallback to getCurrentUser for mobile clients"
```

---

### Task 3: Wire the 8 mobile-facing routes through to the new `getCurrentUser` signature

**Files:**
- Modify: `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`, `app/api/cycles/active/route.ts`, `app/api/cycles/route.ts`, `app/api/expenses/route.ts`, `app/api/categories/route.ts`, `app/api/cycles/chat/route.ts`
- Test: the existing `.test.ts` file next to each of the above

**Interfaces:**
- Consumes: `getCurrentUser(request?: Request): Promise<TokenPayload | null>` from Task 2.
- Produces: all 8 routes callable from a mobile client via `Authorization: Bearer <token>` with no cookie present. Login and signup additionally return `{ id, email, token }` in their JSON body (previously `{ id, email }`).

Read each route file fresh before editing (current state may differ slightly from what's quoted in the spec). For six of the seven files, the route function **already** takes a `request: NextRequest` parameter — the only change there is swapping `getCurrentUser()` for `getCurrentUser(request)`. `app/api/categories/route.ts`'s `GET` is the one exception: it currently takes no parameter at all and needs one added.

- [ ] **Step 1: `app/api/categories/route.ts` — add the missing `request` parameter to `GET`**

Current:
```ts
export async function GET() {
  try {
    const user = await getCurrentUser();
```

New:
```ts
import { NextRequest, NextResponse } from 'next/server';
// ... existing imports ...

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
```

(Confirm the file's existing import line for `NextRequest`/`NextResponse` before adding a duplicate — `POST` in this same file may already import what `GET` needs.)

- [ ] **Step 2: The remaining six files — pass the existing `request` through**

In each of `app/api/cycles/active/route.ts`, `app/api/cycles/route.ts`, `app/api/expenses/route.ts` (both `GET` and `POST`), `app/api/cycles/chat/route.ts`, change the line `const user = await getCurrentUser();` to `const user = await getCurrentUser(request);`. `app/api/cycles/active/route.ts`'s `GET` currently names its parameter `_request` (underscore-prefixed, since it was previously unused) — rename it to `request` when you use it.

- [ ] **Step 3: `app/api/auth/login/route.ts` and `app/api/auth/signup/route.ts` — return the token in the JSON body**

Login, current:
```ts
    const response = NextResponse.json({ id: user.id, email: user.email }, { status: 200 });
    response.cookies.set('token', token, {
```

Login, new:
```ts
    const response = NextResponse.json({ id: user.id, email: user.email, token }, { status: 200 });
    response.cookies.set('token', token, {
```

Signup gets the identical change (its `NextResponse.json({ id: user.id, email: user.email }, { status: 201 })` line gains `, token`). Neither route needs `getCurrentUser` changes — they issue the token, they never check for an existing one.

- [ ] **Step 4: Add one test per updated route confirming `getCurrentUser` receives the request**

Every one of these route test files already mocks `getCurrentUser` entirely (`vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))`), so the route's own test suite never exercises the real Bearer-parsing logic — that's fully covered by Task 2's `session.test.ts`. What these tests need to confirm is narrower and more useful: that the route actually *passes the request through* at all, since a route that still calls `getCurrentUser()` with no argument would pass every existing test (the mock doesn't care) while silently remaining cookie-only for mobile.

Add to each of the six files' existing passing-case test (e.g. `app/api/expenses/route.test.ts`'s "lists expenses for the current user with no filters"):

```ts
    expect(getCurrentUser).toHaveBeenCalledWith(expect.anything());
```

(`expect.anything()` rather than a specific request instance — the route constructs its own `NextRequest` internally from whatever the test's `new NextRequest(...)` call produced, and asserting "called with the request object, whatever it was" is what actually matters; asserting exact referential equality is both harder to set up across these six differently-shaped test files and not the thing this test is protecting against.)

For `app/api/categories/route.ts`'s `GET`, since it's gaining a parameter that didn't exist before, also update its test's call site from `GET()` to `GET(new NextRequest('http://localhost/api/categories'))` (check the test file's existing import of `NextRequest` — `POST`'s tests in the same file likely already import it).

For login and signup, add one assertion to each of their one passing-case tests:

```ts
    const body = await res.json();
    expect(body.token).toBeTruthy();
```

- [ ] **Step 5: Run each updated route's test file**

Run: `npx vitest run app/api/categories/route.test.ts app/api/cycles/active/route.test.ts app/api/cycles/route.test.ts app/api/expenses/route.test.ts app/api/cycles/chat/route.test.ts app/api/auth/login/route.test.ts app/api/auth/signup/route.test.ts`
Expected: every test in every file PASSes, including the new assertions.

- [ ] **Step 6: Commit (locally — do not push)**

```bash
git add app/api/categories/route.ts app/api/categories/route.test.ts \
        app/api/cycles/active/route.ts app/api/cycles/active/route.test.ts \
        app/api/cycles/route.ts app/api/cycles/route.test.ts \
        app/api/expenses/route.ts app/api/expenses/route.test.ts \
        app/api/cycles/chat/route.ts app/api/cycles/chat/route.test.ts \
        app/api/auth/login/route.ts app/api/auth/login/route.test.ts \
        app/api/auth/signup/route.ts app/api/auth/signup/route.test.ts
git commit -m "feat: wire the 8 mobile-facing routes through to the Bearer-token auth fallback"
```

---

### Task 4: New `GET /api/dashboard/summary` route

**Files:**
- Create: `app/api/dashboard/summary/route.ts`
- Test: `app/api/dashboard/summary/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser(request)` (Task 2/3), `computeHealthScore` from `@/lib/health/computeHealthScore`, `getCurrentMonthRange` from `@/lib/utils/dateRange` — both already exist and are already tested where they live; this task adds zero new business logic, only a route wrapper.
- Produces: `GET /api/dashboard/summary` → `{ totalSpentThisMonth: number, healthScore: { value: number, hasScore: boolean } }` when authenticated, `401` when not. Mirrors `app/api/cycles/active/category-breakdown/route.ts`'s existing shape/convention (same auth-check style, same "no active cycle" handling), but this route always returns an object — never `null` — since `totalSpentThisMonth` is meaningful with or without an active cycle.

This is a direct lift of the exact logic already in `app/dashboard/page.tsx` lines computing `totalThisMonth` and `hasHealthScore`/`healthScoreValue` — deliberately NOT the `spendTrend`/`healthScoreTrend` sparkline arrays, since the spec's V1 dashboard contract doesn't need them (YAGNI — don't port logic the mobile app has no use for).

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/health/computeHealthScore', () => ({ computeHealthScore: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { GET } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

function makeRequest() {
  return new NextRequest('http://localhost/api/dashboard/summary');
}

describe('GET /api/dashboard/summary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('calls getCurrentUser with the request, so the Bearer fallback is reachable', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    await GET(makeRequest());

    expect(getCurrentUser).toHaveBeenCalledWith(expect.anything());
  });

  it('sums this calendar month\'s expenses for totalSpentThisMonth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([
      { amount: { toString: () => '20.00' } as never, date: new Date('2026-09-05T00:00:00.000Z'), category: null },
      { amount: { toString: () => '15.50' } as never, date: new Date('2026-09-10T00:00:00.000Z'), category: null },
    ] as never);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.totalSpentThisMonth).toBe(35.5);
  });

  it('reports hasScore:false and value:0 when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.healthScore).toEqual({ value: 0, hasScore: false });
    expect(computeHealthScore).not.toHaveBeenCalled();
  });

  it('reports the real score and hasScore:true when there is an active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      status: 'ACTIVE',
      startingAmount: { toString: () => '500.00' } as never,
    } as never);
    vi.mocked(computeHealthScore).mockResolvedValue({ total: 72 } as never);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.healthScore).toEqual({ value: 72, hasScore: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/dashboard/summary/route.test.ts`
Expected: FAIL — the route file (`./route`) doesn't exist yet.

- [ ] **Step 3: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { computeHealthScore } from '@/lib/health/computeHealthScore';
import { getCurrentMonthRange } from '@/lib/utils/dateRange';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const now = new Date();
    const { start, end } = getCurrentMonthRange(now);

    const currentMonthExpenses = await prisma.expense.findMany({
      where: { userId: user.userId, date: { gte: start, lt: end } },
    });
    const totalSpentThisMonth = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const activeCycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });

    let healthScore = { value: 0, hasScore: false };
    if (activeCycle) {
      const score = await computeHealthScore(
        user.userId,
        {
          id: activeCycle.id,
          startDate: activeCycle.startDate,
          endDate: activeCycle.endDate,
          createdAt: activeCycle.createdAt,
          status: activeCycle.status,
          startingAmount: Number(activeCycle.startingAmount),
        },
        now
      );
      healthScore = { value: score.total, hasScore: true };
    }

    return NextResponse.json({ totalSpentThisMonth, healthScore });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/dashboard/summary/route.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit (locally — do not push)**

```bash
git add app/api/dashboard/summary/route.ts app/api/dashboard/summary/route.test.ts
git commit -m "feat: add GET /api/dashboard/summary for the mobile dashboard"
```

---

### Task 5: Whole-Repo-A verification, batched push, and live Bearer-auth check

**Files:** none new — this task verifies Tasks 1-4's combined result.

**Interfaces:**
- Consumes: everything from Tasks 2-4.
- Produces: all of Repo A's changes live in production, confirmed to actually work over a real HTTPS request with a Bearer token — the thing every Repo B task from here on depends on.

- [ ] **Step 1: Run the full test suite, typecheck, and lint**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: full suite green (461 existing tests + the ~12 new ones from Tasks 2-4), typecheck clean, lint clean.

- [ ] **Step 2: Push — the one batched push for this entire Repo A portion**

```bash
git log origin/main..HEAD --oneline
git push
```

- [ ] **Step 3: Wait for CI, then confirm the deploy is live**

```bash
until gh run list --branch main --limit 1 --json headSha,status -q '.[0] | select(.headSha=="'"$(git rev-parse HEAD)"'") | .status' 2>/dev/null | grep -q completed; do sleep 10; done
gh run list --branch main --limit 1
```

Expected: `completed success`.

- [ ] **Step 4: Live-verify the Bearer-token path against production for all 8 routes**

Using the throwaway account:

```bash
BASE="https://budget-buddy-1aur.vercel.app"

# Log in and extract the token from the JSON body (not the cookie)
LOGIN_RESPONSE=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nalinijarugula@gmail.com","password":"Pravs@1112"}')
echo "$LOGIN_RESPONSE"
TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")

# Each of these must return 200 (or a legitimate non-401 status like 400 for cycles-POST
# if a cycle is already active) using ONLY the Bearer header — no cookie jar at all.
curl -s -o /dev/null -w "cycles/active: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/cycles/active"
curl -s -o /dev/null -w "dashboard/summary: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/dashboard/summary"
curl -s -o /dev/null -w "expenses GET: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/expenses"
curl -s -o /dev/null -w "categories GET: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/categories"

# Negative control: the same requests with NO Authorization header at all must 401.
curl -s -o /dev/null -w "cycles/active, no auth: %{http_code}\n" "$BASE/api/cycles/active"
```

Expected: every authenticated call returns `200`; the no-auth control returns `401`. If any authenticated call returns `401`, stop and debug before proceeding to Repo B — every later task assumes this works.

No commit for this task (nothing new to commit — Step 2 already pushed everything).

---

## Repo B: `budget-buddy-mobile` (new repo)

### Task 6: Scaffold the Flutter project and its GitHub repo

**Files:**
- Create: the entire `~/Downloads/budget-buddy-mobile` project (via `flutter create`), plus `pubspec.yaml` dependency additions and the `lib/` folder skeleton below.

**Interfaces:**
- Produces: a running (but empty) Flutter app, a git repo with an initial commit, and a pushed GitHub repo at `saichetankari2001/budget-buddy-mobile` — the foundation every later Repo B task builds on.

- [ ] **Step 1: Create the Flutter project**

```bash
cd ~/Downloads
flutter create --org com.saichetankari.budgetbuddy --project-name budget_buddy_mobile budget-buddy-mobile
cd budget-buddy-mobile
```

- [ ] **Step 2: Add the three runtime dependencies and two dev dependencies**

Edit `pubspec.yaml`'s `dependencies:` and `dev_dependencies:` sections (keep everything `flutter create` already added, e.g. `flutter`, `cupertino_icons`, `flutter_lints`):

```yaml
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
  flutter_riverpod: ^2.5.1
  dio: ^5.4.3
  flutter_secure_storage: ^9.2.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
  http_mock_adapter: ^0.6.1
  mocktail: ^1.0.3
```

```bash
flutter pub get
```

Expected: resolves with no version conflicts. If `flutter pub get` reports a conflict, use `flutter pub outdated` to find compatible versions and adjust the carets above — don't skip resolving this, every later task needs these packages installed.

- [ ] **Step 3: Create the folder skeleton**

```bash
mkdir -p lib/core lib/features/auth lib/features/dashboard lib/features/expenses lib/features/coach lib/shared/models lib/shared/widgets
mkdir -p test/core test/features/auth test/features/dashboard test/features/expenses test/features/coach
```

- [ ] **Step 4: Run the default test to confirm the scaffold is sound**

```bash
flutter test
```

Expected: PASS (the one default counter-app widget test `flutter create` generates).

- [ ] **Step 5: Git init, initial commit**

```bash
git add -A
git commit -m "chore: scaffold Flutter project with Riverpod, dio, flutter_secure_storage"
```

- [ ] **Step 6: Create and push the GitHub repo**

```bash
gh repo create saichetankari2001/budget-buddy-mobile --public --source=. --remote=origin --push
```

(Public, matching `budget-buddy`'s own visibility — flag this choice when reporting the task done, in case the user wants it private instead; changing visibility afterward is a one-line `gh repo edit --visibility private` fix, not a re-architecture.)

---

### Task 7: API client core — `ApiClient` and `AuthStorage`

**Files:**
- Create: `lib/core/auth_storage.dart`, `lib/core/api_client.dart`
- Test: `test/core/auth_storage_test.dart`, `test/core/api_client_test.dart`

**Interfaces:**
- Produces: `AuthStorage` (`saveToken`, `readToken`, `clearToken`) and `createApiClient(AuthStorage, {onUnauthorized}) -> Dio` — every later feature task's API calls go through the `Dio` instance this returns, which automatically attaches `Authorization: Bearer <token>` from `AuthStorage` to every request, and automatically clears the token and calls `onUnauthorized` on any `401` response from ANY call, from any screen — this is the one place Review Focus item 4 ("a 401 must clear the token and route back to login") gets implemented, so no individual feature screen has to remember to handle it.

- [ ] **Step 1: Write `AuthStorage` with its test**

`test/core/auth_storage_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:budget_buddy_mobile/core/auth_storage.dart';

class MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late MockSecureStorage mockStorage;
  late AuthStorage authStorage;

  setUp(() {
    mockStorage = MockSecureStorage();
    authStorage = AuthStorage(storage: mockStorage);
  });

  test('saveToken writes under the fixed key', async () {
    when(() => mockStorage.write(key: any(named: 'key'), value: any(named: 'value')))
        .thenAnswer((_) async {});

    await authStorage.saveToken('abc123');

    verify(() => mockStorage.write(key: 'auth_token', value: 'abc123')).called(1);
  });

  test('readToken returns null when nothing is stored', async () {
    when(() => mockStorage.read(key: any(named: 'key'))).thenAnswer((_) async => null);

    expect(await authStorage.readToken(), isNull);
  });

  test('readToken returns the stored token', async () {
    when(() => mockStorage.read(key: 'auth_token')).thenAnswer((_) async => 'abc123');

    expect(await authStorage.readToken(), 'abc123');
  });

  test('clearToken deletes the stored token', async () {
    when(() => mockStorage.delete(key: any(named: 'key'))).thenAnswer((_) async {});

    await authStorage.clearToken();

    verify(() => mockStorage.delete(key: 'auth_token')).called(1);
  });
}
```

(Note: Dart test functions are not actually declared `async` in the signature like that — write each `test(...)` body as `() async { ... }`, i.e. `test('saveToken writes under the fixed key', () async { ... });`. The snippet above shows the assertions; fit them into that correct closure syntax.)

- [ ] **Step 2: Run to verify failure**

```bash
flutter test test/core/auth_storage_test.dart
```
Expected: FAIL — `lib/core/auth_storage.dart` doesn't exist yet.

- [ ] **Step 3: Implement `AuthStorage`**

`lib/core/auth_storage.dart`:
```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthStorage {
  AuthStorage({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _tokenKey = 'auth_token';

  Future<void> saveToken(String token) => _storage.write(key: _tokenKey, value: token);

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> clearToken() => _storage.delete(key: _tokenKey);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
flutter test test/core/auth_storage_test.dart
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Write `ApiClient` with its test**

`test/core/api_client_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:mocktail/mocktail.dart';
import 'package:budget_buddy_mobile/core/api_client.dart';
import 'package:budget_buddy_mobile/core/auth_storage.dart';

class MockAuthStorage extends Mock implements AuthStorage {}

void main() {
  late MockAuthStorage mockAuthStorage;

  setUp(() {
    mockAuthStorage = MockAuthStorage();
  });

  test('attaches the stored token as a Bearer Authorization header', () async {
    when(() => mockAuthStorage.readToken()).thenAnswer((_) async => 'my-token');

    final dio = createApiClient(mockAuthStorage);
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter
        .onGet('/api/expenses', (server) => server.reply(200, []))
        .withDelay(Duration.zero);

    await dio.get('/api/expenses');

    // dio_mock_adapter's recorded request options are the source of truth for what was sent.
    expect(dio.options.headers['Authorization'], isNull); // base options unaffected; the interceptor adds it per-request
  });

  test('sends no Authorization header when there is no stored token', () async {
    when(() => mockAuthStorage.readToken()).thenAnswer((_) async => null);

    final dio = createApiClient(mockAuthStorage);
    final dioAdapter = DioAdapter(dio: dio);
    bool sawAuthHeader = false;
    dioAdapter.onGet('/api/expenses', (server) {
      server.reply(200, []);
    });

    await dio.get('/api/expenses');

    expect(sawAuthHeader, isFalse);
  });

  test('base URL points at the deployed Budget Buddy API', () {
    final dio = createApiClient(mockAuthStorage);
    expect(dio.options.baseUrl, 'https://budget-buddy-1aur.vercel.app');
  });

  test('clears the stored token and calls onUnauthorized on a 401 response', () async {
    when(() => mockAuthStorage.readToken()).thenAnswer((_) async => 'stale-token');
    when(() => mockAuthStorage.clearToken()).thenAnswer((_) async {});
    bool unauthorizedCalled = false;

    final dio = createApiClient(mockAuthStorage, onUnauthorized: () => unauthorizedCalled = true);
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onGet('/api/dashboard/summary', (server) => server.reply(401, {'error': 'Not authenticated'}));

    await expectLater(dio.get('/api/dashboard/summary'), throwsA(isA<DioException>()));

    verify(() => mockAuthStorage.clearToken()).called(1);
    expect(unauthorizedCalled, isTrue);
  });
}
```

(The first two tests above sketch the intent — asserting on an interceptor's injected header through `http_mock_adapter` requires reading the `RequestOptions` the adapter received, which varies slightly by `http_mock_adapter` version. When implementing this step, check that package's README for the exact "inspect request headers" API for the version `flutter pub get` resolved in Task 6, and adjust these two tests' assertions to use it — the base-URL test's assertion is exact and won't need adjusting.)

- [ ] **Step 6: Run to verify failure**

```bash
flutter test test/core/api_client_test.dart
```
Expected: FAIL — `lib/core/api_client.dart` doesn't exist yet.

- [ ] **Step 7: Implement `ApiClient`**

`lib/core/api_client.dart`:
```dart
import 'package:dio/dio.dart';
import 'auth_storage.dart';

const String kApiBaseUrl = 'https://budget-buddy-1aur.vercel.app';

Dio createApiClient(AuthStorage authStorage, {void Function()? onUnauthorized}) {
  final dio = Dio(BaseOptions(baseUrl: kApiBaseUrl));

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await authStorage.readToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // Centralized here, not per-screen: ANY 401 from ANY call means the stored token is
        // stale or invalid, so clear it and let the caller (dioProvider, which has access to
        // Riverpod's ref) re-evaluate auth state — every screen gets this behavior for free
        // without remembering to handle it individually.
        if (error.response?.statusCode == 401) {
          await authStorage.clearToken();
          onUnauthorized?.call();
        }
        handler.next(error);
      },
    ),
  );

  return dio;
}
```

- [ ] **Step 8: Run to verify pass, then run the whole suite**

```bash
flutter test test/core/api_client_test.dart
flutter test
```
Expected: all pass.

- [ ] **Step 9: Commit and push**

```bash
git add lib/core/auth_storage.dart lib/core/api_client.dart test/core/auth_storage_test.dart test/core/api_client_test.dart pubspec.yaml pubspec.lock
git commit -m "feat: add AuthStorage and ApiClient (dio + Bearer-token interceptor)"
git push
```

---

### Task 8: Auth feature — login and signup screens

**Files:**
- Create: `lib/features/auth/auth_state.dart` (Riverpod provider), `lib/features/auth/login_screen.dart`, `lib/features/auth/signup_screen.dart`
- Test: `test/features/auth/auth_state_test.dart`, `test/features/auth/login_screen_test.dart`

**Interfaces:**
- Consumes: `createApiClient`/`AuthStorage` (Task 7).
- Produces: an `authStateProvider` (Riverpod `AsyncNotifier` or equivalent) exposing the current login state and a `login(email, password)` / `signup(email, password)` method, which every other feature screen checks to decide whether to show its content or redirect to login.

This task validates end-to-end against Task 5's live, deployed Repo A changes — not a local server, since there is none; `kApiBaseUrl` always points at the real Vercel deployment.

- [ ] **Step 1: Write the failing test for the auth state provider**

`test/features/auth/auth_state_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:mocktail/mocktail.dart';
import 'package:budget_buddy_mobile/core/auth_storage.dart';
import 'package:budget_buddy_mobile/features/auth/auth_state.dart';

class MockAuthStorage extends Mock implements AuthStorage {}

void main() {
  test('login saves the returned token and marks the user authenticated', async () {
    final mockAuthStorage = MockAuthStorage();
    when(() => mockAuthStorage.saveToken(any())).thenAnswer((_) async {});

    final dio = Dio();
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onPost(
      '/api/auth/login',
      (server) => server.reply(200, {'id': 'user_1', 'email': 'a@example.com', 'token': 'returned-token'}),
      data: {'email': 'a@example.com', 'password': 'correct-password'},
    );

    final container = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(dio),
      authStorageProvider.overrideWithValue(mockAuthStorage),
    ]);
    addTearDown(container.dispose);

    final notifier = container.read(authStateProvider.notifier);
    await notifier.login('a@example.com', 'correct-password');

    expect(container.read(authStateProvider).value?.isAuthenticated, isTrue);
    verify(() => mockAuthStorage.saveToken('returned-token')).called(1);
  });

  test('login surfaces an error state on invalid credentials', async () {
    final mockAuthStorage = MockAuthStorage();
    final dio = Dio();
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onPost(
      '/api/auth/login',
      (server) => server.reply(401, {'error': 'Invalid email or password'}),
      data: {'email': 'a@example.com', 'password': 'wrong-password'},
    );

    final container = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(dio),
      authStorageProvider.overrideWithValue(mockAuthStorage),
    ]);
    addTearDown(container.dispose);

    final notifier = container.read(authStateProvider.notifier);
    await notifier.login('a@example.com', 'wrong-password');

    expect(container.read(authStateProvider).hasError, isTrue);
    verifyNever(() => mockAuthStorage.saveToken(any()));
  });
}
```

(Again, write the `async` bodies as `() async { ... }` closures per correct Dart test syntax — the snippets above convey the logic, not literal copy-pasteable Dart.)

- [ ] **Step 2: Run to verify failure**

```bash
flutter test test/features/auth/auth_state_test.dart
```
Expected: FAIL — `lib/features/auth/auth_state.dart` doesn't exist yet.

- [ ] **Step 3: Implement the providers and notifier**

`lib/features/auth/auth_state.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/auth_storage.dart';

final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());

final dioProvider = Provider<Dio>((ref) {
  return createApiClient(
    ref.watch(authStorageProvider),
    // The token is already cleared inside createApiClient's own onError hook (Task 7) — this
    // callback's only job is telling Riverpod the auth state is now stale, so _RootGate (Task 11)
    // re-reads AuthStorage and swaps to the login screen on its own, from wherever the user was.
    onUnauthorized: () => ref.invalidate(authStateProvider),
  );
});

class AuthResult {
  const AuthResult({required this.isAuthenticated});
  final bool isAuthenticated;
}

class AuthStateNotifier extends AsyncNotifier<AuthResult> {
  @override
  Future<AuthResult> build() async {
    final token = await ref.watch(authStorageProvider).readToken();
    return AuthResult(isAuthenticated: token != null);
  }

  Future<void> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.post('/api/auth/login', data: {'email': email, 'password': password});
      final token = response.data['token'] as String;
      await ref.read(authStorageProvider).saveToken(token);
      state = const AsyncData(AuthResult(isAuthenticated: true));
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
    }
  }

  Future<void> signup(String email, String password) async {
    state = const AsyncLoading();
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.post('/api/auth/signup', data: {'email': email, 'password': password});
      final token = response.data['token'] as String;
      await ref.read(authStorageProvider).saveToken(token);
      state = const AsyncData(AuthResult(isAuthenticated: true));
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
    }
  }

  Future<void> logout() async {
    await ref.read(authStorageProvider).clearToken();
    state = const AsyncData(AuthResult(isAuthenticated: false));
  }
}

final authStateProvider = AsyncNotifierProvider<AuthStateNotifier, AuthResult>(AuthStateNotifier.new);
```

- [ ] **Step 4: Run to verify pass**

```bash
flutter test test/features/auth/auth_state_test.dart
```
Expected: both tests PASS.

- [ ] **Step 5: Build the login screen**

`lib/features/auth/login_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_state.dart';
import 'signup_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Log in')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
            ),
            TextField(
              controller: _passwordController,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            if (authState.hasError)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'Invalid email or password.',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            ElevatedButton(
              onPressed: authState.isLoading
                  ? null
                  : () => ref.read(authStateProvider.notifier).login(
                        _emailController.text,
                        _passwordController.text,
                      ),
              child: authState.isLoading
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Log in'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SignupScreen()),
              ),
              child: const Text('No account? Sign up'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: Build the signup screen**

`lib/features/auth/signup_screen.dart` — identical structure to `login_screen.dart` above, with: title `'Sign up'`, calling `ref.read(authStateProvider.notifier).signup(...)` instead of `login(...)`, button label `'Sign up'`, and no "No account?" link at the bottom (replace it with nothing, or a `TextButton` back to login via `Navigator.pop`).

- [ ] **Step 7: Write a widget test for the login screen's three states**

`test/features/auth/login_screen_test.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:budget_buddy_mobile/features/auth/login_screen.dart';
import 'package:budget_buddy_mobile/features/auth/auth_state.dart';
import 'package:budget_buddy_mobile/core/auth_storage.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthStorage extends Mock implements AuthStorage {}

void main() {
  testWidgets('renders email, password, and a log-in button', (tester) async {
    final mockAuthStorage = MockAuthStorage();
    when(() => mockAuthStorage.readToken()).thenAnswer((_) async => null);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [authStorageProvider.overrideWithValue(mockAuthStorage)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Log in'), findsOneWidget);
  });
}
```

- [ ] **Step 8: Run to verify pass**

```bash
flutter test test/features/auth/
```
Expected: all tests PASS.

- [ ] **Step 9: Manually verify against the real deployed API**

```bash
flutter run -d <emulator-or-device-id>
```

Log in with the throwaway account (`nalinijarugula@gmail.com` / `Pravs@1112`) on the running app and confirm it reaches the login success state (no crash, no error banner). Use `flutter devices` first to find `<emulator-or-device-id>` — the AVD created in Task 1, or a physical Android device over USB with Developer Options → USB debugging enabled, whichever is available.

- [ ] **Step 10: Commit and push**

```bash
git add lib/features/auth/ test/features/auth/
git commit -m "feat: add login and signup screens with Riverpod auth state"
git push
```

---

### Task 9: Dashboard feature

**Files:**
- Create: `lib/features/dashboard/dashboard_screen.dart`, `lib/features/dashboard/dashboard_providers.dart`
- Test: `test/features/dashboard/dashboard_providers_test.dart`

**Interfaces:**
- Consumes: `dioProvider` (Task 8), `GET /api/dashboard/summary` and `GET /api/cycles/active` (Repo A).
- Produces: a dashboard screen showing total spent this month + financial health score, or a "start a cycle" form when `GET /api/cycles/active` returns `null`.

- [ ] **Step 1: Write the failing provider test**

`test/features/dashboard/dashboard_providers_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:budget_buddy_mobile/features/auth/auth_state.dart';
import 'package:budget_buddy_mobile/features/dashboard/dashboard_providers.dart';

void main() {
  test('dashboardSummaryProvider parses totalSpentThisMonth and healthScore', () async {
    final dio = Dio();
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onGet(
      '/api/dashboard/summary',
      (server) => server.reply(200, {
        'totalSpentThisMonth': 120.5,
        'healthScore': {'value': 68, 'hasScore': true},
      }),
    );

    final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(dio)]);
    addTearDown(container.dispose);

    final summary = await container.read(dashboardSummaryProvider.future);

    expect(summary.totalSpentThisMonth, 120.5);
    expect(summary.healthScore.value, 68);
    expect(summary.healthScore.hasScore, isTrue);
  });
}
```

- [ ] **Step 2: Run to verify failure**

```bash
flutter test test/features/dashboard/dashboard_providers_test.dart
```
Expected: FAIL — `lib/features/dashboard/dashboard_providers.dart` doesn't exist yet.

- [ ] **Step 3: Implement the model and providers**

`lib/features/dashboard/dashboard_providers.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_state.dart';

class HealthScore {
  const HealthScore({required this.value, required this.hasScore});
  final int value;
  final bool hasScore;

  factory HealthScore.fromJson(Map<String, dynamic> json) =>
      HealthScore(value: json['value'] as int, hasScore: json['hasScore'] as bool);
}

class DashboardSummary {
  const DashboardSummary({required this.totalSpentThisMonth, required this.healthScore});
  final double totalSpentThisMonth;
  final HealthScore healthScore;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) => DashboardSummary(
        totalSpentThisMonth: (json['totalSpentThisMonth'] as num).toDouble(),
        healthScore: HealthScore.fromJson(json['healthScore'] as Map<String, dynamic>),
      );
}

final dashboardSummaryProvider = FutureProvider.autoDispose<DashboardSummary>((ref) async {
  final dio = ref.watch(dioProvider);
  final response = await dio.get('/api/dashboard/summary');
  return DashboardSummary.fromJson(response.data as Map<String, dynamic>);
});

final activeCycleProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) async {
  final dio = ref.watch(dioProvider);
  final response = await dio.get('/api/cycles/active');
  return response.data as Map<String, dynamic>?;
});
```

- [ ] **Step 4: Run to verify pass**

```bash
flutter test test/features/dashboard/dashboard_providers_test.dart
```
Expected: PASS.

- [ ] **Step 5: Build the dashboard screen**

`lib/features/dashboard/dashboard_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dashboard_providers.dart';
import '../auth/auth_state.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(dashboardSummaryProvider);
    final cycleAsync = ref.watch(activeCycleProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        // A 401 here is already handled globally (Task 7's onUnauthorized clears the token and
        // invalidates authStateProvider, which swaps _RootGate to the login screen on its own) —
        // this generic message only ever briefly shows during that swap, or for a real
        // non-auth failure (e.g. a network error).
        error: (_, __) => const Center(child: Text('Something went wrong loading your dashboard.')),
        data: (summary) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Total spent this month', style: Theme.of(context).textTheme.titleMedium),
              Text('\$${summary.totalSpentThisMonth.toStringAsFixed(2)}', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 16),
              Text('Financial health', style: Theme.of(context).textTheme.titleMedium),
              Text(
                summary.healthScore.hasScore ? '${summary.healthScore.value}' : '—',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 24),
              cycleAsync.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (cycle) => cycle == null ? const _StartCycleForm() : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StartCycleForm extends ConsumerStatefulWidget {
  const _StartCycleForm();

  @override
  ConsumerState<_StartCycleForm> createState() => _StartCycleFormState();
}

class _StartCycleFormState extends ConsumerState<_StartCycleForm> {
  final _amountController = TextEditingController();
  DateTime? _endDate;
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    final amount = double.tryParse(_amountController.text);
    if (amount == null || _endDate == null) {
      setState(() => _error = 'Enter a starting amount and an end date.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final dio = ref.read(dioProvider);
      await dio.post('/api/cycles', data: {
        'startingAmount': amount,
        'endDate': _endDate!.toIso8601String(),
      });
      ref.invalidate(activeCycleProvider);
      ref.invalidate(dashboardSummaryProvider);
    } catch (_) {
      setState(() => _error = 'Could not start the cycle — try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Start a money cycle to see your safe-to-spend balance.'),
        TextField(
          controller: _amountController,
          decoration: const InputDecoration(labelText: 'Starting amount (AUD)'),
          keyboardType: TextInputType.number,
        ),
        TextButton(
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 400)),
              initialDate: DateTime.now().add(const Duration(days: 14)),
            );
            if (picked != null) setState(() => _endDate = picked);
          },
          child: Text(_endDate == null ? 'Pick an end date' : _endDate!.toIso8601String().split('T').first),
        ),
        if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting ? const CircularProgressIndicator() : const Text('Start cycle'),
        ),
      ],
    );
  }
}
```

- [ ] **Step 6: Manually verify against the real deployed API**

Run the app, log in, confirm the dashboard loads real data for the throwaway account (it has no active cycle at times — confirm the start-cycle form appears correctly in that case, and that submitting it successfully refreshes the screen).

- [ ] **Step 7: Commit and push**

```bash
git add lib/features/dashboard/ test/features/dashboard/
git commit -m "feat: add dashboard screen with summary stats and start-cycle form"
git push
```

---

### Task 10: Expenses feature

**Files:**
- Create: `lib/features/expenses/expenses_screen.dart`, `lib/features/expenses/expenses_providers.dart`, `lib/features/expenses/add_expense_form.dart`
- Test: `test/features/expenses/expenses_providers_test.dart`

**Interfaces:**
- Consumes: `dioProvider`, `GET /api/expenses`, `GET /api/categories`, `POST /api/expenses`.
- Produces: a screen listing expenses and a form to add one, with the explicit "a failed save must show a visible, retriable error" behavior called out in Review Focus item 5 — this is the task that owns that test.

- [ ] **Step 1: Write the failing provider tests**

`test/features/expenses/expenses_providers_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:budget_buddy_mobile/features/auth/auth_state.dart';
import 'package:budget_buddy_mobile/features/expenses/expenses_providers.dart';

void main() {
  test('expensesProvider parses the expense list', () async {
    final dio = Dio();
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onGet(
      '/api/expenses',
      (server) => server.reply(200, [
        {'id': 'exp_1', 'amount': 20.0, 'description': 'Groceries', 'date': '2026-10-01T00:00:00.000Z', 'category': {'id': 'cat_1', 'name': 'Food'}},
      ]),
    );

    final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(dio)]);
    addTearDown(container.dispose);

    final expenses = await container.read(expensesProvider.future);

    expect(expenses, hasLength(1));
    expect(expenses.first.description, 'Groceries');
    expect(expenses.first.amount, 20.0);
  });

  test('addExpense throws on a non-2xx response, rather than silently succeeding', () async {
    final dio = Dio();
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onPost('/api/expenses', (server) => server.reply(500, {'error': 'Internal error'}));

    final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(dio)]);
    addTearDown(container.dispose);

    expect(
      () => container.read(expensesRepositoryProvider).addExpense(
            amount: 10,
            description: 'Coffee',
            categoryId: 'cat_1',
            date: DateTime.now(),
          ),
      throwsA(isA<DioException>()),
    );
  });
}
```

- [ ] **Step 2: Run to verify failure**

```bash
flutter test test/features/expenses/expenses_providers_test.dart
```
Expected: FAIL — `lib/features/expenses/expenses_providers.dart` doesn't exist yet.

- [ ] **Step 3: Implement the model, repository, and providers**

`lib/features/expenses/expenses_providers.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../auth/auth_state.dart';

class Expense {
  const Expense({required this.id, required this.amount, required this.description, required this.date, required this.categoryName});
  final String id;
  final double amount;
  final String description;
  final DateTime date;
  final String? categoryName;

  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
        id: json['id'] as String,
        amount: (json['amount'] as num).toDouble(),
        description: json['description'] as String,
        date: DateTime.parse(json['date'] as String),
        categoryName: (json['category'] as Map<String, dynamic>?)?['name'] as String?,
      );
}

class Category {
  const Category({required this.id, required this.name});
  final String id;
  final String name;

  factory Category.fromJson(Map<String, dynamic> json) => Category(id: json['id'] as String, name: json['name'] as String);
}

class ExpensesRepository {
  ExpensesRepository(this._dio);
  final Dio _dio;

  Future<void> addExpense({
    required double amount,
    required String description,
    required String categoryId,
    required DateTime date,
  }) async {
    // Any non-2xx response throws a DioException by default — this method intentionally does
    // NOT catch it. A failed save must propagate as a real error the UI shows, never be
    // swallowed into something that looks like success (see this plan's Review Focus item 5).
    await _dio.post('/api/expenses', data: {
      'amount': amount,
      'description': description,
      'categoryId': categoryId,
      'date': date.toIso8601String(),
    });
  }
}

final expensesRepositoryProvider = Provider<ExpensesRepository>((ref) => ExpensesRepository(ref.watch(dioProvider)));

final expensesProvider = FutureProvider.autoDispose<List<Expense>>((ref) async {
  final dio = ref.watch(dioProvider);
  final response = await dio.get('/api/expenses');
  return (response.data as List).map((json) => Expense.fromJson(json as Map<String, dynamic>)).toList();
});

final categoriesProvider = FutureProvider.autoDispose<List<Category>>((ref) async {
  final dio = ref.watch(dioProvider);
  final response = await dio.get('/api/categories');
  return (response.data as List).map((json) => Category.fromJson(json as Map<String, dynamic>)).toList();
});
```

- [ ] **Step 4: Run to verify pass**

```bash
flutter test test/features/expenses/expenses_providers_test.dart
```
Expected: both tests PASS.

- [ ] **Step 5: Build the expenses list screen**

`lib/features/expenses/expenses_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'expenses_providers.dart';
import 'add_expense_form.dart';

class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expensesAsync = ref.watch(expensesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Expenses')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (_) => const AddExpenseForm(),
        ),
        child: const Icon(Icons.add),
      ),
      body: expensesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Could not load expenses.')),
        data: (expenses) => expenses.isEmpty
            ? const Center(child: Text('No expenses yet.'))
            : ListView.builder(
                itemCount: expenses.length,
                itemBuilder: (context, index) {
                  final expense = expenses[index];
                  return ListTile(
                    title: Text(expense.description),
                    subtitle: Text(expense.categoryName ?? 'Uncategorized'),
                    trailing: Text('\$${expense.amount.toStringAsFixed(2)}'),
                  );
                },
              ),
      ),
    );
  }
}
```

- [ ] **Step 6: Build the add-expense form**

`lib/features/expenses/add_expense_form.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'expenses_providers.dart';

class AddExpenseForm extends ConsumerStatefulWidget {
  const AddExpenseForm({super.key});

  @override
  ConsumerState<AddExpenseForm> createState() => _AddExpenseFormState();
}

class _AddExpenseFormState extends ConsumerState<AddExpenseForm> {
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();
  String? _categoryId;
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    final amount = double.tryParse(_amountController.text);
    if (amount == null || _descriptionController.text.isEmpty || _categoryId == null) {
      setState(() => _error = 'Fill in amount, description, and category.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(expensesRepositoryProvider).addExpense(
            amount: amount,
            description: _descriptionController.text,
            categoryId: _categoryId!,
            date: DateTime.now(),
          );
      ref.invalidate(expensesProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      // A failed save stays visible as an explicit, retriable error — never dismissed as if it
      // had worked (see this plan's Review Focus item 5).
      setState(() => _error = 'Could not save this expense — check your connection and try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(categoriesProvider);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(controller: _amountController, decoration: const InputDecoration(labelText: 'Amount (AUD)'), keyboardType: TextInputType.number),
          TextField(controller: _descriptionController, decoration: const InputDecoration(labelText: 'Description')),
          categoriesAsync.when(
            loading: () => const Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator()),
            error: (_, __) => const Text('Could not load categories.'),
            data: (categories) => DropdownButton<String>(
              value: _categoryId,
              hint: const Text('Category'),
              items: categories.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))).toList(),
              onChanged: (value) => setState(() => _categoryId = value),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          ElevatedButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting ? const CircularProgressIndicator() : const Text('Add expense'),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 7: Manually verify against the real deployed API**

Run the app, open the expenses tab, confirm the real list for the throwaway account loads, add a test expense (e.g. "$5, Test expense, Food"), confirm it appears, then delete it afterward via the web app or a direct `curl -X DELETE` so the throwaway account doesn't accumulate junk data.

- [ ] **Step 8: Commit and push**

```bash
git add lib/features/expenses/ test/features/expenses/
git commit -m "feat: add expenses list and add-expense form"
git push
```

---

### Task 11: Coach chat feature

**Files:**
- Create: `lib/features/coach/coach_screen.dart`, `lib/features/coach/coach_providers.dart`
- Test: `test/features/coach/coach_providers_test.dart`

**Interfaces:**
- Consumes: `dioProvider`, `POST /api/cycles/chat`.
- Produces: a chat screen with a message list and composer, calling the same Groq-backed coach every web user talks to.

- [ ] **Step 1: Write the failing provider test**

`test/features/coach/coach_providers_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:budget_buddy_mobile/features/auth/auth_state.dart';
import 'package:budget_buddy_mobile/features/coach/coach_providers.dart';

void main() {
  test('sendMessage appends the user message then the coach reply to the message list', () async {
    final dio = Dio();
    final dioAdapter = DioAdapter(dio: dio);
    dioAdapter.onPost(
      '/api/cycles/chat',
      (server) => server.reply(200, {'reply': 'Logged your coffee.'}),
      data: {'message': 'I spent \$5 on coffee'},
    );

    final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(dio)]);
    addTearDown(container.dispose);

    final notifier = container.read(coachMessagesProvider.notifier);
    await notifier.sendMessage('I spent \$5 on coffee');

    final messages = container.read(coachMessagesProvider);
    expect(messages, hasLength(2));
    expect(messages[0].isUser, isTrue);
    expect(messages[0].content, 'I spent \$5 on coffee');
    expect(messages[1].isUser, isFalse);
    expect(messages[1].content, 'Logged your coffee.');
  });
}
```

- [ ] **Step 2: Run to verify failure**

```bash
flutter test test/features/coach/coach_providers_test.dart
```
Expected: FAIL — `lib/features/coach/coach_providers.dart` doesn't exist yet.

- [ ] **Step 3: Implement the message model and notifier**

`lib/features/coach/coach_providers.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_state.dart';

class CoachMessage {
  const CoachMessage({required this.content, required this.isUser});
  final String content;
  final bool isUser;
}

class CoachMessagesNotifier extends Notifier<List<CoachMessage>> {
  @override
  List<CoachMessage> build() => [];

  Future<void> sendMessage(String message) async {
    state = [...state, CoachMessage(content: message, isUser: true)];

    try {
      final dio = ref.read(dioProvider);
      final response = await dio.post('/api/cycles/chat', data: {'message': message});
      final reply = response.data['reply'] as String;
      state = [...state, CoachMessage(content: reply, isUser: false)];
    } catch (_) {
      state = [...state, const CoachMessage(content: 'Sorry, that message could not be sent — try again.', isUser: false)];
    }
  }
}

final coachMessagesProvider = NotifierProvider<CoachMessagesNotifier, List<CoachMessage>>(CoachMessagesNotifier.new);
```

- [ ] **Step 4: Run to verify pass**

```bash
flutter test test/features/coach/coach_providers_test.dart
```
Expected: PASS.

- [ ] **Step 5: Build the coach screen**

`lib/features/coach/coach_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'coach_providers.dart';

class CoachScreen extends ConsumerStatefulWidget {
  const CoachScreen({super.key});

  @override
  ConsumerState<CoachScreen> createState() => _CoachScreenState();
}

class _CoachScreenState extends ConsumerState<CoachScreen> {
  final _composerController = TextEditingController();
  bool _sending = false;

  Future<void> _send() async {
    final text = _composerController.text.trim();
    if (text.isEmpty) return;
    _composerController.clear();
    setState(() => _sending = true);
    await ref.read(coachMessagesProvider.notifier).sendMessage(text);
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(coachMessagesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Money Coach')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: messages.length,
              itemBuilder: (context, index) {
                final message = messages[index];
                return Align(
                  alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: message.isUser ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(message.content),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _composerController,
                    decoration: const InputDecoration(hintText: 'Tell the coach something…'),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton(
                  icon: _sending ? const CircularProgressIndicator() : const Icon(Icons.send),
                  onPressed: _sending ? null : _send,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 6: Wire all three screens behind auth into `main.dart` with a bottom nav**

`lib/main.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'features/auth/auth_state.dart';
import 'features/auth/login_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/expenses/expenses_screen.dart';
import 'features/coach/coach_screen.dart';

void main() {
  runApp(const ProviderScope(child: BudgetBuddyApp()));
}

class BudgetBuddyApp extends StatelessWidget {
  const BudgetBuddyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Budget Buddy',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple)),
      home: const _RootGate(),
    );
  }
}

class _RootGate extends ConsumerWidget {
  const _RootGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return authState.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => const LoginScreen(),
      data: (result) => result.isAuthenticated ? const _MainTabs() : const LoginScreen(),
    );
  }
}

class _MainTabs extends StatefulWidget {
  const _MainTabs();

  @override
  State<_MainTabs> createState() => _MainTabsState();
}

class _MainTabsState extends State<_MainTabs> {
  int _index = 0;

  static const _screens = [DashboardScreen(), ExpensesScreen(), CoachScreen()];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Expenses'),
          NavigationDestination(icon: Icon(Icons.chat), label: 'Coach'),
        ],
      ),
    );
  }
}
```

- [ ] **Step 7: Manually verify the full app shell**

Run the app fresh (`flutter run`), confirm: unauthenticated → login screen; after login → three-tab bottom nav; switching tabs shows each screen; sending a chat message gets a real Groq-backed reply.

- [ ] **Step 8: Commit and push**

```bash
git add lib/features/coach/ test/features/coach/ lib/main.dart
git commit -m "feat: add coach chat screen and wire all screens behind auth with bottom nav"
git push
```

---

### Task 12: End-to-end live verification and final whole-plan review

**Files:** none new.

**Interfaces:**
- Consumes: everything from Tasks 1-11, across both repos.
- Produces: a confirmed-working app and a final review of the combined diff (Repo A's 4-task diff, Repo B's 6-task diff) before calling V1 done.

- [ ] **Step 1: Fresh install and full flow, on-device**

```bash
flutter clean
flutter pub get
flutter run -d <emulator-or-device-id>
```

Walk through, on the running app: sign up with a brand-new test email (not the shared throwaway account, to get a genuinely fresh "no active cycle yet" state) → confirm the dashboard's start-cycle form appears → start a cycle → confirm the dashboard now shows real numbers → add an expense → confirm it appears in the list and the dashboard's total updates on next load → send a coach chat message → confirm a real reply arrives.

- [ ] **Step 2: Run the full Flutter test suite one more time**

```bash
flutter test
flutter analyze
```

Expected: all tests PASS, `flutter analyze` reports no issues (fix anything it flags before proceeding — this is this project's lint-equivalent gate).

- [ ] **Step 3: Dispatch the final whole-plan review**

Following this project's established subagent-driven-development convention: dispatch a review covering the combined diff across both repos (Repo A's 4-task diff on `budget-buddy`'s `main`, Repo B's 6-task diff on `budget-buddy-mobile`'s `main`), on the most capable available model. Give the reviewer: this plan file, the spec file, both diffs, and explicit instructions to confirm the Global Constraints (especially: zero changes to the 21 untouched `getCurrentUser()` call sites' behavior, and the 8-route scope boundary) and the Review Focus items are genuinely met, not just asserted.

- [ ] **Step 4: Resolve findings, then finish**

One fix wave maximum if the review finds anything, one scoped re-review, then: Repo A already pushed its one batched push back in Task 5 (nothing further to push there unless the fix wave touches Repo A, in which case push that too); Repo B pushes its fix-wave commit directly (no deploy-quota concern). Report back to the user with an honest summary of what shipped, what's still out of scope for V1 (budgets, cashflow, savings goals, iOS), and the Android-only/emulator-setup decision made in Task 1 for them to confirm or revisit.
