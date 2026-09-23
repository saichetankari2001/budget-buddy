# Cycle Chat + Deferred Fixes — Design Spec

**Status:** Approved
**Spec 3 of the Money Coach line** (builds on Spec 2 — Money Cycle + AI Coach)

## Summary

Two things ship together:

1. **A real chat interface for the active Money Cycle.** Instead of clicking
   buttons to edit the amount or cancel a cycle, the user types plain
   English — "change it to $700," "cancel my cycle" — and Gemini, given
   exactly two narrowly-scoped tools, performs the action and replies
   conversationally. This replaces the plain edit/cancel buttons
   originally scoped for this phase with something that actually
   matches what the user asked for: "just like I am chatting with u and
   doing things with u."
2. **Six previously-identified, previously-deferred fixes** from Spec 1
   and Spec 2's final reviews, revisited now that more is being built on
   top of the same surfaces.

## Part 1: Cycle Chat

### Why tool-calling, and why only two tools

Gemini's function-calling API lets a model, when it decides an action is
warranted, respond with a structured `functionCall` (name + typed
arguments) instead of free text. The server executes that call and
sends the result back as a new turn, and the model then replies in
natural language incorporating the outcome. This was verified directly
against the real Gemini API before writing this spec — a real request
with `update_cycle_amount`/`cancel_cycle` tool declarations genuinely
returned `{"functionCall": {"name": "update_cycle_amount", "args":
{"newAmount": 700}}}` for the message "hey can you change my budget to
700 dollars," confirming the mechanism works as expected.

**The tool set is deliberately exactly two functions, nothing more:**

```
update_cycle_amount(newAmount: number)
cancel_cycle()
```

No `start_cycle` tool. Starting a cycle stays on the existing, already-
tested `StartCycleForm` — a structured form is more reliable for a
first-time, unambiguous action than parsing intent from free text, and
keeping it out of the tool set means `CoachMessage.cycleId` never needs
to become nullable (a chat message only ever exists in the context of
an already-created cycle). The chat box itself is only shown once a
cycle is active — the empty state keeps its existing form, unchanged.

**Why the security model holds regardless of what the model outputs:**
tool handlers never receive a user ID or cycle ID as a function
argument. Every handler operates on `getCurrentUser()`'s own currently-
`ACTIVE` cycle, full stop — the same IDOR-safe pattern every other route
in this app already uses. Even in the worst case (a hallucinated call,
a manipulated prompt), the blast radius is "acts on your own cycle" —
never another user's data, never anything outside those two operations.

### New data

`MessageKind` gains two values: `USER` (what the person typed) and
`CHAT` (the AI's conversational reply — kept distinct from the existing
`PLAN`/`CHECK_IN` kinds so the UI can style system-generated plan/check-
in messages differently from an ongoing back-and-forth).

```prisma
enum MessageKind {
  PLAN
  CHECK_IN
  USER
  CHAT
}
```

`CycleStatus` gains `CANCELLED` (see Part 2, item 6 below — cancellation
is one of the two chat tools, and needs a status distinct from
`COMPLETED` so the two are never confused when reviewing history).

```prisma
enum CycleStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}
```

Neither change requires touching the existing partial unique index
(`WHERE status = 'ACTIVE'`) — a cancelled cycle frees the slot for a new
one exactly like a completed one already does.

### New route: `POST /api/cycles/chat`

Request: `{ message: string }`. Requires an `ACTIVE` cycle to exist
(400 if not — the chat box isn't rendered in the empty state, but the
route enforces it independently rather than trusting the client).

