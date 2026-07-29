const { test, expect } = require('@playwright/test');

test('a delayed skill keeps its attribution after another skill is cast', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready && WUI.set);

  const result = await page.evaluate(() => {
    Game.newGame('AttributionHero', 'elementalist', false);
    const player = G.player;
    const meteor = Object.values(SKILL_BY_ID).find(skill => skill.name === 'Meteor');
    const firebolt = Object.values(SKILL_BY_ID).find(skill => skill.name === 'Firebolt');
    player.skills[meteor.id] = 1;
    player.skills[firebolt.id] = 1;
    player.mp = player.derived.maxMp;

    const x = player.x + 1;
    const y = player.y;
    const monster = Ent.makeMonster('zombie', x, y);
    monster.maxHp = monster.hp = 100000;

    Ent.castSkill(player, meteor.id, x, y);
    const pendingSrc = G.pending[0].srcName;

    // Change the global legacy source before resolving the original cast.
    player.gcd = 0;
    Ent.castSkill(player, firebolt.id, x, y);
    G.projs.length = 0;
    G.pending[0].t = 0;
    Ent.updateWorld(0.01);

    return {
      pendingSrc,
      legacySrc: Ent._src,
      by: WUI.dps.fight && WUI.dps.fight.by,
    };
  });

  expect(result.pendingSrc).toBe('Meteor');
  expect(result.legacySrc).toBe('Firebolt');
  expect(result.by.Meteor).toBeGreaterThan(0);
  expect(result.by.Firebolt || 0).toBe(0);
});
