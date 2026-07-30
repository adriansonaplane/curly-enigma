const { test, expect } = require('@playwright/test');

async function game(page, name = 'Charm Runner') {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(name => {
    localStorage.clear();
    Game.newGame(name, 'warbringer', false);

    // Canonical, deterministic fixture creation stays in the browser so every
    // assertion exercises the production charm generator and schema.
    window.__charmFixture = (id, form = 'small', options = {}) => {
      const sequence = (options.sequence || [0.9, 0.75, 0, 0, 0, 0, 0]).slice();
      let cursor = 0;
      const item = InventoryCharms.generate({
        id,
        ilvl: options.ilvl || 1,
        form,
      }, () => {
        if (cursor >= sequence.length) throw new Error(`Charm fixture RNG exhausted for ${id}`);
        return sequence[cursor++];
      });
      item.identified = options.identified !== false;
      if (options.x !== undefined) item._gx = options.x;
      if (options.y !== undefined) item._gy = options.y;
      return item;
    };
  }, name);
  await page.waitForFunction(() => G.state === 'game');
}

test('Small, Large, and Grand charms occupy exact footprints and retain power through keyboard, filtering, and refused equip drag', async ({ page }) => {
  await game(page, 'Charm Footprints');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 80;
    const small = __charmFixture('footprint-small', 'small', { x: 0, y: 0 });
    const large = __charmFixture('footprint-large', 'large', { x: 1, y: 0 });
    const grand = __charmFixture('footprint-grand', 'grand', { x: 2, y: 0 });
    pl.inv = [small, large, grand];
    pl._invMigrated = true;
    Ent.refreshDerived(pl, { fill: true });
    const expectedStats = {};
    for (const item of pl.inv) for (const [key, value] of Object.entries(InventoryCharms.statsOf(item)))
      expectedStats[key] = (expectedStats[key] || 0) + value;
    Save.saveChar(pl);
    UI.open('inv');
    return {
      equipWeaponId: pl.equip.weapon && pl.equip.weapon.id,
      expectedStats,
      derived: JSON.stringify(pl.derived),
    };
  });

  const expectedForms = [
    ['footprint-small', 1],
    ['footprint-large', 2],
    ['footprint-grand', 3],
  ];
  for (const [id, height] of expectedForms) {
    const item = page.getByTestId(`inventory-item-${id}`);
    await expect(item).toHaveClass(/item-charm/);
    await expect(item).toHaveClass(/charm-active/);
    await expect(item).toHaveAttribute('aria-label', /Active while carried; drag to rearrange/);
    expect(await item.evaluate(element => ({
      column: element.style.gridColumnEnd,
      row: element.style.gridRowEnd,
    }))).toEqual({ column: 'span 1', row: `span ${height}` });
  }

  const geometry = await page.evaluate(() => {
    const cell = document.querySelector('#panel-inv .inv-bg-cell').getBoundingClientRect();
    return ['footprint-small', 'footprint-large', 'footprint-grand'].map(id => {
      const rect = document.querySelector(`[data-testid="inventory-item-${id}"]`).getBoundingClientRect();
      return { width: rect.width, height: rect.height, cellWidth: cell.width, cellHeight: cell.height };
    });
  });
  geometry.forEach((record, index) => {
    const cells = index + 1;
    expect(Math.abs(record.width - record.cellWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(record.height - (record.cellHeight * cells + 2 * (cells - 1)))).toBeLessThanOrEqual(1);
  });

  const summary = page.getByTestId('charm-summary');
  await expect(summary).toContainText('3 ACTIVE CHARMS');
  expect(await page.evaluate(() => G.player.charmState.stats)).toEqual(setup.expectedStats);

  const grand = page.getByTestId('inventory-item-footprint-grand');
  await grand.focus();
  await expect(grand).toBeFocused();
  await expect(page.locator('#tooltip')).toContainText('Carried Charm — 1×3');
  await expect(page.locator('#tooltip')).toContainText('ACTIVE IN CARRIED INVENTORY');
  await grand.press('Enter');
  await expect(grand).toBeFocused();
  expect(await page.evaluate(() => G.player.equip.weapon && G.player.equip.weapon.id)).toBe(setup.equipWeaponId);

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="inventory-item-footprint-grand"]');
    const target = document.querySelector('#panel-inv .eq-slot[data-slot="weapon"]');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  expect(await page.evaluate(() => ({
    weapon: G.player.equip.weapon && G.player.equip.weapon.id,
    carried: G.player.inv.map(item => item.id).sort(),
  }))).toEqual({
    weapon: setup.equipWeaponId,
    carried: ['footprint-grand', 'footprint-large', 'footprint-small'],
  });

  await page.locator('#panel-inv [data-filter="equipment"]').click();
  for (const [id] of expectedForms) await expect(page.getByTestId(`inventory-item-${id}`)).toHaveClass(/filtered-out/);
  await page.locator('#panel-inv [data-filter="charms"]').click();
  for (const [id] of expectedForms) await expect(page.getByTestId(`inventory-item-${id}`)).not.toHaveClass(/filtered-out/);
  await page.getByRole('textbox', { name: 'Search inventory' }).fill('carried talisman');
  for (const [id] of expectedForms) await expect(page.getByTestId(`inventory-item-${id}`)).not.toHaveClass(/filtered-out/);
  expect(await page.evaluate(() => ({
    derived: JSON.stringify(G.player.derived),
    stats: G.player.charmState.stats,
    active: G.player.charmState.activeIds.slice().sort(),
  }))).toEqual({
    derived: setup.derived,
    stats: setup.expectedStats,
    active: ['footprint-grand', 'footprint-large', 'footprint-small'],
  });
});

