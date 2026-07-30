const { test, expect } = require('@playwright/test');

async function game(page, name = 'Identification Runner') {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(name => {
    localStorage.clear();
    Game.newGame(name, 'warbringer', false);
  }, name);
  await page.waitForFunction(() => G.state === 'game');
}

test('keyboard scroll flow consumes exactly one scroll, reveals in place, persists, and restores focus', async ({ page }) => {
  await game(page, 'Identification Keyboard');
  const fixture = await page.evaluate(() => {
    const pl = G.player;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const target = Items.generate(28, { forceRarity: 'rare', forceType: 'sword' });
    target.id = 'identification-keyboard-target';
    target.baseName = 'War Sword';
    target.name = 'Whispering Doom';
    target.stats = { str: 37, fireDmg: 19 };
    target.reqLvl = 17;
    target.price = 98765;
    target.value = 54321;
    target.sockets = 2;
    const hiddenGem = Items.makeGem('ruby', 'perfect');
    hiddenGem.id = 'identification-hidden-ruby';
    target.gems = [hiddenGem, null];
    target._gx = 1;
    target._gy = 0;
    ItemIdentification.prepareDrop(target);

    const first = ItemIdentification.createScroll('identification-scroll-first');
    first._gx = 0;
    first._gy = 0;
    const second = ItemIdentification.createScroll('identification-scroll-second');
    second._gx = 0;
    second._gy = 1;
    pl.inv = [first, second, target];
    pl._invMigrated = true;
    // Snapshot the canonical save shape so this test isolates identification
    // from the independent durability/socket migrations that run on every save.
    Save.normalizeItems(pl);
    target.durability = 7;
    const payload = JSON.parse(JSON.stringify(target));
    delete payload.identified;
    UI.open('inv');
    return { payload: JSON.stringify(payload), secretName: target.name, maxDurability: target.maxDurability };
  });

  const target = page.getByTestId('inventory-item-identification-keyboard-target');
  const firstScroll = page.getByTestId('inventory-item-identification-scroll-first');
  await expect(target).toHaveClass(/item-unidentified/);
  await expect(target).toHaveAttribute('aria-label', /^Unidentified War Sword\. Identify before equipping/);
  await expect(page.locator('#panel-inv')).not.toContainText(fixture.secretName);

  await target.focus();
  const tooltip = page.locator('#tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Unidentified War Sword');
  await expect(tooltip).toContainText('UNIDENTIFIED');
  await expect(tooltip).toContainText('Old Maras');
  await expect(tooltip).not.toContainText(fixture.secretName);
  await expect(tooltip).not.toContainText('+37 Strength');
  await expect(tooltip).not.toContainText('+19 Fire Damage');
  await expect(tooltip).not.toContainText('Value: 98765');
  await expect(tooltip).not.toContainText('Value: 54321');
  await expect(tooltip).not.toContainText(`Durability: 7 of ${fixture.maxDurability}`);
  await expect(tooltip).not.toContainText('Perfect Ruby');

  await firstScroll.focus();
  await firstScroll.press('Enter');
  await expect(page.getByTestId('identify-status')).toContainText('IDENTIFICATION READY');
  await expect(page.getByTestId('identify-cancel')).toBeVisible();
  await expect(page.getByTestId('inventory-item-identification-scroll-first')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-item-identification-keyboard-target')).toHaveClass(/identify-target/);

  // Cancellation is an explicit, keyboard-reachable escape hatch and consumes nothing.
  await page.getByTestId('identify-cancel').click();
  expect(await page.evaluate(() => ({
    selected: UI.identificationSelection,
    scrolls: G.player.inv.filter(ItemIdentification.isScroll).length,
    identified: G.player.inv.find(item => item.id === 'identification-keyboard-target').identified,
  }))).toEqual({ selected: null, scrolls: 2, identified: false });

  await page.getByTestId('inventory-item-identification-scroll-first').focus();
  await page.getByTestId('inventory-item-identification-scroll-first').press('Enter');
  const selectedTarget = page.getByTestId('inventory-item-identification-keyboard-target');
  await selectedTarget.focus();
  await selectedTarget.press('Enter');

  const revealed = page.getByTestId('inventory-item-identification-keyboard-target');
  await expect(revealed).toBeFocused();
  await expect(revealed).not.toHaveClass(/item-unidentified/);
  await expect(revealed).toHaveAttribute('aria-label', /^Equip Whispering Doom/);
  await expect(page.getByTestId('inventory-item-identification-scroll-first')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item-identification-scroll-second')).toHaveCount(1);
  await expect(page.getByTestId('identify-status')).toContainText('0 UNIDENTIFIED');

  const committed = await page.evaluate(() => {
    const target = G.player.inv.find(item => item.id === 'identification-keyboard-target');
    const livePayload = JSON.parse(JSON.stringify(target));
    delete livePayload.identified;
    const saved = Save.loadChar(G.player.name);
    const savedTarget = saved.inv.find(item => item.id === target.id);
    const savedPayload = JSON.parse(JSON.stringify(savedTarget));
    delete savedPayload.identified;
    return {
      liveIdentified: target.identified,
      savedIdentified: savedTarget.identified,
      livePayload: JSON.stringify(livePayload),
      savedPayload: JSON.stringify(savedPayload),
      scrollIds: G.player.inv.filter(ItemIdentification.isScroll).map(item => item.id),
      savedScrollIds: saved.inv.filter(ItemIdentification.isScroll).map(item => item.id),
    };
  });
  expect(committed).toEqual({
    liveIdentified: true,
    savedIdentified: true,
    livePayload: fixture.payload,
    savedPayload: fixture.payload,
    scrollIds: ['identification-scroll-second'],
    savedScrollIds: ['identification-scroll-second'],
  });
});

test('unidentified equipment is atomically refused by equip, socket, Cube, and vendor paths', async ({ page }) => {
  await game(page, 'Identification Locks');
  const locked = await page.evaluate(() => {
    const pl = G.player;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const target = Items.makeBaseItem(() => 0.5, Items.baseById('sword'), 0, 30, { skipQuality: true });
    target.id = 'identification-locked-item';
    target.baseName = 'Short Sword';
    target.name = 'Oracle Bane';
    target.rarity = 'rare';
    target.stats = { str: 88, dmgFlat: 77 };
    target.price = 76543;
    target.sockets = 1;
    target.gems = [null];
    target._gx = 1;
    target._gy = 0;
    ItemIdentification.prepareDrop(target);
    const gem = Items.makeGem('sapphire', 'chipped');
    gem.id = 'identification-locked-gem';
    gem._gx = 0;
    gem._gy = 0;
    pl.inv = [gem, target];
    pl._invMigrated = true;
    pl.gold = 5000;
    Ent.computeDerived(pl);
    UI.open('inv');

    const before = JSON.stringify({ inv: pl.inv, equip: pl.equip, gold: pl.gold });
    Game.equipFromInv(target.id);
    const socket = Game.insertSocket(gem.id, target.id);
    const preview = Cube.preview(pl, [target.id]);
    const transmute = Cube.transmute(pl, [target.id], () => 0.5);
    const after = JSON.stringify({ inv: pl.inv, equip: pl.equip, gold: pl.gold });
    return { before, after, socket, preview, transmute, secretName: target.name };
  });

  expect(locked.after).toBe(locked.before);
  expect(locked.socket).toMatchObject({ ok: false, reason: 'Identify that item before socketing it.' });
  expect(locked.preview).toMatchObject({ ok: false, reason: 'Identify every concealed input before transmutation.' });
  expect(locked.transmute).toMatchObject({ ok: false, reason: 'Identify every concealed input before transmutation.' });

  await page.evaluate(() => UI.open('cube'));
  const cubeInput = page.getByTestId('cube-input-identification-locked-item');
  await expect(cubeInput).toBeDisabled();
  await expect(cubeInput).toHaveAttribute('aria-label', 'Unidentified Short Sword. Identify before using in the Cube');
  await expect(page.locator('#panel-cube')).not.toContainText(locked.secretName);

  await page.evaluate(() => {
    G.shopStock = [];
    UI.open('vendor');
  });
  const vendorItem = page.locator('#panel-vendor .shop-list').last()
    .getByRole('button', { name: 'Unidentified Short Sword. Identify before selling' });
  await expect(vendorItem).toHaveAttribute('aria-disabled', 'true');
  await vendorItem.focus();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).not.toContainText(locked.secretName);
  await expect(page.locator('#tooltip')).not.toContainText('76543');
  await vendorItem.press('Enter');

  const afterVendor = await page.evaluate(() => ({
    state: JSON.stringify({ inv: G.player.inv, equip: G.player.equip, gold: G.player.gold }),
    targetPresent: G.player.inv.some(item => item.id === 'identification-locked-item'),
    componentPresent: G.player.inv.some(item => item.id === 'identification-locked-gem'),
    socketEmpty: G.player.inv.find(item => item.id === 'identification-locked-item').gems[0] === null,
    sellPrice: Items.sellPrice(G.player.inv.find(item => item.id === 'identification-locked-item')),
  }));
  expect(afterVendor.state).toBe(locked.before);
  expect(afterVendor).toMatchObject({ targetPresent: true, componentPresent: true, socketEmpty: true, sellPrice: 0 });
});

test('Old Maras identifies every carried item for free and no equipment, stash, or corpse gear', async ({ page }) => {
  await game(page, 'Identification Maras');
  const ids = await page.evaluate(() => {
    const make = (id, name) => {
      const item = Items.generate(24, { forceRarity: 'rare', forceType: 'sword', unidentified: true });
      item.id = id;
      item.name = name;
      item.baseName = 'War Sword';
      item.stats = { str: 13 };
      ItemIdentification.prepareDrop(item);
      return item;
    };
    const pl = G.player;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const carriedA = make('maras-carried-a', 'Carried Secret Alpha');
    carriedA._gx = 0; carriedA._gy = 0;
    const carriedB = make('maras-carried-b', 'Carried Secret Beta');
    carriedB._gx = 1; carriedB._gy = 0;
    const equipped = make('maras-equipped', 'Equipped Secret');
    const stashed = make('maras-stashed', 'Stashed Secret');
    const corpse = make('maras-corpse', 'Corpse Secret');
    pl.inv = [carriedA, carriedB];
    pl._invMigrated = true;
    pl.equip.weapon = equipped;
    pl.corpses = [{
      id: 'maras-corpse-record', version: CorpseState.VERSION,
      location: { kind: 'town', town: G.map.name, x: pl.x + 2, y: pl.y },
      gear: [{ slot: 'weapon', item: corpse }],
    }];
    G.stash = [stashed];
    pl.gold = 0;
    Save.saveStash();
    Ent.computeDerived(pl);
    UI.npcDialog(G.npcs.find(npc => npc.id === 'elder'));
    return {
      carried: [carriedA.id, carriedB.id], equipped: equipped.id,
      stashed: stashed.id, corpse: corpse.id,
      secrets: [carriedA.name, carriedB.name, equipped.name, stashed.name, corpse.name],
    };
  });

  const service = page.getByTestId('identification-service');
  await expect(service).toBeVisible();
  await expect(service).toContainText('IDENTIFICATION · FREE');
  await expect(service).toContainText('Equipped, stashed, mercenary, and corpse gear remain untouched.');
  await expect(service.locator('.identification-row')).toHaveCount(2);
  for (const secret of ids.secrets) await expect(service).not.toContainText(secret);
  const identifyAll = page.getByTestId('identify-all');
  await expect(identifyAll).toBeEnabled();
  await expect(identifyAll).toHaveAttribute('aria-label', 'Identify all 2 carried unidentified items for free');
  await identifyAll.click();
  await expect(page.getByTestId('identification-service')).toContainText('You carry nothing veiled.');
  await expect(page.getByTestId('identify-all')).toBeDisabled();

  const state = await page.evaluate(ids => {
    const byId = (items, id) => items.find(item => item && item.id === id);
    const saved = Save.loadChar(G.player.name);
    const savedStash = JSON.parse(localStorage.getItem(Save.STASH) || '[]');
    return {
      gold: G.player.gold,
      carried: ids.carried.map(id => byId(G.player.inv, id).identified),
      equipped: G.player.equip.weapon.identified,
      stashed: byId(G.stash, ids.stashed).identified,
      corpse: G.player.corpses[0].gear[0].item.identified,
      savedCarried: ids.carried.map(id => byId(saved.inv, id).identified),
      savedEquipped: saved.equip.weapon.identified,
      savedCorpse: saved.corpses[0].gear[0].item.identified,
      savedStash: byId(savedStash, ids.stashed).identified,
    };
  }, ids);
  expect(state).toEqual({
    gold: 0,
    carried: [true, true],
    equipped: false,
    stashed: false,
    corpse: false,
    savedCarried: [true, true],
    savedEquipped: false,
    savedCorpse: false,
    savedStash: false,
  });
});

test('world drops are veiled while default generation stays identified, and mobile identification UI is contained', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await game(page, 'Identification Mobile');
  const generation = await page.evaluate(() => {
    const defaultRare = Items.generate(35, { forceRarity: 'rare', forceType: 'sword' });
    const explicitRare = Items.generate(35, { forceRarity: 'rare', forceType: 'sword', unidentified: true });
    const explicitCommon = Items.generate(35, { forceRarity: 'common', forceType: 'sword', unidentified: true });
    G.groundItems = [];
    G.dropLoot({ x: G.player.x, y: G.player.y, lvl: 35, rank: 'boss' });
    const equipmentDrops = G.groundItems.map(drop => drop.item).filter(ItemIdentification.isEligible);
    const first = equipmentDrops[0];
    const interaction = Game.interactables().find(entry => entry.kind === 'gitem' && entry.gi.item === first);

    const target = Items.generate(30, { forceRarity: 'rare', forceType: 'sword', unidentified: true });
    target.id = 'identification-mobile-target';
    target.baseName = 'War Sword';
    target.name = 'Mobile Secret Cataclysm';
    target.stats = { vit: 61 };
    target.price = 45678;
    target._gx = 1;
    target._gy = 0;
    const scroll = ItemIdentification.createScroll('identification-mobile-scroll');
    scroll._gx = 0;
    scroll._gy = 0;
    G.player.inv = [scroll, target];
    G.player._invMigrated = true;
    UI.open('inv');
    return {
      defaultIdentified: ItemIdentification.isIdentified(defaultRare),
      explicitNeedsIdentification: ItemIdentification.needsIdentification(explicitRare),
      commonNeedsIdentification: ItemIdentification.needsIdentification(explicitCommon),
      equipmentDropCount: equipmentDrops.length,
      allEligibleWorldDropsVeiled: equipmentDrops.every(ItemIdentification.needsIdentification),
      scrollDrops: G.groundItems.filter(drop => ItemIdentification.isScroll(drop.item)).length,
      worldLabel: interaction && interaction.label,
      worldDisplay: Items.displayName(first),
      worldSecret: first && first.name,
    };
  });

  expect(generation.defaultIdentified).toBe(true);
  expect(generation.explicitNeedsIdentification).toBe(true);
  expect(generation.commonNeedsIdentification).toBe(false);
  expect(generation.equipmentDropCount).toBeGreaterThan(0);
  expect(generation.allEligibleWorldDropsVeiled).toBe(true);
  expect(generation.scrollDrops).toBeGreaterThanOrEqual(1);
  expect(generation.worldLabel).toBe(generation.worldDisplay);
  expect(generation.worldLabel).toMatch(/^Unidentified /);
  expect(generation.worldLabel).not.toBe(generation.worldSecret);

  const target = page.getByTestId('inventory-item-identification-mobile-target');
  await target.focus();
  const tooltip = page.locator('#tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Unidentified War Sword');
  await expect(tooltip).not.toContainText('Mobile Secret Cataclysm');
  await expect(tooltip).not.toContainText('+61 Vitality');
  await expect(tooltip).not.toContainText('45678');

  const initialBounds = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      panel: rect('#panel-inv'),
      grid: rect('#panel-inv .inv-grid-var'),
      tooltip: rect('#tooltip'),
      identifyStatus: rect('[data-testid="identify-status"]'),
    };
  });
  expect(initialBounds.scrollWidth).toBe(initialBounds.width);
  expect(initialBounds.bodyScrollWidth).toBeLessThanOrEqual(initialBounds.width);
  expect(initialBounds.panel.left).toBeGreaterThanOrEqual(0);
  expect(initialBounds.panel.right).toBeLessThanOrEqual(initialBounds.width);
  expect(initialBounds.grid.left).toBeGreaterThanOrEqual(initialBounds.panel.left);
  expect(initialBounds.grid.right).toBeLessThanOrEqual(initialBounds.panel.right);
  expect(initialBounds.tooltip.left).toBeGreaterThanOrEqual(0);
  expect(initialBounds.tooltip.right).toBeLessThanOrEqual(initialBounds.width);
  expect(initialBounds.tooltip.top).toBeGreaterThanOrEqual(0);
  expect(initialBounds.tooltip.bottom).toBeLessThanOrEqual(initialBounds.height);
  expect(initialBounds.tooltip.bottom <= initialBounds.identifyStatus.top ||
    initialBounds.tooltip.top >= initialBounds.identifyStatus.bottom).toBe(true);

  await page.getByTestId('inventory-item-identification-mobile-scroll').focus();
  await page.getByTestId('inventory-item-identification-mobile-scroll').press('Enter');
  const status = page.getByTestId('identify-status');
  await status.scrollIntoViewIfNeeded();
  await expect(status).toContainText('IDENTIFICATION READY');
  await expect(page.getByTestId('identify-cancel')).toBeVisible();
  const selectedBounds = await page.evaluate(() => {
    const panel = document.getElementById('panel-inv').getBoundingClientRect();
    const status = document.querySelector('[data-testid="identify-status"]').getBoundingClientRect();
    const cancel = document.querySelector('[data-testid="identify-cancel"]').getBoundingClientRect();
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      panel: { left: panel.left, right: panel.right },
      status: { left: status.left, right: status.right },
      cancel: { left: cancel.left, right: cancel.right },
    };
  });
  expect(selectedBounds.scrollWidth).toBe(selectedBounds.width);
  expect(selectedBounds.status.left).toBeGreaterThanOrEqual(selectedBounds.panel.left);
  expect(selectedBounds.status.right).toBeLessThanOrEqual(selectedBounds.panel.right);
  expect(selectedBounds.cancel.left).toBeGreaterThanOrEqual(selectedBounds.status.left);
  expect(selectedBounds.cancel.right).toBeLessThanOrEqual(selectedBounds.status.right);

  await page.getByTestId('inventory-item-identification-mobile-target').focus();
  const selectedTargetBounds = await page.evaluate(() => {
    const tooltip = document.getElementById('tooltip').getBoundingClientRect();
    const status = document.querySelector('[data-testid="identify-status"]').getBoundingClientRect();
    return { tooltip: { top: tooltip.top, bottom: tooltip.bottom }, status: { top: status.top, bottom: status.bottom } };
  });
  expect(selectedTargetBounds.tooltip.bottom <= selectedTargetBounds.status.top ||
    selectedTargetBounds.tooltip.top >= selectedTargetBounds.status.bottom).toBe(true);

  await page.getByTestId('inventory-item-identification-mobile-target').press('Enter');
  await expect(page.getByTestId('inventory-item-identification-mobile-target')).toBeFocused();
  const revealedBounds = await page.evaluate(() => {
    const tooltip = document.getElementById('tooltip').getBoundingClientRect();
    const status = document.querySelector('[data-testid="identify-status"]').getBoundingClientRect();
    return { tooltip: { top: tooltip.top, bottom: tooltip.bottom }, status: { top: status.top, bottom: status.bottom } };
  });
  expect(revealedBounds.tooltip.bottom <= revealedBounds.status.top ||
    revealedBounds.tooltip.top >= revealedBounds.status.bottom).toBe(true);
});
