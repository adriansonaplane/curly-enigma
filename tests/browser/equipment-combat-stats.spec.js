const { test, expect } = require('@playwright/test');

async function startGame(page, cls = 'warbringer') {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(({ cls }) => {
    localStorage.clear();
    Game.newGame('EquipmentContract', cls, false);
  }, { cls });
  await page.waitForFunction(() => G.state === 'game');
}

test('Bonecrusher Litany aggregates duration and uses the fixed stun chance', async ({ page }) => {
  await startGame(page);

  const result = await page.evaluate(() => {
    const pl = G.player;
    const unique = UNIQUES.find(item => item.name === 'Bonecrusher Litany');
    pl.equip.weapon = Items.makeUnique(() => 0.5, unique);
    pl.equip.ring1 = { stats: { stunOnHit: 0.5 } };
    Ent.computeDerived(pl);

    const target = { stunT: 0 };
    const originalRand = U.rand;
    U.rand = () => 0.19;
    Ent.applyWeaponHitEffects(target, pl);
    const landed = target.stunT;
    target.stunT = 0;
    U.rand = () => 0.2;
    Ent.applyWeaponHitEffects(target, pl);
    U.rand = originalRand;

    return {
      duration: pl.derived.stunOnHit,
      landed,
      missed: target.stunT,
      tooltip: Items.tooltip(pl.equip.weapon, pl),
    };
  });

  expect(result.duration).toBe(1.5);
  expect(result.landed).toBe(1.5);
  expect(result.missed).toBe(0);
  expect(result.tooltip).toContain('20% Chance to Stun for 1 Second');
});

test('generated pierce set equipment affects weapon projectiles but not pure spells', async ({ page }) => {
  await startGame(page, 'windrunner');

  const result = await page.evaluate(() => {
    const pl = G.player;
    const set = SETS.find(entry => entry.id === 'set_wnd');
    const slots = ['weapon', 'helm', 'boots', 'amulet'];
    set.pieces.forEach((piece, index) => {
      pl.equip[slots[index]] = Items.makeSetPiece(() => 0.5, set, piece);
    });
    Ent.computeDerived(pl);

    G.projs.length = 0;
    pl.gcd = 0;
    Ent.basicAttack(pl, pl.x + 5, pl.y);
    const attack = G.projs[0];

    const spark = Object.values(SKILL_BY_ID).find(skill => skill.name === 'Spark');
    pl.skills[spark.id] = 1;
    pl.mp = pl.derived.maxMp;
    pl.gcd = 0;
    G.projs.length = 0;
    Ent.castSkill(pl, spark.id, pl.x + 5, pl.y);
    const spell = G.projs[0];

    return {
      derivedPierce: pl.derived.pierce,
      attack: { pierce: attack.pierce, weaponHit: attack.weaponHit },
      spell: { pierce: spell.pierce || 0, weaponHit: !!spell.weaponHit },
      tooltip: Items.tooltip(pl.equip.weapon, pl),
    };
  });

  expect(result.derivedPierce).toBe(2);
  expect(result.attack).toEqual({ pierce: 2, weaponHit: true });
  expect(result.spell).toEqual({ pierce: 0, weaponHit: false });
  expect(result.tooltip).toContain('Weapon Projectiles Pierce 2 Additional Targets');
});
