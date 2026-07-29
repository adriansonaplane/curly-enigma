const { test, expect } = require('@playwright/test');

test('renderer retries safely on a fresh game canvas', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__animationFrameRequests = 0;
    window.requestAnimationFrame = () => ++window.__animationFrameRequests;
  });
  await page.route('**/vendor/three.min.js', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: `${body}\nwindow.__RealRenderer = THREE.WebGLRenderer; window.__rendererAttempts = []; THREE.WebGLRenderer = function (options) { window.__rendererAttempts.push({ canvas: options.canvas.id, antialias: options.antialias, powerPreference: options.powerPreference || 'default' }); if (window.__rendererAttempts.length === 1) throw new Error('stubbed WebGL failure'); return new window.__RealRenderer(options); }; THREE.WebGLRenderer.prototype = window.__RealRenderer.prototype;` });
  });

  await page.goto('/index.html');

  await expect(page.locator('#renderer-init-error')).toHaveCount(0);
  const state = await page.evaluate(() => ({
    attempts: window.__rendererAttempts,
    status: R3.initializationStatus,
    rendererCanvas: R3.renderer.domElement.id,
    renderCanvas: Render.gl.id,
    gameIsRenderer: document.querySelector('canvas#game') === R3.renderer.domElement,
    overlayIsRenderer: document.querySelector('canvas#overlay') === R3.renderer.domElement,
  }));
  expect(state.attempts).toEqual([
    { canvas: 'game', antialias: true, powerPreference: 'high-performance' },
    { canvas: 'game', antialias: false, powerPreference: 'default' },
  ]);
  expect(state.status).toMatchObject({ requestedProfile: 'default', antialias: false, powerPreference: 'default' });
  expect(state.rendererCanvas).toBe('game');
  expect(state.renderCanvas).toBe('game');
  expect(state.gameIsRenderer).toBe(true);
  expect(state.overlayIsRenderer).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('failure recovery displays all initialization diagnostics', async ({ page }) => {
  await page.route('**/vendor/three.min.js', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: `${body}\nTHREE.WebGLRenderer = function () { throw new Error('stubbed WebGL failure'); };` });
  });
  await page.goto('/index.html');
  await expect(page.locator('#renderer-init-error')).toBeVisible();
  await expect(page.locator('#renderer-init-diagnostic')).toContainText('requestedProfile');
  await expect(page.locator('#renderer-init-diagnostic')).toContainText('high-performance');
  await expect(page.locator('#renderer-init-diagnostic')).toContainText('low-power');
});