test('field concealment survives tooltip and secret-name search until keyboard scroll identification activates in place without healing', async ({ page }) => {
  await game(page, 'Charm Identification');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 30;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const target = __charmFixture('concealed-charm', 'small', { identified: false, x: 1, y: 0 });
    const first = ItemIdentification.createScroll('concealed-scroll-first');
    first._gx = 0; first._gy = 0;
    const second = ItemIdentification.createScroll('concealed-scroll-second');
    second._gx = 0; second._gy = 1;

    G.groundItems = [{ x: pl.x, y: pl.y, item: target }];
    const worldLabel = Game.interactables().find(entry => entry.kind === 'gitem').label;
    const worldTooltip = Items.tooltip(target, pl);
    G.groundItems = [];
    pl.inv = [first, second, target];
    pl._invMigrated = true;
    Ent.refreshDerived(pl, { fill: true });
    const before = { maxHp: pl.derived.maxHp, maxMp: pl.derived.maxMp };
    pl.hp = 19;
    pl.mp = 11;
    // Isolate the transaction from ambient out-of-combat regeneration. The
    // contract under test is that identification itself never fills resources.
    Game.update = () => {};
    UI.open('inv');
    return {
      secret: target.name,
      worldLabel,
      worldTooltip,
      before,
      stats: InventoryCharms.statsOf(target),
    };
  });

  expect(setup.worldLabel).toBe('Unidentified Small Charm');
  expect(setup.worldTooltip).toContain('Unidentified Small Charm');
  expect(setup.worldTooltip).not.toContain(setup.secret);
  expect(setup.worldTooltip).not.toContain('Requires Level');
  expect(setup.worldTooltip).not.toContain('Value:');

  let target = page.getByTestId('inventory-item-concealed-charm');
  await expect(target).toHaveClass(/item-unidentified/);
  await expect(target).toHaveClass(/charm-inactive/);
  await expect(target).toHaveAttribute('aria-label', 'Unidentified Small Charm. Identify before its magic becomes active');
  await target.focus();
  const tooltip = page.locator('#tooltip');
  await expect(tooltip).toContainText('Carried Charm — 1×1');
  await expect(tooltip).toContainText('UNIDENTIFIED');
  await expect(tooltip).not.toContainText(setup.secret);
  await expect(tooltip).not.toContainText('Requires Level');
  await expect(tooltip).not.toContainText('Value:');
  await expect(page.locator('#panel-inv')).not.toContainText(setup.secret);

  await page.getByRole('textbox', { name: 'Search inventory' }).fill(setup.secret);
  await expect(page.getByTestId('inventory-item-concealed-charm')).toHaveClass(/filtered-out/);
  await page.getByRole('textbox', { name: 'Search inventory' }).fill('');
  await expect(page.getByTestId('inventory-item-concealed-charm')).not.toHaveClass(/filtered-out/);

  const scroll = page.getByTestId('inventory-item-concealed-scroll-first');
  await scroll.focus();
  await scroll.press('Enter');
  await expect(page.getByTestId('identify-status')).toContainText('IDENTIFICATION READY');
  target = page.getByTestId('inventory-item-concealed-charm');
  await target.focus();
  await target.press('Enter');

  target = page.getByTestId('inventory-item-concealed-charm');
  await expect(target).toBeFocused();
  await expect(target).not.toHaveClass(/item-unidentified/);
  await expect(target).toHaveClass(/charm-active/);
  await expect(target).toHaveAttribute('aria-label', new RegExp(`^${setup.secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\. Active while carried`));
  await expect(page.getByTestId('charm-summary')).toContainText('1 ACTIVE CHARM');
  await expect(page.getByTestId('inventory-item-concealed-scroll-first')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item-concealed-scroll-second')).toHaveCount(1);

  expect(await page.evaluate(() => {
    const live = G.player.inv.find(item => item.id === 'concealed-charm');
    const saved = Save.loadChar(G.player.name);
    const savedCharm = saved.inv.find(item => item.id === live.id);
    return {
      hp: G.player.hp,
      mp: G.player.mp,
      maxHp: G.player.derived.maxHp,
      maxMp: G.player.derived.maxMp,
      liveIdentified: live.identified,
      savedIdentified: savedCharm.identified,
      liveCount: G.player.inv.filter(item => item.id === live.id).length,
      savedCount: saved.inv.filter(item => item.id === live.id).length,
      scrolls: G.player.inv.filter(ItemIdentification.isScroll).map(item => item.id),
    };
  })).toEqual({
    hp: 19,
    mp: 11,
    maxHp: setup.before.maxHp + setup.stats.hp,
    maxMp: setup.before.maxMp + setup.stats.mp,
    liveIdentified: true,
    savedIdentified: true,
    liveCount: 1,
    savedCount: 1,
    scrolls: ['concealed-scroll-second'],
  });
});

