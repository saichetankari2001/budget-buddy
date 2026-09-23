# Cycle Chat + Deferred Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain edit/cancel buttons originally scoped for the Money Cycle with a real Gemini function-calling chat interface (two narrowly-scoped tools: update the cycle amount, cancel the cycle), plus land 6 previously-identified, previously-deferred fixes from earlier reviews.

**Architecture:** A new shared action module (`lib/moneyCycle/actions.ts`) owns the actual "update a cycle" / "cancel a cycle" business logic; both new REST routes (`PATCH`/`DELETE /api/cycles/[id]`, which do not yet exist) and the new chat route (`POST /api/cycles/chat`) call it — no duplicated logic between the button-free chat path and a conventional REST path. The chat layer (`lib/ai/chat.ts`) is a new file separate from the existing `lib/ai/coach.ts`, since tool-calling is a materially different request/response shape than the existing plain-text generation.

**Tech Stack:** Next.js 14 App Router, Prisma + Neon Postgres, Gemini API (function-calling), Zod, Vitest + Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-09-24-cycle-chat-and-fixes-design.md`

## Global Constraints

- Exactly two tools, nothing more: `update_cycle_amount(newAmount: number)`, `cancel_cycle()`. No `start_cycle` tool — `CoachMessage.cycleId` stays non-nullable; the chat box is only ever shown once a cycle already exists.
- Tool handlers never receive `userId`/`cycleId` as a function argument from the AI — every handler resolves "the current user's own `ACTIVE` cycle" itself, server-side, via `getCurrentUser()`. This is the entire security model: even a hallucinated or manipulated tool call can only ever act on the caller's own cycle.
- New `MessageKind` values: `USER` (what the person typed), `CHAT` (the AI's conversational reply — kept distinct from the existing `PLAN`/`CHECK_IN` kinds).
- New `CycleStatus` value: `CANCELLED`.
- Shared action logic lives in `lib/moneyCycle/actions.ts` — both the REST routes and the chat tool handlers call it. No business logic duplicated in two places.
- On any Gemini failure during a chat turn (timeout, error, malformed response): save and return a generic apologetic `CHAT`-kind message ("Sorry, I couldn't catch that — try again in a moment") — never leave the user with no response at all.
- On a tool execution failure (e.g. "cancel my cycle" when there's no active cycle — a race, not a client-trustable state): the function result relayed back to Gemini is `{success: false, error: "..."}`, letting the model generate its own appropriate reply — the server never invents scripted error text for this case.
- Fix #4 (push subscription reassignment) is a data-hygiene `deleteMany` + `create` fix, **not** a security/schema change — do not add a compound unique constraint (a single browser only ever has one live push subscription per origin; a compound key would let two accounts both hold "valid" rows for a browser that can only actually deliver to one, which is worse).
- Fix #6's contrast work must use computed WCAG ratios, not eyeballed values — the exact target opacities below were computed against this project's real token values, not guessed.
- The full Vitest suite (190 tests) and full Playwright suite (9 tests, including every axe-core WCAG 2.1 AA test) must stay green after every task.
- Work happens directly on `main`, no worktree/feature branch. Push after every task.

---

### Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new migration directory under `prisma/migrations/`

**Interfaces:**
- Produces: the `CANCELLED` value on `CycleStatus`, and `USER`/`CHAT` values on `MessageKind` — every later task's Prisma calls and Zod-adjacent types rely on these existing in the generated client.

- [ ] **Step 1: Update the two enums in `prisma/schema.prisma`**

Current (read fresh — confirmed content as of this plan):

```prisma
enum CycleStatus {
  ACTIVE
  COMPLETED
}

enum MessageKind {
  PLAN
  CHECK_IN
}
```

Replace with:

```prisma
enum CycleStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}

enum MessageKind {
  PLAN
  CHECK_IN
  USER
  CHAT
}
```

- [ ] **Step 2: Generate and apply the real migration against the project's real Neon database**

Run: `cd /Users/saichetankari/Downloads/budget-buddy && npx prisma migrate dev --name add_cancelled_status_and_chat_message_kinds`

Expected: Prisma detects the two enum additions, generates a migration
(adding enum values is a simple `ALTER TYPE ... ADD VALUE` in Postgres),
and applies it. There is no separate test database in this project —
this genuinely modifies the real database backing both local dev and
production. Confirm success with `npx prisma migrate status` —
expected output: "Database schema is up to date!"

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: 190/190 Vitest tests pass, typecheck clean, lint clean — this task only adds enum values nothing yet references, so nothing should break.

- [ ] **Step 4: Commit and push**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add CANCELLED cycle status and USER/CHAT message kinds"
git push
```

---

### Task 2: Shared cycle-action logic + PATCH/DELETE /api/cycles/[id]

**Files:**
- Create: `lib/moneyCycle/actions.ts`
- Create: `lib/moneyCycle/actions.test.ts`
- Create: `app/api/cycles/[id]/route.ts`
- Create: `app/api/cycles/[id]/route.test.ts`

**Interfaces:**
- Consumes: `computeDaysRemaining`, `computeCommittedSpend`, `computeSafeToSpend` (`lib/utils/moneyCycle.ts`, exact signatures unchanged from Spec 2), `generatePlanMessage` (`lib/ai/coach.ts`), `prisma` (`lib/prisma.ts`).
- Produces: `updateCycleAmount(userId: string, newAmount: number): Promise<ActionResult>` and `cancelCycle(userId: string): Promise<ActionResult>` from `lib/moneyCycle/actions.ts` — Task 4 (the chat route) calls these directly as its tool handlers.

