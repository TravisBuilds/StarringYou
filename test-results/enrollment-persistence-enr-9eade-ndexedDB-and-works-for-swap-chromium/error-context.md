# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: enrollment-persistence.spec.ts >> enrollment persists to IndexedDB and works for swap
- Location: e2e/enrollment-persistence.spec.ts:7:1

# Error details

```
TimeoutError: page.waitForSelector: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('#proceed-to-swap') to be visible
    82 × locator resolved to hidden <button id="proceed-to-swap" class="btn btn-primary">Try Face Swap →</button>

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - heading "⭐ StarringYou" [level=1] [ref=e4]
    - paragraph [ref=e5]: See yourself starring in any outfit
  - generic [ref=e6]:
    - generic [ref=e7]:
      - strong [ref=e8]: 🎥 Try enrollment + test swaps here
      - text: "- Use your webcam to enroll your face, then see yourself swapped into sample outfits."
    - generic [ref=e9]:
      - strong [ref=e10]: "🔌 Install the extension:"
      - text: 1. Download
      - link "starringyou-extension.zip" [ref=e11] [cursor=pointer]:
        - /url: /StarringYou/starringyou-extension.zip
      - text: 2. Unzip the file 3. Visit
      - code [ref=e12]: chrome://extensions
      - text: ", enable Developer mode 4. Click \"Load unpacked\" and select the unzipped folder"
  - navigation [ref=e13]:
    - button "Enroll Face" [ref=e14] [cursor=pointer]
    - button "Try Swap" [disabled] [ref=e15]
    - button "Settings" [ref=e16] [cursor=pointer]
  - generic [ref=e18]:
    - generic [ref=e22]:
      - paragraph [ref=e23]: Look straight at the camera — Not so far, turn back a little
      - button "Skip this step" [ref=e31] [cursor=pointer]
    - button "Restart" [ref=e33] [cursor=pointer]
  - contentinfo [ref=e34]:
    - paragraph [ref=e35]:
      - strong [ref=e36]: "Privacy First:"
      - text: Your face data stays in your browser. No uploads, no tracking, no third-party analytics.
```

# Test source

```ts
  1  | /**
  2  |  * E2E test: Verify enrollment persists and can be used for swap
  3  |  * Tests with fake webcam (--use-fake-device-for-media-stream)
  4  |  */
  5  | import { test, expect } from '@playwright/test';
  6  | 
  7  | test('enrollment persists to IndexedDB and works for swap', async ({ page }) => {
  8  |   // Collect console logs
  9  |   const consoleLogs: string[] = [];
  10 |   page.on('console', msg => {
  11 |     const text = msg.text();
  12 |     consoleLogs.push(text);
  13 |     if (text.includes('Frame captured') || text.includes('Enrollment Complete') || text.includes('quality=')) {
  14 |       console.log('  →', text);
  15 |     }
  16 |   });
  17 | 
  18 |   // Navigate with e2e mode for fast completion
  19 |   await page.goto('/?e2e=1', { waitUntil: 'networkidle' });
  20 | 
  21 |   // Wait for camera to initialize (button becomes visible)
  22 |   await page.waitForSelector('#start-enrollment', { state: 'visible', timeout: 10000 });
  23 |   console.log('✓ Start button visible');
  24 |   
  25 |   await page.click('#start-enrollment');
  26 |   console.log('✓ Clicked start, waiting for enrollment...');
  27 | 
  28 |   // Wait for enrollment to complete (longer timeout for pacing)
> 29 |   await page.waitForSelector('#proceed-to-swap', { state: 'visible', timeout: 45000 });
     |              ^ TimeoutError: page.waitForSelector: Timeout 45000ms exceeded.
  30 |   console.log('✓ Enrollment completed');
  31 | 
  32 |   // Verify frame counts from console logs
  33 |   const captureAttempts = consoleLogs.filter(log => log.includes('Capture attempt'));
  34 |   const capturedFrames = consoleLogs.filter(log => log.includes('✓ Frame captured'));
  35 |   const completeLog = consoleLogs.find(log => log.includes('Enrollment Complete'));
  36 |   
  37 |   console.log(`  Capture attempts: ${captureAttempts.length}`);
  38 |   console.log(`  Frames captured: ${capturedFrames.length}`);
  39 |   expect(capturedFrames.length).toBeGreaterThan(0); // Must have captured frames
  40 |   expect(completeLog).toBeTruthy();
  41 | 
  42 |   // Click proceed to swap
  43 |   await page.click('#proceed-to-swap');
  44 |   await page.waitForSelector('.sample-grid', { timeout: 5000 });
  45 | 
  46 |   // Check enrollment status shows success
  47 |   const statusText = await page.locator('#enrollment-status').textContent();
  48 |   expect(statusText).toContain('✅');
  49 |   expect(statusText).toContain('Enrolled');
  50 |   console.log('✓ Status:', statusText);
  51 | 
  52 |   // Click a sample image
  53 |   await page.click('.sample-image-card >> nth=0');
  54 | 
  55 |   // Should NOT show alert
  56 |   page.on('dialog', async dialog => {
  57 |     throw new Error(`Unexpected alert: ${dialog.message()}`);
  58 |   });
  59 | 
  60 |   // Wait for swap to start
  61 |   await page.waitForSelector('#swap-loading', { state: 'visible', timeout: 5000 });
  62 |   console.log('✓ Swap started');
  63 | 
  64 |   // Wait for swap to complete
  65 |   await page.waitForSelector('#swapped-result-img[src]', { timeout: 15000 });
  66 | 
  67 |   const swappedSrc = await page.locator('#swapped-result-img').getAttribute('src');
  68 |   expect(swappedSrc).toBeTruthy();
  69 |   expect(swappedSrc).not.toBe('');
  70 | 
  71 |   console.log('✓ Face swap completed successfully');
  72 | });
  73 | 
```