test('level gating, duplicate-object corruption, and save ownership normalization all fail closed', async ({ page }) => {
  await game(page, 'Charm Safety');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 30;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const low = __charmFixture('safety-low', 'small', { x: 0, y: 0 });
    const high = __charmFixture('safety-high', 'grand', {
      ilvl: 54,
      sequence: [0.3, 0, 0.999, 0],
      x: 1,
      y: 0,
    });
    pl.inv = [];
    const baseline = Ent.computeDerived(pl);
    pl.inv = [low, high];
    Ent.refreshDerived(pl, { fill: true });
    UI.open('inv');
    return {
      baseline: { maxHp: baseline.maxHp, maxMp: baseline.maxMp },
      lowStats: InventoryCharms.statsOf(low),
      highStats: InventoryCharms.statsOf(high),
      highReq: high.reqLvl,
    };
  });

  expect(setup.highReq).toBe(42);
  await expect(page.getByTestId('charm-summary')).toContainText('1 ACTIVE CHARM');
  await expect(page.getByTestId('charm-summary')).toContainText('1 inactive');
  await expect(page.getByTestId('inventory-item-safety-low')).toHaveClass(/charm-active/);
  await expect(page.getByTestId('inventory-item-safety-high')).toHaveClass(/charm-inactive/);
  await expect(page.getByTestId('inventory-item-safety-high')).toHaveAttribute('aria-label', /Inactive until level 42/);
  await page.getByTestId('inventory-item-safety-high').focus();
  await expect(page.locator('#tooltip')).toContainText('INACTIVE — REQUIRES LEVEL 42');
  await expect(page.locator('#tooltip')).toContainText('Drag to rearrange · currently inactive');
  expect(await page.evaluate(() => ({
    active: G.player.charmState.activeIds,
    inactive: G.player.charmState.inactive,
    maxHp: G.player.derived.maxHp,
    maxMp: G.player.derived.maxMp,
  }))).toEqual({
    active: ['safety-low'],
    inactive: [{ id: 'safety-high', reason: 'level-required', required: 42 }],
    maxHp: setup.baseline.maxHp + (setup.lowStats.hp || 0),
    maxMp: setup.baseline.maxMp + (setup.lowStats.mp || 0),
  });

  const unlocked = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 42;
    pl.hp = 17;
    pl.mp = 9;
    Ent.refreshDerived(pl);
    UI.renderInv();
    return {
      active: pl.charmState.activeIds.slice().sort(),
      hp: pl.hp,
      mp: pl.mp,
      maxHp: pl.derived.maxHp,
      maxMp: pl.derived.maxMp,
    };
  });
  expect(unlocked.active).toEqual(['safety-high', 'safety-low']);
  expect(unlocked.hp).toBe(17);
  expect(unlocked.mp).toBe(9);
  await expect(page.getByTestId('charm-summary')).toContainText('2 ACTIVE CHARMS');

  const corrupted = await page.evaluate(() => {
    const pl = G.player;
    const low = pl.inv.find(item => item.id === 'safety-low');
    pl.inv = [];
    const baseline = Ent.computeDerived(pl);
    pl.inv = [low, low];
    Ent.refreshDerived(pl);
    const state = pl.charmState;
    G.stash = [low];
    UI.renderInv();
    return {
      ok: state.ok,
      reason: state.reason,
      maxHp: pl.derived.maxHp,
      maxMp: pl.derived.maxMp,
      baseline: { maxHp: baseline.maxHp, maxMp: baseline.maxMp },
    };
  });
  expect(corrupted).toMatchObject({ ok: false, reason: 'duplicate-item-object' });
  expect(corrupted.maxHp).toBe(corrupted.baseline.maxHp);
  expect(corrupted.maxMp).toBe(corrupted.baseline.maxMp);
  await expect(page.getByTestId('charm-summary')).toContainText('CHARMS INACTIVE');
  await expect(page.getByTestId('charm-summary')).toContainText('invalid or overlapping inventory layout');

  const normalized = await page.evaluate(() => {
    Save.saveChar(G.player);
    Save.saveStash();
    Ent.refreshDerived(G.player);
    UI.renderInv();
    const saved = Save.loadChar(G.player.name);
    const savedStash = JSON.parse(localStorage.getItem(Save.STASH) || '[]');
    return {
      liveInv: G.player.inv.filter(item => item.id === 'safety-low').length,
      liveStash: G.stash.filter(item => item.id === 'safety-low').length,
      savedInv: saved.inv.filter(item => item.id === 'safety-low').length,
      savedStash: savedStash.filter(item => item.id === 'safety-low').length,
      active: G.player.charmState.activeIds,
    };
  });
  expect(normalized).toEqual({ liveInv: 1, liveStash: 0, savedInv: 1, savedStash: 0, active: ['safety-low'] });
  await expect(page.getByTestId('charm-summary')).toContainText('1 ACTIVE CHARM');
});