**Note:** `app/api/cycles/[id]/route.ts` does **not** currently exist — the
originally-discussed plain edit/cancel buttons were approved in
conversation but never implemented before the scope expanded to this
chat-based design. This task creates the routes and the shared module
together, in one pass — it is not a refactor of pre-existing code.

**Explicit decision: `POST /api/cycles` is left as-is, not refactored to
call the new shared module.** The spec's wording ("a shared module ...
that PATCH/DELETE AND the chat tool handlers both call") only mandates
sharing among those three consumers. `POST /api/cycles` creates a *new*
cycle — a different operation from "update the amount of an existing
one" — its logic overlaps with `updateCycleAmount` only superficially
(both compute committed spend and call `generatePlanMessage`), and
forcing it through the same function would mean threading a "create vs.
update" branch into `lib/moneyCycle/actions.ts` for a single caller's
benefit. That's more coupling for less duplication than it's worth.
Leave `POST /api/cycles` untouched by this task.

- [ ] **Step 1: Write the failing tests for the shared action module**

Create `lib/moneyCycle/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/ai/coach', () => ({ generatePlanMessage: vi.fn() }));

import { generatePlanMessage } from '@/lib/ai/coach';
import { updateCycleAmount, cancelCycle } from './actions';

describe('updateCycleAmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the amount, regenerates the plan message, and returns the new figures', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      startingAmount: { toString: () => '500.00' } as never,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    prismaMock.expense.findMany.mockResolvedValue([]);
    vi.mocked(generatePlanMessage).mockResolvedValue('Updated to $700.');
    prismaMock.$transaction.mockImplementation(((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock)) as never);
    prismaMock.moneyCycle.update.mockResolvedValue({
      id: 'cycle_1',
      startingAmount: { toString: () => '700.00' } as never,
    } as never);
    prismaMock.coachMessage.create.mockResolvedValue({
      id: 'msg_2',
      cycleId: 'cycle_1',
      kind: 'PLAN',
      content: 'Updated to $700.',
      createdAt: new Date(),
    } as never);

    const result = await updateCycleAmount('user_1', 700);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.remainingAmount).toBe(700);
      expect(result.message).toBe('Updated to $700.');
    }
    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cycle_1' }, data: { startingAmount: 700 } })
    );
  });

  it('returns a failure result when the user has no active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const result = await updateCycleAmount('user_1', 700);

    expect(result).toEqual({ success: false, error: 'No active cycle found' });
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
  });
});

describe('cancelCycle', () => {
  it('marks the active cycle CANCELLED', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue({
      id: 'cycle_1',
      userId: 'user_1',
      status: 'ACTIVE',
    } as never);
    prismaMock.moneyCycle.update.mockResolvedValue({} as never);

    const result = await cancelCycle('user_1');

    expect(result).toEqual({ success: true });
    expect(prismaMock.moneyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle_1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('returns a failure result when the user has no active cycle', async () => {
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const result = await cancelCycle('user_1');

    expect(result).toEqual({ success: false, error: 'No active cycle found' });
    expect(prismaMock.moneyCycle.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/moneyCycle/actions.test.ts --run`
Expected: FAIL — `./actions` does not exist yet.

- [ ] **Step 3: Implement `lib/moneyCycle/actions.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { generatePlanMessage } from '@/lib/ai/coach';
import { computeDaysRemaining, computeCommittedSpend, computeSafeToSpend } from '@/lib/utils/moneyCycle';

type ActionResult<T = Record<string, never>> = ({ success: true } & T) | { success: false; error: string };

async function findActiveCycle(userId: string) {
  return prisma.moneyCycle.findFirst({ where: { userId, status: 'ACTIVE' } });
}

export async function updateCycleAmount(
  userId: string,
  newAmount: number
): Promise<ActionResult<{ remainingAmount: number; daysRemaining: number; safeToSpend: number; message: string }>> {
  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  const now = new Date();
  const recurringTemplates = await prisma.expense.findMany({
    where: { userId, isRecurring: true },
  });
  const committedSpend = computeCommittedSpend(
    recurringTemplates
      .filter((t) => t.recurrenceInterval !== null)
      .map((t) => ({ amount: Number(t.amount), recurrenceInterval: t.recurrenceInterval!, date: t.date })),
    now,
    cycle.endDate
  );
  const daysRemaining = computeDaysRemaining(cycle.endDate, now);
  const remainingAmount = Math.max(newAmount - committedSpend, 0);
  const safeToSpend = computeSafeToSpend({ startingAmount: remainingAmount, committedSpend: 0, daysRemaining });

  const planMessageText = await generatePlanMessage({
    startingAmount: newAmount,
    committedSpend,
    daysRemaining,
    safeToSpend,
  });

  await prisma.$transaction(async (tx) => {
    await tx.moneyCycle.update({ where: { id: cycle.id }, data: { startingAmount: newAmount } });
    await tx.coachMessage.create({ data: { cycleId: cycle.id, kind: 'PLAN', content: planMessageText } });
  });

  return { success: true, remainingAmount, daysRemaining, safeToSpend, message: planMessageText };
}

export async function cancelCycle(userId: string): Promise<ActionResult> {
  const cycle = await findActiveCycle(userId);
  if (!cycle) {
    return { success: false, error: 'No active cycle found' };
  }

  await prisma.moneyCycle.update({ where: { id: cycle.id }, data: { status: 'CANCELLED' } });

  return { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/moneyCycle/actions.test.ts --run`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Write the failing tests for the REST routes**

