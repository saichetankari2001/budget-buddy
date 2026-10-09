import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { forceReducedMotion } from './helpers/reducedMotion';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Every test in this file scans for WCAG violations, so every test needs GlassPanel's entrance
// animation (opacity 0 -> 1) settled before scanning — see e2e/helpers/reducedMotion.ts for why
// page.emulateMedia({ reducedMotion: 'reduce' }) alone isn't sufficient for this. Applied globally
// rather than per-test since it's a scan precondition, not something specific tests opt into.
test.beforeEach(async ({ page }) => {
  await forceReducedMotion(page);
});

async function signUp(page: import('@playwright/test').Page, emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('longenough123');
  await page.getByRole('button', { name: /sign up/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test('signup page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/signup');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('login page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-dashboard');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard with an active money cycle has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-dashboard-cycle');
  await page.goto('/dashboard');
  await page.getByLabel(/how much do you have/i).fill('500');
  await page.getByLabel('Until when', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard with a spending breakdown shows the recommendation table and has no WCAG 2.1 A/AA violations', async ({
  page,
}) => {
  await signUp(page, 'a11y-spending-breakdown');
  await page.getByLabel(/how much do you have/i).fill('500');
  await page.getByLabel('Until when', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

  await expect(page.getByTestId('spending-breakdown-card')).toBeVisible({ timeout: 10000 });

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('expenses page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-expenses');
  await page.goto('/expenses');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('expenses page with the add-expense form open has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-expenses-form');
  await page.goto('/expenses');
  await page.getByRole('button', { name: /add expense/i }).click();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('expenses page with a submitted expense shows its edit/delete icons and has no WCAG 2.1 A/AA violations', async ({
  page,
}) => {
  await signUp(page, 'a11y-expenses-added');
  // The newly-added row plays a 300ms fade-slide-in opacity animation
  // (tailwind.config.ts's fadeSlideIn); scanning mid-animation would catch a
  // transient, non-representative low-opacity contrast state. The component
  // already declares `motion-reduce:animate-none` for exactly this case, so
  // emulating the same reduced-motion preference here scans the real resting
  // state instead of adding an arbitrary wait.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/expenses');
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/amount/i).fill('42.50');
  await page.getByLabel(/description/i).fill('Groceries');
  // No scoping needed: /expenses is now its own standalone page (Task 4 of this plan) with no
  // Manage Budgets cell sharing the DOM — that cell lives on its own /budgets page now, so this
  // form's "Save" button is the only one on the page. The old #expenses-scoped locator here
  // targeted a section-anchor id from the pre-split consolidated dashboard that no longer exists
  // anywhere in the app's markup (confirmed via repo-wide search) — found live during this task's
  // own full-suite run, where the stale locator matched zero elements and hung until timeout.
  await page.getByRole('button', { name: /^save$/i }).click();

  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('budgets page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-budgets');
  await page.goto('/budgets');
  // Replaces the old `page.waitForSelector('#budgets')`: that id was a section anchor on the
  // pre-split consolidated dashboard and no longer exists anywhere in the app's markup now that
  // /budgets is its own standalone page (Task 2 of this plan) — the stale selector matched zero
  // elements and hung until timeout, found live during this task's own full-suite run. /budgets'
  // content is server-rendered, so waiting for its real h1 is sufficient readiness evidence.
  await expect(page.getByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard with a saved budget renders progress bars and has no WCAG 2.1 A/AA violations', async ({
  page,
}) => {
  await signUp(page, 'a11y-budget-progress');
  await page.goto('/budgets');

  // Scoped to the "Manage budgets" panel (via its own heading, same idiom as the "Budget
  // progress" scoping below): the old #budgets-scoped locator here targeted a section-anchor id
  // from the pre-split consolidated dashboard that no longer exists anywhere in the app's markup
  // — found live during this task's own full-suite run, where the stale locator matched zero
  // elements and hung until timeout. An initial fix (plain `page.locator('li').first()`, reasoning
  // that /budgets' only other list, Budget progress, starts empty for a fresh signup) was also
  // confirmed broken live: the Save click below populates that EARLIER Budget progress list with
  // its own real <li> (same render, no reload — BudgetsClient's router.refresh()), so by the time
  // `firstRow` is re-queried for the "Remove" button, unscoped "first li" had already shifted to
  // Budget progress's new row instead of staying on the Manage budgets row that was actually
  // saved. Scoping to the Manage budgets panel specifically avoids this regardless of what renders
  // above it.
  const manageBudgetsPanel = page.getByRole('heading', { name: 'Manage budgets' }).locator('..');
  const firstRow = manageBudgetsPanel.locator('li').first();
  const categoryName = (await firstRow.locator('span.font-medium').first().innerText()).trim();
  await firstRow.locator('input[type="number"]').fill('500');
  await firstRow.getByRole('button', { name: 'Save' }).click();
  // Confirms the save actually landed (Remove only renders once monthlyLimit !== null).
  await expect(firstRow.getByRole('button', { name: 'Remove' })).toBeVisible();

  // Budget progress now lives only on /budgets itself — Task 5 of this plan rebuilt /dashboard as
  // a lean home screen with no Budget progress section at all (confirmed live: the rendered
  // /dashboard DOM has no "Budget progress" heading anywhere, just the hero, 2 stats, quick-access
  // strip, Money Coach, and Spending-by-category chart). The old `page.goto('/dashboard')` +
  // Budget-progress-heading check this test used to do is therefore testing a section that no
  // longer exists there. BudgetsClient's handleSave() already calls `router.refresh()` on save,
  // which re-renders this same /budgets page's server-fetched Budget progress panel in place —
  // no navigation needed to see it reflect the new limit.
  const budgetProgressPanel = page.getByRole('heading', { name: 'Budget progress' }).locator('..');
  await expect(budgetProgressPanel.getByText(categoryName, { exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('cashflow page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-cashflow');
  await page.goto('/cashflow');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('cashflow page with an active cycle and a bill shows the projection list and has no WCAG 2.1 A/AA violations', async ({
  page,
}) => {
  // Same reasoning as the test.setTimeout() headroom added for the consolidated dashboard in
  // e2e/dashboard.spec.ts: this test loads the dashboard page once (for the cycle start) and the
  // now-direct, real /cashflow page once, then adds a
  // bill, which triggers a bill-list refresh AND a full /api/cycles/active projection refetch —
  // itself several sequential Prisma queries (expenses, bills, income sources, aggregates). Under
  // real Neon free-tier latency this reliably failed the "Rent -$800.00" projection-row assertion
  // on its default 10s timeout twice in CI (runs 37199547781, 37200415376) while the identical
  // logic worked correctly locally — the bill's "Rent" entry itself rendered fine (an earlier
  // assertion in this same test), only the heavier projection refetch was too slow for the
  // default window, not a real product bug.
  test.setTimeout(60_000);

  await signUp(page, 'a11y-cashflow-projection');
  // The projection list renders one row per day of the cycle, each playing the same fade-slide-in
  // opacity animation used by the income/bill rows above (see the "expenses page with a submitted
  // expense" test above for the same fix). Scanning mid-animation on a list this size makes it easy
  // to catch a transient low-opacity row; emulating reduced motion scans the real resting state.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  await page.getByLabel(/how much do you have/i).fill('500');
  await page.getByLabel('Until when', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: /^start$/i }).click();
  await expect(page.getByText('Days left')).toBeVisible({ timeout: 15000 });

  await page.goto('/cashflow');
  await page.getByRole('button', { name: /add bill/i }).click();
  await page.getByLabel(/^name$/i).fill('Rent');
  await page.getByLabel(/amount/i).fill('800');
  // exact: true — the substring/regex form also matches DateField's "Open due date calendar"
  // button aria-label, causing a Playwright strict-mode ambiguity error.
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: /add bill/i }).click();

  // exact: true — without it this would also match the projection row's "Rent -$800.00" text
  // below, causing a Playwright strict-mode ambiguity error.
  await expect(page.getByText('Rent', { exact: true })).toBeVisible();
  // Confirms the projection list actually rendered real day-by-day data (not the empty/prompt
  // state) before scanning: the bill's amount appears inline as an event on its due-date row,
  // which only exists once /api/cycles/active has returned a populated `projection` array.
  // Extended timeout: this specific refetch is the slowest step in the test (see the
  // test.setTimeout() comment above).
  await expect(page.getByText('Rent -$800.00')).toBeVisible({ timeout: 20000 });
  // The visual flag the whole feature exists to surface — the lowest projected balance in the cycle.
  // Without this the test would pass on a projection that rendered rows but never flagged the dip.
  await expect(page.getByText('Lowest point')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('privacy page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/privacy');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
