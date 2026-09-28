import { test, expect } from '@playwright/test';

test('signup, add an expense, and see it on the dashboard', async ({ page }) => {
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
  await page.getByRole('button', { name: /save/i }).click();

  await expect(page.getByText('Test lunch')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByText('$42.50')).toBeVisible();
});

// Node's default Intl locale resolves to en-US regardless of server timezone/OS locale (verified:
// `new Date().toLocaleDateString()` on this project's own dev/CI machines returns US-style M/D/Y),
// while a real visitor's browser resolves whatever locale their OS/browser is set to — for this
// Australia-targeted app, that's realistically en-AU (D/M/Y), matching the locale already pinned
// explicitly in lib/utils/currency.ts. Forcing the browser context to en-AU here makes that
// realistic mismatch deterministic in CI instead of depending on the test runner's own ambient
// locale (which is why this bug survived Task 7/8's review undetected — no existing test forces a
// non-US client locale, and no existing test does a fresh hard navigation to /cashflow with a bill
// already in the DB, since every prior bill-list test only ever added the bill via a same-page
// client-side POST that never round-trips through the server component's `initialBills` prop).
test.use({ locale: 'en-AU' });

test('cashflow page reloaded with an existing bill hydrates without a server/client mismatch', async ({ page }) => {
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