Create `app/api/cycles/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/moneyCycle/actions', () => ({ updateCycleAmount: vi.fn(), cancelCycle: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';
import { PATCH, DELETE } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('PATCH /api/cycles/[id]', () => {
  it('updates the amount and returns the new figures', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(updateCycleAmount).mockResolvedValue({
      success: true,
      remainingAmount: 700,
      daysRemaining: 5,
      safeToSpend: 140,
      message: 'Updated to $700.',
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/cycles/cycle_1', {
        method: 'PATCH',
        body: JSON.stringify({ newAmount: 700 }),
      }),
      { params: { id: 'cycle_1' } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.remainingAmount).toBe(700);
    expect(updateCycleAmount).toHaveBeenCalledWith('user_1', 700);
  });

  it('returns 404 when there is no active cycle to update', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(updateCycleAmount).mockResolvedValue({ success: false, error: 'No active cycle found' });

    const res = await PATCH(
      new NextRequest('http://localhost/api/cycles/cycle_1', {
        method: 'PATCH',
        body: JSON.stringify({ newAmount: 700 }),
      }),
      { params: { id: 'cycle_1' } }
    );

    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(
      new NextRequest('http://localhost/api/cycles/cycle_1', {
        method: 'PATCH',
        body: JSON.stringify({ newAmount: 700 }),
      }),
      { params: { id: 'cycle_1' } }
    );

    expect(res.status).toBe(401);
    expect(updateCycleAmount).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/cycles/[id]', () => {
  it('cancels the active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(cancelCycle).mockResolvedValue({ success: true });

    const res = await DELETE(new NextRequest('http://localhost/api/cycles/cycle_1', { method: 'DELETE' }), {
      params: { id: 'cycle_1' },
    });

    expect(res.status).toBe(200);
    expect(cancelCycle).toHaveBeenCalledWith('user_1');
  });

  it('returns 404 when there is no active cycle to cancel', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(cancelCycle).mockResolvedValue({ success: false, error: 'No active cycle found' });

    const res = await DELETE(new NextRequest('http://localhost/api/cycles/cycle_1', { method: 'DELETE' }), {
      params: { id: 'cycle_1' },
    });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test -- app/api/cycles/\\[id\\] --run`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 7: Implement `app/api/cycles/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';

const updateCycleSchema = z.object({ newAmount: z.number().positive() });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { newAmount } = updateCycleSchema.parse(await request.json());
    const result = await updateCycleAmount(user.userId, newAmount);

    if (!result.success) {
      throw new AppError(404, result.error);
    }

    return NextResponse.json({
      remainingAmount: result.remainingAmount,
      daysRemaining: result.daysRemaining,
      safeToSpend: result.safeToSpend,
      message: result.message,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params: _params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const result = await cancelCycle(user.userId);

    if (!result.success) {
      throw new AppError(404, result.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

(The `id` route param is accepted for RESTful URL structure but intentionally not used for authorization — per the Global Constraints, the actual security boundary is `userId` scoping inside `updateCycleAmount`/`cancelCycle` themselves, which only ever touch the calling user's own active cycle regardless of what's in the URL. There is only ever one active cycle per user, so the id is not load-bearing for correctness either — it exists so the route reads naturally as "act on this cycle," not because a mismatched id needs special handling.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass (190 existing + this task's new ones), typecheck clean, lint clean.

- [ ] **Step 9: Commit and push**

```bash
git add lib/moneyCycle/actions.ts lib/moneyCycle/actions.test.ts app/api/cycles/\[id\]/route.ts app/api/cycles/\[id\]/route.test.ts
git commit -m "feat: add shared cycle-action logic and PATCH/DELETE /api/cycles/[id]"
git push
```

---

### Task 3: Gemini chat wrapper with tool-calling (`lib/ai/chat.ts`)

**Files:**
- Create: `lib/ai/chat.ts`
- Create: `lib/ai/chat.test.ts`

**Interfaces:**
- Produces: `generateChatReply(message: string, history: {role: 'user' | 'model', content: string}[], handlers: {updateCycleAmount: (newAmount: number) => Promise<Record<string, unknown> & {success: boolean; error?: string}>, cancelCycle: () => Promise<{success: boolean; error?: string}>}): Promise<string>` — Task 4's chat route calls this directly.

**Before writing any implementation code, verify the real Gemini API's response shape live** — this plan's own spec-writing process confirmed Turn 1 (the initial function-call response) but hit a free-tier rate limit before confirming Turn 2 (the natural-language reply after a function result is sent back). Do not guess this shape from documentation alone.

- [ ] **Step 1: Live-verify the real API's two-turn shape**

Run this script (reads the real `GEMINI_API_KEY` from `.env`, makes real API calls):

```bash
cd /Users/saichetankari/Downloads/budget-buddy && node -e "
import('fs').then(async ({ readFileSync }) => {
  const envText = readFileSync('.env', 'utf-8');
  const key = envText.match(/GEMINI_API_KEY=\"(.*)\"/)[1];

  const tools = [{
    functionDeclarations: [
      { name: 'update_cycle_amount', description: 'Update the starting amount', parameters: { type: 'object', properties: { newAmount: { type: 'number' } }, required: ['newAmount'] } },
    ],
  }];

  const res1 = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'change my budget to 700 dollars' }] }], tools }),
  });
  const data1 = await res1.json();
  const modelPart = data1.candidates?.[0]?.content;
  console.log('--- Turn 1 model content (send this back verbatim as the model turn) ---');
  console.log(JSON.stringify(modelPart, null, 2));

  const functionCallPart = modelPart?.parts?.find((p) => p.functionCall);
  if (!functionCallPart) { console.log('NO FUNCTION CALL — stop and investigate before continuing'); return; }

  const res2 = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: 'change my budget to 700 dollars' }] },
        modelPart,
        { role: 'function', parts: [{ functionResponse: { name: 'update_cycle_amount', response: { success: true, remainingAmount: 700 } } }] },
      ],
      tools,
    }),
  });
  console.log('--- Turn 2 status ---', res2.status);
  const data2 = await res2.json();
  console.log(JSON.stringify(data2, null, 2));
});
"
```

If Turn 2 returns a 429 (rate limit — the free tier allows 20 requests/minute per model), wait using a bounded approach (e.g. `ScheduleWakeup` if working inside an agent session, or simply re-run after actually waiting — do not busy-loop retry) and re-run. Confirm: does Turn 2's response contain a plain `text` part (as documented), or something else? Note the exact path to the reply text (expected: `data2.candidates[0].content.parts[0].text`, but confirm against what actually came back before writing code that assumes it).

**Do not proceed to Step 2 until this is confirmed against a real, successful (non-429) response.**

- [ ] **Step 2: Write the failing tests**

Create `lib/ai/chat.test.ts`. Mock `fetch` exactly as `lib/ai/coach.test.ts` already does (`vi.stubGlobal('fetch', vi.fn())`, `vi.stubEnv('GEMINI_API_KEY', 'test-key')` in `beforeEach`, unstub in `afterEach`):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateChatReply } from './chat';

describe('generateChatReply', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('replies directly when Gemini responds with plain text (no tool call)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'Sure, happy to help!' }] } }] }),
    } as Response);

    const handlers = { updateCycleAmount: vi.fn(), cancelCycle: vi.fn() };
    const result = await generateChatReply('hey there', [], handlers);

    expect(result).toBe('Sure, happy to help!');
    expect(handlers.updateCycleAmount).not.toHaveBeenCalled();
  });

  it('calls update_cycle_amount when Gemini requests it, then uses the follow-up reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'update_cycle_amount', args: { newAmount: 700 } } }],
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: 'Done — updated to $700.' }] } }],
        }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn().mockResolvedValue({ success: true, remainingAmount: 700 }),
      cancelCycle: vi.fn(),
    };
    const result = await generateChatReply('change it to 700', [], handlers);

    expect(result).toBe('Done — updated to $700.');
    expect(handlers.updateCycleAmount).toHaveBeenCalledWith(700);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('calls cancel_cycle when Gemini requests it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'cancel_cycle', args: {} } }] } }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: 'Your cycle has been cancelled.' }] } }],
        }),
      } as Response);

    const handlers = { updateCycleAmount: vi.fn(), cancelCycle: vi.fn().mockResolvedValue({ success: true }) };
    const result = await generateChatReply('cancel my cycle', [], handlers);

    expect(result).toBe('Your cycle has been cancelled.');
    expect(handlers.cancelCycle).toHaveBeenCalled();
  });

  it('relays a tool failure back to Gemini rather than inventing error text itself', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'cancel_cycle', args: {} } }] } }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { role: 'model', parts: [{ text: "You don't have an active cycle to cancel." }] } }],
        }),
      } as Response);

    const handlers = {
      updateCycleAmount: vi.fn(),
      cancelCycle: vi.fn().mockResolvedValue({ success: false, error: 'No active cycle found' }),
    };
    await generateChatReply('cancel my cycle', [], handlers);

    const secondCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    const functionResponsePart = secondCallBody.contents.find((c: { role: string }) => c.role === 'function');
    expect(functionResponsePart.parts[0].functionResponse.response).toEqual({
      success: false,
      error: 'No active cycle found',
    });
  });

  it('returns a generic fallback message when the Gemini call fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const handlers = { updateCycleAmount: vi.fn(), cancelCycle: vi.fn() };
    const result = await generateChatReply('change it to 700', [], handlers);

    expect(result).toBe("Sorry, I couldn't catch that — try again in a moment.");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- lib/ai/chat.test.ts --run`
