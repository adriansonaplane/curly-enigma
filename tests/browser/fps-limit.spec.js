const { test, expect } = require('@playwright/test');

test('60 FPS limit gates rendered frames without slowing game time', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && typeof Game !== 'undefined');

  const result = await page.evaluate(async () => {
    WUI.set.fpsLimit = 60;
    WUI.saveSet();
    Game._last = 0;

    let frames = 0;
    let gameSeconds = 0;
    Game.update = dt => { gameSeconds += dt; };
    Render.frame = () => { frames++; };
    G.state = 'game';

    const started = performance.now();
    await new Promise(resolve => setTimeout(resolve, 3000));
    const wallSeconds = (performance.now() - started) / 1000;
    G.state = 'menu';
    return {
      frames,
      gameSeconds,
      wallSeconds,
      saved: JSON.parse(localStorage.getItem(WUI.SETK)).fpsLimit,
    };
  });

  const measuredFps = result.frames / result.wallSeconds;
  // A real browser may miss frames under load, but the limiter must neither
  // substantially undershoot in this quiet probe nor exceed its target.
  expect(measuredFps).toBeGreaterThan(52);
  expect(measuredFps).toBeLessThanOrEqual(62);
  expect(Math.abs(result.gameSeconds - result.wallSeconds)).toBeLessThan(0.12);
  expect(result.saved).toBe(60);
});
