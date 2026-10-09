import { test, expect } from '@playwright/test';

test('signup, add an expense, and see it on the dashboard', async ({ page }) => {
  // Extra headroom on the whole test, not just the signup assertion below: this test does a real
  // signup, a hard navigation to /expenses, an expense submission, and a hard navigation to
  // /dashboard, each a separate real Prisma round-trip against a real Neon free-tier database —
  // enough real I/O, even against today's lighter, split-out pages (Tasks 2-6 of this plan), to
  // occasionally push past Playwright's 30s default under real latency without anything actually
  // being broken. Same reasoning as the existing extra headroom on the signup assertion just
  // below. (This comment previously described the pre-split consolidated /dashboard page this
  // test used to load when /expenses was still a redirect to it — no longer accurate since Task 4
  // made /expenses a real standalone page; corrected here while fixing the stale #expenses
  // locator a few lines down, found live during this task's own full-suite run.)
  test.setTimeout(60_000);

  const email = `test-${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
  await page.getByRole('button', { name: /sign up/i }).click();

  // Extra headroom on this specific assertion: it's the one step in the suite most exposed to
  // Neon free-tier cold-start latency (a real signup DB write + JWT issuance + redirect), which
  // has occasionally exceeded the global 10s expect timeout in CI without indicating a real bug.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  await page.goto('/expenses');
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/amount/i).fill('42.50');
  await page.getByLabel(/description/i).fill('Test lunch');
  // No scoping needed: /expenses is now its own standalone page (Task 4 of this plan) with no
  // Manage Budgets cell sharing the DOM — that cell lives on its own /budgets page now, so this
  // form's "Save" button is the only one on the page. The old #expenses-scoped locator here
  // targeted a section-anchor id from the pre-split consolidated dashboard that no longer exists
  // anywhere in the app's markup (confirmed via repo-wide search) — found live during this task's
  // own full-suite run, where the stale locator matched zero elements and hung until timeout.
  await page.getByRole('button', { name: /^save$/i }).click();

  await expect(page.getByText('Test lunch')).toBeVisible();

  await page.goto('/dashboard');
  // Scoped to the "Total spent this month" stat card for a clear, specific assertion target
  // (matches the scoping pattern used elsewhere in this suite, e.g. e2e/accessibility.spec.ts).
  // The original ambiguity this guarded against (an unscoped getByText('$42.50') also matching
  // the just-added expense row's own amount text in an Expenses cell further down the same page)
  // no longer applies — Task 5 of this plan rebuilt /dashboard as a lean home screen with no
  // expense list on it at all, so scoping here is now just good practice, not a strict-mode fix.
  const totalSpentCard = page.getByText('Total spent this month').locator('..');
  await expect(totalSpentCard.getByText('$42.50')).toBeVisible();
});

test('expenses, budgets, and cash flow are real pages, not redirects to the dashboard', async ({ page }) => {
  test.setTimeout(60_000);

  const email = `test-real-routes-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('longenough123');
  await page.getByRole('button', { name: /sign up/i }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto('/expenses');
  await expect(page).toHaveURL(/\/expenses$/);
  // level: 1 — the brief's given selector (unscoped getByRole('heading', { name: 'Expenses' }))
  // is a strict-mode violation on the real page: app/expenses/page.tsx's <h1>Expenses</h1> page
  // title AND its GlassPanel's <h2>Expenses</h2> section heading (wrapping ExpensesClient) both
  // have the exact accessible name "Expenses" — found live running this suite. Scoping to the
  // page's own <h1> is what actually proves "this is the real Expenses page", which is this
  // test's intent anyway.
  await expect(page.getByRole('heading', { name: 'Expenses', level: 1 })).toBeVisible();

  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/budgets$/);
  // level: 1 — same reasoning as the /expenses heading above: the default case-insensitive
  // substring match also resolves to app/budgets/page.tsx's <h2>Manage budgets</h2> ("budgets" is
  // a substring of "Manage budgets"), a second strict-mode violation found live running this
  // suite alongside the /expenses one.
  await expect(page.getByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();

  await page.goto('/cashflow');
  await expect(page).toHaveURL(/\/cashflow$/);
  // level: 1 for consistency with the two checks above, even though Cash Flow's own sub-headings
  // ("Income sources", "Bills") don't currently collide with this name.
  await expect(page.getByRole('heading', { name: 'Cash Flow', level: 1 })).toBeVisible();
});

test.describe('expenses hydration', () => {
  // Same root cause as the 'cashflow hydration' block below (an unpinned toLocaleDateString() on
  // text that is genuinely rendered server-side), found live during this task's own Step 6
  // verification: ExpensesClient.tsx rendered each expense row's date via a plain
  // `toLocaleDateString()` with no explicit locale, so a browser whose default locale differs from
  // Node's default (en-US) produces a real server/client text mismatch once a real expense already
  // exists in the DB at the time of a fresh hard navigation to /expenses (fixed by pinning 'en-AU',
  // matching CashFlowClient's pre-existing fix for the same bug class on bill dates, and
  // lib/utils/currency.ts's project-wide locale convention).
  test.use({ locale: 'en-AU' });

  test('expenses page reloaded with an existing expense hydrates without a server/client mismatch', async ({
    page,
  }) => {
    // Same reasoning as the first test's test.setTimeout() above: this test signs up, adds an
    // expense, then does a fresh hard navigation that reloads /expenses, each a real Prisma
    // round-trip against a real Neon free-tier database. Empirically at risk under the default
    // 30s test timeout (reproduced a timeout 1/3 isolated runs before this fix) despite typically
    // completing in 9-12s. (Previously described this as reloading "the now-heavier consolidated
    // /dashboard page" — no longer accurate since Task 4 made /expenses its own standalone page;
    // corrected here while fixing the stale #expenses locator a few lines down.)
    test.setTimeout(60_000);

    const email = `test-expenses-hydration-${Date.now()}@example.com`;

    await page.goto('/signup');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await page.goto('/expenses');
    await page.getByRole('button', { name: /add expense/i }).click();
    await page.getByLabel(/amount/i).fill('25.00');
    await page.getByLabel(/description/i).fill('Groceries');
    // No scoping needed: /expenses is now its own standalone page (Task 4 of this plan) with no
    // Manage Budgets cell sharing the DOM, so this form's "Save" button is the only one on the
    // page. The old #expenses-scoped locator here targeted a section-anchor id from the pre-split
    // consolidated dashboard that no longer exists anywhere in the app's markup — found live
    // during this task's own full-suite run, where the stale locator matched zero elements and
    // hung until timeout.
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Groceries', { exact: true })).toBeVisible();

    // The expense now exists in the DB. Every prior add in this test only set local client state
    // (ExpensesClient's handleCreate), so app/expenses/page.tsx's server-rendered
    // `serializedExpenses` prop was empty every time this page was hydrated so far. A FRESH
    // navigation now is the first point where the server actually renders a real expense's
    // formatted date via toLocaleDateString() — the same text the client then re-renders during
    // hydration. See the 'cashflow hydration' block below for why `pageerror`, not console output,
    // is the correct signal to assert against in a production build.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/expenses');
    await expect(page.getByText('Groceries', { exact: true })).toBeVisible();
    // Give any hydration-recovery errors a moment to fire before asserting.
    await page.waitForTimeout(500);

    expect(pageErrors).toEqual([]);
  });
});

test.describe('cashflow hydration', () => {
  // Node's default Intl locale resolves to en-US regardless of server timezone/OS locale (verified:
  // `new Date().toLocaleDateString()` on this project's own dev/CI machines returns US-style M/D/Y),
  // while a real visitor's browser resolves whatever locale their OS/browser is set to — for this
  // Australia-targeted app, that's realistically en-AU (D/M/Y), matching the locale already pinned
  // explicitly in lib/utils/currency.ts. Forcing the browser context to en-AU here (scoped to this
  // describe block only — test.use() applies to the enclosing suite, not to declaration order, so
  // an unscoped top-level call here would have also silently changed the locale for the pre-existing
  // sibling test above) makes that realistic mismatch deterministic in CI instead of depending on
  // the test runner's own ambient locale (which is why this bug survived Task 7/8's review
  // undetected — no existing test forces a non-US client locale, and no existing test does a fresh
  // hard navigation to /cashflow with a bill already in the DB, since every prior bill-list test
  // only ever added the bill via a same-page client-side POST that never round-trips through the
  // server component's `initialBills` prop).
  test.use({ locale: 'en-AU' });

  test('cashflow page reloaded with an existing bill hydrates without a server/client mismatch', async ({
    page,
  }) => {
    // Same reasoning as the per-test timeout overrides elsewhere in this file: this test signs up,
    // starts a cycle, and does two fresh hard navigations to the now-heavier consolidated
    // /dashboard page. Measured at 24.3s against the 30s default in an earlier verification pass
    // (margin-tight, not reliably failing) and reproduced an actual timeout under real load since.
    test.setTimeout(60_000);

    const email = `test-cashflow-hydration-${Date.now()}@example.com`;

    await page.goto('/signup');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await page.getByLabel(/how much do you have/i).fill('500');
    await page.getByLabel('Until when', { exact: true }).fill('2026-12-31');
    await page.getByRole('button', { name: /^start$/i }).click();
    await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

    await page.goto('/cashflow');
    await page.getByRole('button', { name: /add bill/i }).click();
    await page.getByLabel(/^name$/i).fill('Rent');
    await page.getByLabel(/amount/i).fill('800');
    await page.getByLabel('Due date', { exact: true }).fill('2026-10-01');
    await page.getByRole('button', { name: /add bill/i }).click();
    await expect(page.getByText('Rent', { exact: true })).toBeVisible();

    // The bill now exists in the DB. Every prior visit to /cashflow in this test only ever added
    // the bill via a client-side POST + setState (refreshBills()), so app/cashflow/page.tsx's
    // server-rendered `initialBills` prop was empty every time CashFlowClient was hydrated so far.
    // A FRESH navigation now is the first point where the server actually renders a real bill's
    // "Due <date>" text via toLocaleDateString() — the same text the client then re-renders during
    // hydration. Per playwright.config.ts, this suite runs against a PRODUCTION build
    // (`next build && next start`) only when `CI` is set — a local run uses `next dev` instead.
    // Against a production build, a hydration text mismatch does NOT surface as a readable
    // console.error — React's dev-mode "Text content did not match" warning is stripped from
    // production bundles. Instead it throws a minified React error (#418/#423/#425) as an
    // uncaught `pageerror` — confirmed by reproducing this exact test against the pre-fix code,
    // which threw seven such pageerrors here (five #425, one #418, one #423) before the fix, and
    // zero after — so `pageerror` is the correct, load-bearing signal to assert against, not
    // console output.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/cashflow');
    await expect(page.getByText('Rent', { exact: true })).toBeVisible();
    // Give any hydration-recovery errors a moment to fire before asserting.
    await page.waitForTimeout(500);

    expect(pageErrors).toEqual([]);
  });
});
