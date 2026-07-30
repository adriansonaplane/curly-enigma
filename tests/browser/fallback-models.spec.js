const { test, expect } = require('@playwright/test');

test('disabled authored models keep procedural actors and props visible without scene requests', async ({ page }) => {
  const bakedRequests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/models/baked/')) bakedRequests.push(request.url());
  });

  await page.addInitScript(() => {
    localStorage.setItem('diabloid.authoredModels', 'false');
    localStorage.setItem('wui_settings_v1', JSON.stringify({ authoredModels: false }));
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(() => Game.newGame('FallbackModelsHero', 'warbringer', false));
  await page.waitForFunction(() => G.state === 'game' && Actors3.crowd.length && Props3.sets.length && R3.stats().calls > 0);

  const state = await page.evaluate(() => ({
    authoredModels: R3.authoredModels,
    actors: Actors3.stats(),
    proceduralActors: Actors3.crowd.filter(m => m._rig && m._rig.visible && !m._rig.userData.authored).length,
    authoredProps: Props3.sets.filter(set => set.authored).length,
    visiblePropInstances: Props3.batches.filter(mesh => mesh.visible).reduce((count, mesh) => count + mesh.count, 0),
    diagnostics: Render.diagnosticSnapshot(),
  }));

  expect(state.authoredModels).toBe(false);
  expect(state.actors.authoredModels).toBe(false);
  expect(state.actors.authoredActors).toBe(0);
  expect(state.proceduralActors).toBeGreaterThan(0);
  expect(state.authoredProps).toBe(0);
  expect(state.visiblePropInstances).toBeGreaterThan(0);
  expect(state.diagnostics.authoredModels).toBe(false);
  expect(state.diagnostics.props.authoredModels).toBe(false);
  expect(state.diagnostics.props.diagnostics.every(d => d.authoredModels === false)).toBe(true);
  expect(bakedRequests).toEqual([]);
});
