const { test, expect } = require('@playwright/test');

async function game(page, name = 'Condition Runner') {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(name => {
    localStorage.clear();
    Game.newGame(name, 'warbringer', false);
  }, name);
  await page.waitForFunction(() => G.state === 'game');
}

test('landed actions wear once and broken gear loses every gameplay contribution while staying visible', async ({ page }) => {
  await game(page);
  const state = await page.evaluate(() => {
    const make = (type, id, tier = 0) => {
      const item = Items.makeBaseItem(() => 0.5, Items.baseById(type), tier, Math.max(1, tier * 12), { skipQuality: true });
      item.id = id;
      item.name = id.replace(/-/g, ' ');
      item.stats = {};
      return ItemCondition.canonicalize(item);
    };
    const target = (x, y) => ({ x, y, size: 1, ally: false, dead: false, defense: 0, hp: 500, stunT: 0, debuffs: {}, mods: [] });
    const pl = G.player;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    pl.inv = [];
    pl._invMigrated = true;

    const sword = make('sword', 'condition-melee');
    sword.stats = { str: 10, dmgFlat: 7 };
    sword.sockets = 1;
    sword.gems = [Items.makeGem('ruby', 'perfect')];
    sword.gems[0].id = 'condition-ruby';
    sword.durability = 3;
    pl.equip.weapon = sword;
    const fullSwordDerived = Ent.computeDerived(pl);
    const fullSword = {
      str: fullSwordDerived.str,
      fire: fullSwordDerived.flatElem.fire,
      rate: fullSwordDerived.atkRate,
      damage: Ent.weaponDmg(pl).slice(),
    };

    const originalDamageMonster = Ent.damageMonster;
    const originalHitCheck = Ent.rollHitCheck;
    const originalRand = U.rand;
    Ent.damageMonster = () => 1;
    Ent.rollHitCheck = () => true;
    U.rand = () => 0;

    const wear = { start: sword.durability };
    G.monsters = [target(pl.x + 1, pl.y), target(pl.x + 1, pl.y + 0.1)];
    pl.gcd = 0;
    Ent.basicAttack(pl, pl.x + 1, pl.y);
    wear.multiTarget = sword.durability;

    G.monsters = [];
    pl.gcd = 0;
    Ent.basicAttack(pl, pl.x + 8, pl.y);
    wear.noTarget = sword.durability;

    G.monsters = [target(pl.x + 1, pl.y)];
    Ent.rollHitCheck = () => false;
    pl.gcd = 0;
    Ent.basicAttack(pl, pl.x + 1, pl.y);
    wear.miss = sword.durability;

    sword.durability = 1;
    Ent.rollHitCheck = () => true;
    G.monsters = [target(pl.x + 1, pl.y), target(pl.x + 1, pl.y + 0.1)];
    pl.gcd = 0;
    Ent.basicAttack(pl, pl.x + 1, pl.y);
    wear.broken = sword.durability;
    const brokenSwordDerived = pl.derived;
    const brokenSword = {
      str: brokenSwordDerived.str,
      fire: brokenSwordDerived.flatElem.fire,
      rate: brokenSwordDerived.atkRate,
      damage: Ent.weaponDmg(pl).slice(),
      stillEquipped: pl.equip.weapon === sword,
    };

    // Drive two real projectile collisions through one shared action token.
    const bow = make('crossbow', 'condition-projectile');
    bow.durability = 4;
    pl.equip.weapon = bow;
    Ent.computeDerived(pl);
    const bowRange = Ent.skillRange(null, pl);
    const bowRate = pl.derived.atkRate;
    const first = target(pl.x, pl.y), second = target(pl.x, pl.y);
    G.monsters = [first, second];
    const projectile = {
      x: pl.x, y: pl.y, vx: 0, vy: 0, dmg: 10, elem: 'phys', ally: true, from: pl,
      r: 0.3, ttl: 1, pierce: 1, crit: false, weaponHit: true, conditionUse: Ent.weaponUse(pl), srcName: 'Condition test',
    };
    Ent.updateProjectile(projectile, 0);
    const afterFirstImpact = bow.durability;
    first.dead = true;
    projectile.x = second.x;
    projectile.y = second.y;
    Ent.updateProjectile(projectile, 0);
    const afterSecondImpact = bow.durability;
    bow.durability = 0;
    Ent.computeDerived(pl);
    const brokenBow = { range: Ent.skillRange(null, pl), rate: pl.derived.atkRate, stillEquipped: pl.equip.weapon === bow };

    const helm = make('helm', 'condition-set-helm');
    const chest = make('chest', 'condition-set-chest');
    helm.setId = chest.setId = 'set_war';
    pl.equip.helm = helm;
    pl.equip.chest = chest;
    const setFullHp = Ent.computeDerived(pl).maxHp;
    chest.durability = 0;
    const setBrokenHp = Ent.computeDerived(pl).maxHp;

    const shield = make('shield', 'condition-shield');
    shield.armor = 75;
    pl.equip.offhand = shield;
    const shieldFull = Ent.computeDerived(pl);
    const fullShield = { armor: shieldFull.armor, block: shieldFull.blockChance };
    shield.durability = 0;
    const shieldBroken = Ent.computeDerived(pl);
    const brokenShield = { armor: shieldBroken.armor, block: shieldBroken.blockChance };

    const boots = make('boots', 'condition-inventory-boots');
    boots.durability = 0;
    boots._gx = 0;
    boots._gy = 0;
    pl.inv = [boots];
    helm.durability = Math.max(1, Math.floor(helm.maxDurability * 0.2));

    Ent.damageMonster = originalDamageMonster;
    Ent.rollHitCheck = originalHitCheck;
    U.rand = originalRand;
    UI.open('inv');
    UI.updateHUD();
    return {
      wear,
      projectile: { start: 4, afterFirstImpact, afterSecondImpact },
      fullSword,
      brokenSword,
      bow: { fullRange: bowRange, fullRate: bowRate, brokenRange: brokenBow.range, brokenRate: brokenBow.rate, stillEquipped: brokenBow.stillEquipped },
      setHp: { full: setFullHp, broken: setBrokenHp },
      shield: { full: fullShield, broken: brokenShield },
    };
  });

  expect(state.wear).toEqual({ start: 3, multiTarget: 2, noTarget: 2, miss: 2, broken: 0 });
  expect(state.projectile).toEqual({ start: 4, afterFirstImpact: 3, afterSecondImpact: 3 });
  expect(state.brokenSword.stillEquipped).toBe(true);
  expect(state.fullSword.str).toBeGreaterThan(state.brokenSword.str);
  expect(state.fullSword.fire).toBeGreaterThan(state.brokenSword.fire);
  expect(state.fullSword.damage).not.toEqual([1, 3]);
  expect(state.brokenSword.damage).toEqual([1, 3]);
  expect(state.fullSword.rate).not.toBe(state.brokenSword.rate);
  expect(state.bow.fullRange).toBeGreaterThan(state.bow.brokenRange);
  expect(state.bow.fullRate).not.toBe(state.bow.brokenRate);
  expect(state.bow.stillEquipped).toBe(true);
  expect(state.setHp.full - state.setHp.broken).toBeGreaterThanOrEqual(60);
  expect(state.shield.full.armor).toBeGreaterThan(state.shield.broken.armor);
  expect(state.shield.full.block).toBeGreaterThan(0);
  expect(state.shield.broken.block).toBe(0);

  const equipped = page.getByTestId('socket-target-equip-weapon');
  await expect(equipped).toHaveClass(/item-broken/);
  await expect(equipped).toHaveAttribute('aria-label', /\(broken\)$/);
  await equipped.hover();
  await expect(page.locator('#tooltip')).toContainText('Durability: 0 of');
  await expect(page.locator('#tooltip')).toContainText('BROKEN — grants no bonuses while equipped.');
  const inventory = page.getByTestId('inventory-item-condition-inventory-boots');
  await expect(inventory).toHaveClass(/item-broken/);
  await expect(inventory).toHaveAttribute('aria-label', /\(broken\)$/);
  const lowHelm = page.getByTestId('socket-target-equip-helm');
  await expect(lowHelm).toHaveClass(/item-low/);
  await expect(lowHelm).toHaveAttribute('aria-label', /low durability, \d+ of \d+/);
  const inventoryHud = page.locator('#hud-buttons [data-panel="inv"]');
  await expect(inventoryHud).toHaveClass(/condition-broken/);
  await expect(inventoryHud).toHaveAttribute('aria-label', /broken equipped item/);

  await page.evaluate(() => UI.open('char'));
  const paperdoll = page.locator('#panel-char .pd-slot[data-slot="weapon"]');
  await expect(paperdoll).toHaveClass(/item-broken/);
  await expect(paperdoll).toHaveAttribute('aria-label', /\(broken\)$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => UI.open('inv'));
  const mobileWeapon = page.getByTestId('socket-target-equip-weapon');
  await mobileWeapon.focus();
  await expect(mobileWeapon).toHaveAttribute('aria-describedby', 'tooltip');
  await expect(page.locator('#tooltip')).toBeVisible();
  const tooltipBounds = await page.evaluate(() => {
    const rect = document.getElementById('tooltip').getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(tooltipBounds.left).toBeGreaterThanOrEqual(0);
  expect(tooltipBounds.right).toBeLessThanOrEqual(tooltipBounds.width);
  expect(tooltipBounds.top).toBeGreaterThanOrEqual(0);
  expect(tooltipBounds.bottom).toBeLessThanOrEqual(tooltipBounds.height);
  expect(tooltipBounds.scrollWidth).toBe(tooltipBounds.width);
});

test('physical block wears only the shield and accepted hits rotate exactly one armor slot', async ({ page }) => {
  await game(page, 'Condition Defender');
  const state = await page.evaluate(() => {
    const make = (type, id) => {
      const item = Items.makeBaseItem(() => 0.5, Items.baseById(type), 0, 1, { skipQuality: true });
      item.id = id;
      item.stats = {};
      return ItemCondition.canonicalize(item);
    };
    const pl = G.player;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const helm = make('helm', 'wear-helm');
    const chest = make('chest', 'wear-chest');
    const shield = make('shield', 'wear-shield');
    pl.equip.helm = helm;
    pl.equip.chest = chest;
    pl.equip.offhand = shield;
    pl.conditionWearCursor = 0;
    pl.dead = false;
    Ent.computeDerived(pl);
    pl.hp = pl.derived.maxHp;

    const originalTown = G.map.town;
    const originalRand = U.rand;
    G.map.town = false;
    U.rand = () => 0;
    pl.blockCd = 0;
    pl.derived.blockChance = 100;
    const beforeBlock = { hp: pl.hp, helm: helm.durability, chest: chest.durability, shield: shield.durability };
    Ent.damagePlayer(25, 'phys', { lvl: 1, x: pl.x + 10, y: pl.y, dead: false });
    const afterBlock = { hp: pl.hp, helm: helm.durability, chest: chest.durability, shield: shield.durability };

    pl.blockCd = 0;
    pl.derived.blockChance = 0;
    const beforeHit = { hp: pl.hp, helm: helm.durability, chest: chest.durability, shield: shield.durability, cursor: pl.conditionWearCursor };
    Ent.damagePlayer(25, 'phys', { lvl: 1, x: pl.x + 10, y: pl.y, dead: false });
    const afterHit = { hp: pl.hp, helm: helm.durability, chest: chest.durability, shield: shield.durability, cursor: pl.conditionWearCursor };

    U.rand = originalRand;
    G.map.town = originalTown;
    return { beforeBlock, afterBlock, beforeHit, afterHit };
  });

  expect(state.afterBlock.hp).toBe(state.beforeBlock.hp);
  expect(state.afterBlock.shield).toBe(state.beforeBlock.shield - 1);
  expect(state.afterBlock.helm).toBe(state.beforeBlock.helm);
  expect(state.afterBlock.chest).toBe(state.beforeBlock.chest);
  expect(state.beforeHit.cursor).toBe(0);
  expect(state.afterHit.hp).toBeLessThan(state.beforeHit.hp);
  expect(state.afterHit.helm).toBe(state.beforeHit.helm - 1);
  expect(state.afterHit.chest).toBe(state.beforeHit.chest);
  expect(state.afterHit.shield).toBe(state.beforeHit.shield);
  expect(state.afterHit.cursor).toBe(1);
  const totalArmorLoss = (state.beforeHit.helm - state.afterHit.helm) +
    (state.beforeHit.chest - state.afterHit.chest) + (state.beforeHit.shield - state.afterHit.shield);
  expect(totalArmorLoss).toBe(1);
});

test('Korga quotes exact owned repairs, commits Repair All atomically, persists it, and exposes honest shortfalls', async ({ page }) => {
  await game(page, 'Condition Customer');
  const setup = await page.evaluate(() => {
    const make = (type, id, name, price, missing, ethereal = false) => {
      const item = Items.makeBaseItem(() => 0.5, Items.baseById(type), 1, 15, { skipQuality: true });
      item.id = id;
      item.name = name;
      item.stats = {};
      item.price = price;
      item.ethereal = ethereal;
      ItemCondition.canonicalize(item);
      item.durability = item.maxDurability - missing;
      return item;
    };
    const pl = G.player;
    for (const slot of Object.keys(pl.equip)) pl.equip[slot] = null;
    const hero = make('sword', 'repair-hero', 'Scarred Hero Blade', 480, 12);
    const inventory = make('helm', 'repair-inventory', 'Dented Pack Helm', 360, 9);
    inventory._gx = 0;
    inventory._gy = 0;
    const mercenary = make('chest', 'repair-mercenary', 'Battered Hireling Plate', 620, 15);
    const stash = make('boots', 'repair-stash', 'Roadworn Stash Boots', 280, 7);
    const ethereal = make('shield', 'repair-ethereal', 'Fading Ethereal Guard', 900, 11, true);
    const corpse = make('gloves', 'repair-corpse', 'Unrecovered Grave Grips', 410, 8);

    pl.equip.weapon = hero;
    pl.equip.offhand = ethereal;
    pl.inv = [inventory];
    pl._invMigrated = true;
    const mercId = Object.keys(MERCENARY_BY_ID)[0];
    pl.mercenary = { archetypeId: mercId, level: 1, xp: 0, dead: false, equipment: { chest: mercenary } };
    G.stash = [stash];
    pl.corpses = [{ id: 'repair-unresolved-corpse', version: CorpseState.VERSION,
      location: { kind: 'town', town: G.map.name, x: pl.x + 2, y: pl.y },
      gear: [{ slot: 'gloves', item: corpse }] }];
    Ent.computeDerived(pl);

    const catalog = UI.smithRepairCatalog(pl);
    pl.gold = catalog.cost + 137;
    const entries = catalog.entries.map(entry => {
      const record = catalog.ownedById.get(entry.id);
      return Object.assign({}, entry, { name: record.item.name });
    });
    const excludedBefore = { ethereal: ethereal.durability, corpse: corpse.durability };
    UI.open('vendor');
    return { entries, total: catalog.cost, gold: pl.gold, excludedBefore };
  });

  const section = page.getByTestId('smith-repairs');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Ethereal items can wear and break, but cannot be repaired.');
  await expect(section.locator('[data-testid^="repair-row-"]')).toHaveCount(setup.entries.length);
  await expect(page.getByTestId('repair-row-repair-ethereal')).toHaveCount(0);
  await expect(page.getByTestId('repair-row-repair-corpse')).toHaveCount(0);
  for (const entry of setup.entries) {
    const row = page.getByTestId(`repair-row-${entry.id}`);
    await expect(row).toHaveAttribute('data-item-id', entry.id);
    await expect(row).toContainText(entry.name);
    await expect(row).toContainText(`Condition ${entry.durability} / ${entry.maxDurability}`);
    const button = page.getByTestId(`repair-item-${entry.id}`);
    await expect(button).toHaveAttribute('data-repair-cost', String(entry.cost));
    await expect(button).toHaveAttribute('aria-label', new RegExp(`for ${entry.cost} gold$`));
    await expect(button).toBeEnabled();
  }
  const repairAll = page.getByTestId('repair-all');
  await expect(repairAll).toHaveAttribute('data-repair-cost', String(setup.total));
  await expect(repairAll).toHaveAttribute('aria-label', `Repair all ${setup.entries.length} damaged items for ${setup.total} gold`);
  await expect(repairAll).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.smith-repair-row')).map(row => {
      const rr = row.getBoundingClientRect(), br = row.querySelector('.smith-repair-one').getBoundingClientRect();
      return { rowTop: rr.top, rowBottom: rr.bottom, buttonTop: br.top, buttonBottom: br.bottom };
    });
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, rows };
  });
  expect(mobileLayout.scrollWidth).toBe(mobileLayout.width);
  for (let index = 0; index < mobileLayout.rows.length; index++) {
    const row = mobileLayout.rows[index];
    expect(row.buttonTop).toBeGreaterThanOrEqual(row.rowTop);
    expect(row.buttonBottom).toBeLessThanOrEqual(row.rowBottom);
    if (index + 1 < mobileLayout.rows.length)
      expect(row.rowBottom).toBeLessThanOrEqual(mobileLayout.rows[index + 1].rowTop);
  }
  await repairAll.click();
  await expect(section).toContainText('No repairable equipment is damaged.');

  const repaired = await page.evaluate(() => {
    const pl = G.player;
    const live = [pl.equip.weapon, pl.inv[0], pl.mercenary.equipment.chest, G.stash[0]];
    const saved = Save.loadChar(pl.name);
    const savedStash = JSON.parse(localStorage.getItem(Save.STASH) || '[]');
    const savedItems = [saved.equip.weapon, saved.inv[0], saved.mercenary.equipment.chest, savedStash[0]];
    return {
      gold: pl.gold,
      live: live.map(item => ({ id: item.id, durability: item.durability, max: item.maxDurability })),
      savedGold: saved.gold,
      saved: savedItems.map(item => ({ id: item.id, durability: item.durability, max: item.maxDurability })),
      ethereal: pl.equip.offhand.durability,
      corpse: pl.corpses[0].gear[0].item.durability,
      savedEthereal: saved.equip.offhand.durability,
      savedCorpse: saved.corpses[0].gear[0].item.durability,
    };
  });
  expect(repaired.gold).toBe(setup.gold - setup.total);
  expect(repaired.savedGold).toBe(repaired.gold);
  for (const item of repaired.live) expect(item.durability).toBe(item.max);
  for (const item of repaired.saved) expect(item.durability).toBe(item.max);
  expect(repaired.ethereal).toBe(setup.excludedBefore.ethereal);
  expect(repaired.corpse).toBe(setup.excludedBefore.corpse);
  expect(repaired.savedEthereal).toBe(setup.excludedBefore.ethereal);
  expect(repaired.savedCorpse).toBe(setup.excludedBefore.corpse);

  const shortfall = await page.evaluate(() => {
    const item = G.player.equip.weapon;
    item.durability = item.maxDurability - 5;
    G.player.gold = 0;
    UI.renderVendor();
    const catalog = UI.smithRepairCatalog(G.player);
    return { cost: catalog.cost, before: { gold: G.player.gold, durability: item.durability } };
  });
  await expect(page.getByTestId('repair-all')).toBeDisabled();
  await expect(page.getByTestId('repair-item-repair-hero')).toBeDisabled();
  await expect(page.getByTestId('repair-all-shortfall')).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('repair-all-shortfall')).toContainText(`Need ${shortfall.cost} more gold for Repair All`);
  const unchanged = await page.evaluate(() => {
    const item = G.player.equip.weapon;
    const before = JSON.stringify({ gold: G.player.gold, durability: item.durability });
    document.querySelector('[data-testid="repair-all"]').click();
    const after = JSON.stringify({ gold: G.player.gold, durability: item.durability });
    return { before, after };
  });
  expect(unchanged.after).toBe(unchanged.before);
  expect(JSON.parse(unchanged.after)).toEqual(shortfall.before);
});
