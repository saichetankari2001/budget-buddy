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

test('budgets page has no WCAG 2.1 A/AA violations', async ({ page }) => {
  await signUp(page, 'a11y-budgets');
  await page.goto('/budgets');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
