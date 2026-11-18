/**
 * E2E test: Verify enrollment persists and can be used for swap
 */
import { test, expect } from '@playwright/test';

test('enrollment persists to IndexedDB and works for swap', async ({ page, context }) => {
  await context.grantPermissions(['camera']);

  // Navigate with e2e mode for fast completion
  await page.goto('http://localhost:4173/StarringYou/?e2e=1', { waitUntil: 'networkidle' });

  // Wait for enrollment to auto-complete in e2e mode
  await page.waitForSelector('button:has-text("Download My Face Data")', { timeout: 15000 });

  console.log('✓ Enrollment completed');

  // Navigate to Try Swap
  await page.click('button:text("Try Face Swap")');
  await page.waitForSelector('.sample-grid', { timeout: 5000 });

  // Check enrollment status shows success
  const statusText = await page.locator('#enrollment-status').textContent();
  expect(statusText).toContain('✅');
  expect(statusText).toContain('Enrolled');

  console.log('✓ Status shows enrolled:', statusText);

  // Click a sample image
  await page.click('.sample-image-card:first-child');

  // Should NOT show alert
  page.on('dialog', async dialog => {
    throw new Error(`Unexpected alert: ${dialog.message()}`);
  });

  // Wait for swap to complete
  await page.waitForSelector('#swapped-result-img[src]', { timeout: 10000 });

  const swappedSrc = await page.locator('#swapped-result-img').getAttribute('src');
  expect(swappedSrc).toBeTruthy();
  expect(swappedSrc).not.toBe('');

  console.log('✓ Face swap completed successfully');
});
