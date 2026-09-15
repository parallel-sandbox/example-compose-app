import { test, expect } from '@playwright/test';

test('a job added in the browser is picked up by the worker and finished', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('example-compose-app');

  const title = `e2e ${new Date().toISOString()}`;
  await page.fill('#title', title);
  await page.click('#add');

  const row = page.locator('tr', { hasText: title });
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 20_000 });
  await expect(row.locator('td').nth(2)).toContainText('sha256:');
  await expect(page.locator('#worker')).toContainText('worker: up');

  await page.screenshot({ path: 'screenshots/jobs.png', fullPage: true });
});
