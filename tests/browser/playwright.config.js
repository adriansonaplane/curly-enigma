const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1100, height: 640 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Some sandboxes provide a Chromium build that does not match the revision
    // this Playwright version would download, and cannot download one. Point
    // PLAYWRIGHT_CHROMIUM_PATH at that binary to use it. Unset — the normal
    // case — Playwright resolves its own browser exactly as before.
    launchOptions: {
      args: ['--use-gl=swiftshader'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
    },
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:4173/index.html',
    timeout: 15_000,
    reuseExistingServer: true,
  },
});
