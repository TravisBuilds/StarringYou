/**
 * E2E test: Complete enrollment and perform swap on production build
 * Tests the real persistence flow without ?e2e=1 shortcuts
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/StarringYou';

test('complete enrollment and perform swap without errors', async ({ page, context }) => {
  // Listen for console errors
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text());
    }
  });
  
  // Grant webcam permission
  await context.grantPermissions(['camera']);

  // Navigate to app
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Click "Start Enrollment"
  await page.click('button:has-text("Start Enrollment")');
  await page.waitForSelector('.enrollment-container', { timeout: 5000 });

  // Wait for enrollment to complete
  // The fake webcam should auto-complete steps quickly
  await page.waitForSelector('button:has-text("Download My Face Data")', { timeout: 30000 });

  console.log('Enrollment completed');

  // Navigate to Try Swap
  await page.click('a[href="#try-swap"]');
  await page.waitForSelector('.sample-grid', { timeout: 5000 });

  // Click a sample image
  await page.click('.model-card[data-model-id="model-1"]');

  // Wait for swap to start (loading indicator appears)
  await page.waitForSelector('#swap-loading', { state: 'visible', timeout: 5000 });

  // Check for alert (should NOT appear)
  page.on('dialog', async dialog => {
    console.error('Unexpected alert:', dialog.message());
    expect(dialog.message()).not.toContain('Please complete enrollment first');
    await dialog.dismiss();
  });

  // Wait for swap result
  await page.waitForSelector('#swap-result', { state: 'visible', timeout: 10000 });

  // Verify swapped image is visible
  const swappedImg = await page.locator('#swapped-result-img').getAttribute('src');
  expect(swappedImg).toBeTruthy();
  expect(swappedImg).not.toBe('');

  // Log any console errors for debugging
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors);
  }
  if (consoleWarnings.length > 0) {
    console.warn('Console warnings:', consoleWarnings);
  }

  // Check for storage errors specifically
  const storageErrors = consoleErrors.filter(e => 
    e.includes('save') || 
    e.includes('storage') || 
    e.includes('IndexedDB') ||
    e.includes('enrollment data')
  );
  
  if (storageErrors.length > 0) {
    console.error('Storage-related errors found:', storageErrors);
  }
  
  expect(storageErrors).toHaveLength(0);
});
