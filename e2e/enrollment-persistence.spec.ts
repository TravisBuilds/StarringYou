/**
 * E2E test: Verify enrollment persists and can be used for swap
 */
import { test, expect } from '@playwright/test';

test('enrollment persists to IndexedDB and works for swap', async ({ page }) => {
  // Navigate with e2e mode for fast completion
  await page.goto('/?e2e=1');

  // Wait for camera to initialize (button becomes visible)
  await page.waitForSelector('#start-enrollment', { state: 'visible', timeout: 10000 });
  
  console.log('✓ Start button visible, clicking...');
  await page.click('#start-enrollment');

  // Wait for enrollment to complete
  await page.waitForSelector('#proceed-to-swap', { state: 'visible', timeout: 30000 });
  console.log('✓ Enrollment completed');

  // Check console for frame counts before navigating
  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(msg.text()));

  // Click proceed to swap
  await page.click('#proceed-to-swap');
  await page.waitForSelector('.sample-grid', { timeout: 5000 });

  // Verify frame counts from console logs
  const completeLog = consoleLogs.find(log => log.includes('Enrollment Complete'));
  expect(completeLog).toBeTruthy();
  console.log('Enrollment summary:', completeLog);

  // Check enrollment status shows success
  const statusText = await page.locator('#enrollment-status').textContent();
  expect(statusText).toContain('✅');
  expect(statusText).toContain('Enrolled');
  expect(statusText).toMatch(/\d+ usable frame/); // Should show frame count
  console.log('✓ Status shows enrolled:', statusText);

  // Click a sample image
  await page.click('.sample-image-card >> nth=0');

  // Should NOT show alert
  page.on('dialog', async dialog => {
    throw new Error(`Unexpected alert: ${dialog.message()}`);
  });

  // Wait for swap to start
  await page.waitForSelector('#swap-loading', { state: 'visible', timeout: 5000 });
  console.log('✓ Swap started');

  // Wait for swap to complete
  await page.waitForSelector('#swapped-result-img[src]', { timeout: 15000 });

  const swappedSrc = await page.locator('#swapped-result-img').getAttribute('src');
  expect(swappedSrc).toBeTruthy();
  expect(swappedSrc).not.toBe('');

  console.log('✓ Face swap completed successfully');
});
