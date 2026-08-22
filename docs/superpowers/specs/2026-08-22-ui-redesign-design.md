# Budget Buddy — UI/UX Design Pass

## Purpose

Give Budget Buddy's existing pages (login, signup, dashboard, expenses) a real visual
identity before v1.1/v1.2/v1.3 (budgets, recurring expenses, CSV import/export) are built
on top of it. Currently every page uses bare-minimum Tailwind (gray-50 background, plain
white/bordered cards, default system font, no shared components) — functional but
visually generic. This pass establishes a consistent design system and a small set of
shared components so future features inherit the style automatically instead of each
needing its own visual pass.

This is a portfolio project; the visual result should read as "built by someone who
thinks about UX," not just "works."

## Visual System — Indigo Bento

Chosen from real style/palette/typography data (via the ui-ux-pro-max design database),
not invented ad hoc.

**Style:** Bento Box Grid — modular cards, `rounded-2xl` corners, soft shadows, subtle
hover-scale (1.02) on interactive cards. Apple-dashboard aesthetic. Light mode only (no
dark mode toggle in this pass).

**Colors** (Tailwind `theme.extend.colors`):

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#6366F1` | Buttons, links, active nav, focus rings |
| `primary-hover` | `#4F46E5` | Primary button hover state |
| `accent` | `#059669` | Positive/CTA accents, save confirmations |
| `background` | `#F5F3FF` | Page background |
| `card` | `#FFFFFF` | Card surfaces |
| `foreground` | `#1E1B4B` | Primary text |
| `muted` | `#64748B` | Secondary text (labels, timestamps) |
| `border` | `#E0E7FF` | Card/input borders |
| `destructive` | `#DC2626` | Delete actions, error text |

**Typography:** Lexend (headings, `font-heading`) + Source Sans 3 (body, `font-sans`),
loaded via `next/font/google`. Both chosen for accessibility (Lexend is specifically
designed to improve reading proficiency).

**Effects:** `rounded-2xl` cards, `shadow-sm` at rest → `shadow-md` on hover for
interactive cards, 150–200ms transitions, `hover:scale-[1.02]` on clickable cards only
(not on static stat cards).

**Icons:** Heroicons (`@heroicons/react`, outline variant, 20px), replacing plain text
links like "Edit"/"Delete" with icon+label buttons. No emoji anywhere (matches existing
codebase convention).

## New Shared Components

All in `components/ui/`, each a small, single-purpose Client or Server Component as
appropriate:

- **`Header.tsx`** (Client Component) — logo/wordmark ("Budget Buddy"), nav links
  (Dashboard, Expenses) with active-state styling, a logout button that calls the
  existing `POST /api/auth/logout` and redirects to `/login`. Rendered at the top of
  `/dashboard` and `/expenses` only (not login/signup, where the user isn't
  authenticated yet). This closes a real functional gap: there is currently no logout
  button anywhere in the UI, even though the API route has existed since Task 8.
- **`Card.tsx`** — the bento card wrapper (`rounded-2xl bg-card shadow-sm border
  border-border p-6`), replacing the ad-hoc `border border-gray-200` divs used
  throughout. Accepts children and optional `className`/`hoverable` props.
- **`Button.tsx`** — `primary` / `secondary` / `destructive` variants via a `variant`
  prop, replacing the one-off button classes duplicated across login/signup/ExpenseForm.
- **`IconButton.tsx`** — small icon+label button for actions like Edit/Delete, used in
  the expense list.

## Pages Touched

- **`app/login/page.tsx`, `app/signup/page.tsx`** — centered `Card`, new color/type
  system, no `Header` (unauthenticated). Form inputs restyled to match the new border/
  focus-ring colors.
- **`app/dashboard/page.tsx`** — `Header` added; stat card and both chart cards
  restyled as `Card` components; Recharts color props updated: trend line stroke →
  `primary` (`#6366F1`), `CartesianGrid` lines → `border` (`#E0E7FF`), axis tick text →
  `muted` (`#64748B`), tooltip background → `card` white with `border` outline. Pie
  slice colors stay category-driven (each category's stored `color` field) — those are
  user data, not part of the design system, and are unaffected by this pass.
- **`app/expenses/page.tsx`, `ExpensesClient.tsx`, `ExpenseForm.tsx`,
  `ExpenseFilters.tsx`** — `Header` added; filter bar, expense list rows, and the add/
  edit form restyled with the new `Card`/`Button`/`IconButton` components; Edit/Delete
  become icon buttons (pencil/trash icons) instead of plain text links.
- **Chart components** (`CategoryPieChart.tsx`, `MonthlyTrendChart.tsx`) — restyle
  non-data chrome (grid lines, axis text, tooltip background) to match the palette;
  category slice colors are unaffected (they come from each category's stored `color`
  field, which is user/data-driven, not a design-system token).

## Out of Scope

- No new features or behavior changes — this is a pure visual/structural pass.
- No dark mode toggle (Indigo Bento is defined as light-only for this pass; dark mode
  could be a future design pass once there's a reason to prioritize it).
- No layout restructuring beyond adding the shared `Header` (e.g., no sidebar nav, no
  mobile hamburger menu — the existing pages are single-column and stay that way).
- No changes to chart data logic, aggregation, or the underlying category-color system.
- No changes to any API route, validation schema, or database schema.

## Testing

Existing component tests (`ExpenseForm.test.tsx`, `CategoryPieChart.test.tsx`,
`MonthlyTrendChart.test.tsx`) assert on text content and `data-testid` attributes, not
CSS classes — they should continue passing largely unchanged as long as the same text/
testids are preserved through the restyle. New components (`Header`, `Card`, `Button`,
`IconButton`) are small enough to warrant their own focused tests (e.g., `Header`
renders the logout button and calls the logout endpoint on click) but don't need the
full TDD ceremony of a data/business-logic task — these are presentational components
with minimal logic.

## Explicitly Out of Scope for This Design System (future work)

- v1.1 (budgets), v1.2 (recurring expenses), v1.3 (CSV import/export) — these get built
  in this established style once this pass ships, but are separate spec/plan cycles.
