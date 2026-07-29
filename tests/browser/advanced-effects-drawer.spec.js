const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && FX3.ready);
  await page.evaluate(() => {
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('VIDEO');
    WUI.renderSettings();
    document.getElementById('panel-settings').classList.remove('hidden');
  });
});

test('advanced GPU effects are grouped in a drawer with independent resources', async ({ page }) => {
  const drawer = page.locator('.ws-drawer[data-setting="advancedEffects"]');
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toHaveAttribute('open', '');
  for (const key of ['advancedEffects', 'advancedParticles', 'advancedGeometry', 'ambientEffects'])
    await expect(drawer.locator(`.ws-row[data-setting="${key}"]`)).toHaveCount(1);

  await drawer.locator('.ws-row[data-setting="advancedGeometry"] .ws-toggle').click();
  await page.locator('.wui-confirm [data-action="confirm"]').click();
  const state = await page.evaluate(() => ({
    setting: WUI.set.advancedGeometry,
    config: GraphicsConfig.current.advancedGeometry,
    stats: FX3.stats(),
  }));
  expect(state.setting).toBe(false);
  expect(state.config).toBe(false);
  expect(state.stats.advancedGeometry).toBe(false);
  expect(state.stats.advancedParticles).toBe(true);
  expect(state.stats.customParticleShaders).toBe(true);
});
