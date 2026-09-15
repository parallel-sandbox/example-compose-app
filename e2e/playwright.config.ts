import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: !process.env.HEADED,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
  },
});