test('corrupt non-array character inventory and shared stash containers migrate safely on full game load', async ({ page }) => {
  await game(page, 'Charm Container Migration');
  const result = await page.evaluate(() => {
    const frozenUnplaced = __charmFixture('frozen-unplaced', 'small');
    Object.freeze(frozenUnplaced);
    const directMigration = UI.inventoryGrid.migrateInv(['malformed-member', frozenUnplaced]);
    const key = G.player.name.toLowerCase();
    const all = JSON.parse(localStorage.getItem(Save.CHARS) || '{}');
    all[key].inv = { corrupt: true };
    localStorage.setItem(Save.CHARS, JSON.stringify(all));
    localStorage.setItem(Save.STASH, JSON.stringify({ corrupt: true }));
    let loaded = false, error = '';
    try { loaded = Game.loadGame(G.player.name, 0); } catch (caught) { error = String(caught && caught.stack || caught); }
    return {
      loaded,
      error,
      invIsArray: Array.isArray(G.player && G.player.inv),
      invLength: G.player && G.player.inv.length,
      stashIsArray: Array.isArray(G.stash),
      stashLength: G.stash.length,
      savedStash: JSON.parse(localStorage.getItem(Save.STASH) || 'null'),
      directMigrationLength: directMigration.length,
    };
  });
  expect(result).toEqual({
    loaded: true, error: '', invIsArray: true, invLength: 0,
    stashIsArray: true, stashLength: 0, savedStash: [], directMigrationLength: 0,
  });
});

