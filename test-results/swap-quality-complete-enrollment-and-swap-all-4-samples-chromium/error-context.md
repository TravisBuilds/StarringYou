# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: swap-quality.spec.ts >> complete enrollment and swap all 4 samples
- Location: e2e/swap-quality.spec.ts:12:1

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#start-enrollment') to be visible

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - heading "404" [level=1] [ref=e3]
  - paragraph [ref=e4]:
    - strong [ref=e5]: There isn't a GitHub Pages site here.
  - paragraph [ref=e6]:
    - text: If you're trying to publish one,
    - link "read the full documentation" [ref=e7] [cursor=pointer]:
      - /url: https://help.github.com/pages/
    - text: to learn how to set up
    - strong [ref=e8]: GitHub Pages
    - text: for your repository, organization, or user account.
  - generic [ref=e9]:
    - link "GitHub Status" [ref=e10] [cursor=pointer]:
      - /url: https://githubstatus.com
    - text: —
    - link "@githubstatus" [ref=e11] [cursor=pointer]:
      - /url: https://twitter.com/githubstatus
  - link [ref=e12] [cursor=pointer]:
    - /url: /
```

# Test source

```ts
  1   | /**
  2   |  * E2E test: Complete enrollment with fake webcam and test swap quality
  3   |  * Saves result PNGs for manual inspection
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import * as fs from 'fs';
  7   | import * as path from 'path';
  8   | 
  9   | const FAKE_VIDEO_PATH = '/tmp/test-face.y4m';
  10  | const OUTPUT_DIR = '/cursor/stores/bot/starringyou/web-swaps';
  11  | 
  12  | test('complete enrollment and swap all 4 samples', async ({ page, context }) => {
  13  |   // Ensure output directory exists
  14  |   if (!fs.existsSync(OUTPUT_DIR)) {
  15  |     fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  16  |   }
  17  | 
  18  |   // Collect console logs
  19  |   const consoleLogs: string[] = [];
  20  |   page.on('console', msg => {
  21  |     const text = msg.text();
  22  |     consoleLogs.push(text);
  23  |     if (text.includes('Frame captured') || text.includes('Enrollment Complete') || text.includes('Swap')) {
  24  |       console.log('  →', text);
  25  |     }
  26  |   });
  27  | 
  28  |   // Navigate with e2e mode
  29  |   await page.goto('/?e2e=1', { waitUntil: 'networkidle' });
  30  | 
  31  |   // Wait for camera initialization
> 32  |   await page.waitForSelector('#start-enrollment', { state: 'visible', timeout: 10000 });
      |              ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  33  |   console.log('✓ Start button visible');
  34  |   
  35  |   await page.click('#start-enrollment');
  36  |   console.log('✓ Enrollment started');
  37  | 
  38  |   // Wait for enrollment to complete
  39  |   await page.waitForSelector('#proceed-to-swap', { state: 'visible', timeout: 60000 });
  40  |   
  41  |   const capturedFrames = consoleLogs.filter(log => log.includes('✓ Frame captured'));
  42  |   console.log(`✓ Enrollment completed (${capturedFrames.length} frames captured)`);
  43  |   expect(capturedFrames.length).toBeGreaterThan(0);
  44  | 
  45  |   // Click proceed to swap
  46  |   await page.click('#proceed-to-swap');
  47  |   await page.waitForSelector('.sample-grid', { timeout: 5000 });
  48  | 
  49  |   // Check enrollment status
  50  |   const statusText = await page.locator('#enrollment-status').textContent();
  51  |   expect(statusText).toContain('✅');
  52  |   expect(statusText).toContain('Enrolled');
  53  |   console.log('✓ Status:', statusText);
  54  | 
  55  |   // Test swap on all 4 sample models
  56  |   const sampleCards = await page.locator('.sample-image-card:not(.upload-card)').all();
  57  |   expect(sampleCards.length).toBe(4);
  58  | 
  59  |   for (let i = 0; i < sampleCards.length; i++) {
  60  |     console.log(`\nTesting swap ${i + 1}/4...`);
  61  |     
  62  |     // Click sample
  63  |     await sampleCards[i].click();
  64  | 
  65  |     // Wait for swap to start
  66  |     await page.waitForSelector('#swap-loading', { state: 'visible', timeout: 5000 });
  67  |     
  68  |     // Wait for swap to complete
  69  |     await page.waitForSelector('#swap-result', { state: 'visible', timeout: 30000 });
  70  |     
  71  |     // Check for errors
  72  |     const resultContent = await page.locator('#swap-result').textContent();
  73  |     if (resultContent?.includes('Failed') || resultContent?.includes('Error')) {
  74  |       console.error(`✗ Swap ${i + 1} failed:`, resultContent);
  75  |       throw new Error(`Swap ${i + 1} failed: ${resultContent}`);
  76  |     }
  77  |     
  78  |     // Get swapped result image
  79  |     const swappedImg = page.locator('#swapped-result-img');
  80  |     await expect(swappedImg).toBeVisible();
  81  |     
  82  |     const swappedSrc = await swappedImg.getAttribute('src');
  83  |     expect(swappedSrc).toBeTruthy();
  84  |     expect(swappedSrc).not.toBe('');
  85  |     
  86  |     // Save result as PNG
  87  |     if (swappedSrc && swappedSrc.startsWith('data:image')) {
  88  |       const base64Data = swappedSrc.split(',')[1];
  89  |       const buffer = Buffer.from(base64Data, 'base64');
  90  |       const outputPath = path.join(OUTPUT_DIR, `web-swap-model-${i + 1}.png`);
  91  |       fs.writeFileSync(outputPath, buffer);
  92  |       console.log(`✓ Saved: ${outputPath}`);
  93  |     }
  94  |     
  95  |     console.log(`✓ Swap ${i + 1} complete`);
  96  |     
  97  |     // Go back for next swap
  98  |     if (i < sampleCards.length - 1) {
  99  |       await page.click('#try-another');
  100 |       await page.waitForSelector('.sample-grid', { state: 'visible', timeout: 5000 });
  101 |     }
  102 |   }
  103 | 
  104 |   console.log('\n✓ All 4 swaps completed successfully');
  105 |   console.log(`Results saved to: ${OUTPUT_DIR}`);
  106 | });
  107 | 
```