const { test, expect } = require('@playwright/test');

test('60 FPS limit gates rendered frames without slowing game time', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && typeof Game !== 'undefined');

  const result = await page.evaluate(() => {
    WUI.set.fpsLimit = 60;
    WUI.saveSet();

    let frames = 0;
    let gameSeconds = 0;
    Game.update = dt => { gameSeconds += dt; };
    Render.frame = () => { frames++; };
    G.state = 'game';

    // Drive the gate with deterministic 120 Hz RAF timestamps. Headless
    // browsers can deliver only ~48 callbacks per second while the full suite
    // is busy, which cannot distinguish a broken 60 FPS cap from host load.
    const durationMs = 3000;
    const sourceFps = 120;
    const startedAt = 1000;
    Game._last = startedAt;
    const realRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    for (let i = 0; i <= durationMs / (1000 / sourceFps); i++)
      Game.loop(startedAt + i * (1000 / sourceFps));
    window.requestAnimationFrame = realRaf;

    G.state = 'menu';
    return {
      frames,
      gameSeconds,
      durationSeconds: durationMs / 1000,
      saved: JSON.parse(localStorage.getItem(WUI.SETK)).fpsLimit,
    };
  });

  expect(result.frames / result.durationSeconds).toBe(60);
  expect(result.gameSeconds).toBeCloseTo(result.durationSeconds, 8);
  expect(result.saved).toBe(60);
});
