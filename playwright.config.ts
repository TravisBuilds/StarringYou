import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173/StarringYou',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        ...(process.env.FAKE_VIDEO_PATH ? [`--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO_PATH}`] : []),
        '--disable-blink-features=AutomationControlled',
      ],
      headless: false, // Run headed for fake video to work
    },
    permissions: ['camera', 'microphone'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
