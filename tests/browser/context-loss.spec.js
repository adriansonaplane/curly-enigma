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

test('context losses restore at progressively degraded workloads', async ({ page }) => {
  const glErrors = [];
  page.on('console', m => {
    if (/INVALID_ENUM|INVALID_OPERATION|does not belong to this context/.test(m.text())) glErrors.push(m.text());
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready, null, { timeout: 30000 });
  await page.evaluate(() => { localStorage.clear(); Game.newGame('CtxHero', 'warbringer', false); });
  await page.waitForFunction(() => G.state === 'game' && Hero3.rig);
  await page.waitForFunction(() => R3.stats().calls > 0, null, { timeout: 15000 });

  await page.evaluate(() => {
    Render.qualityMode = 'ultra';
    Render.renderScale = 1;
    Render.fx.shadows = true;
    Render.fx.grade = true;
  });
  await page.waitForFunction(() => R3.stats().grade && R3.stats().shadows && R3.stats().lightBudget > 6);
  const initial = await page.evaluate(() => R3.stats());

  if (mutation === 'context') {
    await page.evaluate(() => { R3._bindContextEvents = () => {}; R3._lost = () => false; });
  }

  const loseAndRestore = async expectedLosses => {
    await page.evaluate(() => {
      window.__ext = R3.renderer.getContext().getExtension('WEBGL_lose_context');
      window.__ext.loseContext();
    });
    await page.waitForFunction(losses => R3._contextLost && R3._contextLosses === losses, expectedLosses);
    await page.evaluate(() => window.__ext.restoreContext());
    // The renderer must draw again on its own, without a reload.
    await page.waitForFunction(losses => R3.stats().calls > 0 && !R3._contextLost
      && R3.stats().gpu.contextLosses === losses, expectedLosses, { timeout: 15000 });
    return page.evaluate(() => R3.stats());
  };

  const first = await loseAndRestore(1);
  expect(first.renderScale).toBeLessThan(initial.renderScale);
  expect(first.framebuffer.width * first.framebuffer.height)
    .toBeLessThan(initial.framebuffer.width * initial.framebuffer.height);
  expect(first.lightBudget).toBeLessThan(initial.lightBudget);
  expect(first.grade).toBe(true);
  expect(first.shadows).toBe(true);

  const second = await loseAndRestore(2);
  expect(second.renderScale).toBe(first.renderScale);
  expect(second.lightBudget).toBe(first.lightBudget);
  expect(second.grade).toBe(false);
  expect(second.shadows).toBe(false);
  expect(second.calls).toBeLessThan(first.calls);

  // Several governor-driven frames must not undo the context-loss safety caps.
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => R3.stats());
  expect(after.calls, 'renderer drew nothing after restore — the world is blank').toBeGreaterThan(0);
  expect(after.gpu.contextLosses).toBe(2);
  expect(after.renderScale).toBe(second.renderScale);
  expect(after.lightBudget).toBe(second.lightBudget);
  expect(after.grade).toBe(false);
  expect(after.shadows).toBe(false);
  // The timer must not be querying handles from the dead context.
  expect(glErrors.join('\n'), 'stale-context GL errors after restore').toBe('');
});