test('stash deposit and take persist both owners immediately, clamp on removal, and never create aliases', async ({ page }) => {
  await game(page, 'Charm Stash');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 30;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    pl.inv = [];
    const baseline = Ent.computeDerived(pl);
    const charm = __charmFixture('stash-charm', 'small', { x: 0, y: 0 });
    const locked = __charmFixture('stash-locked', 'grand', {
      ilvl: 54,
      sequence: [0.3, 0, 0.999, 0],
      x: 1,
      y: 0,
    });
    pl.inv = [charm, locked];
    pl._invMigrated = true;
    Ent.refreshDerived(pl, { fill: true });
    pl.hp = baseline.maxHp + 2;
    pl.mp = Math.min(7, baseline.maxMp);
    // Stash transfer must be measured without the independent world regen tick.
    Game.update = () => {};
    Save.saveChar(pl);
    Save.saveStash();
    UI.open('stash');
    return {
      name: charm.name,
      lockedName: locked.name,
      lockedReq: locked.reqLvl,
      baseline: { maxHp: baseline.maxHp, maxMp: baseline.maxMp },
      beforeMp: pl.mp,
    };
  });

  expect(setup.lockedReq).toBe(42);
  const deposit = page.locator('#panel-stash').getByRole('button', { name: `Deposit ${setup.name} in shared stash` });
  await expect(deposit).toHaveClass(/charm-active/);
  await expect(deposit).toHaveCSS('width', '46px');
  await expect(deposit).toHaveCSS('height', '46px');
  await expect(deposit).toHaveAttribute('aria-label', /active while carried/);
  const locked = page.getByTestId('stash-pack-item-stash-locked');
  await expect(locked).toHaveClass(/charm-inactive/);
  await expect(locked).toHaveCSS('width', '46px');
  await expect(locked).toHaveCSS('height', '46px');
  await expect(locked).toHaveAttribute('aria-label', /inactive until level 42/);
  expect(await locked.evaluate(element => getComputedStyle(element, '::before').content)).toContain('–');
  expect(await locked.evaluate(element => {
    const cell = element.getBoundingClientRect();
    const row = element.parentElement.getBoundingClientRect();
    return {
      rowHeight: row.height,
      contained: cell.left >= row.left && cell.right <= row.right && cell.top >= row.top && cell.bottom <= row.bottom,
    };
  })).toEqual({ rowHeight: 46, contained: true });
  await locked.focus();
  await expect(page.locator('#tooltip')).toContainText('INACTIVE — REQUIRES LEVEL 42');
  await deposit.focus();
  await deposit.press('Enter');
  const stashed = page.getByTestId('stash-item-stash-charm');
  await expect(stashed).toHaveClass(/charm-inactive/);
  await stashed.focus();
  await expect(page.locator('#tooltip')).toContainText('INACTIVE IN STASH');

  expect(await page.evaluate(() => {
    const saved = Save.loadChar(G.player.name);
    const savedStash = JSON.parse(localStorage.getItem(Save.STASH) || '[]');
    return {
      hp: G.player.hp,
      mp: G.player.mp,
      liveInv: G.player.inv.filter(item => item.id === 'stash-charm').length,
      liveStash: G.stash.filter(item => item.id === 'stash-charm').length,
      savedInv: saved.inv.filter(item => item.id === 'stash-charm').length,
      savedStash: savedStash.filter(item => item.id === 'stash-charm').length,
    };
  })).toEqual({
    hp: setup.baseline.maxHp,
    mp: setup.beforeMp,
    liveInv: 0,
    liveStash: 1,
    savedInv: 0,
    savedStash: 1,
  });

  await stashed.press('Enter');
  expect(await page.evaluate(() => {
    const saved = Save.loadChar(G.player.name);
    const savedStash = JSON.parse(localStorage.getItem(Save.STASH) || '[]');
    return {
      hp: G.player.hp,
      mp: G.player.mp,
      liveInv: G.player.inv.filter(item => item.id === 'stash-charm').length,
      liveStash: G.stash.filter(item => item.id === 'stash-charm').length,
      savedInv: saved.inv.filter(item => item.id === 'stash-charm').length,
      savedStash: savedStash.filter(item => item.id === 'stash-charm').length,
      active: G.player.charmState.activeIds,
    };
  })).toEqual({
    hp: setup.baseline.maxHp,
    mp: setup.beforeMp,
    liveInv: 1,
    liveStash: 0,
    savedInv: 1,
    savedStash: 0,
    active: ['stash-charm'],
  });

  const reloaded = await page.evaluate(() => {
    const name = G.player.name;
    const loaded = Game.loadGame(name, 0);
    return {
      loaded,
      inv: G.player.inv.filter(item => item.id === 'stash-charm').length,
      stash: G.stash.filter(item => item.id === 'stash-charm').length,
      active: G.player.charmState.activeIds,
    };
  });
  expect(reloaded).toEqual({ loaded: true, inv: 1, stash: 0, active: ['stash-charm'] });
});

