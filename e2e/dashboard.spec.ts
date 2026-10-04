import { test, expect } from '@playwright/test';

test('signup, add an expense, and see it on the dashboard', async ({ page }) => {
  // Extra headroom on the whole test, not just the signup assertion below: the consolidated
  // /dashboard page this test loads now bundles what used to be four separate pages' worth of
  // Prisma queries into one request (six-month expense aggregation, budgets, categories, the
  // filtered-expenses query for the Expenses cell, income sources, bills), so it measurably takes
  // longer to fully settle than any single original page did. Combined with real Neon free-tier
  // latency, that can push this test past Playwright's 30s default test timeout even when nothing
  // is actually broken (confirmed: the same run that timed out here showed a fully-rendered
  // dashboard, including the "Add expense" button, in its final snapshot — and passed cleanly in
  // 22s under a 60s timeout). Same reasoning as the existing extra headroom on the signup
  // assertion just below, extended to the whole test now that the page it loads is heavier.
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
  // Scoped to #expenses: on the consolidated dashboard, the Manage Budgets cell renders its own
  // per-row "Save" button for every category, all simultaneously in the DOM alongside the expense
  // form's "Save" button — an unscoped getByRole('button', { name: /save/i }) now matches all of
  // them (strict-mode violation) where it used to be unambiguous on the old single-purpose page.
  await page.locator('#expenses').getByRole('button', { name: /^save$/i }).click();

  await expect(page.getByText('Test lunch')).toBeVisible();

  await page.goto('/dashboard');
  // Scoped to the "Total spent this month" stat card: an unscoped getByText('$42.50') would also
  // match the just-added expense row's own amount text in the Expenses cell below, so it could
  // never actually fail even if the stat card itself were broken. Matches the scoping pattern
  // already used elsewhere in this file/suite (e.g. the Budget progress heading scoping in
  // e2e/accessibility.spec.ts).
  const totalSpentCard = page.getByText('Total spent this month').locator('..');
  await expect(totalSpentCard.getByText('$42.50')).toBeVisible();
});

test('old page routes redirect to the matching section of the consolidated dashboard', async ({ page }) => {
  // Same reasoning as the first test's test.setTimeout() above, with more headroom: this test
  // does a signup, a Money Cycle start, AND three separate hard navigations to old routes, each
  // one a full reload of the now-heavier consolidated /dashboard page. Empirically confirmed at
  // risk under the default 30s test timeout — reproduced 3/3 timeouts in isolation before this
  // fix (`page.goto('/budgets')` never resolving within the window), and reliably passing in
  // 9.5–35.3s once given real headroom.
  test.setTimeout(90_000);

  const email = `test-redirects-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  // Starting a Money Cycle before the redirect checks below means the Money Coach history list,
  // the Spending Breakdown table, and both charts all have real content to render — which is what
  // exposed the bug these toBeInViewport() assertions guard against (see comment below).
  await page.getByLabel(/how much do you have/i).fill('500');
  await page.getByLabel('Until when', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

  await page.goto('/expenses');
  await expect(page).toHaveURL(/\/dashboard#expenses$/);
  // Regression guard: a hard navigation to /expenses lands on /dashboard#expenses via the URL
  // alone even if the browser never actually scrolled there — found live during this task's own
  // verification. The browser's native on-load anchor scroll fires before the Money Coach
  // history list, Spending Breakdown table, and charts above #expenses finish hydrating and
  // growing the page, which left the section up to ~1300px below the viewport before the fix
  // (components/ui/Header.tsx now re-settles the scroll via a ResizeObserver on document.body).
  await expect(page.locator('#expenses')).toBeInViewport({ ratio: 0.5 });

  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/dashboard#budgets$/);
  // Same regression guard as above — #budgets sits even further down the page, so it was the
  // worst-affected section before the fix (over 6000px below the viewport).
  await expect(page.locator('#budgets')).toBeInViewport({ ratio: 0.5 });

  await page.goto('/cashflow');
  await expect(page).toHaveURL(/\/dashboard#cashflow$/);
  await expect(page.locator('#cashflow')).toBeInViewport({ ratio: 0.5 });
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
    // expense, then does a fresh hard navigation that reloads the now-heavier consolidated
    // /dashboard page. Empirically at risk under the default 30s test timeout (reproduced a
    // timeout 1/3 isolated runs before this fix) despite typically completing in 9-12s.
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
    await page.locator('#expenses').getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Groceries', { exact: true })).toBeVisible();

    // The expense now exists in the DB. Every prior add in this test only set local client state
    // (ExpensesClient's handleCreate), so app/dashboard/page.tsx's server-rendered
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
    // hydration. In a PRODUCTION build (this suite always runs against `next build && next start`,
    // per playwright.config.ts), a hydration text mismatch does NOT surface as a readable
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
