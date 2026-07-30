const { test, expect } = require('@playwright/test');

async function openVideo(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && typeof Render !== 'undefined');
  await page.evaluate(() => {
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('VIDEO');
    document.getElementById('menu-screen').classList.add('hidden');
    UI.open('settings');
  });
}

test('every visible video toggle changes its declared renderer state', async ({ page }) => {
  await openVideo(page);

  const contracts = await page.evaluate(() => WUI.VIDEO_TOGGLES.map(({ key, state }) => ({ key, state })));
  const renderedKeys = await page.locator('#panel-settings .ws-row[data-setting]')
    .evaluateAll(rows => rows.map(row => row.dataset.setting));
  for (const { key } of contracts)
    expect(renderedKeys.filter(rendered => rendered === key), `${key} has one live renderer control`).toHaveLength(1);

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

test('fog defaults off, toggles on, and persists without changing shafts', async ({ page }) => {
  await openVideo(page);

  const defaults = await page.evaluate(() => ({
    graphics: GraphicsConfig.DEFAULTS.fog,
    wui: WUI.DEF_SET.fog,
    setting: WUI.set.fog,
    renderer: Render.fx.fog,
    shaftsSetting: WUI.set.shafts,
    shaftsConfig: GraphicsConfig.current.shafts,
  }));
  expect(defaults).toEqual({
    graphics: false,
    wui: false,
    setting: false,
    renderer: false,
    shaftsSetting: true,
    shaftsConfig: true,
  });

  await page.locator('#panel-settings .ws-row[data-setting="fog"] .ws-toggle').click();

  const toggled = await page.evaluate(() => {
    const wuiSaved = JSON.parse(localStorage.getItem(WUI.SETK));
    const graphicsSaved = JSON.parse(localStorage.getItem(GraphicsConfig.STORAGE_KEY)).config;
    return {
      setting: WUI.set.fog,
      renderer: Render.fx.fog,
      graphics: GraphicsConfig.current.fog,
      wuiSaved: wuiSaved.fog,
      graphicsSaved: graphicsSaved.fog,
      shaftsSetting: WUI.set.shafts,
      shaftsConfig: GraphicsConfig.current.shafts,
    };
  });
  expect(toggled).toEqual({
    setting: true,
    renderer: true,
    graphics: true,
    wuiSaved: true,
    graphicsSaved: true,
    shaftsSetting: true,
    shaftsConfig: true,
  });

  await page.reload();
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && typeof Render !== 'undefined');
  const reloaded = await page.evaluate(() => ({
    setting: WUI.set.fog,
    renderer: Render.fx.fog,
    graphics: GraphicsConfig.current.fog,
    shaftsSetting: WUI.set.shafts,
    shaftsRenderer: Render.fx.shafts,
    shaftsConfig: GraphicsConfig.current.shafts,
  }));
  expect(reloaded).toEqual({
    setting: true,
    renderer: true,
    graphics: true,
    shaftsSetting: true,
    shaftsRenderer: true,
    shaftsConfig: true,
  });
});
