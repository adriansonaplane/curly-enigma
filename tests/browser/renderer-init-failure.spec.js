const { test, expect } = require('@playwright/test');

test('a WebGL renderer constructor failure stops boot cleanly', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__animationFrameRequests = 0;
    window.requestAnimationFrame = () => ++window.__animationFrameRequests;
  });
  await page.route('**/vendor/three.min.js', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: `${body}\nTHREE.WebGLRenderer = function () { throw new Error('stubbed WebGL failure'); };` });
  });

  await page.goto('/index.html');

  await expect(page.locator('#renderer-init-error')).toBeVisible();
  await expect(page.locator('#renderer-init-error')).toContainText('Reload the page');
  await expect(page.locator('#renderer-init-error')).toContainText('Safe graphics mode');
  expect(await page.evaluate(() => R3.initializationStatus)).toEqual({
    ok: false, status: 'initialization-error',
    code: 'webgl-renderer-construction-failed', phase: 'renderer',
  });
  expect(await page.evaluate(() => ({ renderer: R3.renderer, ready: R3.ready }))).toEqual({ renderer: null, ready: false });
  expect(await page.evaluate(() => window.__animationFrameRequests)).toBe(0);
  expect(pageErrors).toEqual([]);
});
