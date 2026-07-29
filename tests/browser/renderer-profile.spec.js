const { test, expect } = require('@playwright/test');

test('context loss selects the conservative renderer profile on reload', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);

  // Dispatching the browser event exercises the persistence path without
  // depending on WEBGL_lose_context restoration behavior in the test driver.
  await page.evaluate(() => R3.canvas.dispatchEvent(new Event('webglcontextlost')));
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem(R3.PROFILE_SESSION_KEY))).toBe('conservative');

  await page.reload();
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(() => {
    localStorage.clear();
    Game.newGame('SafeProfileHero', 'warbringer', false);
    Render.qualityMode = 'ultra';
    Render.renderScale = 1;
    Render.fx.shadows = true;
    Render.fx.grade = true;
  });
  await page.waitForFunction(() => G.state === 'game' && World3.hero && R3.stats().calls > 0);

  const state = await page.evaluate(() => ({
    profile: R3.profileName,
    antialias: R3.renderer.getContext().getContextAttributes().antialias,
    maxLights: R3.maxLights,
    renderScale: R3.renderScale,
    effectiveDpr: R3.effectivePixelRatio,
    gradeTarget: !!R3._target,
    grade: R3.stats().grade,
    shadows: R3.stats().shadows,
    heroShadow: World3.hero.castShadow,
    visiblePointLights: World3.lights.filter(e => e.light.visible).length
      + (World3.hero.visible ? 1 : 0),
  }));

  expect(state.profile).toBe('conservative');
  expect(state.antialias).toBe(false);
  expect(state.maxLights).toBe(6);
  expect(state.renderScale).toBeLessThanOrEqual(0.75);
  expect(state.effectiveDpr).toBeLessThanOrEqual(0.75);
  expect(state.gradeTarget).toBe(false);
  expect(state.grade).toBe(false);
  expect(state.shadows).toBe(false);
  expect(state.heroShadow).toBe(false);
  expect(state.visiblePointLights).toBeLessThanOrEqual(state.maxLights);
});
