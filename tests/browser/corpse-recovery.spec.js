const { test, expect } = require('@playwright/test');

async function game(page, name = 'Corpse Runner', hardcore = false) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(({ name, hardcore }) => {
    localStorage.clear(); Game.newGame(name, 'warbringer', hardcore);
  }, { name, hardcore });
  await page.waitForFunction(() => G.state === 'game');
}

test('softcore death leaves socketed gear on a persistent corpse and a return portal', async ({ page }) => {
  await game(page);
  const death = await page.evaluate(() => {
    Game.enterDungeon(0, 1, 0); G.monsters = [];
    const mapKey = Game.mapKey(G.map);
    const weapon = Items.makeBaseItem(() => .5, Items.baseById('sword'), 0, 18, { skipQuality: true });
    weapon.id = 'death-sword'; weapon.sockets = 1; weapon.gems = [Items.makeGem('ruby', 'chipped')];
    weapon.gems[0].id = 'death-ruby'; weapon.stats = {};
    G.player.equip.weapon = weapon; G.player.gold = 1000;
    Ent.computeDerived(G.player); G.player.hp = G.player.derived.maxHp;
    G.onPlayerDeath();
    return { mapKey, weapon: weapon.id, gem: weapon.gems[0].id };
  });

  const panel = page.locator('#panel-death');
  await expect(panel).toBeVisible({ timeout: 3000 });
  await expect(panel).toContainText('Your corpse guards 1 equipped item');
  await expect(panel).toContainText('returns safely to the town recovery shrine');
  await expect(panel.getByRole('button', { name: 'RISE AGAIN' })).toBeFocused();
  expect(await page.evaluate(() => {
    const saved = Save.loadChar(G.player.name);
    return {
      gold: G.player.gold,
      equipped: G.player.equip.weapon,
      corpses: G.player.corpses.length,
      savedCorpses: saved.corpses.length,
      savedWeapon: saved.corpses[0].gear[0].item.id,
      savedGem: saved.corpses[0].gear[0].item.gems[0].id,
    };
  })).toEqual({ gold: 900, equipped: null, corpses: 1, savedCorpses: 1,
    savedWeapon: death.weapon, savedGem: death.gem });

  await panel.getByRole('button', { name: 'RISE AGAIN' }).click();
  await page.waitForFunction(() => G.map.town && !G.player.dead);
  expect(await page.evaluate(() => ({ deathReturn: G.portal.deathReturn,
    portalLabel: Game.interactables().find(entry => entry.kind === 'portal').label,
    localCorpses: Game.corpsesOnMap().length })))
    .toEqual({ deathReturn: true, portalLabel: 'Return to your corpse', localCorpses: 0 });

  const recovered = await page.evaluate(() => {
    Game.usePortal();
    const corpse = Game.corpsesOnMap()[0];
    const marker = Render.mapMarkers(G.map).find(entry => entry.kind === 'corpses');
    G.player.x = corpse.location.x; G.player.y = corpse.location.y;
    const result = Game.recoverCorpse(corpse.id);
    const saved = Save.loadChar(G.player.name);
    return {
      mapKey: Game.mapKey(G.map), marker: !!marker, result,
      weapon: G.player.equip.weapon.id, gem: G.player.equip.weapon.gems[0].id,
      corpses: G.player.corpses.length, savedCorpses: saved.corpses.length,
    };
  });
  expect(recovered.mapKey).toBe(death.mapKey);
  expect(recovered.marker).toBe(true);
  expect(recovered.result).toMatchObject({ ok: true, restored: 1, spilled: 0 });
  expect(recovered.weapon).toBe(death.weapon);
  expect(recovered.gem).toBe(death.gem);
  expect(recovered.corpses).toBe(0);
  expect(recovered.savedCorpses).toBe(0);
});

