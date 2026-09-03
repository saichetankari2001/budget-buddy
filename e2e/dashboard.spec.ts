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
