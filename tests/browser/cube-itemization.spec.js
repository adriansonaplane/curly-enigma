const { test, expect } = require('@playwright/test');

async function game(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(() => { localStorage.clear(); Game.newGame('Cube UI', 'warbringer', false); });
  await page.waitForFunction(() => G.state === 'game');
}

test('components socket through explicit UI and Cube transacts exact selected inputs', async ({ page }) => {
  await game(page);
  const ids = await page.evaluate(() => {
    const pl = G.player, base = Items.makeBaseItem(() => .5, Items.baseById('sword'), 0, 20, { skipQuality: true });
    base.id = 'socket-base'; base.sockets = 1; base.gems = [null]; base.stats = {};
    const gem = Items.makeGem('ruby', 'chipped'); gem.id = 'socket-gem';
    const gems = [Items.makeGem('ruby', 'chipped'), Items.makeGem('ruby', 'chipped'), Items.makeGem('ruby', 'chipped')];
    gems.forEach((g, i) => g.id = `cube-gem-${i}`); pl.equip.weapon = base; pl.inv = [gem, ...gems]; pl._invMigrated = false;
    Ent.computeDerived(pl); UI.open('inv'); return { base: base.id, gem: gem.id, cube: gems.map(g => g.id) };
  });
  const component = page.getByTestId(`inventory-item-${ids.gem}`);
  await expect(component).toHaveAttribute('role', 'button');
  await component.focus(); await component.press('Enter');
  expect(await page.evaluate(() => ({ weapon: G.player.equip.weapon.id, gem: G.player.inv.some(i => i.id === 'socket-gem'), selected: UI.socketSelection })))
    .toEqual({ weapon: ids.base, gem: true, selected: ids.gem });
  const target = page.getByTestId('socket-target-equip-weapon');
  await expect(target).toHaveClass(/socket-target/);
  await expect(target).toHaveAttribute('role', 'button');
  await target.focus(); await target.press('Enter');
  const socketed = await page.evaluate(() => {
    Ent.computeDerived(G.player); const first = G.player.derived.flatElem.fire; Ent.computeDerived(G.player);
    return { gem: G.player.inv.some(i => i.id === 'socket-gem'), stat: Items.socketStats(G.player.equip.weapon).fireDmg,
      first, second: G.player.derived.flatElem.fire, target: G.player.equip.weapon.id };
  });
  expect(socketed.gem).toBe(false);
  expect(socketed.target).toBe(ids.base);
  expect(socketed.stat).toBeGreaterThan(0);
  expect(socketed.first).toBe(socketed.stat);
  expect(socketed.second).toBe(socketed.stat);
  await page.getByTestId('open-cube').click();
  for (const id of ids.cube) await expect(page.getByTestId(`cube-input-${id}`).locator('canvas')).toHaveCount(1);
  const recipes = page.getByTestId('cube-recipes');
  await expect(recipes).toContainText('Known recipes (7)');
  await expect(recipes).toContainText('preserve the base item');
  await recipes.locator('summary').click();
  await expect(recipes).not.toHaveAttribute('open', '');
  for (const id of ids.cube) {
    await page.getByTestId(`cube-input-${id}`).click();
    await expect(page.getByTestId(`cube-input-${id}`)).toBeFocused();
    await expect(recipes).not.toHaveAttribute('open', '');
  }
  await expect(page.getByTestId('cube-preview')).toContainText('Upgrade Gem');
  await page.getByTestId('cube-transmute').click();
  expect(await page.evaluate(() => {
    const upgraded = G.player.inv.find(i => i.kind === 'gem' && i.quality === 'flawed');
    return { consumed: G.player.inv.filter(i => /^cube-gem-/.test(i.id)).length, upgraded: !!upgraded,
      productionReady: !!(upgraded && upgraded.component && upgraded.description && upgraded.price > 0) };
  })).toEqual({ consumed: 0, upgraded: true, productionReady: true });
});

test('Cube preserves native keyboard traversal instead of firing world targeting', async ({ page }) => {
  await game(page);
  await page.evaluate(() => {
    const gems = [Items.makeGem('sapphire', 'chipped'), Items.makeGem('sapphire', 'chipped'), Items.makeGem('sapphire', 'chipped')];
    gems.forEach((gem, index) => { gem.id = `key-gem-${index}`; });
    G.player.inv = gems; G.player._invMigrated = false;
    window.__cubeTargetTabs = 0;
    Target.tabNext = () => { window.__cubeTargetTabs++; };
    UI.open('cube');
  });
  const first = page.getByTestId('cube-input-key-gem-0');
  const second = page.getByTestId('cube-input-key-gem-1');
  await first.focus();
  await first.press('Tab');
  await expect(second).toBeFocused();
  expect(await page.evaluate(() => window.__cubeTargetTabs)).toBe(0);
  await second.press('Enter');
  await expect(page.getByTestId('cube-input-key-gem-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cube-input-key-gem-1')).toBeFocused();
});

test('Cube invalid previews and failed transactions leave inventory intact', async ({ page }) => {
  await game(page);
  const before = await page.evaluate(() => { const g = Items.makeGem('ruby', 'chipped'); g.id = 'only-gem'; G.player.inv = [g]; G.player._invMigrated = false; UI.open('cube'); return JSON.stringify(G.player.inv); });
  await page.getByTestId('cube-input-only-gem').click();
  await expect(page.getByTestId('cube-preview')).toContainText(/No declared|Select/);
  await expect(page.getByTestId('cube-transmute')).toBeDisabled();
  expect(await page.evaluate(() => {
    const result = Cube.transmute(G.player, ['only-gem'], U.rand);
    return { result: result.ok, inventory: JSON.stringify(G.player.inv) };
  })).toEqual({ result: false, inventory: before });
});

test('gem and rune icons have distinct cached visual semantics', async ({ page }) => {
  await game(page);
  const icons = await page.evaluate(() => {
    const gem = Sprites.itemIcon(Items.makeGem('ruby', 'chipped'), 44);
    const rune = Sprites.itemIcon(Items.makeRune('El'), 44);
    const highRune = Sprites.itemIcon(Items.makeRune('Zod'), 44);
    const perfectGem = Sprites.itemIcon(Items.makeGem('ruby', 'perfect'), 44);
    return { same: gem === rune, gem: gem.toDataURL(), rune: rune.toDataURL(), highRune: highRune.toDataURL(), perfectGem: perfectGem.toDataURL() };
  });
  expect(icons.same).toBe(false);
  expect(icons.gem).not.toBe(icons.rune);
  expect(icons.rune).not.toBe(icons.highRune);
  expect(icons.gem).not.toBe(icons.perfectGem);
});

test('mobile inventory grid stays inside the panel without transform clipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await game(page);
  const bounds = await page.evaluate(() => {
    const gem = Items.makeGem('sapphire', 'flawed'); gem.id = 'mobile-gem'; G.player.inv = [gem];
    UI.open('inv');
    const panel = document.getElementById('panel-inv').getBoundingClientRect();
    const grid = document.querySelector('#panel-inv .inv-grid-var').getBoundingClientRect();
    return { panel: { left: panel.left, right: panel.right }, grid: { left: grid.left, right: grid.right }, transform: getComputedStyle(document.querySelector('#panel-inv .inv-grid-var')).transform };
  });
  expect(bounds.grid.left).toBeGreaterThanOrEqual(bounds.panel.left);
  expect(bounds.grid.right).toBeLessThanOrEqual(bounds.panel.right);
  expect(bounds.transform).toBe('none');
});
