const { test, expect } = require('@playwright/test');

test('casters and summoners reposition instead of attacking through walls', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof Ent !== 'undefined' && typeof Game !== 'undefined');

  const results = await page.evaluate(() => {
    G.state = 'menu';

    const width = 10;
    const height = 10;
    const tiles = new Uint8Array(width * height).fill(TILE.FLOOR);
    for (let y = 0; y < height; y++) tiles[y * width + 4] = TILE.WALL;
    G.map = { w: width, h: height, t: tiles };
    G.player = { x: 6.5, y: 5.5, dead: false };

    return ['caster', 'summoner'].map(ai => {
      const monster = {
        x: 2.5, y: 5.5, size: 1, spd: 2, ai, elem: 'arc',
        dmgLo: 5, dmgHi: 10, hp: 20, maxHp: 20, lvl: 1,
        dir: 0, anim: 0, atkCd: 0, abilityCd: ai === 'caster' ? 0 : 1,
        attackT: 0, stunT: 0, debuffT: 0, debuffs: {}, hitT: 0,
        dead: false, aggro: true, ally: false, mods: [],
      };
      G.monsters = [monster];
      G.projs = [];

      const startX = monster.x;
      Ent.updateMonster(monster, 0.1);
      return {
        ai,
        movedTowardOpening: monster.x > startX,
        projectiles: G.projs.length,
        attackCooldown: ai === 'caster' ? monster.abilityCd : monster.atkCd,
      };
    });
  });

  for (const result of results) {
    expect(result.movedTowardOpening, `${result.ai} should reposition`).toBe(true);
    expect(result.projectiles, `${result.ai} should not attack through a wall`).toBe(0);
    expect(result.attackCooldown, `${result.ai} should preserve its ready attack`).toBeLessThanOrEqual(0);
  }
});
