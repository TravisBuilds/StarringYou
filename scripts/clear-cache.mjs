#!/usr/bin/env node
/**
 * Clear swap cache before E2E test
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDir = join(__dirname, '../extension');

console.log('🧹 Clearing swap cache...');

const context = await chromium.launchPersistentContext('', {
  headless: true,
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    '--no-sandbox',
  ],
});

const page = await context.newPage();

// Clear storage
await page.evaluate(() => {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      console.log('Cache cleared');
      resolve();
    });
  });
});

await context.close();
console.log('✅ Cache cleared');
