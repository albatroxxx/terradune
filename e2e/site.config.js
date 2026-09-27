import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './site-tests',
  outputDir: 'site-results',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { outputFolder: 'site-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:18394',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 18394 --bind 127.0.0.1 --directory ../site',
    url: 'http://127.0.0.1:18394',
    reuseExistingServer: false,
  },
});
