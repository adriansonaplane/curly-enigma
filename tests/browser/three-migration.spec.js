const { test, expect } = require('@playwright/test');

const mutation = process.env.BREAK_PROBE || '';

async function openGame(page, errors) {
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
}

async function startGame(page, name = 'SmokeHero') {
  await page.evaluate(([hero, broken]) => {
    localStorage.clear();
    Game.newGame(hero, broken ? 'not-a-class' : 'warbringer', false);
  }, [name, mutation === 'character']);
  await page.waitForFunction(() => G.state === 'game' && Hero3.rig);
}

test('page boots WebGL and has no console errors', async ({ page }) => {
  const errors = [];
  await openGame(page, errors);
  if (mutation === 'boot') await page.evaluate(() => console.error('deliberate boot failure'));
  expect(await page.evaluate(() => ({ ready: R3.ready, renderer: R3.renderer instanceof THREE.WebGLRenderer })))
    .toEqual({ ready: true, renderer: true });
  expect(errors).toEqual([]);
});

test('character creation uses the real menu flow', async ({ page }) => {
  const errors = [];
  await openGame(page, errors);
  await page.click('#btn-new');
  await page.fill('#char-name', mutation === 'character' ? '' : 'BrowserHero');
  await page.locator('#class-cards .class-card').first().click();
  await page.click('#btn-create');
  await expect(page.locator('#menu-screen')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => ({ name: G.player.name, state: G.state, rig: !!Hero3.rig })))
    .toEqual({ name: 'BrowserHero', state: 'game', rig: true });
});

test('Ent.makeMonster creates a renderable real monster', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const m = Ent.makeMonster('zombie', G.player.x + 1, G.player.y, { mlvl: 3 });
    if (broken) delete m.fam;
    Actors3.sync([m], G.time);
    return { fam: m.fam, hasDef: m.def === MONSTERS.zombie, inWorld: G.monsters.includes(m), rig: !!m._rig };
  }, mutation === 'monster');
  expect(result).toEqual({ fam: 'zombie', hasDef: true, inWorld: true, rig: true });
});

test('hero and nearby actor rigs are visible in the Three.js scene', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const m = Ent.makeMonster('skeleton', G.player.x + 1, G.player.y + 1);
    Actors3.sync([m], G.time);
    if (broken) m._rig.visible = false;
    return {
      hero: Hero3.rig.visible && Hero3.rig.parent === R3.scene,
      monster: m._rig.visible && m._rig.parent === R3.scene,
      parts: m._rig.children.length > 0,
    };
  }, mutation === 'actors');
  expect(result).toEqual({ hero: true, monster: true, parts: true });
});

test('torch light and emissive instance transition through light and snuff', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const map = Dungeon.generate({ actIdx: 0, depth: 1, seed: 8675309 });
    Game.clearWorld(); Game.loadMap(map); Render.onMap(map);
    const light = map.lights.find(l => l.prop && l.lit === false);
    if (!light) throw new Error('seed produced no cold sconce');
    const slot = Props3.slot.get(light.prop);
    const emissive = slot.set.tmpl.findIndex(p => p.e > 0);
    const scale = () => {
      const m = new THREE.Matrix4(); slot.set.meshes[emissive].getMatrixAt(slot.i, m);
      return new THREE.Vector3().setFromMatrixScale(m).length();
    };
    G.nearLight = light;
    const cold = scale();
    Game.toggleLight();
    if (broken) { light.lit = false; light.prop.lit = false; Props3.refresh(light.prop); }
    World3.updateLights(G.time, light.x, light.y);
    const hot = scale(), intensity = World3.lights.find(e => e.src === light).light.intensity;
    G.nearLight = light; Game.toggleLight(); World3.updateLights(G.time, light.x, light.y);
    return { cold, hot, intensity, snuffed: scale(), lit: light.lit };
  }, mutation === 'torch');
  expect(result.cold).toBe(0);
  expect(result.hot).toBeGreaterThan(0);
  expect(result.intensity).toBeGreaterThan(0);
  expect(result.snuffed).toBe(0);
  expect(result.lit).toBe(false);
});

for (const mode of ['iso', 'third']) {
  test(`movement is camera-relative in ${mode} mode`, async ({ page }) => {
    const errors = [];
    await openGame(page, errors); await startGame(page);
    const result = await page.evaluate(({ mode, broken }) => {
      Cam.setMode(mode); Cam.applyPrefs(true); R3.setMode(mode === 'third' ? R3.MODE_FREE : R3.MODE_ISO);
      if (mode === 'third') { Cam.yaw = Cam.yawTarget = 1.1; R3.yaw = 1.1; }
      R3.lookAt(G.player.x, G.player.y);
      const basis = R3.screenBasis();
      const [dx, dy] = Cam.screenToWorldDir(1, 0);
      const dot = dx * basis.rx + dy * basis.rz;
      return broken ? -dot : dot;
    }, { mode, broken: mutation === `movement-${mode}` });
    expect(result).toBeGreaterThan(0.99);
  });
}

test('prop instance visibility transitions from present to hidden and back', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const prop = G.map.props.find(p => Props3.slot.has(p));
    const slot = Props3.slot.get(prop), mesh = slot.set.meshes[0], matrix = new THREE.Matrix4();
    const scale = () => { mesh.getMatrixAt(slot.i, matrix); return new THREE.Vector3().setFromMatrixScale(matrix).length(); };
    const shown = scale(); prop.destroyed = true; if (!broken) Props3.refresh(prop); const hidden = scale();
    prop.destroyed = false; Props3.refresh(prop); return { shown, hidden, restored: scale() };
  }, mutation === 'props');
  expect(result.shown).toBeGreaterThan(0);
  expect(result.hidden).toBe(0);
  expect(result.restored).toBeGreaterThan(0);
});

test('representative combat effects reach visible Three.js pools', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const x = G.player.x, y = G.player.y;
    FX.slash(x, y, 0, 1.7, '#ffffff'); FX.explosion(x, y, 2, '#ff6600'); FX.strike(x, y, '#66aaff');
    if (broken) { G.parts.length = 0; G.rings.length = 0; G.flashes.length = 0; G.bolts.length = 0; }
    FX3.sync(G.time);
    return {
      particles: FX3.add.geometry.drawRange.count + FX3.norm.geometry.drawRange.count,
      rings: FX3.rings.filter(m => m.visible).length,
      flashes: FX3.flashes.filter(m => m.visible).length,
      bolts: FX3.bolts.filter(m => m.visible).length,
    };
  }, mutation === 'combat');
  expect(result.particles).toBeGreaterThan(0);
  expect(result.rings).toBeGreaterThan(0);
  expect(result.flashes).toBeGreaterThan(0);
  expect(result.bolts).toBeGreaterThan(0);
});