Flow:
1. Save the user's message as a `CoachMessage` (`kind: USER`).
2. Load the last N messages (suggest N=10) for this cycle as
   conversation history, mapped to Gemini's `contents` array (`role:
   'user'` for `USER`-kind messages, `role: 'model'` for `PLAN`/
   `CHECK_IN`/`CHAT`-kind messages — the existing message kinds all
   represent something the AI said, so all map to `role: 'model'`).
3. Send to Gemini with the two tool declarations.
4. If the response contains a `functionCall`: execute the matching
   handler (implemented in a shared module reused by the existing PATCH/
   DELETE routes — see below), send the function's result back to
   Gemini as a `role: 'function'` turn, and use *that* response's text
   as the reply. **The implementer must confirm this follow-up turn's
   exact response shape against the real API before relying on it** —
   this spec's own verification hit a free-tier rate limit before
   confirming turn 2's shape; turn 1 (the initial function-call
   response) is confirmed, turn 2 is not.
5. If the response contains plain text (no tool call — e.g. a purely
   conversational message), use that text directly.
6. Save the AI's reply as a `CoachMessage` (`kind: CHAT`).
7. On any Gemini failure (timeout, error, malformed response): save and
   return a generic apologetic `CHAT` message ("Sorry, I couldn't catch
   that — try again in a moment") rather than leaving the user with no
   response. This is the chat-turn equivalent of the existing plan/
   check-in fallback — the feature never goes fully silent, even though
   a "template" doesn't make sense for an arbitrary conversational
   reply the way it does for a plan/check-in.
8. On a tool execution failure (e.g. "cancel my cycle" when it's
   already cancelled — a race condition, not a client-trustable state):
   the function result sent back to Gemini includes `{success: false,
   error: "..."}`, letting the model generate an appropriate apology/
   clarification rather than the server inventing scripted error text.

### Shared action logic (avoiding duplication)

`update_cycle_amount` and `cancel_cycle`'s server-side handlers must not
reimplement what `PATCH /api/cycles/[id]` and `DELETE /api/cycles/[id]`
already do (see Part 2 restructuring below) — both the REST routes and
the chat tool handlers call the same underlying functions in
`lib/moneyCycle/actions.ts`. One place owns "what does editing an
amount actually do," not two.

### UI (`CoachCard.tsx`)

A chat input (text field + send button) appears below the message feed
whenever a cycle is active, styled with the existing Neon Glass glass-
input treatment (`bg-card`, `border-border`, matching `StartCycleForm`'s
existing inputs — no new colors or components). Sent messages and AI
chat replies render as new `CoachMessage` list items exactly like
existing `PLAN`/`CHECK_IN` messages do, with `USER`-kind messages
visually distinguished (e.g., right-aligned or a different accent
border) from AI-kind messages.

## Part 2: Deferred fixes

Six items, each already identified as real during earlier reviews in
this project and deliberately deferred at the time as non-blocking.
Revisiting now that more is being built on the same surfaces.

### 1. `PushSubscribe.tsx` — button reappears every load, no error handling

Currently doesn't check `Notification.permission` on mount, so the
"Notify me" button shows even after permission was already granted, and
`handleSubscribe` has no try/catch (an unhandled rejection leaves the
button stuck mid-state). Fix: check `Notification.permission` on mount
and render nothing (or a "Notifications on" indicator) if already
`'granted'`; wrap the subscribe call in try/catch with a user-visible
error on failure, matching this app's existing error-display
conventions.

### 2. Logout doesn't unsubscribe push

The unsubscribe route (`POST /api/push/unsubscribe`) exists but has zero
callers — on a shared device, a logged-out user keeps receiving the
*previous* account's coach notifications. Fix: before the existing
logout POST fires, the client checks for an active `PushSubscription`
(`registration.pushManager.getSubscription()`) and, if one exists,
POSTs its endpoint to `/api/push/unsubscribe` first. Best-effort — if
this fails, logout still proceeds; the stale subscription will get
cleaned up the next time a push to it 410s or 404s.

### 3. AI prompts don't specify currency

`lib/ai/coach.ts`'s prompts hand Gemini bare `"$500.00"` strings with no
currency context. Fix: add "(in Australian dollars)" to both prompt
templates in `generatePlanMessage`/`generateCheckInMessage`, and to the
new chat system context, so generated phrasing stays consistent with
the AUD formatting shown everywhere else in the UI.

### 4. Push-subscription reassignment isn't clean

The existing `upsert` in `POST /api/push/subscribe` blindly updates
`userId` on any existing row for that `endpoint`, including one owned
by a different user. Worth naming precisely: **this is not a fixable
"vulnerability" in the traditional sense** — a single browser only ever
has one live push subscription per origin, so if two different app-
accounts have both subscribed from the same physical browser (e.g. a
shared computer), the *browser's* subscription can only ever point at
one of them; reassigning it to whoever most recently subscribed is
correct behavior, not a bug, and a compound `(userId, endpoint)` unique
constraint would make this *worse* (letting both accounts hold "valid"
rows for a browser that can only actually deliver to one). The real,
worthwhile fix is narrower: replace the blind `update` with a
`deleteMany` + `create` when reassigning, so a reassigned endpoint
always gets a clean new row (fresh `createdAt`, no leftover state from
the prior owner) rather than mutating someone else's existing record in
place. This is a data-hygiene improvement, not a security boundary —
documented honestly as such rather than oversold.

### 5. `CountUpStat`'s gradient doesn't reach cyan

The `<p>` element is block-level, so the violet→cyan gradient spans the
full card width while the actual text only occupies the first few
characters — it renders as solid violet, not the intended gradient.
Fix: add `inline-block` (or `w-fit`) so the gradient background is
sized to the text itself.

### 6. Marginal/untested contrast levels

Three spots flagged during the Neon Glass final review as real but
below axe-core's detection threshold (axe doesn't check non-text UI
boundary contrast, WCAG 1.4.11):
- `IconButton`'s default-variant text (`text-primary`, ~4.32:1 on a
  glass card) — switch to `text-primary-hover` (~6.72:1), already used
  elsewhere in the app for exactly this reason.
- `Button`'s secondary variant and other `border-border`-only elements
  sit at ~1.72:1 against the page background, well under the 3:1
  WCAG 1.4.11 target for interactive component boundaries — the
  implementer should compute the actual opacity needed to hit 3:1
  (matching this project's established practice of verifying contrast
  numerically, not eyeballing it) and adjust the `border` token's alpha
  accordingly, or add a stronger border specifically to interactive
  elements if a global token change has too broad a blast radius.
- `BudgetProgress`'s unfilled track (`bg-background` on `bg-card`) is
  too close in value to read as a visible track — bump to a low-opacity
  white overlay (e.g. `bg-white/10`), matching the pattern already used
  for hover states elsewhere in this app.

## Testing

- **Chat route:** Gemini and the shared action-logic module are both
  mocked in Vitest, matching this project's established pattern. Cover:
  a message that triggers `update_cycle_amount`, one that triggers
  `cancel_cycle`, one that gets a plain-text reply with no tool call,
  a Gemini failure (asserts the generic fallback `CHAT` message), and a
  tool-execution failure (asserts the error is relayed to Gemini, not
  swallowed or shown as a raw exception).
- **Shared action logic:** since `PATCH`/`DELETE /api/cycles/[id]` now
  delegate to `lib/moneyCycle/actions.ts`, their existing tests should
  need minimal changes (same behavior, refactored call path) — the
  implementer should confirm existing route tests still pass unchanged
  or with only mock-target updates, not weakened assertions.
- **UI:** the chat input and message list get axe-core coverage added
  to the existing `dashboard with an active money cycle` accessibility
  test, exercising an actual chat exchange, not just the static states
  already covered.
- **Deferred fixes:** each gets whatever test is proportionate — a
  contrast fix is verified via the existing axe-core suite plus a
  manual/computed check (per this project's established distrust of
  "it looks fine"), the push-unsubscribe-on-logout fix gets a real
  test asserting the client calls the unsubscribe endpoint before
  logout completes, `CountUpStat`'s fix has no meaningful automated
  test (a purely visual CSS change) and is verified live instead.

## Rollout

Directly to `main`, no feature flag, consistent with every prior phase
of this project.