Expected: FAIL — `./chat` does not exist yet.

- [ ] **Step 4: Implement `lib/ai/chat.ts`**

Use the exact response shape confirmed live in Step 1. The structure below matches Gemini's documented function-calling protocol and Turn 1's confirmed shape — **adjust the Turn 2 text-extraction path if Step 1's live output showed a different shape than `candidates[0].content.parts[0].text`.**

```ts
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
const TIMEOUT_MS = 9000;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'update_cycle_amount',
        description: "Update the starting amount of the user's active money cycle, in Australian dollars",
        parameters: {
          type: 'object',
          properties: { newAmount: { type: 'number', description: 'The new starting amount in AUD' } },
          required: ['newAmount'],
        },
      },
      {
        name: 'cancel_cycle',
        description: "Cancel the user's active money cycle entirely",
        parameters: { type: 'object', properties: {} },
      },
    ],
  },
];

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatToolHandlers {
  updateCycleAmount: (newAmount: number) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;
  cancelCycle: () => Promise<{ success: boolean; error?: string }>;
}

const FALLBACK_REPLY = "Sorry, I couldn't catch that — try again in a moment.";

async function callGemini(contents: unknown[]): Promise<{ modelContent: unknown; text: string | undefined }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents, tools: TOOLS }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned ${response.status}`);
    }

    const data = await response.json();
    const modelContent = data?.candidates?.[0]?.content;
    const textPart = modelContent?.parts?.find((p: { text?: string }) => typeof p.text === 'string');
    return { modelContent, text: textPart?.text };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateChatReply(
  message: string,
  history: ChatHistoryMessage[],
  handlers: ChatToolHandlers
): Promise<string> {
  try {
    const contents = [
      ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const first = await callGemini(contents);

    const functionCallPart = (first.modelContent as { parts?: { functionCall?: { name: string; args: Record<string, unknown> } }[] })
      ?.parts?.find((p) => p.functionCall);

    if (!functionCallPart?.functionCall) {
      return first.text ?? FALLBACK_REPLY;
    }

    const { name, args } = functionCallPart.functionCall;
    let toolResult: { success: boolean; error?: string; [key: string]: unknown };
    if (name === 'update_cycle_amount') {
      toolResult = await handlers.updateCycleAmount(args.newAmount as number);
    } else if (name === 'cancel_cycle') {
      toolResult = await handlers.cancelCycle();
    } else {
      toolResult = { success: false, error: `Unknown tool: ${name}` };
    }

    const second = await callGemini([
      ...contents,
      first.modelContent,
      { role: 'function', parts: [{ functionResponse: { name, response: toolResult } }] },
    ]);

    return second.text ?? FALLBACK_REPLY;
  } catch {
    return FALLBACK_REPLY;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- lib/ai/chat.test.ts --run`
Expected: PASS, all 5 tests. If the mocked shapes in Step 2 don't exactly match what Step 1's live verification found, adjust the implementation (not the tests) to match reality.

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 7: Commit and push**

```bash
git add lib/ai/chat.ts lib/ai/chat.test.ts
git commit -m "feat: add Gemini function-calling chat wrapper with two-tool scope"
git push
```

---

### Task 4: `POST /api/cycles/chat` route

**Files:**
- Create: `app/api/cycles/chat/route.ts`
- Create: `app/api/cycles/chat/route.test.ts`

**Interfaces:**
- Consumes: `generateChatReply` (Task 3), `updateCycleAmount`/`cancelCycle` (Task 2).
- Produces: the route Task 5's UI calls — `POST /api/cycles/chat` with `{ message: string }`, returns `{ reply: string }` on success.

- [ ] **Step 1: Write the failing tests**

Create `app/api/cycles/chat/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/tests/mocks/prisma';
import { prismaMock } from '@/tests/mocks/prisma';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/ai/chat', () => ({ generateChatReply: vi.fn() }));
vi.mock('@/lib/moneyCycle/actions', () => ({ updateCycleAmount: vi.fn(), cancelCycle: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import { generateChatReply } from '@/lib/ai/chat';
import { POST } from './route';

const mockUser = { userId: 'user_1', email: 'a@example.com' };

describe('POST /api/cycles/chat', () => {
  it('saves the user message, generates a reply, and saves the reply', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue({ id: 'cycle_1', userId: 'user_1', status: 'ACTIVE' } as never);
    prismaMock.coachMessage.findMany.mockResolvedValue([]);
    prismaMock.coachMessage.create.mockResolvedValue({} as never);
    vi.mocked(generateChatReply).mockResolvedValue('Done — updated to $700.');

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'change it to 700' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply).toBe('Done — updated to $700.');
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'USER', content: 'change it to 700' }) })
    );
    expect(prismaMock.coachMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'CHAT', content: 'Done — updated to $700.' }) })
    );
  });

  it('returns 400 when there is no active cycle', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    prismaMock.moneyCycle.findFirst.mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
      })
    );

    expect(res.status).toBe(400);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(
      new NextRequest('http://localhost/api/cycles/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
      })
    );

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/api/cycles/chat --run`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 3: Implement `app/api/cycles/chat/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors/AppError';
import { handleRouteError } from '@/lib/errors/handleRouteError';
import { generateChatReply, ChatHistoryMessage } from '@/lib/ai/chat';
import { updateCycleAmount, cancelCycle } from '@/lib/moneyCycle/actions';

