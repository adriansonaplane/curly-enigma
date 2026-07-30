const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready && typeof DifficultyState !== 'undefined');
}

async function reloadMenu(page) {
  await page.reload();
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready && document.querySelector('.char-slot'));
  await page.locator('.char-slot').click();
  await expect(page.locator('#difficulty-panel')).toBeVisible();
}

async function finishActFive(page) {
  await page.evaluate(() => {
    G.map = { actIdx: 4, bossKey: ACTS[4].boss, bossDead: false, town: false, name: 'Act V contract arena' };
    G.onBossKilled({ name: 'Act V boss' });
    Save.saveChar(G.player);
  });
}

test('Act V unlocks durable per-tier campaigns while preserving the hero', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    localStorage.clear();
    Game.newGame('Tierwalker', 'warbringer', false);
    const pl = G.player;
    pl.lvl = 42;
    pl.gold = 777;
    pl.equip.amulet = { id: 'difficulty-marker', name: 'Pilgrim Sigil', type: 'amulet', rarity: 'unique', stats: {} };
    Ent.computeDerived(pl);
    Save.saveChar(pl);
  });
  await page.waitForFunction(() => G.state === 'game');
  await finishActFive(page);

  await reloadMenu(page);
  const normal = page.locator('[data-difficulty="0"]');
  const nightmare = page.locator('[data-difficulty="1"]');
  const hell = page.locator('[data-difficulty="2"]');
  const hero = page.locator('.char-slot');
  await expect(normal).toBeEnabled();
  await expect(normal).toBeFocused();
  await expect(normal).toHaveAttribute('aria-current', 'true');
  await expect(nightmare).toBeEnabled();
  await expect(nightmare).toContainText('ENTER CAMPAIGN');
  await expect(hell).toHaveAttribute('aria-disabled', 'true');
  await expect(hell).toContainText('Defeat Act V on Nightmare to unlock');
  await hell.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#difficulty-panel')).toBeVisible();
  expect(await page.evaluate(() => G.state)).toBe('menu');

  await page.locator('#btn-difficulty-back').click();
  await expect(hero).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Delete Tierwalker' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(hero).toBeFocused();
  await page.setViewportSize({ width: 700, height: 320 });
  const originScroll = await page.evaluate(() => {
    const menu = document.getElementById('menu-screen');
    menu.scrollTop = Math.min(90, Math.max(0, menu.scrollHeight - menu.clientHeight));
    return menu.scrollTop;
  });
  expect(originScroll).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#difficulty-panel')).toBeVisible();
  await expect(normal).toBeFocused();
  await page.evaluate(() => {
    const menu = document.getElementById('menu-screen');
    menu.scrollTop = menu.scrollHeight;
  });
  await page.locator('#btn-difficulty-back').click();
  await expect(hero).toBeFocused();
  expect(await page.evaluate(() => document.getElementById('menu-screen').scrollTop)).toBe(originScroll);
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.keyboard.press('Enter');
  await expect(normal).toBeFocused();

  await nightmare.click();
  await page.waitForFunction(() => G.state === 'game' && G.player.difficultyIdx === 1);
  const nightmareState = await page.evaluate(() => {
    const pl = G.player;
    pl.equip.amulet.stats = {};
    Ent.computeDerived(pl);
    const baseFireRes = pl.derived.fireRes;
    const family = Object.keys(MONSTERS)[0];
    const monster = Ent.makeMonster(family, pl.x + 10, pl.y + 10, { mlvl: 5 });
    const ranked = {};
    for (const [offset, rank] of ['normal', 'champion', 'elite'].entries()) {
      const rankedMonster = Ent.makeMonster(family, pl.x + 20 + offset, pl.y + 20, { mlvl: 5, rank });
      ranked[rank] = { resist: rankedMonster.resist,
        armorMods: rankedMonster.mods.filter(mod => ELITE_MODS[mod].armor).length };
    }
    pl.equip.amulet.stats = { fireRes: 100 };
    Ent.computeDerived(pl);
    return {
      level: pl.lvl,
      gold: pl.gold,
      marker: pl.equip.amulet && pl.equip.amulet.id,
      selected: pl.difficultyIdx,
      currentAct: pl.progress.actUnlocked,
      currentKills: pl.progress.bossKilled,
      normalAct: pl.difficulty.campaigns[0].progress.actUnlocked,
      normalBoss: pl.difficulty.campaigns[0].progress.bossKilled[4],
      baseFireRes,
      overcapFireRes: pl.derived.fireRes,
      monsterLevel: monster.lvl,
      monsterResist: monster.resist,
      ranked,
      monsterHp: monster.maxHp,
      expectedHp: Math.floor(Ent.scaleHp(MONSTERS[family].hp, 35) * DIFFICULTIES[1].hpMult),
    };
  });
  expect(nightmareState).toMatchObject({
    level: 42, gold: 777, marker: 'difficulty-marker', selected: 1,
    currentAct: 0, currentKills: [false, false, false, false, false],
    normalAct: 5, normalBoss: true, baseFireRes: -40, overcapFireRes: 60, monsterLevel: 35,
    monsterResist: 0.2,
  });
  expect(nightmareState.monsterHp).toBe(nightmareState.expectedHp);
  expect(nightmareState.ranked.normal.resist).toBeCloseTo(0.2, 8);
  expect(nightmareState.ranked.champion.resist).toBeCloseTo(0.3, 8);
  expect(nightmareState.ranked.elite.resist).toBeCloseTo(0.35 + nightmareState.ranked.elite.armorMods * 0.2, 8);

  await page.evaluate(() => Save.saveChar(G.player));
  await reloadMenu(page);
  await normal.click();
  await page.waitForFunction(() => G.state === 'game' && G.player.difficultyIdx === 0);
  const normalState = await page.evaluate(() => {
    Ent.computeDerived(G.player);
    return {
      marker: G.player.equip.amulet && G.player.equip.amulet.id,
      act: G.player.progress.actUnlocked,
      boss: G.player.progress.bossKilled[4],
      nightmareAct: G.player.difficulty.campaigns[1].progress.actUnlocked,
      fireRes: G.player.derived.fireRes,
    };
  });
  expect(normalState).toEqual({ marker: 'difficulty-marker', act: 5, boss: true, nightmareAct: 0, fireRes: 75 });

  await page.evaluate(() => Save.saveChar(G.player));
  await reloadMenu(page);
  await nightmare.click();
  await page.waitForFunction(() => G.state === 'game' && G.player.difficultyIdx === 1);
  await finishActFive(page);
  await reloadMenu(page);
  await expect(page.locator('[data-difficulty="2"]')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-difficulty="2"]').click();
  await page.waitForFunction(() => G.state === 'game' && G.player.difficultyIdx === 2);
  const hellState = await page.evaluate(() => {
    G.player.equip.amulet.stats = {};
    Ent.computeDerived(G.player);
    const baseFireRes = G.player.derived.fireRes;
    const family = Object.keys(MONSTERS)[0];
    const ranked = {};
    for (const [offset, rank] of ['normal', 'champion', 'elite'].entries()) {
      const monster = Ent.makeMonster(family, G.player.x + 20 + offset, G.player.y + 20, { mlvl: 5, rank });
      ranked[rank] = { resist: monster.resist,
        armorMods: monster.mods.filter(mod => ELITE_MODS[mod].armor).length };
    }
    G.player.equip.amulet.stats = { fireRes: 100 };
    Ent.computeDerived(G.player);
    return {
      act: G.player.progress.actUnlocked,
      kills: G.player.progress.bossKilled,
      baseFireRes,
      overcapFireRes: G.player.derived.fireRes,
      ranked,
      unlocked: G.player.difficulty.unlocked,
      normalComplete: G.player.difficulty.campaigns[0].progress.bossKilled[4],
      nightmareComplete: G.player.difficulty.campaigns[1].progress.bossKilled[4],
      marker: G.player.equip.amulet && G.player.equip.amulet.id,
    };
  });
  expect(hellState).toMatchObject({
    act: 0, kills: [false, false, false, false, false], baseFireRes: -100, overcapFireRes: 0, unlocked: 2,
    normalComplete: true, nightmareComplete: true, marker: 'difficulty-marker',
  });
  expect(hellState.ranked.normal.resist).toBeCloseTo(0.4, 8);
  expect(hellState.ranked.champion.resist).toBeCloseTo(0.5, 8);
  expect(hellState.ranked.elite.resist).toBeCloseTo(0.55 + hellState.ranked.elite.armorMods * 0.2, 8);
});
