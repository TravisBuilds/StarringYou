#!/usr/bin/env node
/**
 * E2E test for StarringYou extension
 */

import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
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
  
  const fakeWebcamPath = join(rootDir, 'test-fixtures/fake-webcam-frontal.y4m');
  logToFile(`📹 Using fake webcam: ${fakeWebcamPath}`);
  
  // Use fresh temp directory to avoid cached results
  const tempUserDataDir = mkdtempSync(join(tmpdir(), 'starringyou-e2e-'));
  logToFile(`📁 Fresh user data dir: ${tempUserDataDir}`);
  
  const context = await chromium.launchPersistentContext(tempUserDataDir, {
    headless: false,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${fakeWebcamPath}`,
    ],
    viewport: { width: 1280, height: 720 },
    permissions: ['camera'],
  });

  try {
    // Wait for service worker to load
    logToFile('⏳ Waiting for service worker...');
    
    const swPromise = context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    const sw = await swPromise;
    
    if (sw) {
      logToFile(`✅ Service worker loaded: ${sw.url()}`);
      sw.on('console', msg => logToFile(`[SW] ${msg.text()}`));
    } else {
      logToFile('⚠️ Service worker did not load within 10s');
    }
    
    const backgroundPages = context.serviceWorkers();
    logToFile(`📦 Service workers count: ${backgroundPages.length}`);
    
    if (backgroundPages.length > 0) {
      const sw = backgroundPages[0];
      logToFile(`✅ Extension service worker loaded: ${sw.url()}`);
      
      // Listen to service worker console
      sw.on('console', msg => logToFile(`[SW] ${msg.text()}`));
    } else {
      logToFile('⚠️ No service workers found - extension may not have loaded');
      logToFile('⚠️ Continuing anyway with test mode...');
    }

    // Screenshot chrome://extensions to check for errors
    logToFile('📸 Checking chrome://extensions for errors...');
    const extensionsPage = await context.newPage();
    await extensionsPage.goto('chrome://extensions/');
    await extensionsPage.waitForTimeout(1000);
    await extensionsPage.screenshot({ 
      path: '/cursor/stores/self/e2e-extensions-page.png',
      fullPage: true 
    });
    await extensionsPage.close();
    logToFile('✅ Extensions page screenshot saved');
    
    // Test onboarding first
    logToFile('📋 Testing onboarding enrollment...');
    let extensionId = null;
    if (backgroundPages.length > 0) {
      const swUrl = backgroundPages[0].url();
      const match = swUrl.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) {
        extensionId = match[1];
        logToFile(`📦 Extension ID: ${extensionId}`);
      }
    }
    
    if (extensionId) {
      const onboardingPage = await context.newPage();
      onboardingPage.on('console', msg => logToFile(`[Onboarding] ${msg.text()}`));
      
      // Add ?e2e=1 query param for relaxed tolerances with fake webcam
      await onboardingPage.goto(`chrome-extension://${extensionId}/onboarding/onboarding.html?e2e=1`);
      await onboardingPage.waitForTimeout(1000);
      
      // Take screenshot before starting
      await onboardingPage.screenshot({
        path: '/cursor/stores/self/onboarding-initial.png'
      });
      logToFile('📸 Onboarding initial screenshot saved');
      
      // Click start button
      await onboardingPage.click('#start-btn');
      logToFile('▶️  Started enrollment');
      
      // Wait for step 1 to complete (~1 second for step 0, ~1 second for step 1)
      await onboardingPage.waitForTimeout(2000);
      
      // Take mid-enrollment screenshot (should show video + step 1-2 active)
      await onboardingPage.screenshot({
        path: '/cursor/stores/self/onboarding-mid.png'
      });
      logToFile('📸 Onboarding mid-enrollment screenshot saved');
      
      // Wait for remaining steps to complete (~4 more steps * 0.5s = 2s, plus buffer)
      await onboardingPage.waitForTimeout(4000);
      
      // Wait a bit more for UI to update after completion
      await onboardingPage.waitForTimeout(500);
      
      // Take final screenshot
      await onboardingPage.screenshot({
        path: '/cursor/stores/self/onboarding-complete.png',
        fullPage: true
      });
      logToFile('📸 Onboarding complete screenshot saved');
      
      await onboardingPage.close();
    }
    
    // Clear swap cache for fresh test via service worker
    logToFile('🧹 Clearing swap cache...');
    if (backgroundPages.length > 0) {
      const sw = backgroundPages[0];
      await sw.evaluate(() => {
        return chrome.storage.local.remove('swapCache');
      });
      logToFile('✅ Cache cleared');
    }
    
    logToFile('🧪 Testing swap with enrolled face from onboarding');
    
    // Create page and navigate to test fixture with test mode enabled
    const page = await context.newPage();
    page.on('console', msg => {
      const text = msg.text();
      logToFile(`[Page] ${text}`);
      
      // Capture debug exports
      if (text.startsWith('DEBUG_EXPORTS')) {
        msg.args()[1].jsonValue().then(debugData => {
          const { target, warpedSource, mask, result } = debugData;
          if (target) {
            const targetData = target.split(',')[1];
            writeFileSync('/cursor/stores/self/debug-a-target.png', Buffer.from(targetData, 'base64'));
            logToFile('📸 Saved debug-a-target.png');
          }
          if (warpedSource) {
            const sourceData = warpedSource.split(',')[1];
            writeFileSync('/cursor/stores/self/debug-b-warped-source.png', Buffer.from(sourceData, 'base64'));
            logToFile('📸 Saved debug-b-warped-source.png');
          }
          if (mask) {
            const maskData = mask.split(',')[1];
            writeFileSync('/cursor/stores/self/debug-c-mask.png', Buffer.from(maskData, 'base64'));
            logToFile('📸 Saved debug-c-mask.png');
          }
          if (result) {
            const resultData = result.split(',')[1];
            writeFileSync('/cursor/stores/self/debug-d-result.png', Buffer.from(resultData, 'base64'));
            logToFile('📸 Saved debug-d-result.png');
          }
        }).catch(err => logToFile(`Failed to save debug images: ${err}`));
      }
    });
    page.on('pageerror', err => logToFile(`[Error] ${err.message}`));
    
    // Navigate to fixture page (using enrolled face from onboarding)
    logToFile('📄 Loading fixture page...');
    await page.goto('http://localhost:8765/test-fixtures/product-page.html');
    await page.waitForLoadState('networkidle');
    
    // Take before screenshot
    logToFile('📸 Taking before screenshot...');
    await page.screenshot({ 
      path: '/cursor/stores/self/e2e-before.png',
      fullPage: true 
    });
    
    // Wait for all images to finish processing (up to 20s)
    logToFile('⏳ Waiting for image swaps to complete...');
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('.product-image'));
      return images.every(img => {
        const state = img.getAttribute('data-starringyou-state');
        return state === 'done' || state === 'error' || state === null;
      });
    }, { timeout: 20000 }).catch(() => {
      logToFile('⚠️  Timeout waiting for swaps, continuing anyway');
    });
    
    // Take after screenshot
    logToFile('📸 Taking after screenshot...');
    await page.screenshot({ 
      path: '/cursor/stores/self/e2e-after.png',
      fullPage: true 
    });
    
    // Capture individual product images
    logToFile('📸 Capturing individual product images...');
    const productImages = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('.product-image'));
      return images.map((img, index) => ({
        index,
        src: img.src,
        swapped: img.getAttribute('data-starringyou-swapped'),
        width: img.naturalWidth,
        height: img.naturalHeight
      }));
    });
    
    // Screenshot each product card
    for (let i = 0; i < Math.min(productImages.length, 5); i++) {
      const img = productImages[i];
      try {
        const card = await page.$$(`.product-card`);
        if (card[i]) {
          await card[i].screenshot({
            path: `/cursor/stores/self/swap-${i}-after.png`
          });
          logToFile(`  → Saved swap-${i}-after.png`);
        }
      } catch (e) {
        logToFile(`  ⚠️  Failed to capture product ${i}: ${e.message}`);
      }
    }
    
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
