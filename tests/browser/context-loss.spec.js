const { test, expect } = require('@playwright/test');

// Losing and restoring the WebGL context must not leave the world blank.
//
// It did. The GPU timer holds an extension object and a queue of query objects
// across frames; after a loss those belong to a context that no longer exists,
// and nothing dropped them. Every subsequent frame asked the new context about
// the old ones, which is an INVALID_ENUM and an INVALID_OPERATION per frame,
// forever — and that error flood is itself enough to lose the context again.
// The world rendered white while the 2D UI overlay, on its own canvas, was fine.
//
// BREAK_PROBE=context skips the restore handling to prove this probe fails.
const mutation = process.env.BREAK_PROBE || '';

test('the world survives a WebGL context loss', async ({ page }) => {
  const glErrors = [];
  page.on('console', m => {
    if (/INVALID_ENUM|INVALID_OPERATION|does not belong to this context/.test(m.text())) glErrors.push(m.text());
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready, null, { timeout: 30000 });
  await page.evaluate(() => { localStorage.clear(); Game.newGame('CtxHero', 'warbringer', false); });
  await page.waitForFunction(() => G.state === 'game' && Hero3.rig);
  await page.waitForFunction(() => R3.stats().calls > 0, null, { timeout: 15000 });

  if (mutation === 'context') {
    await page.evaluate(() => { R3._bindContextEvents = () => {}; R3._lost = () => false; });
  }

  await page.evaluate(() => {
    window.__ext = R3.renderer.getContext().getExtension('WEBGL_lose_context');
    window.__ext.loseContext();
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => window.__ext.restoreContext());
  // The renderer must draw again on its own, without a reload.
  await page.waitForFunction(() => R3.stats().calls > 0 && !R3._contextLost, null, { timeout: 15000 });

  const after = await page.evaluate(() => R3.stats());
  expect(after.calls, 'renderer drew nothing after restore — the world is blank').toBeGreaterThan(0);
  expect(after.gpu.contextLosses).toBe(1);
  // The timer must not be querying handles from the dead context.
  expect(glErrors.join('\n'), 'stale-context GL errors after restore').toBe('');
});
