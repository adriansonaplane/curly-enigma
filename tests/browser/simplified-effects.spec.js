const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html?gfx.advancedEffects=false');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready && FX3.ready && WUI.set);
});

test('simplified effects allocate no custom particle shaders or optional meshes', async ({ page }) => {
  const state = await page.evaluate(() => ({
    config: GraphicsConfig.current.advancedEffects,
    ui: WUI.set.advancedEffects,
    stats: FX3.stats(),
    groupChildren: FX3.group.children.length,
    shaderMaterials: (() => {
      let count = 0;
      FX3.group.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        count += materials.filter(material => material && material.isShaderMaterial).length;
      });
      return count;
    })(),
    sheetsStarted: Assets.sheetsReady || Object.keys(Assets.sheets).length > 0,
    sync: FX3.sync(G.time),
  }));

  expect(state).toEqual({
    config: false,
    ui: false,
    stats: {
      mode: 'simplified', advancedEffects: false, advancedParticles: false,
      advancedGeometry: false, ambientEffects: false, ready: true,
      customParticleShaders: false, gpuResources: 0,
    },
    groupChildren: 0,
    shaderMaterials: 0,
    sheetsStarted: false,
    sync: { mode: 'simplified', parts: 0, add: 0, norm: 0, rings: 0, flashes: 0, bolts: 0, projs: 0 },
  });
});

test('simplified effects retain combat, hazard, and effect timing simulation', async ({ page }) => {
  const result = await page.evaluate(() => {
    Game.newGame('SimpleHero', 'warbringer', false);
    const monster = Ent.makeMonster('zombie', G.player.x + 1, G.player.y);
    const monsterHp = monster.hp;
    Ent.damageMonster(monster, 1, 'phys', { from: G.player });

    const tile = Math.floor(G.player.y) * G.map.w + Math.floor(G.player.x);
    G.map.town = false;
    G.map.haz[tile] = HAZ.LAVA;
    G.player.hazAcc = 0;
    const playerHp = G.player.hp;
    Ent.updateHazards(0.51);

    const before = G.parts.length;
    const life = before ? G.parts[0].life : 0;
    FX3.update(0.05);
    return {
      monsterDamaged: monster.hp < monsterHp,
      playerDamaged: G.player.hp < playerHp,
      particlesEmitted: before > 0,
      particleAdvanced: !G.parts.length || G.parts[0].life < life,
      mode: FX3.stats().mode,
    };
  });
  expect(result).toEqual({
    monsterDamaged: true,
    playerDamaged: true,
    particlesEmitted: true,
    particleAdvanced: true,
    mode: 'simplified',
  });
});