const chatMessageSchema = z.object({ message: z.string().min(1).max(500) });

export const maxDuration = 15;

const HISTORY_LIMIT = 10;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AppError(401, 'Not authenticated');
    }

    const { message } = chatMessageSchema.parse(await request.json());

    const cycle = await prisma.moneyCycle.findFirst({ where: { userId: user.userId, status: 'ACTIVE' } });
    if (!cycle) {
      throw new AppError(400, 'No active cycle to chat about');
    }

    await prisma.coachMessage.create({ data: { cycleId: cycle.id, kind: 'USER', content: message } });

    const priorMessages = await prisma.coachMessage.findMany({
      where: { cycleId: cycle.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    const history: ChatHistoryMessage[] = priorMessages
      .reverse()
      .map((m) => ({ role: m.kind === 'USER' ? 'user' : 'model', content: m.content }));

    const reply = await generateChatReply(message, history, {
      updateCycleAmount: (newAmount: number) => updateCycleAmount(user.userId, newAmount),
      cancelCycle: () => cancelCycle(user.userId),
    });

    await prisma.coachMessage.create({ data: { cycleId: cycle.id, kind: 'CHAT', content: reply } });

    return NextResponse.json({ reply });
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 5: Commit and push**

```bash
git add app/api/cycles/chat/route.ts app/api/cycles/chat/route.test.ts
git commit -m "feat: add POST /api/cycles/chat route"
git push
```

---

### Task 5: Chat UI in `CoachCard.tsx`

**Files:**
- Modify: `components/coach/CoachCard.tsx`

**Interfaces:**
- Consumes: `POST /api/cycles/chat` (Task 4).

- [ ] **Step 1: Read the current file fresh, then add chat state and a submit handler**

Current active-cycle rendering path in `components/coach/CoachCard.tsx` (confirmed fresh at planning time — read the file again before editing, in case a prior task in this plan's execution touched it):

```tsx
interface CoachMessage {
  id: string;
  kind: 'PLAN' | 'CHECK_IN';
  content: string;
  createdAt: string;
}
```

Update the `CoachMessage` interface to include the two new kinds:

```tsx
interface CoachMessage {
  id: string;
  kind: 'PLAN' | 'CHECK_IN' | 'USER' | 'CHAT';
  content: string;
  createdAt: string;
}
```

Add chat state inside the `CoachCard` function, alongside the existing `cycle`/`startError` state:

```tsx
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || cycle === undefined || cycle === null || cycle === 'error') return;

    const messageText = chatInput;
    setChatInput('');
    setSendingChat(true);

    const optimisticUserMessage: CoachMessage = {
      id: `optimistic-${Date.now()}`,
      kind: 'USER',
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    setCycle({ ...cycle, messages: [...cycle.messages, optimisticUserMessage] });

    const res = await fetch('/api/cycles/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageText }),
    });

    if (res.ok) {
      const refreshed = await fetch('/api/cycles/active');
      if (refreshed.ok) {
        setCycle(await refreshed.json());
      }
    }

    setSendingChat(false);
  }
```

(Refetching `/api/cycles/active` after a successful chat turn — rather than trying to reconstruct the exact new state client-side — is deliberate: a chat message might have changed `remainingAmount`/`daysRemaining`/`safeToSpend` via `update_cycle_amount`, or ended the cycle entirely via `cancel_cycle`, and re-fetching the single source of truth is simpler and more correct than duplicating that logic on the client.)

Add the required `FormEvent` import to the existing import line:

```tsx
import { useEffect, useState, FormEvent } from 'react';
```

- [ ] **Step 2: Render the chat input and style USER-kind messages distinctly**

Update the message-list rendering. Current:

```tsx
      <ul className="flex flex-col gap-3">
        {cycle.messages.map((message) => (
          <li
            key={message.id}
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground backdrop-blur-xl"
          >
            <p>{message.content}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {message.kind === 'PLAN' ? 'Plan' : 'Check-in'} · {new Date(message.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
```

Replace with (distinguishes `USER`-kind messages with a right-aligned, primary-tinted border; adds the chat input form below the list):

```tsx
      <ul className="flex flex-col gap-3">
        {cycle.messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-xl border px-4 py-3 text-sm text-foreground backdrop-blur-xl ${
              message.kind === 'USER' ? 'ml-8 border-primary bg-card' : 'border-border bg-card'
            }`}
          >
            <p>{message.content}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {message.kind === 'PLAN'
                ? 'Plan'
                : message.kind === 'CHECK_IN'
                  ? 'Check-in'
                  : message.kind === 'USER'
                    ? 'You'
                    : 'Coach'}{' '}
              · {new Date(message.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Tell the coach something — e.g. &quot;change it to $700&quot;"
          disabled={sendingChat}
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" disabled={sendingChat || !chatInput.trim()}>
          {sendingChat ? 'Sending…' : 'Send'}
        </Button>
      </form>
```

Add the `Button` import (already used elsewhere in this app's `Card`-based components — confirm the exact import path by checking `components/coach/StartCycleForm.tsx`'s existing import, which already imports it):

```tsx
import { Button } from '@/components/ui/Button';
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass (no existing `CoachCard` unit test exists per Spec 2's own established pattern — data-fetching client components in this codebase are verified via live/Playwright checks, not Vitest — so this step is about confirming nothing else broke), typecheck clean, lint clean.

- [ ] **Step 4: Commit and push**

```bash
git add components/coach/CoachCard.tsx
git commit -m "feat: add chat input to the Money Coach card"
git push
```

---

### Task 6: Deferred fixes, batch A (prompt/style, independent, small)

**Files:**
- Modify: `lib/ai/coach.ts`
- Modify: `lib/ai/chat.ts` (system-level currency context, if not already covered by Task 3's prompt text — check current state first)
- Modify: `components/ui/CountUpStat.tsx`
- Modify: `components/ui/IconButton.tsx`
- Modify: `components/ui/Button.tsx`
- Modify: `components/ui/BudgetProgress.tsx`

**Interfaces:** none — pure styling/copy changes, no signatures change.

- [ ] **Step 1: Fix #3 — specify currency in the AI prompts**

In `lib/ai/coach.ts`, both prompt template strings currently read (confirmed fresh):

```ts
    `You are a friendly, concise personal-finance coach speaking directly to the user (use "you"). ` +
```

Change both occurrences (in `generatePlanMessage` and `generateCheckInMessage`) to:

```ts
    `You are a friendly, concise personal-finance coach speaking directly to the user (use "you"). ` +
    `All amounts are in Australian dollars (AUD). ` +
```

- [ ] **Step 2: Fix #5 — `CountUpStat`'s gradient text doesn't reach its full width**

Current `components/ui/CountUpStat.tsx` return statement:

```tsx
  return (
    <p className="bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
      {formatCurrency(display)}
    </p>
  );
```

Add `inline-block` so the gradient is sized to the text itself, not the full block-level width of its parent:

```tsx
  return (
    <p className="inline-block bg-gradient-to-r from-primary to-accent bg-clip-text font-mono text-3xl font-semibold text-transparent">
      {formatCurrency(display)}
    </p>
  );
```

- [ ] **Step 3: Fix #6a — `IconButton`'s default-variant text contrast**

Current `components/ui/IconButton.tsx`:

```tsx
  const colorClasses =
    variant === 'destructive' ? 'text-destructive hover:bg-white/5' : 'text-primary hover:bg-white/5';
```

`text-primary` (`#8b5cf6`) on a glass card computes to ~4.32:1 — just under the 4.5:1 AA minimum for normal text. `text-primary-hover` (`#a78bfa`) computes to ~6.72:1, comfortably passing, and is already used elsewhere in this app's dark theme for exactly this reason (e.g. `Header.tsx`'s active-nav-link styling). Change to:

```tsx
  const colorClasses =
    variant === 'destructive' ? 'text-destructive hover:bg-white/5' : 'text-primary-hover hover:bg-white/5';
```

- [ ] **Step 4: Fix #6b — interactive-element border contrast**

The app-wide `border` token (`rgba(139,92,246,0.35)`) computes to ~1.5-1.7:1 against the page background — well under the 3:1 WCAG 1.4.11 target for interactive UI component boundaries. Rather than changing the global token (which would also affect purely-decorative card borders that don't carry the same obligation), add a stronger border specifically to `Button`'s `secondary` variant, the one interactive element most affected. Computed: `rgba(139,92,246,0.75)` against this app's real `#05050f` background yields ~3.1:1, clearing the target.

Current `components/ui/Button.tsx`:

```tsx
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-accent text-[#05050f] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]',
  secondary: 'bg-card text-foreground border border-border backdrop-blur-xl hover:bg-white/10',
  destructive: 'bg-destructive text-[#05050f] hover:shadow-[0_0_20px_rgba(248,113,113,0.4)]',
};
```

Change the `secondary` variant's border from the token-based `border-border` to the computed-stronger arbitrary value:

```tsx
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-accent text-[#05050f] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]',
  secondary: 'bg-card text-foreground border border-[rgba(139,92,246,0.75)] backdrop-blur-xl hover:bg-white/10',
  destructive: 'bg-destructive text-[#05050f] hover:shadow-[0_0_20px_rgba(248,113,113,0.4)]',
};
```

- [ ] **Step 5: Fix #6c — `BudgetProgress`'s unfilled track**

Current `components/ui/BudgetProgress.tsx`:

```tsx
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
```

`bg-background` on `bg-card` is too close in value to read as a visible track. Change to a low-opacity white overlay, matching the hover-state pattern already used elsewhere in this app:

```tsx
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass unchanged (these are pure styling/copy changes — existing component tests assert behavior via testing-library queries, not exact class strings or prompt text, so none should need edits; if any fail, read why before assuming it's unrelated), typecheck clean, lint clean.

- [ ] **Step 7: Run the full Playwright suite from a clean build**

```bash
pkill -f "next dev" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 1
lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1
rm -rf .next && CI=true npm run build && CI=true npm run test:e2e
```

Expected: all Playwright tests passing, including every axe-core WCAG 2.1 AA test — this is the real acceptance gate for the contrast fixes in Steps 3-5, not a visual judgment call.

- [ ] **Step 8: Commit and push**

```bash
git add lib/ai/coach.ts components/ui/CountUpStat.tsx components/ui/IconButton.tsx components/ui/Button.tsx components/ui/BudgetProgress.tsx
git commit -m "fix: currency context in AI prompts, gradient-text clipping, and three contrast levels below WCAG targets"
git push
```

---

### Task 7: Deferred fixes, batch B (push-subscription lifecycle)

**Files:**
- Modify: `components/pwa/PushSubscribe.tsx`
- Modify: `components/ui/Header.tsx`
- Modify: `app/api/push/subscribe/route.ts`

**Interfaces:** none new — internal behavior changes only.

- [ ] **Step 1: Fix #1 — check `Notification.permission` on mount, add error handling**

Current `components/pwa/PushSubscribe.tsx` (confirmed fresh):

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushSubscribe() {
  const [status, setStatus] = useState<'idle' | 'subscribing' | 'subscribed' | 'denied' | 'unsupported'>('idle');

  async function handleSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    setStatus('subscribing');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = subscription.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });

    setStatus('subscribed');
  }

  if (status === 'subscribed') {
    return <p className="text-sm text-muted">You&apos;ll get a daily check-in notification.</p>;
  }
  if (status === 'denied') {
    return <p className="text-sm text-muted">Notifications blocked — you can still see check-ins here.</p>;
  }
  if (status === 'unsupported') {
    return null;
  }

  return (
    <Button variant="secondary" onClick={handleSubscribe} disabled={status === 'subscribing'}>
      {status === 'subscribing' ? 'Enabling…' : 'Notify me'}
    </Button>
  );
}
```

Replace with (adds a mount-time permission check via `useEffect`, adds try/catch with an `'error'` status, adds `'unavailable'` handling when `Notification` itself doesn't exist):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type Status = 'idle' | 'subscribing' | 'subscribed' | 'denied' | 'unsupported' | 'error';

export function PushSubscribe() {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'granted') {
      setStatus('subscribed');
    } else if (Notification.permission === 'denied') {
      setStatus('denied');
    }
  }, []);

  async function handleSubscribe() {
    setStatus('subscribing');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });

      if (!res.ok) {
        setStatus('error');
        return;
      }

      setStatus('subscribed');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'subscribed') {
    return <p className="text-sm text-muted">You&apos;ll get a daily check-in notification.</p>;
  }
  if (status === 'denied') {
    return <p className="text-sm text-muted">Notifications blocked — you can still see check-ins here.</p>;
  }
  if (status === 'unsupported') {
    return null;
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">Couldn&apos;t enable notifications.</p>
        <Button variant="secondary" onClick={handleSubscribe}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={handleSubscribe} disabled={status === 'subscribing'}>
      {status === 'subscribing' ? 'Enabling…' : 'Notify me'}
    </Button>
  );
}
```

- [ ] **Step 2: Fix #2 — unsubscribe push on logout**

Current `components/ui/Header.tsx`'s `handleLogout` (confirmed fresh):

```tsx
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
```

Replace with (best-effort unsubscribe before the actual logout call — if this fails for any reason, logout still proceeds unconditionally, since a stale subscription will self-clean the next time a push to it 410s or 404s):

```tsx
  async function handleLogout() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
      }
    } catch {
      // Best-effort — a failed unsubscribe shouldn't block logout. The stale
      // subscription self-cleans the next time a push to it 410s or 404s.
    }

    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
```

Check `app/api/push/unsubscribe/route.ts`'s current request-body shape before assuming `{ endpoint }` is correct — read the file fresh and match its actual expected schema exactly.

- [ ] **Step 3: Fix #4 — clean reassignment on `POST /api/push/subscribe`**

Current `app/api/push/subscribe/route.ts` (confirmed fresh):

```ts
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: user.userId, p256dh: keys.p256dh, auth: keys.auth },
    });
