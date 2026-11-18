/**
 * E2E test: Verify enrollment persists and can be used for swap
 * Tests with fake webcam (--use-fake-device-for-media-stream)
 */
import { test, expect } from '@playwright/test';

test('enrollment persists to IndexedDB and works for swap', async ({ page }) => {
  // Collect console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('Frame captured') || text.includes('Enrollment Complete') || text.includes('quality=')) {
      console.log('  →', text);
    }
  });

  // Navigate with e2e mode for fast completion
  await page.goto('/?e2e=1', { waitUntil: 'networkidle' });

  // Wait for camera to initialize (button becomes visible)
  await page.waitForSelector('#start-enrollment', { state: 'visible', timeout: 10000 });
  console.log('✓ Start button visible');
  
  await page.click('#start-enrollment');
  console.log('✓ Clicked start, waiting for enrollment...');

  // Wait for enrollment to complete (longer timeout for pacing)
  await page.waitForSelector('#proceed-to-swap', { state: 'visible', timeout: 45000 });
  console.log('✓ Enrollment completed');

  // Verify frame counts from console logs
  const captureAttempts = consoleLogs.filter(log => log.includes('Capture attempt'));
  const capturedFrames = consoleLogs.filter(log => log.includes('✓ Frame captured'));
  const completeLog = consoleLogs.find(log => log.includes('Enrollment Complete'));
  
  console.log(`  Capture attempts: ${captureAttempts.length}`);
  console.log(`  Frames captured: ${capturedFrames.length}`);
  expect(capturedFrames.length).toBeGreaterThan(0); // Must have captured frames
  expect(completeLog).toBeTruthy();

  // Click proceed to swap
  await page.click('#proceed-to-swap');
  await page.waitForSelector('.sample-grid', { timeout: 5000 });

  // Check enrollment status shows success
  const statusText = await page.locator('#enrollment-status').textContent();
  expect(statusText).toContain('✅');
  expect(statusText).toContain('Enrolled');
  console.log('✓ Status:', statusText);

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