test('drop, pickup, sale, and full-inventory failure preserve one physical charm and commit only successful moves', async ({ page }) => {
  await game(page, 'Charm Lifecycle');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 30;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const charm = __charmFixture('lifecycle-charm', 'small', { x: 0, y: 0 });
    pl.inv = [charm];
    pl._invMigrated = true;
    Ent.refreshDerived(pl, { fill: true });
    Save.saveChar(pl);
    UI.open('inv');
    return { name: charm.name, sellPrice: Items.sellPrice(charm), gold: pl.gold };
  });

  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="inventory-item-lifecycle-charm"]');
    const target = document.querySelector('#panel-inv .world-drop');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  expect(await page.evaluate(() => {
    const saved = Save.loadChar(G.player.name);
    return {
      inv: G.player.inv.filter(item => item.id === 'lifecycle-charm').length,
      ground: G.groundItems.filter(entry => entry.item && entry.item.id === 'lifecycle-charm').length,
      saved: saved.inv.filter(item => item.id === 'lifecycle-charm').length,
      active: G.player.charmState.activeIds,
    };
  })).toEqual({ inv: 0, ground: 1, saved: 0, active: [] });

  expect(await page.evaluate(() => {
    const ground = G.groundItems.find(entry => entry.item && entry.item.id === 'lifecycle-charm');
    Game.interact({ kind: 'gitem', x: ground.x, y: ground.y, gi: ground });
    const saved = Save.loadChar(G.player.name);
    return {
      inv: G.player.inv.filter(item => item.id === 'lifecycle-charm').length,
      ground: G.groundItems.filter(entry => entry.item && entry.item.id === 'lifecycle-charm').length,
      saved: saved.inv.filter(item => item.id === 'lifecycle-charm').length,
      active: G.player.charmState.activeIds,
    };
  })).toEqual({ inv: 1, ground: 0, saved: 1, active: ['lifecycle-charm'] });

  await page.evaluate(() => { G.shopStock = []; UI.open('vendor'); });
  await page.locator('#panel-vendor').getByRole('button', { name: `Sell ${setup.name}` }).click();
  expect(await page.evaluate(() => {
    const saved = Save.loadChar(G.player.name);
    return {
      gold: G.player.gold,
      inv: G.player.inv.filter(item => item.id === 'lifecycle-charm').length,
      saved: saved.inv.filter(item => item.id === 'lifecycle-charm').length,
      active: G.player.charmState.activeIds,
    };
  })).toEqual({ gold: setup.gold + setup.sellPrice, inv: 0, saved: 0, active: [] });

  const refused = await page.evaluate(() => {
    const pl = G.player;
    const fillers = [];
    for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++) {
      const scroll = ItemIdentification.createScroll(`full-${row}-${col}`);
      scroll._gx = col; scroll._gy = row;
      fillers.push(scroll);
    }
    pl.inv = fillers;
    pl._invMigrated = true;
    const charm = __charmFixture('full-grand-charm', 'grand', { x: 9, y: 3 });
    G.groundItems = [{ x: pl.x, y: pl.y, item: charm }];
    const before = JSON.stringify(charm);
    const ground = G.groundItems[0];
    Game.interact({ kind: 'gitem', x: ground.x, y: ground.y, gi: ground });
    return {
      invCount: pl.inv.length,
      charmInInv: pl.inv.some(item => item.id === charm.id),
      groundCount: G.groundItems.filter(entry => entry.item === charm).length,
      unchanged: JSON.stringify(charm) === before,
    };
  });
  expect(refused).toEqual({ invCount: 60, charmInInv: false, groundCount: 1, unchanged: true });
});

