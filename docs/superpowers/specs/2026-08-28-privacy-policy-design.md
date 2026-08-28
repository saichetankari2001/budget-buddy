# Budget Buddy — Privacy Act 1988 Notes

## Purpose

Fourth and final sub-phase in the Australian-standards scope (AUD
formatting → GST tracking → WCAG 2.1 AA audit → Privacy Act 1988 notes
[this one, last]). Adds a real, reachable privacy policy page describing
this app's actual data practices in plain English, informed by the
substance of the Australian Privacy Principles (APPs) without reading as
a legal-compliance checklist. Unlike the other three sub-phases, this is
primarily a documentation phase — a static content page, not a code-heavy
feature.

## Architecture

- **Route:** a new `/privacy` page (`app/privacy/page.tsx`) — a static,
  unauthenticated Server Component. No data fetching, no forms, no
  interactive logic.
- **Discoverability:** two link points, so the policy is actually
  reachable rather than merely existing:
  1. A line on the signup page (`app/signup/page.tsx`): "By creating an
     account, you agree to our [Privacy Policy](/privacy)." — this is the
     point that actually matters under APP 1 (visible at the moment
     personal information is first collected), not just having the page
     exist somewhere.
  2. A new, minimal `Footer` component (`components/ui/Footer.tsx`),
     rendered once in the root layout (`app/layout.tsx`), so it's
     guaranteed visible on every page — logged in or not, including
     `/login` and `/signup`, which don't currently render the existing
     `Header` component.

## Content

Plain-English sections, each covering the substance of the relevant
Australian Privacy Principles without itemizing them by number:

- **What We Collect:** email address, a bcrypt-hashed password (never
  stored in plain text), and whatever financial data the user enters
  themselves — expense amounts, descriptions, categories, dates,
  recurring-expense settings, budgets, and GST-free category flags.
- **How We Use It:** solely to provide the expense-tracking service
  itself — authentication, displaying the user's own data back to them,
  and calculating their own totals, budgets, and GST. No advertising,
  no analytics tracking, no behavioral profiling — this app has none of
  that infrastructure.
- **How It's Stored:** in a Neon (managed PostgreSQL) database; the app
  runs on Vercel. Both are infrastructure providers processing data to
  operate the service, not third parties using it for their own separate
  purposes. All financial data is scoped strictly to the owning account —
  enforced throughout the codebase via userId-scoped, IDOR-safe database
  queries — so no other user can access it.
- **Your Rights:** access, correction, and deletion of your data, on
  request. Deletion is described as request-based rather than a
  self-service "delete my account" button, since building that button is
  a real feature (its own API route, confirmation flow, and cascading
  delete across categories/expenses/budgets) — meaningfully more scope
  than a documentation phase, and a reasonable candidate for a future
  phase if wanted later.
- **Contact:** the project's public GitHub Issues page,
  `https://github.com/saichetankari2001/budget-buddy/issues` — a real,
  working channel the developer actually controls — rather than inventing
  a fake support email address, since this is a personal/portfolio project
  without real support infrastructure.
- **Retention:** data is kept for as long as the account is active.
- **Changes to This Policy:** a short note that the policy may be updated
  as the app changes, with the most current version always at `/privacy`.

## Testing

No unit tests — this is a static content page with no data fetching, no
forms, and no interactive logic; nothing here is meaningfully unit-testable.
Verification is:
- One new test added to the existing `e2e/accessibility.spec.ts` suite (from
  the WCAG audit phase) for the `/privacy` page, following that file's
  established pattern exactly — this is a real page a real user will land
  on, so it belongs in the same permanent, CI-enforced accessibility check
  as every other page.
- Manual/curl verification that the page renders and both link points
  (the signup-page link and the footer link) are present and correctly
  point to `/privacy`.

## Out of Scope

- No self-service account deletion feature — described above as a
  candidate for a future phase, not this one.
- No cookie-consent banner — this app sets exactly one cookie (the
  `httpOnly` auth session token), which is strictly necessary for the app
  to function. Consent banners are for tracking/advertising cookies, which
  this app has none of.
- No terms-of-service page — a separate legal document from a privacy
  policy, not part of this phase.
- This is the last sub-phase in the Australian-standards scope — no
  further sub-phases follow.
