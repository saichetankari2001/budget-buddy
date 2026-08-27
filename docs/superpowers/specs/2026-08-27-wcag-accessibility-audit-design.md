# Budget Buddy — WCAG 2.1 AA Accessibility Audit

## Purpose

Third of four sub-phases in the Australian-standards scope (AUD formatting
[done] → GST tracking [done] → WCAG 2.1 AA audit [this one] → Privacy Act
1988 notes). Runs an automated accessibility scan across the app, fixes
whatever it finds, and locks the result in as a permanent, CI-enforced test
suite — so a future change can't silently reintroduce an accessibility
regression, the same way a broken feature can't silently ship.

The app already has some accessibility-conscious code from the earlier
Indigo Bento redesign phase (`aria-hidden` on decorative icons, `aria-label`
on icon-only buttons, `prefers-reduced-motion` guards on animations), so
this is a verification-and-fix pass, not a from-scratch remediation.

## Architecture

`@axe-core/playwright` — free, open-source, the standard automated
accessibility checker — layered onto the `@playwright/test` setup already
present in this project (`playwright.config.ts`, one existing spec at
`e2e/dashboard.spec.ts`). No new service, no new paid tooling.

One new Playwright spec, `e2e/accessibility.spec.ts`, with one test per
page/state:
- `/signup`
- `/login`
- `/dashboard`
- `/expenses`
- `/expenses` with the "Add expense" form open
- `/budgets`

`/signup` and `/login` are public routes and get scanned directly with no
setup. `/dashboard`, `/expenses`, and `/expenses` with the form open all
require an authenticated session, so those tests first sign up a fresh
throwaway user (same timestamp-based unique email pattern as
`e2e/dashboard.spec.ts`) before navigating and scanning. `/budgets`
likewise requires a session and follows the same signup-first pattern.

Each test then asserts `AxeBuilder` finds zero violations at the WCAG 2.1 A + AA rule
level (axe-core's built-in tag filtering: `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`).

**Process:** run the scan first against the current app to get the real
list of violations, fix each one found, then let the test suite lock in
"zero violations" as the permanent bar going forward — the fix list in the
implementation plan is written against actual scan output, not guessed
in advance.

## CI Wiring

`test:e2e` (Playwright) is not currently run in CI — only `npm test`
(the Vitest unit suite) is, per `.github/workflows/ci.yml`. Since the goal
is for an accessibility regression to genuinely fail CI, this phase adds a
`test:e2e` step to that workflow.

Trade-offs, accepted as reasonable at this project's scale:
- CI needs `npx playwright install --with-deps chromium` added as a setup
  step, adding a couple of minutes to every CI run — still free on GitHub
  Actions' free tier.
- Every CI run's e2e tests sign up a fresh throwaway user against the real
  Neon database (via the `DATABASE_URL` secret already configured in CI),
  the same way the existing `e2e/dashboard.spec.ts` test already does with
  a timestamp-based unique email. This slowly accumulates test-user rows
  in the live database over time — a real, if slow, cost of genuine
  end-to-end testing against a live free-tier database, not something this
  phase attempts to solve (e.g. no CI cleanup job) since that's separate
  scope.

## What This Phase Expects to Find (Not Prescriptive)

The actual fix list comes from the scan's real output, not this list — but
worth naming likely candidates so a finding isn't a surprise:
- Color contrast ratios (axe checks computed contrast against WCAG's 4.5:1
  normal-text / 3:1 large-text thresholds) — worth checking the Indigo
  Bento palette's `muted` gray-on-white text and any destructive-red text.
- Form inputs where a visual label exists but isn't programmatically
  associated with its `<input>` (missing `htmlFor`/wrapping).
- Checkbox/toggle controls (the GST-free and Repeat checkboxes from
  earlier phases) needing correct label association.
- Heading hierarchy issues (e.g. skipping from `h1` straight to `h3`).
- Chart components (Recharts-rendered SVGs) potentially needing additional
  ARIA attributes or an explicit accessible name if axe flags them as
  non-decorative but unlabeled.

## Testing

The accessibility tests themselves are the testing for this phase — this
is fundamentally an integration-level concern (real rendered DOM, real
computed styles), not something a unit test can meaningfully check. No
separate unit-test layer is added. Existing Vitest unit tests and the
existing `e2e/dashboard.spec.ts` functional test are unaffected.

## Out of Scope

- No manual screen-reader testing (VoiceOver/NVDA) — automated tooling
  catches a large, well-defined subset of WCAG success criteria, but not
  everything (e.g. whether alt text is *meaningful*, not merely present).
  A full manual audit is separate, larger scope than this phase.
- No AAA-level compliance — AA is the target, matching this phase's name
  and the typical practical/legal standard.
- No visual redesign — fixes target accessibility defects only, not
  aesthetic changes.
- Privacy Act 1988 notes remain a separate, final phase in this same
  Australian-standards scope.