```

Replace with a `deleteMany` + `create` — this does not change what user ends up owning the endpoint (that's still whoever most recently subscribed, which is correct browser-level semantics per the spec's own reasoning), it just ensures a reassigned row is fresh rather than an existing row silently mutated in place:

```ts
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    await prisma.pushSubscription.create({
      data: { userId: user.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
```

- [ ] **Step 4: Update `app/api/push/subscribe/route.test.ts` for the new deleteMany+create call shape**

Read the existing test file fresh — it very likely asserts on `prismaMock.pushSubscription.upsert` being called with specific arguments. Update those assertions to instead assert `prismaMock.pushSubscription.deleteMany` was called with `{ where: { endpoint } }` and `prismaMock.pushSubscription.create` was called with the equivalent `data` shape the old `upsert`'s `create`/`update` branches used. Do not weaken any assertion — match the same rigor the existing test already has, just against the new call shape.

- [ ] **Step 5: Run the full test suite**

Run: `npm test -- --run && npm run typecheck && npm run lint`
Expected: all tests pass, typecheck clean, lint clean.

- [ ] **Step 6: Commit and push**

```bash
git add components/pwa/PushSubscribe.tsx components/ui/Header.tsx app/api/push/subscribe/route.ts app/api/push/subscribe/route.test.ts
git commit -m "fix: push-subscription lifecycle (mount-time permission check, unsubscribe on logout, clean reassignment)"
git push
```

---

### Task 8: Final whole-feature verification

**Files:** none modified — this task is verification only.

**Interfaces:** N/A.

- [ ] **Step 1: Run the full automated suite from a clean build**

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

Expected: every Vitest test passing, clean typecheck/lint, clean production build, every Playwright test passing including all axe-core WCAG 2.1 AA tests.

- [ ] **Step 2: Live browser verification of a real chat conversation**

Using the Playwright MCP browser tools (or equivalent), against a local dev server with a real `GEMINI_API_KEY`:

1. Sign up a fresh account, start a cycle (e.g. $500, a future date).
2. In the new chat input, type "change it to $700" and send. Wait for the reply (Gemini's real latency, up to ~9s). Confirm: a new `USER`-kind message shows your exact text; a new `CHAT`-kind message shows a real, non-templated reply; the "Amount left" stat actually updates to reflect the new figure (re-fetch/re-render, not just the chat text).
3. Type "cancel my cycle" and send. Confirm: the card returns to the empty "start a cycle" state (since the cycle is now `CANCELLED`, not `ACTIVE`).
4. Confirm directly via a Prisma query that the cancelled cycle's `CoachMessage` history (including the `USER`/`CHAT` messages from this conversation) still exists in the database — cancellation is a soft status flip, not a delete, per the spec.

This is exactly the kind of behavior a mocked Vitest test cannot prove — it requires the real Gemini API actually parsing free-text intent into the correct tool call.

- [ ] **Step 3: Live verification of the 6 deferred fixes**

- Fix #1/#2: subscribe to push notifications, reload the page, confirm the "Notify me" button does *not* reappear (should show the "you'll get a daily check-in" text instead, since permission is already granted). Log out, confirm (via a Prisma query or network tab) that an unsubscribe request fired before the logout request.
- Fix #3: read the actual chat/plan reply text generated in Step 2 — confirm it's coherent with AUD framing (not strictly enforceable to assert automatically, but read it to sanity-check the prompt change had a real effect).
- Fix #4: subscribe from two different browser contexts with the same VAPID key setup is impractical to simulate cleanly — instead, confirm via a direct Prisma query that a single `POST /api/push/subscribe` call produces exactly one `PushSubscription` row for its endpoint (no duplicates), and that the row's `createdAt` updates on a repeat subscribe (proving it's a fresh row, not a mutated one).
- Fix #5: screenshot the dashboard's `CountUpStat` figures (e.g. "Total spent this month") and visually confirm the gradient now visibly spans violet-to-cyan across the actual digits, not just the first character.
- Fix #6: this is covered by axe-core in Step 1, but also spot-check visually via screenshot that the secondary button borders and budget-progress tracks are now clearly visible against the dark background.

- [ ] **Step 4: Clean up test data**

If Step 2/3 created any accounts against the shared Neon database (local dev and production share one database in this project), delete them:

```bash
node -e "
import('@prisma/client').then(async ({ PrismaClient }) => {
  const p = new PrismaClient();
  const r = await p.user.deleteMany({ where: { email: { contains: 'REPLACE_WITH_TEST_EMAIL_PREFIX_USED' } } });
  console.log('deleted:', r.count);
  await p.\$disconnect();
});
"
```

- [ ] **Step 5: Report completion**

No commit needed for this task (verification only) unless a real defect is found — if one is, fix it, add it as a follow-up step here, and re-run Steps 1-3 before considering this plan done.
