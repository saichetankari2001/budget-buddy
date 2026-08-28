# Budget Buddy — Privacy Act 1988 Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, reachable `/privacy` page describing this app's actual data practices, linked from both the signup page and a new site-wide footer.

**Architecture:** A new static `/privacy` page, a new minimal `Footer` component rendered once in the root layout (so it appears on every page, logged in or not), a link added to the signup page, and one new test added to the existing accessibility suite.

**Tech Stack:** Next.js 14 App Router + TypeScript (existing), Tailwind (existing design tokens), `@axe-core/playwright` (existing, from the WCAG phase).

## Global Constraints

- The `Footer` component's link uses `text-primary-hover`, never `text-muted` — the footer renders directly on the root layout's `bg-background` page background (not inside a white `Card`), and `text-muted` (`#64748B`) fails WCAG contrast (4.33:1, needs 4.5:1) against that specific background color, exactly the violation fixed in the prior WCAG audit phase. `text-primary-hover` is already the established, verified-accessible link color used throughout this app since that phase.
- `/privacy` must be reachable with no authentication — it must not call `getCurrentUser()` or perform any redirect/auth check. Confirmed safe: `middleware.ts`'s route matcher only covers `/dashboard/:path*` and `/expenses/:path*`, so a new unmatched route is never redirected regardless of login state.
- No dedicated unit tests for the new page or `Footer` component — both are static, non-interactive presentational content, matching this app's established convention (no test files exist for comparable static/presentational components like `Header.tsx` beyond its existing test, or `Card.tsx`). Verification is the new Playwright accessibility test plus curl/manual checks.
- The existing 6 tests in `e2e/accessibility.spec.ts` must continue to pass unmodified after `Footer` is added globally — since it now renders on every page those tests scan, this is a real regression risk, not a formality.

---

## File Structure

```
budget-buddy/
├── components/
│   └── ui/
│       └── Footer.tsx                              # CREATE
├── app/
│   ├── layout.tsx                                   # MODIFY: render Footer
│   ├── signup/
│   │   └── page.tsx                                  # MODIFY: add privacy link
│   └── privacy/
│       └── page.tsx                                  # CREATE
└── e2e/
    └── accessibility.spec.ts                         # MODIFY: add /privacy test
```

---

### Task 1: Footer Component and Site-Wide Wiring

**Files:**
- Create: `components/ui/Footer.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/signup/page.tsx`

**Interfaces:**
- Produces: `Footer` component (no props) — rendered in `app/layout.tsx`, appears on every page. Both new links point to `/privacy`, which Task 2 creates (the route doesn't need to exist yet for this task's own verification — a 404 on a not-yet-built page doesn't break rendering or accessibility of the linking page itself).

- [ ] **Step 1: Create `components/ui/Footer.tsx`**

```tsx
export function Footer() {
  return (
    <footer className="border-t border-border py-6 text-center text-sm">
      <a href="/privacy" className="text-primary-hover underline">
        Privacy Policy
      </a>
    </footer>
  );
}
```

- [ ] **Step 2: Modify `app/layout.tsx`**

Add the import:
```ts
import { Footer } from '@/components/ui/Footer';
```

Change the `<body>` element from:
```tsx
      <body className="min-h-screen bg-background font-sans text-foreground">{children}</body>
```
to:
```tsx
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
```

The full file after this change:

```tsx
import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import { Footer } from '@/components/ui/Footer';
import './globals.css';

const lexend = Lexend({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const sourceSans = Source_Sans_3({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Budget Buddy',
  description: 'Track expenses, categories, and spending trends.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lexend.variable} ${sourceSans.variable}`}>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
```

**Rationale:** `flex min-h-screen flex-col` on `<body>`, with the page content wrapped in a `flex-1` div, is the standard "sticky footer" pattern — the footer sits at the bottom of the viewport on short pages (like `/login`), and flows naturally after content on longer pages, without needing separate layout logic per page.

- [ ] **Step 3: Modify `app/signup/page.tsx`**

Add one new paragraph immediately after the existing "Already have an account?" paragraph:

```tsx
        <p className="mt-4 text-sm text-muted">
          Already have an account?{' '}
          <a href="/login" className="text-primary-hover underline">
            Log in
          </a>
        </p>
        <p className="mt-2 text-sm text-muted">
          By creating an account, you agree to our{' '}
          <a href="/privacy" className="text-primary-hover underline">
            Privacy Policy
          </a>
          .
        </p>
