const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set
    && typeof Render !== 'undefined' && Object.keys(WUI.frames).length);
});

test('action bar 2 stays hidden by default and displays when enabled, including edit mode', async ({ page }) => {
  const bar = page.locator('#wui-actionbar2');

  await expect(bar).toHaveClass(/wui-hidden/);
  await expect(bar).toHaveCSS('display', 'none');

  await page.evaluate(() => {
    WUI.set.fBar2 = true;
    WUI.applySettings();
  });
  await expect(bar).not.toHaveClass(/wui-hidden/);
  await expect(bar).toHaveCSS('display', 'flex');

  await page.evaluate(() => WUI.setEditMode(true));
  await expect(page.locator('body')).toHaveClass(/wui-edit/);
  await expect(bar).toHaveCSS('display', 'flex');

  await page.evaluate(() => {
    WUI.set.fBar2 = false;
    WUI.applySettings();
  });
  await expect(bar).toHaveClass(/wui-hidden/);
  await expect(bar).toHaveCSS('display', 'none');
});

test('nameplate setting suppresses ordinary enemy names but retains elite and boss names', async ({ page }) => {
  const result = await page.evaluate(() => {
    const previous = {
      player: G.player,
      monsters: G.monsters,
      npcs: G.npcs,
      worldToScreen: R3.worldToScreen,
      width: Render.W,
      height: Render.H,
    };
    const ctx = {
      names: [],
      save() {},
      restore() {},
      fillRect() {},
      fillText(text) { this.names.push(text); },
    };
    const capture = enabled => {
      WUI.set.nameplates = enabled;
      WUI.applySettings();
      ctx.names = [];
      Render.drawPlates(ctx, 0);
      return { forwarded: Render.fx.nameplates, names: ctx.names.slice() };
    };

    try {
      G.player = { x: 0, y: 0 };
      G.monsters = [
        { name: 'Ordinary', x: 1, y: 0, hp: 10, maxHp: 10, dead: false, ally: false },
        { name: 'Elite', x: 2, y: 0, hp: 10, maxHp: 10, dead: false, ally: false, rank: 'elite' },
        { name: 'Boss', x: 3, y: 0, hp: 10, maxHp: 10, dead: false, ally: false, boss: true },
      ];
      G.npcs = [];
      Render.W = 1000;
      Render.H = 800;
      R3.worldToScreen = (x, y) => [100 + x * 20, 100 + y * 20, 0.5];
      return { disabled: capture(false), enabled: capture(true) };
    } finally {
      G.player = previous.player;
      G.monsters = previous.monsters;
      G.npcs = previous.npcs;
      R3.worldToScreen = previous.worldToScreen;
      Render.W = previous.width;
      Render.H = previous.height;
    }
  });

  expect(result.disabled).toEqual({ forwarded: false, names: ['Elite', 'Boss'] });
  expect(result.enabled).toEqual({ forwarded: true, names: ['Ordinary', 'Elite', 'Boss'] });
});
