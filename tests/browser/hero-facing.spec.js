const { test, expect } = require('@playwright/test');

async function startGame(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(() => {
    localStorage.clear();
    Game.newGame('FacingHero', 'warbringer', false);
  });
  await page.waitForFunction(() => G.state === 'game' && Hero3.rig);
}

test('successful camera-relative movement updates hero facing during attacks', async ({ page }) => {
  await startGame(page);

  const samples = await page.evaluate(() => {
    Cam.setMode('third');
    Cam.applyPrefs(true);
    R3.setMode(R3.MODE_FREE);
    Cam.yaw = Cam.yawTarget = 0.83;
    R3.yaw = 0.83;
    R3.lookAt(G.player.x, G.player.y);

    const originalTryMove = Ent.tryMove;
    // Keep this regression deterministic and isolate heading from generated-map
    // obstacles. The real movement call still receives camera-relative deltas.
    Ent.tryMove = (actor, dx, dy) => { actor.x += dx; actor.y += dy; };
    const bindings = [
      ['up', WUI.keymap.moveU],
      ['right', WUI.keymap.moveR],
      ['down', WUI.keymap.moveD],
      ['left', WUI.keymap.moveL],
    ];
    const results = [];

    try {
      for (let i = 0; i < bindings.length; i++) {
        const [name, key] = bindings[i];
        Game.keys = {};
        Game.keys[key] = true;
        G.player.attackT = i === 1 ? 0.3 : 0;
        const oldX = G.player.x, oldY = G.player.y;
        Game.update(1 / 60);
        const dx = G.player.x - oldX, dy = G.player.y - oldY;
        const expected = Math.atan2(dy, dx);
        Hero3.sync(G.player, G.time);
        results.push({
          name,
          attackActive: G.player.attackT > 0,
          displaced: Math.hypot(dx, dy),
          expected,
          player: G.player.dir,
          rig: Hero3.rig.rotation.y,
        });
      }
    } finally {
      Game.keys = {};
      Ent.tryMove = originalTryMove;
    }
    return results;
  });

  expect(samples).toHaveLength(4);
  expect(samples.some(sample => sample.attackActive)).toBe(true);
  for (const sample of samples) {
    expect(sample.displaced, `${sample.name} displaced`).toBeGreaterThan(0);
    expect(sample.player, `${sample.name} player heading`).toBeCloseTo(sample.expected, 10);
    expect(sample.rig, `${sample.name} rig heading`)
      .toBeCloseTo(Math.PI / 2 - sample.expected, 10);
  }
  expect(new Set(samples.map(sample => sample.player.toFixed(6))).size).toBe(4);
  expect(new Set(samples.map(sample => sample.rig.toFixed(6))).size).toBe(4);
});