```

Nothing else in this file changes. This paragraph sits inside the page's `<Card>` (white background), where `text-muted` correctly passes contrast — unlike the `Footer`, this one is safe to use `text-muted` for the surrounding text, matching the existing "Already have an account?" line right above it.

- [ ] **Step 4: Run the existing accessibility suite to confirm no regressions from the now-global Footer**

```bash
npm run dev &
sleep 4
npx playwright test e2e/accessibility.spec.ts --reporter=list
kill %1
```

Expected: the 6 existing tests still pass (the new signup-page paragraph and the new global Footer must not introduce any contrast or labeling violations). It's fine — expected, even — if Playwright reports 404-related console noise for the `/privacy` links themselves, since that route doesn't exist yet; this does not affect axe's scan of the *current* page's own accessibility.

- [ ] **Step 5: Run the full Vitest suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing (unchanged — no new unit tests in this task).

- [ ] **Step 6: Commit**

```bash
git add components/ui/Footer.tsx app/layout.tsx app/signup/page.tsx
git commit -m "feat: add site-wide footer and signup privacy link"
```

---

### Task 2: Privacy Policy Page

**Files:**
- Create: `app/privacy/page.tsx`

**Interfaces:**
- Consumes: `Card` (`components/ui/Card.tsx`, existing).
- Produces: `GET /privacy` — consumed by Task 1's `Footer` and signup-page links (both already point here), and by Task 3's new accessibility test.

- [ ] **Step 1: Create `app/privacy/page.tsx`**

```tsx
import { Card } from '@/components/ui/Card';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <h1 className="mb-2 font-heading text-2xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="mb-6 text-sm text-muted">Last updated: 28 August 2026</p>

        <div className="flex flex-col gap-6 text-sm text-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">What We Collect</h2>
            <p>
              When you create an account, we collect your email address and a password (which is
              hashed with bcrypt before it&apos;s ever stored — we never see or store your actual
              password). Everything else Budget Buddy holds is financial data you enter yourself:
              expense amounts, descriptions, categories, dates, recurring-expense settings, budgets,
              and category GST-free flags.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">How We Use It</h2>
            <p>
              Solely to run the expense-tracking service itself: authenticating you, showing you your
              own data, and calculating your own totals, budgets, and GST. Budget Buddy has no
              advertising, no analytics tracking, and no behavioral profiling — none of that
              infrastructure exists in this app.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">How It&apos;s Stored</h2>
            <p>
              Your data lives in a Neon (managed PostgreSQL) database, and the app itself runs on
              Vercel. Both are infrastructure providers that process data to operate the service —
              not third parties using it for their own purposes. Every query in this app is scoped to
              your own account, so no other user can access your data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">Your Rights</h2>
            <p>
              You can request access to, correction of, or deletion of your data at any time by
              contacting us (see below). Budget Buddy doesn&apos;t yet have a self-service
              &quot;delete my account&quot; button, so these requests are currently handled manually.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">Data Retention</h2>
            <p>Your data is kept for as long as your account is active.</p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">
              Changes to This Policy
            </h2>
            <p>
              This policy may be updated as Budget Buddy changes. The most current version will
              always be available at this page.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">Contact</h2>
            <p>
              Budget Buddy is a personal project without a support team, but you can reach the
              developer directly via{' '}
              <a
                href="https://github.com/saichetankari2001/budget-buddy/issues"
                className="text-primary-hover underline"
              >
                GitHub Issues
              </a>
              .
            </p>
          </section>
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify via curl that the page renders and both link points work**

```bash
npm run dev &
sleep 4

echo "--- /privacy should render with 200 and contain the policy heading ---"
curl -s http://localhost:3000/privacy -o /tmp/privacy-page.html -w "privacy page status: %{http_code}\n"
grep -q "Privacy Policy" /tmp/privacy-page.html && echo "PASS: privacy page renders its heading"
grep -q "github.com/saichetankari2001/budget-buddy/issues" /tmp/privacy-page.html && echo "PASS: contact link present"

echo "--- signup page should link to /privacy ---"
curl -s http://localhost:3000/signup -o /tmp/signup-page.html -w "signup page status: %{http_code}\n"
grep -q 'href="/privacy"' /tmp/signup-page.html && echo "PASS: signup page links to /privacy"

echo "--- footer should be present and link to /privacy on an unauthenticated page ---"
grep -q "<footer" /tmp/signup-page.html && echo "PASS: footer renders on the signup page"

rm -f /tmp/privacy-page.html /tmp/signup-page.html
kill %1
```

Expected: all status codes `200`, all four `PASS` lines print.

- [ ] **Step 3: Run the full Vitest suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 133/133 passing.

- [ ] **Step 4: Commit**

```bash
git add app/privacy/page.tsx
git commit -m "feat: add privacy policy page"
```

---

### Task 3: Accessibility Test and Final Verification

**Files:**
- Modify: `e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `GET /privacy` (Task 2).

- [ ] **Step 1: Add a new test to `e2e/accessibility.spec.ts`**

Add this test at the end of the file (after the existing `budgets page` test, keeping all 6 existing tests unchanged):

```ts
test('privacy page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/privacy');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
```

This follows the same no-setup pattern as the `signup page`/`login page` tests, since `/privacy` is a public route requiring no authentication.

- [ ] **Step 2: Run the full accessibility suite to confirm all 7 tests pass**

```bash
npm run dev &
sleep 4
npx playwright test e2e/accessibility.spec.ts --reporter=list
kill %1
```

Expected: all 7 tests PASS (the 6 existing plus the new `/privacy` test).

- [ ] **Step 3: Run the full Vitest suite**

```bash
npx vitest run
```

Expected: 133/133 passing.

- [ ] **Step 4: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors from either. This project treats a clean `tsc --noEmit` as a hard, non-negotiable gate.

- [ ] **Step 5: Run the pre-existing `e2e/dashboard.spec.ts` test too, to confirm the site-wide layout change (Task 1) doesn't break the one other existing e2e test**

```bash
npm run dev &
sleep 4
npx playwright test e2e/dashboard.spec.ts --reporter=list
kill %1
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/accessibility.spec.ts
git commit -m "test: add /privacy to the accessibility suite"
```

- [ ] **Step 7: Push and confirm CI is green**

```bash
git push origin main
```

After pushing, confirm the GitHub Actions run for this commit succeeds (use `gh run watch` or check the Actions tab) — this project's CI runs the full Playwright suite (including this task's new test) against a real production build, so this is the first time the new page and footer are verified in that exact environment, not just locally.

---

## End of Privacy Act 1988 Notes

At this point: `/privacy` is a real, reachable page describing Budget Buddy's actual data practices, linked from both the signup page and a new site-wide footer present on every page, and covered by the same permanent, CI-enforced accessibility suite as every other page. This is the last sub-phase in the Australian-standards scope — AUD formatting, GST tracking, the WCAG 2.1 AA audit, and now Privacy Act 1988 notes are all shipped.
