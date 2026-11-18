# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/enrollment-persistence.spec.ts >> enrollment persists to IndexedDB and works for swap
- Location: e2e/enrollment-persistence.spec.ts:6:1

# Error details

```
TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('button:has-text("Download My Face Data")') to be visible

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
  - paragraph [ref=e23]:
    - strong [ref=e24]: No camera found
    - text: Please connect a webcam and try again.
    - button "Retry" [ref=e25] [cursor=pointer]
  - contentinfo [ref=e33]:
    - paragraph [ref=e34]:
      - strong [ref=e35]: "Privacy First:"
      - text: Your face data stays in your browser. No uploads, no tracking, no third-party analytics.
```

# Test source

```ts
  1  | /**
  2  |  * E2E test: Verify enrollment persists and can be used for swap
  3  |  */
  4  | import { test, expect } from '@playwright/test';
  5  | 
  6  | test('enrollment persists to IndexedDB and works for swap', async ({ page, context }) => {
  7  |   await context.grantPermissions(['camera']);
  8  | 
  9  |   // Navigate with e2e mode for fast completion
  10 |   await page.goto('http://localhost:4173/StarringYou/?e2e=1', { waitUntil: 'networkidle' });
  11 | 
  12 |   // Wait for enrollment to auto-complete in e2e mode
> 13 |   await page.waitForSelector('button:has-text("Download My Face Data")', { timeout: 15000 });
     |              ^ TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
  14 | 
  15 |   console.log('✓ Enrollment completed');
  16 | 
  17 |   // Navigate to Try Swap
  18 |   await page.click('button:text("Try Face Swap")');
  19 |   await page.waitForSelector('.sample-grid', { timeout: 5000 });
  20 | 
  21 |   // Check enrollment status shows success
  22 |   const statusText = await page.locator('#enrollment-status').textContent();
  23 |   expect(statusText).toContain('✅');
  24 |   expect(statusText).toContain('Enrolled');
  25 | 
  26 |   console.log('✓ Status shows enrolled:', statusText);
  27 | 
  28 |   // Click a sample image
  29 |   await page.click('.sample-image-card:first-child');
  30 | 
  31 |   // Should NOT show alert
  32 |   page.on('dialog', async dialog => {
  33 |     throw new Error(`Unexpected alert: ${dialog.message()}`);
  34 |   });
  35 | 
  36 |   // Wait for swap to complete
  37 |   await page.waitForSelector('#swapped-result-img[src]', { timeout: 10000 });
  38 | 
  39 |   const swappedSrc = await page.locator('#swapped-result-img').getAttribute('src');
  40 |   expect(swappedSrc).toBeTruthy();
  41 |   expect(swappedSrc).not.toBe('');
  42 | 
  43 |   console.log('✓ Face swap completed successfully');
  44 | });
  45 | 
```