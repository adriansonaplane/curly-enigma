const { test, expect } = require('@playwright/test');

async function openVideo(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && R3.ready);
  await page.evaluate(() => {
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('VIDEO');
    WUI.renderSettings();
    document.getElementById('panel-settings').classList.remove('hidden');
  });
}

test('disruptive render-scale changes wait for confirmation and roll back on cancel', async ({ page }) => {
  await openVideo(page);
  await page.evaluate(() => {
    window.calls = { saveSet: 0, graphics: 0, scale: 0, build: 0, init: 0 };
    for (const [owner, name, key] of [[WUI, 'saveSet', 'saveSet'], [GraphicsConfig, 'save', 'graphics'],
      [R3, 'setRenderScale', 'scale'], [Props3, 'build', 'build'], [FX3, 'init', 'init']]) {
      const original = owner[name]; owner[name] = function (...args) { calls[key]++; return original.apply(this, args); };
    }
  });
  const scale = page.locator('#panel-settings .ws-row').filter({ hasText: '3D render scale' }).locator('select');
  await scale.selectOption('0.75');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await page.evaluate(() => ({ value: WUI.set.renderScale, calls }))).toEqual({
    value: 1, calls: { saveSet: 0, graphics: 0, scale: 0, build: 0, init: 0 },
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(scale).toHaveValue('1');
  await expect(scale).toBeFocused();
  expect(await page.evaluate(() => ({ value: WUI.set.renderScale, calls }))).toEqual({
    value: 1, calls: { saveSet: 0, graphics: 0, scale: 0, build: 0, init: 0 },
  });
});

test('confirmed repeated changes persist across reload without unrelated rebuilds', async ({ page }) => {
  await openVideo(page);
  await page.evaluate(() => {
    window.calls = { scale: 0, build: 0, init: 0 };
    for (const [owner, name, key] of [[R3, 'setRenderScale', 'scale'], [Props3, 'build', 'build'], [FX3, 'init', 'init']]) {
      const original = owner[name]; owner[name] = function (...args) { calls[key]++; return original.apply(this, args); };
    }
  });
  const scale = page.locator('#panel-settings .ws-row').filter({ hasText: '3D render scale' }).locator('select');
  for (const value of ['0.85', '0.6']) {
    await scale.selectOption(value);
    expect(await page.evaluate(() => ({ setting: WUI.set.renderScale, calls }))).toEqual({
      setting: value === '0.85' ? 1 : 0.85,
      calls: { scale: value === '0.85' ? 0 : 1, build: 0, init: 0 },
    });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => page.evaluate(() => WUI.set.renderScale)).toBe(Number(value));
  }
  expect(await page.evaluate(() => calls)).toEqual({ scale: 2, build: 0, init: 0 });
  await page.reload();
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set);
  expect(await page.evaluate(() => ({ wui: WUI.set.renderScale, boot: GraphicsConfig.current.renderScale,
    renderer: R3.renderScale }))).toEqual({ wui: 0.6, boot: 0.6, renderer: 0.6 });
});

test('model and advanced-effects controls do not reconstruct resources before confirmation', async ({ page }) => {
  await openVideo(page);
  for (const setting of ['authoredModels', 'advancedEffects']) {
    await page.evaluate(() => {
      window.calls = { build: 0, init: 0 };
      const build = Props3.build, init = FX3.init;
      Props3.build = function (...args) { calls.build++; return build.apply(this, args); };
      FX3.init = function (...args) { calls.init++; return init.apply(this, args); };
    });
    await page.locator(`[data-setting="${setting}"] .ws-toggle`).click();
    expect(await page.evaluate(() => calls)).toEqual({ build: 0, init: 0 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator(`[data-setting="${setting}"] .ws-toggle`)).toHaveAttribute('aria-checked', 'true');
  }
});
