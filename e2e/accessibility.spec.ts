import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

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
  await page.getByRole('button', { name: /^save$/i }).click();

  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('budgets page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-budgets');
  await page.goto('/budgets');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard with a saved budget renders progress bars and has no WCAG 2.1 A/AA violations', async ({
  page,
}) => {
  await signUp(page, 'a11y-budget-progress');
  await page.goto('/budgets');

  const firstRow = page.locator('li').first();
  const categoryName = (await firstRow.locator('span.font-medium').first().innerText()).trim();
  await firstRow.locator('input[type="number"]').fill('500');
  await firstRow.getByRole('button', { name: 'Save' }).click();
  // Confirms the save actually landed (Remove only renders once monthlyLimit !== null)
  // before navigating away, so the dashboard load below is guaranteed to see a real budget.
  await expect(firstRow.getByRole('button', { name: 'Remove' })).toBeVisible();

  await page.goto('/dashboard');
  const budgetCard = page.getByRole('heading', { name: 'Budget progress' }).locator('..');
  await expect(budgetCard.getByText(categoryName, { exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('privacy page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/privacy');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
