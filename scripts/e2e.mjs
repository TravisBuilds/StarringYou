#!/usr/bin/env node
/**
 * E2E test for StarringYou extension
 */

import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import handler from 'serve-handler';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const extensionDir = join(rootDir, 'extension');
const fixturesDir = join(rootDir, 'test-fixtures');

// Start static file server for test fixtures
const server = http.createServer((req, res) => {
  return handler(req, res, {
    public: rootDir,
    cleanUrls: false
  });
});

server.listen(8765, async () => {
  console.log('📁 Test server running on http://localhost:8765');
  
  try {
    await runE2E();
  } catch (error) {
    console.error('❌ E2E test failed:', error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});

async function runE2E() {
  const logs = [];
  const logToFile = (msg) => {
    logs.push(msg);
    console.log(msg);
  };
  
  logToFile('🚀 Launching Chrome with extension...');
  logToFile(`📂 Extension path: ${extensionDir}`);
  
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    viewport: { width: 1280, height: 720 },
  });

  try {
    // Wait for extension to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const backgroundPages = context.serviceWorkers();
    logToFile(`📦 Service workers: ${backgroundPages.length}`);
    
    if (backgroundPages.length > 0) {
      const sw = backgroundPages[0];
      logToFile(`✅ Extension service worker loaded: ${sw.url()}`);
      
      // Listen to service worker console
      sw.on('console', msg => logToFile(`[SW] ${msg.text()}`));
    } else {
      logToFile('⚠️ No service workers found - extension may not have loaded');
      logToFile('⚠️ Continuing anyway with test mode...');
    }

    logToFile('🧪 Using TEST MODE - content script will use hardcoded test face');
    
    // Create page and navigate to test fixture with test mode enabled
    const page = await context.newPage();
    page.on('console', msg => logToFile(`[Page] ${msg.text()}`));
    page.on('pageerror', err => logToFile(`[Error] ${err.message}`));
    
    // Navigate to fixture page with test mode enabled
    logToFile('📄 Loading fixture page...');
    await page.goto('http://localhost:8765/test-fixtures/product-page.html?test=true');
    await page.waitForLoadState('networkidle');
    
    // Take before screenshot
    logToFile('📸 Taking before screenshot...');
    await page.screenshot({ 
      path: '/cursor/stores/self/e2e-before.png',
      fullPage: true 
    });
    
    // Wait for content script to process images
    await page.waitForTimeout(5000);
    
    // Take after screenshot
    logToFile('📸 Taking after screenshot...');
    await page.screenshot({ 
      path: '/cursor/stores/self/e2e-after.png',
      fullPage: true 
    });
    
    // Check for swapped images
    const swappedCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-starringyou-swapped]').length;
    });
    
    logToFile(`✨ Swapped ${swappedCount} images`);
    
    // Save logs
    writeFileSync('/cursor/stores/self/e2e-logs.txt', logs.join('\n'));
    logToFile('✅ E2E test complete!');
    
  } finally {
    await context.close();
  }
}