test('saved dungeon corpses relocate to town and full-inventory recovery stays atomic', async ({ page }) => {
  await game(page, 'Corpse Save');
  const state = await page.evaluate(() => {
    Game.enterDungeon(1, 2, 0); G.monsters = [];
    const first = Items.makeBaseItem(() => .5, Items.baseById('sword'), 0, 25, { skipQuality: true });
    first.id = 'first-corpse-sword'; G.player.equip.weapon = first;
    const captured = CorpseState.capture(G.player, Game.corpseLocation(G.map, 8.5, 9.5));
    Save.saveChar(G.player);
    const savedDungeon = Save.loadChar(G.player.name).corpses[0].location.kind;
    Game.loadGame(G.player.name, 0);
    const relocated = G.player.corpses[0];

    const backup = Items.makeBaseItem(() => .5, Items.baseById('sword'), 0, 25, { skipQuality: true });
    backup.id = 'backup-corpse-sword'; G.player.equip.weapon = backup;
    CorpseState.capture(G.player, Game.townCorpseLocation()); Game.arrangeTownCorpses();
    const replacement = Items.makeBaseItem(() => .5, Items.baseById('sword'), 0, 25, { skipQuality: true });
    replacement.id = 'replacement-sword'; G.player.equip.weapon = replacement;
    G.player.inv = [];
    for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++)
      G.player.inv.push({ id: `full-${col}-${row}`, type: 'ring', name: 'Packed Ring', rarity: 'common', _gx: col, _gy: row });
    G.player._invMigrated = true;
    const before = JSON.stringify({ equip: G.player.equip, inv: G.player.inv, corpses: G.player.corpses });
    const blocked = Game.recoverCorpse(captured.corpse.id);
    const after = JSON.stringify({ equip: G.player.equip, inv: G.player.inv, corpses: G.player.corpses });
    for (const id of ['full-0-0', 'full-0-1', 'full-0-2'])
      G.player.inv.splice(G.player.inv.findIndex(item => item.id === id), 1);
    const recovered = Game.recoverCorpse(captured.corpse.id);
    const spilled = G.player.inv.find(item => item.id === 'first-corpse-sword');
    return {
      savedDungeon, relocatedKind: relocated.location.kind, relocatedTown: relocated.location.town,
      townCount: Game.corpsesOnMap().length,
      blocked, atomic: before === after, recovered,
      equipped: G.player.equip.weapon.id, spilled: spilled && [spilled._gx, spilled._gy],
      remaining: G.player.corpses.map(corpse => corpse.gear[0].item.id),
    };
  });
  expect(state.savedDungeon).toBe('dungeon');
  expect(state.relocatedKind).toBe('town');
  expect(state.relocatedTown).toBe("Haven's Rest");
  expect(state.townCount).toBe(1);
  expect(state.blocked).toMatchObject({ ok: false, reason: 'inventory-full' });
  expect(state.atomic).toBe(true);
  expect(state.recovered).toMatchObject({ ok: true, restored: 0, spilled: 1 });
  expect(state.equipped).toBe('replacement-sword');
  expect(state.spilled).toEqual([0, 0]);
  expect(state.remaining).toEqual(['backup-corpse-sword']);
});

test('hardcore death remains permanent and never creates a recoverable corpse', async ({ page }) => {
  await game(page, 'Last Breath', true);
  const equipped = await page.evaluate(() => {
    G.player.gold = 777;
    const id = G.player.equip.weapon.id;
    G.onPlayerDeath();
    return id;
  });
  const panel = page.locator('#panel-death');
  await expect(panel).toBeVisible({ timeout: 3000 });
  await expect(panel).toContainText('Hardcore death is forever');
  expect(await page.evaluate(() => ({ deadForever: G.player.deadForever, gold: G.player.gold,
    equipped: G.player.equip.weapon.id, corpses: G.player.corpses.length,
    savedDead: Save.loadChar(G.player.name).dead })))
    .toEqual({ deadForever: true, gold: 777, equipped, corpses: 0, savedDead: true });
});
