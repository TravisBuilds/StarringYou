/**
 * E2E test: Complete enrollment with fake webcam and test swap quality
 * Saves result PNGs for manual inspection
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const FAKE_VIDEO_PATH = '/cursor/stores/bot/starringyou/e2e-face/webcam-face.y4m';
const OUTPUT_DIR = '/cursor/stores/bot/starringyou/web-swaps';

test('complete enrollment and swap all 4 samples', async ({ page, context }) => {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Collect console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('Frame captured') || text.includes('Enrollment Complete') || text.includes('Swap')) {
      console.log('  →', text);
    }
  });

  // Navigate with e2e mode
  await page.goto('/?e2e=1', { waitUntil: 'networkidle' });

  // Wait for camera initialization
  await page.waitForSelector('#start-enrollment', { state: 'visible', timeout: 10000 });
  console.log('✓ Start button visible');
  
  await page.click('#start-enrollment');
  console.log('✓ Enrollment started');

  // Wait for enrollment to complete
  await page.waitForSelector('#proceed-to-swap', { state: 'visible', timeout: 60000 });
  
  const capturedFrames = consoleLogs.filter(log => log.includes('✓ Frame captured'));
  console.log(`✓ Enrollment completed (${capturedFrames.length} frames captured)`);
  expect(capturedFrames.length).toBeGreaterThan(0);

  // Click proceed to swap
  await page.click('#proceed-to-swap');
  await page.waitForSelector('.sample-grid', { timeout: 5000 });

  // Check enrollment status
  const statusText = await page.locator('#enrollment-status').textContent();
  expect(statusText).toContain('✅');
  expect(statusText).toContain('Enrolled');
  console.log('✓ Status:', statusText);

  // Test swap on all 4 sample models
  const sampleCards = await page.locator('.sample-image-card:not(.upload-card)').all();
  expect(sampleCards.length).toBe(4);

  for (let i = 0; i < sampleCards.length; i++) {
    console.log(`\nTesting swap ${i + 1}/4...`);
    
    // Click sample
    await sampleCards[i].click();

    // Wait for swap to start
    await page.waitForSelector('#swap-loading', { state: 'visible', timeout: 5000 });
    
    // Wait for swap to complete
    await page.waitForSelector('#swap-result', { state: 'visible', timeout: 30000 });
    
    // Check for errors
    const resultContent = await page.locator('#swap-result').textContent();
    if (resultContent?.includes('Failed') || resultContent?.includes('Error')) {
      console.error(`✗ Swap ${i + 1} failed:`, resultContent);
      throw new Error(`Swap ${i + 1} failed: ${resultContent}`);
    }
    
    // Get swapped result image
    const swappedImg = page.locator('#swapped-result-img');
    await expect(swappedImg).toBeVisible();
    
    const swappedSrc = await swappedImg.getAttribute('src');
    expect(swappedSrc).toBeTruthy();
    expect(swappedSrc).not.toBe('');
    
    // Save result as PNG
    if (swappedSrc && swappedSrc.startsWith('data:image')) {
      const base64Data = swappedSrc.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const outputPath = path.join(OUTPUT_DIR, `web-swap-model-${i + 1}.png`);
      fs.writeFileSync(outputPath, buffer);
      console.log(`✓ Saved: ${outputPath}`);
    }
    
    console.log(`✓ Swap ${i + 1} complete`);
    
    // Go back for next swap
    if (i < sampleCards.length - 1) {
      await page.click('#try-another');
      await page.waitForSelector('.sample-grid', { state: 'visible', timeout: 5000 });
    }
  }

  console.log('\n✓ All 4 swaps completed successfully');
  console.log(`Results saved to: ${OUTPUT_DIR}`);
});