test('full-pack equipment swaps refuse atomically instead of creating invisible overflow that disables charms', async ({ page }) => {
  await game(page, 'Charm Swap Safety');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 30;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const bow = Items.makeBaseItem(() => 0.5, Items.baseById('bow'), 0, 30, { skipQuality: true });
    bow.id = 'swap-old-bow';
    const dagger = Items.makeBaseItem(() => 0.5, Items.baseById('dagger'), 0, 30, { skipQuality: true });
    dagger.id = 'swap-new-dagger'; dagger._gx = 0; dagger._gy = 0;
    const active = __charmFixture('swap-active-charm', 'small', { x: 1, y: 0 });
    const inventory = [dagger, active];
    for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++) {
      if ((col === 0 && (row === 0 || row === 1)) || (col === 1 && row === 0)) continue;
      const filler = ItemIdentification.createScroll(`swap-fill-${col}-${row}`);
      filler._gx = col; filler._gy = row; inventory.push(filler);
    }
    pl.inv = inventory; pl.equip.weapon = bow; pl._invMigrated = true;
    Ent.refreshDerived(pl, { fill: true });
    Save.saveChar(pl);
    UI.open('inv');
    return {
      before: JSON.stringify({ inv: pl.inv, equip: pl.equip }),
      count: pl.inv.length,
      active: pl.charmState.activeIds,
    };
  });
  expect(setup.count).toBe(59);
  expect(setup.active).toContain('swap-active-charm');

  const clickPath = await page.evaluate(before => {
    Game.equipFromInv('swap-new-dagger');
    return {
      unchanged: JSON.stringify({ inv: G.player.inv, equip: G.player.equip }) === before,
      weapon: G.player.equip.weapon && G.player.equip.weapon.id,
      daggerCarried: G.player.inv.some(item => item.id === 'swap-new-dagger'),
      bowCarried: G.player.inv.some(item => item.id === 'swap-old-bow'),
      charmState: G.player.charmState,
    };
  }, setup.before);
  expect(clickPath.unchanged).toBe(true);
  expect(clickPath).toMatchObject({
    weapon: 'swap-old-bow', daggerCarried: true, bowCarried: false,
    charmState: { ok: true, activeIds: ['swap-active-charm'] },
  });
  await expect(page.locator('#announce')).toContainText('Make room for the displaced equipment first');

  const dragPath = await page.evaluate(before => {
    const accepted = UI.inventoryGrid.equip({ kind: 'inv', itemId: 'swap-new-dagger' }, 'weapon');
    return {
      accepted,
      unchanged: JSON.stringify({ inv: G.player.inv, equip: G.player.equip }) === before,
      weapon: G.player.equip.weapon && G.player.equip.weapon.id,
      charmState: G.player.charmState,
    };
  }, setup.before);
  expect(dragPath).toMatchObject({
    accepted: false, unchanged: true, weapon: 'swap-old-bow',
    charmState: { ok: true, activeIds: ['swap-active-charm'] },
  });
});

