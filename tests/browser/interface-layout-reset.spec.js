const { test, expect } = require('@playwright/test');

async function openInterface(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && Object.keys(WUI.frames).length);
  await page.evaluate(() => {
    Game.newGame('LayoutResetHero', 'warbringer', false);
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('INTERFACE');
    UI.open('settings');
  });
}

test('layout reset waits for confirmation and applies without reloading', async ({ page }) => {
  await openInterface(page);
  const reset = page.getByRole('button', { name: 'Reset layout' });
  const before = await page.evaluate(() => {
    WUI.placeFrame('player', 300, 240);
    WUI.layout.player = { x: 300, y: 240 };
    WUI._save(WUI.LAYK, WUI.layout);
    window.layoutResetPageMarker = true;
    const player = document.getElementById('wui-player').getBoundingClientRect();
    return {
      position: { x: player.x, y: player.y },
      stored: localStorage.getItem(WUI.LAYK),
    };
  });

  await reset.click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => {
    const player = document.getElementById('wui-player').getBoundingClientRect();
    return {
      position: { x: player.x, y: player.y },
      stored: localStorage.getItem(WUI.LAYK),
    };
  })).toEqual(before);

  await reset.click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  expect(await page.evaluate(() => {
    const player = document.getElementById('wui-player').getBoundingClientRect();
    const inViewport = Object.values(WUI.frames).every(({ el }) => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    });
    return {
      marker: window.layoutResetPageMarker,
      player: { x: player.x, y: player.y },
      layout: WUI.layout,
      stored: JSON.parse(localStorage.getItem(WUI.LAYK)),
      inViewport,
    };
  })).toEqual({ marker: true, player: { x: 14, y: 14 }, layout: {}, stored: {}, inViewport: true });
});
