# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: enrollment-persistence.spec.ts >> enrollment persists to IndexedDB and works for swap
- Location: e2e/enrollment-persistence.spec.ts:6:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#proceed-to-swap') to be visible
    55 × locator resolved to hidden <button id="proceed-to-swap" class="btn btn-primary">Try Face Swap →</button>

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
  3  |  */
  4  | import { test, expect } from '@playwright/test';
  5  | 
  6  | test('enrollment persists to IndexedDB and works for swap', async ({ page }) => {
  7  |   // Navigate with e2e mode for fast completion
  8  |   await page.goto('/?e2e=1');
  9  | 
  10 |   // Wait for camera to initialize (button becomes visible)
  11 |   await page.waitForSelector('#start-enrollment', { state: 'visible', timeout: 10000 });
  12 |   
  13 |   console.log('✓ Start button visible, clicking...');
  14 |   await page.click('#start-enrollment');
  15 | 
  16 |   // Wait for enrollment to complete
> 17 |   await page.waitForSelector('#proceed-to-swap', { state: 'visible', timeout: 30000 });
     |              ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  18 |   console.log('✓ Enrollment completed');
  19 | 
  20 |   // Click proceed to swap
  21 |   await page.click('#proceed-to-swap');
  22 |   await page.waitForSelector('.sample-grid', { timeout: 5000 });
  23 | 
  24 |   // Check enrollment status shows success
  25 |   const statusText = await page.locator('#enrollment-status').textContent();
  26 |   expect(statusText).toContain('✅');
  27 |   expect(statusText).toContain('Enrolled');
  28 |   console.log('✓ Status shows enrolled:', statusText);
  29 | 
  30 |   // Click a sample image
  31 |   await page.click('.sample-image-card >> nth=0');
  32 | 
  33 |   // Should NOT show alert
  34 |   page.on('dialog', async dialog => {
  35 |     throw new Error(`Unexpected alert: ${dialog.message()}`);
  36 |   });
  37 | 
  38 |   // Wait for swap to start
  39 |   await page.waitForSelector('#swap-loading', { state: 'visible', timeout: 5000 });
  40 |   console.log('✓ Swap started');
  41 | 
  42 |   // Wait for swap to complete
  43 |   await page.waitForSelector('#swapped-result-img[src]', { timeout: 15000 });
  44 | 
  45 |   const swappedSrc = await page.locator('#swapped-result-img').getAttribute('src');
  46 |   expect(swappedSrc).toBeTruthy();
  47 |   expect(swappedSrc).not.toBe('');
  48 | 
  49 |   console.log('✓ Face swap completed successfully');
  50 | });
  51 | 
```