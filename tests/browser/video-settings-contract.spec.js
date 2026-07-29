const { test, expect } = require('@playwright/test');

test('every visible video toggle changes its declared renderer state', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && typeof Render !== 'undefined');

  await page.evaluate(() => {
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('VIDEO');
    WUI.renderSettings();
    document.getElementById('panel-settings').classList.remove('hidden');
  });

  const contracts = await page.evaluate(() => WUI.VIDEO_TOGGLES.map(({ key, state }) => ({ key, state })));
  const visible = await page.locator('#panel-settings .ws-row[data-setting] .ws-toggle').count();
  expect(visible).toBe(contracts.length);

  for (const contract of contracts) {
    const before = await page.evaluate(({ key, state }) => ({
      setting: WUI.set[key],
      renderer: state.split('.').reduce((value, part) => value[part], Render),
    }), contract);

    await page.locator(`#panel-settings .ws-row[data-setting="${contract.key}"] .ws-toggle`).click();

    const after = await page.evaluate(({ key, state }) => ({
      setting: WUI.set[key],
      renderer: state.split('.').reduce((value, part) => value[part], Render),
      persisted: JSON.parse(localStorage.getItem(WUI.SETK))[key],
    }), contract);
    expect(after.setting).toBe(!before.setting);
    expect(after.renderer).toBe(!before.renderer);
    expect(after.persisted).toBe(after.setting);
  }
});

test('retired AO and reflection settings are neither visible nor forwarded', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wui_settings_v1', JSON.stringify({
    ao: false, reflections: false,
  })));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && typeof Render !== 'undefined');

  const state = await page.evaluate(() => ({
    defaults: { ao: 'ao' in WUI.DEF_SET, reflections: 'reflections' in WUI.DEF_SET },
    settings: { ao: 'ao' in WUI.set, reflections: 'reflections' in WUI.set },
    persisted: (() => {
      const saved = JSON.parse(localStorage.getItem(WUI.SETK));
      return { ao: 'ao' in saved, reflections: 'reflections' in saved };
    })(),
    forwarded: { ao: 'ao' in Render.fx, reflections: 'reflections' in Render.fx },
    controls: WUI.VIDEO_TOGGLES.map(toggle => toggle.key),
  }));
  expect(state).toEqual({
    defaults: { ao: false, reflections: false },
    settings: { ao: false, reflections: false },
    persisted: { ao: false, reflections: false },
    forwarded: { ao: false, reflections: false },
    controls: ['fog', 'shafts', 'grade', 'fps'],
  });
});
