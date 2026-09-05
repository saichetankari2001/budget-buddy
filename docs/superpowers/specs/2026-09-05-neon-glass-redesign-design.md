# Neon Glass Redesign — Design Spec

**Status:** Draft, pending user review
**Spec 1 of 2** (Spec 2 — Money Cycle + AI Coach — follows this one, built on top of it)

## Summary

Replace Budget Buddy's current light "Indigo Bento" visual design with
a dark, glass-and-glow aesthetic ("Neon Glass"): translucent
backdrop-blurred cards, glowing indigo/cyan accents on a near-black
background, gradient text on key numbers, and subtle depth via
shadow/tilt rather than literal 3D rendering. This is a **pure
presentation-layer change** — no data model, business logic, or route
behavior changes. Every existing page keeps doing exactly what it does
today; only how it looks changes.

This choice was validated against two references during brainstorming,
not just personal taste: the `ui-ux-pro-max` design skill's style
database (which independently surfaces "Modern Dark Cinema" —
near-black + indigo glow + glassmorphism — as a top fit for fintech
dashboards, WCAG AA achievable "with care"), and real installable
components on 21st.dev demonstrating this look already exists in
production-quality form (glowing stat cards, tilt-on-hover analytics
cards). A literal WebGL/Three.js 3D style was explicitly considered and
rejected — the style database flags it as poor performance and poor
accessibility, which would conflict with this project's CI-enforced
WCAG 2.1 AA suite.

## Scope

**In scope:** `tailwind.config.ts` tokens, `app/globals.css`, every
shared UI component (`Card`, `Button`, `IconButton`, `DateField`,
`Header`, `Footer`), and every page (`/login`, `/signup`, `/dashboard`,
`/expenses`, `/budgets`, `/privacy`, `/offline`). Font pairing change.
Color palette change. Adding glass/glow/gradient treatments and a small
set of restrained motion effects.

**Out of scope (this spec):** anything from the Money Cycle / AI Coach
feature (Spec 2) — new pages, new data, new dependencies. No business
logic changes of any kind. No new npm dependencies are required for
this spec — everything here is achievable with Tailwind utilities and
plain CSS (`backdrop-filter`, `box-shadow`, gradients), so there's
nothing new to audit for licensing or bundle size.

## Design system

### Color tokens (dark-only)

The app becomes dark-first — "Neon Glass" on a light background
doesn't read the same way; glow needs a dark backdrop. Replacing
`tailwind.config.ts`'s current light palette entirely (not adding a
toggle):

| Token | Value | Use |
|---|---|---|
| `background` | `#05050f` | Page background |
| `surface` | `rgba(255,255,255,0.06)` | Glass card fill (paired with `backdrop-blur`) |
| `surface-border` | `rgba(139,92,246,0.35)` | Glass card border |
| `foreground` | `#e5e7ff` | Primary text |
| `muted` | `#94a3b8` | Secondary text |
| `primary` | `#8b5cf6` (violet-500) | Primary accent, buttons, focus glow |
| `primary-hover` | `#a78bfa` (violet-400) | Hover state — lighter, not darker, on a dark background |
| `accent` | `#22d3ee` (cyan-400) | Secondary glow accent, gradient end |
| `destructive` | `#f87171` (red-400) | Errors, delete actions — chosen specifically for AA contrast on `#05050f` |
| `success` | `#34d399` (emerald-400) | Positive/on-track states |

Every pairing above will be checked against the existing axe-core WCAG
2.1 AA suite before this spec is considered done — the suite is the
acceptance test for color choices, not a visual judgment call.

### Typography

Switching from Lexend + Source Sans 3 to a system validated by the
style database for this exact category (fintech/dashboard/dark mode):
**Inter** for both headings and body (a single-family precision
system — simpler and more consistent than mixing families), plus
**JetBrains Mono** specifically for money amounts and dates — a
common fintech convention (tabular figures align cleanly, and a
monospaced number reads as "data" at a glance, distinct from prose).
Both are free Google Fonts, loaded the same way the current fonts are
(`next/font/google`).

### Surface treatment

- **Glass cards:** `background: rgba(255,255,255,0.06)`,
  `backdrop-filter: blur(12px)`, `border: 1px solid` the glow-tinted
  border color, soft outer `box-shadow` in the accent color at low
  opacity (the "glow").
- **Gradient text:** large stat numbers (dashboard totals, cycle
  amounts) use a `background: linear-gradient(...)` clipped to text
  (violet → cyan), matching the mockup you approved.
- **Depth without WebGL:** hover states use a subtle `scale(1.02)` +
  shadow increase (already the pattern `Card`'s `hoverable` prop
  uses today — extending it, not replacing it). No 3D engine, no
  mouse-tracked perspective tilt in this spec — that's a nice-to-have
  that could be added later per-component if desired, not required
  for the redesign to be complete.

### Motion

Restrained, per the `ui-ux-pro-max` guidance already informing this
project: 150–300ms transitions, entrance fades on page load, a subtle
pulse on the primary glow (e.g. the active nav item). Everything
respects `prefers-reduced-motion` — animations disable, not just
shorten, when a user has that OS setting on. This is a real
requirement, not a nice-to-have: the current codebase already handles
this correctly in one place (`Card`'s `motion-reduce:hover:scale-100`)
and this spec extends that same discipline everywhere new motion is
added.

## Component-by-component impact

No component's *props or behavior* change — this is a `className`-level
reskin:
- **Card:** background/border/shadow updated to glass treatment.
- **Button:** solid violet fill → glowing violet fill on hover;
  secondary/destructive variants follow the new palette.
- **IconButton:** same 44px touch target from the recent fix, new
  colors.
- **DateField:** same `showPicker()` behavior from the recent fix, new
  glass input styling.
- **Header / Footer:** dark glass nav bar treatment.
- Every page's JSX structure is unchanged — only Tailwind class strings
  change. This is what keeps the blast radius contained: existing
  Vitest component tests assert behavior (does clicking Save call
  `onSubmit`?), not exact visual styling, so the large majority of the
  133 existing tests should need zero changes.

## Testing

- **Full existing Vitest + Playwright suites must stay green**,
  including the permanent WCAG 2.1 AA accessibility suite — this is
  the actual acceptance bar for the color/contrast choices above, not
  a subjective "looks right" check.
- No new automated tests are meaningfully addable for "does this look
  like Neon Glass" — that's a visual judgment, verified manually
  (screenshots + the live Playwright MCP browser, the same way past
  UI fixes in this project were verified) rather than asserted in
  code.
- A visual regression risk worth naming: since this changes nearly
  every page's markup classes, the diff will be large by line count
  even though it's low-risk by behavior. The implementation plan
  should still land it as several focused tasks (tokens/components
  first, then pages one or two at a time) rather than one giant commit,
  so each step gets its own review gate.

## Rollout

Directly on `main`, no feature flag, no toggle back to the old look —
consistent with this project's established practice of shipping
complete increments directly. Once merged and verified, it becomes the
foundation Spec 2 (Money Cycle + AI Coach) builds its new UI on top of.
