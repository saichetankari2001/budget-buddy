import { test, expect } from '@playwright/test';
import { forceReducedMotion } from './helpers/reducedMotion';

test.describe('reduced motion fallback', () => {
  test('dashboard shows the static glass fallback instead of the WebGL orb', async ({ page }) => {
    await forceReducedMotion(page);

    const email = `test-reduced-motion-dashboard-${Date.now()}@example.com`;
    await page.goto('/signup');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password (8+ characters)').fill('long-enough-password');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await expect(page.getByTestId('webgl-static-fallback')).toBeVisible();
    await expect(page.getByTestId('webgl-accent')).not.toBeVisible();
  });

  test('login page shows the static glass fallback instead of the WebGL hero scene', async ({ page }) => {
    await forceReducedMotion(page);

    await page.goto('/login');
    await expect(page.getByTestId('webgl-static-fallback')).toBeVisible();
    await expect(page.getByTestId('webgl-accent')).not.toBeVisible();
  });
});
