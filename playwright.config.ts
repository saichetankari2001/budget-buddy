import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
