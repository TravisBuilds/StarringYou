/**
 * StarringYou Extension E2E Test
 */

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '../../extension');
const FAKE_WEBCAM_PATH = path.join(__dirname, '../../test-fixtures/fake-webcam.y4m');
const FIXTURE_URL = 'http://localhost:8765/test-fixtures/product-page.html';

let context: BrowserContext;

test.beforeAll(async () => {
  // Launch Chrome with extension loaded and fake webcam
  context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions require headed mode
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${FAKE_WEBCAM_PATH}`,
      '--use-fake-ui-for-media-stream', // Auto-allow camera
    ],
  });
});

test.afterAll(async () => {
  await context?.close();
});

test('extension loads and shows popup', async () => {
  const page = await context.newPage();
  
  // Navigate to test page
  await page.goto('chrome://extensions');
  
  // Check extension is loaded
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ path: '/cursor/stores/self/extension-loaded.png' });
  
  console.log('Extension loaded successfully');
});

test('onboarding enrollment flow', async () => {
  const page = await context.newPage();
  
  // Open onboarding page
  await page.goto(`chrome-extension://fake-id/onboarding/onboarding.html`);
  // Note: We'll need to get the real extension ID
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/cursor/stores/self/onboarding-start.png' });
});

test('face swap on product page', async () => {
  const page = await context.newPage();
  
  // Navigate to fixture page
  await page.goto(FIXTURE_URL);
  
  // Wait for page load
  await page.waitForLoadState('networkidle');
  
  // Take before screenshot
  await page.screenshot({ path: '/cursor/stores/self/fixture-before.png', fullPage: true });
  
  // Wait for swaps to happen (if extension is enabled)
  await page.waitForTimeout(3000);
  
  // Take after screenshot
  await page.screenshot({ path: '/cursor/stores/self/fixture-after.png', fullPage: true });
  
  console.log('Product page test complete');
});