test('Cube, socket, repair, and mercenary systems refuse charms while the 390px inventory remains contained and non-overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await game(page, 'Charm Boundaries');
  const setup = await page.evaluate(() => {
    const pl = G.player;
    pl.lvl = 30;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const active = __charmFixture('boundary-active', 'small', { x: 0, y: 0 });
    const hidden = __charmFixture('boundary-hidden', 'grand', { identified: false, x: 1, y: 0 });
    const gem = Items.makeGem('ruby', 'chipped');
    gem.id = 'boundary-gem'; gem._gx = 2; gem._gy = 0;
    const scroll = ItemIdentification.createScroll('boundary-scroll');
    scroll._gx = 3; scroll._gy = 0;
    pl.inv = [active, hidden, gem, scroll];
    pl._invMigrated = true;
    const mercId = Object.keys(MERCENARY_BY_ID).find(id => MERCENARY_BY_ID[id].slots.includes('weapon'));
    pl.mercenary = { archetypeId: mercId, level: 30, xp: 0, dead: false, equipment: {} };
    Ent.refreshDerived(pl, { fill: true });
    const before = JSON.stringify(pl.inv);
    const socket = Game.insertSocket(gem.id, active.id);
    const cube = Cube.preview(pl, [active.id]);
    const transmute = Cube.transmute(pl, [active.id], () => 0.5);
    const repair = ItemCondition.quoteAll(pl, G.stash);
    UI.open('cube');
    return {
      activeName: active.name,
      before,
      after: JSON.stringify(pl.inv),
      socket,
      cube,
      transmute,
      repairIds: repair.entries.map(entry => entry.id),
    };
  });

  expect(setup.after).toBe(setup.before);
  expect(setup.socket).toMatchObject({ ok: false, reason: 'Charms cannot hold socket components.' });
  expect(setup.cube).toMatchObject({ ok: false, reason: 'Charms have no Cube recipe.' });
  expect(setup.transmute).toMatchObject({ ok: false, reason: 'Charms have no Cube recipe.' });
  expect(setup.repairIds).not.toContain('boundary-active');
  const cubeCharm = page.getByTestId('cube-input-boundary-active');
  await expect(cubeCharm).toBeDisabled();
  await expect(cubeCharm).toHaveClass(/charm-active/);
  await expect(cubeCharm).toHaveAttribute('aria-label', `${setup.activeName}. Charms have no Cube recipe`);
  await expect(cubeCharm).toContainText('NO CHARM RECIPE');
  const cubeHidden = page.getByTestId('cube-input-boundary-hidden');
  await expect(cubeHidden).toBeDisabled();
  await expect(cubeHidden).toHaveClass(/charm-inactive/);
  await expect(cubeHidden).toHaveAttribute('aria-label', 'Unidentified Grand Charm. Identify before using in the Cube');

  await page.evaluate(() => {
    const stock = Items.makeBaseItem(() => 0.5, Items.baseById('dagger'), 0, G.player.lvl, { skipQuality: true });
    stock.id = 'boundary-stock';
    G.shopStock = [stock];
    UI.open('vendor');
  });
  await expect(page.getByTestId('vendor-stock-item-boundary-stock')).toHaveCSS('width', '54px');
  await expect(page.getByTestId('vendor-stock-item-boundary-stock')).toHaveCSS('height', '54px');
  await expect(page.getByTestId('vendor-pack-item-boundary-active')).toHaveClass(/charm-active/);
  await expect(page.getByTestId('vendor-pack-item-boundary-active')).toHaveCSS('width', '46px');
  await expect(page.getByTestId('vendor-pack-item-boundary-hidden')).toHaveClass(/charm-inactive/);
  await expect(page.getByTestId('repair-row-boundary-active')).toHaveCount(0);
  await page.evaluate(() => UI.open('mercenary'));
  const mercEquip = page.locator('#panel-mercenary').getByRole('button', { name: 'Equip weapon from inventory on mercenary' });
  await mercEquip.click();
  await expect(page.locator('#announce')).toContainText('No level-appropriate weapon in inventory');
  expect(await page.evaluate(() => ({
    equipped: G.player.mercenary.equipment.weapon || null,
    carried: G.player.inv.some(item => item.id === 'boundary-active'),
  }))).toEqual({ equipped: null, carried: true });

  await page.evaluate(() => UI.open('inv'));
  const hidden = page.getByTestId('inventory-item-boundary-hidden');
  await hidden.focus();
  await expect(page.locator('#tooltip')).toBeVisible();
  const mobile = await page.evaluate(() => {
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const overlap = (a, b) => Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
      Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
    const panel = rect(document.getElementById('panel-inv'));
    const grid = rect(document.querySelector('#panel-inv .inv-grid-var'));
    const summary = rect(document.querySelector('[data-testid="charm-summary"]'));
    const identify = rect(document.querySelector('[data-testid="identify-status"]'));
    const tooltip = rect(document.getElementById('tooltip'));
    const active = document.querySelector('[data-testid="inventory-item-boundary-active"]');
    const inactive = document.querySelector('[data-testid="inventory-item-boundary-hidden"]');
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panel,
      grid,
      summary,
      identify,
      tooltip,
      summaryIdentifyOverlap: overlap(summary, identify),
      tooltipSummaryOverlap: overlap(tooltip, summary),
      tooltipIdentifyOverlap: overlap(tooltip, identify),
      activeMarker: getComputedStyle(active, '::before').content,
      inactiveMarker: getComputedStyle(inactive, '::before').content,
    };
  });
  expect(mobile.documentWidth).toBe(mobile.viewport);
  expect(mobile.panel.left).toBeGreaterThanOrEqual(0);
  expect(mobile.panel.right).toBeLessThanOrEqual(390);
  expect(mobile.grid.left).toBeGreaterThanOrEqual(mobile.panel.left);
  expect(mobile.grid.right).toBeLessThanOrEqual(mobile.panel.right);
  for (const surface of [mobile.summary, mobile.identify, mobile.tooltip]) {
    expect(surface.left).toBeGreaterThanOrEqual(0);
    expect(surface.right).toBeLessThanOrEqual(390);
  }
  expect(mobile.tooltip.top).toBeGreaterThanOrEqual(0);
  expect(mobile.tooltip.bottom).toBeLessThanOrEqual(844);
  expect(mobile.summaryIdentifyOverlap).toBe(false);
  expect(mobile.tooltipSummaryOverlap).toBe(false);
  expect(mobile.tooltipIdentifyOverlap).toBe(false);
  expect(mobile.activeMarker).toContain('✓');
  expect(mobile.inactiveMarker).toContain('–');
});
