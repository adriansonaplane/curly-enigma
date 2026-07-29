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

test('legacy orthographic camera preference migrates to elevated perspective', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cam_v1', JSON.stringify({
    mode: 'iso', prefs: { iso: { zoom: 2.2, pitch: 0.22 }, third: { zoom: 1.9, pitch: 0.44 } },
  })));
  const errors = [];
  await openGame(page, errors);
  expect(await page.evaluate(() => ({
    mode: Cam.mode, zoom: Cam.prefs.elevated.zoom, pitch: Cam.prefs.elevated.pitch,
    thirdZoom: Cam.prefs.third.zoom, perspective: R3.cam === R3.perspCam,
  }))).toEqual({ mode: 'elevated', zoom: 1, pitch: 0.72, thirdZoom: 1.9, perspective: true });
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

test('production page excludes the disabled SDF actor experiment', async ({ page }) => {
  const errors = [];
  await openGame(page, errors);
  expect(await page.evaluate(() => ({ sdf: typeof SDFActorsExperimental, actors: typeof Actors3 })))
    .toEqual({ sdf: 'undefined', actors: 'object' });
  expect(errors).toEqual([]);
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

test('shadow quality changes update the live world without rebuilding it', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const map = Dungeon.generate({ actIdx: 0, depth: 1, seed: 8675309 });
    Game.clearWorld(); Game.loadMap(map); Render.onMap(map);
    Render.qualityMode = 'high'; Render.quality = 'high'; Render.fx.shadows = true;
    Render.frame(1 / 60, G.time);
    const group = World3.group;
    const enabled = {
      hero: World3.hero.castShadow,
      renderer: R3.renderer.shadowMap.enabled,
    };

    Render.qualityMode = 'low';
    Render.frame(1 / 60, G.time);
    if (broken) World3.hero.castShadow = true;
    return {
      enabled,
      disabled: {
        hero: World3.hero.castShadow,
        renderer: R3.renderer.shadowMap.enabled,
      },
      sameWorld: World3.group === group,
    };
  }, mutation === 'shadows');
  expect(result).toEqual({
    enabled: { hero: true, renderer: true },
    disabled: { hero: false, renderer: false },
    sameWorld: true,
  });
  expect(errors).toEqual([]);
});

test('light budget culls influence volumes and only reselects after meaningful movement', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(() => {
    const map = Dungeon.generate({ actIdx: 0, depth: 1, seed: 8675309 });
    Game.clearWorld(); Game.loadMap(map); Render.onMap(map);
    R3.maxLights = 8;
    // Add a source that remains inside the camera's long view pyramid but is
    // far beyond both the visible ground footprint and its own influence.
    const remoteSrc = { x: G.player.x - 180, y: G.player.y - 180, r: 2, lit: true };
    const remote = new THREE.PointLight(0xffffff, 0, remoteSrc.r * 1.6, 1.8);
    remote.position.set(remoteSrc.x, 1.1, remoteSrc.y);
    World3.group.add(remote);
    const remoteEntry = { light: remote, src: remoteSrc };
    World3.lights.push(remoteEntry);
    R3.lookAt(G.player.x, G.player.y); R3.updateCamera();
    World3.updateLights(G.time, G.player.x, G.player.y);
    const first = World3._lightSelection;
    const selected = first.selected.size;
    World3.updateLights(G.time + 0.1, G.player.x + 0.2, G.player.y + 0.2);
    const held = World3._lightSelection === first;
    const cold = World3.lights.find(e => first.selected.has(e));
    cold.src.lit = false;
    World3.updateLights(G.time + 0.2, G.player.x + 0.2, G.player.y + 0.2);
    return {
      selected,
      held,
      stateChanged: World3._lightSelection !== first,
      coldExcluded: !World3._lightSelection.selected.has(cold) && !cold.light.visible,
      remoteExcluded: !World3._lightSelection.selected.has(remoteEntry) && !remote.visible,
      visible: World3.lights.filter(e => e.light.visible).length,
    };
  });
  expect(result.selected).toBeLessThanOrEqual(8);
  expect(result.held).toBe(true);
  expect(result.stateChanged).toBe(true);
  expect(result.coldExcluded).toBe(true);
  expect(result.remoteExcluded).toBe(true);
  expect(result.visible).toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
});

test('ultra explicitly opts into twelve lights while high uses eight', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const budgets = await page.evaluate(() => {
    Render.qualityMode = 'high'; Render.frame(1 / 60, G.time);
    const high = R3.maxLights;
    Render.qualityMode = 'ultra'; Render.frame(1 / 60, G.time);
    return { high, ultra: R3.maxLights };
  });
  expect(budgets).toEqual({ high: 8, ultra: 12 });
  expect(errors).toEqual([]);
});

test('spatial batch experiment preserves instances and publishes its control', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(() => {
    const control = Render.configureSpatialBatches({ world: 0, props: 0 });
    const chunked = Render.configureSpatialBatches({ world: 12, props: 12, minProps: 1 });
    const boundsContainInstances = World3.batches.every(im => {
      const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        if (!im.geometry.boundingBox.containsPoint(point)) return false;
      }
      return !!im.geometry.boundingSphere && !im.geometry.boundingSphere.isEmpty();
    });
    Render.configureSpatialBatches({ world: 16, props: 16, minProps: 48 });
    return { control: control.instances, chunked: chunked.instances, boundsContainInstances };
  });
  expect(result.control.world.chunkSize).toBe(0);
  expect(result.control.props.chunkSize).toBe(0);
  expect(result.chunked.world.chunkSize).toBe(12);
  expect(result.chunked.props.chunkSize).toBe(12);
  expect(result.chunked.totalInstances).toBe(result.control.totalInstances);
  expect(result.chunked.calls).toBeGreaterThanOrEqual(result.control.calls);
  expect(result.boundsContainInstances).toBe(true);
  expect(errors).toEqual([]);
});

for (const mode of ['elevated', 'third']) {
  test(`movement is camera-relative in ${mode} mode`, async ({ page }) => {
    const errors = [];
    await openGame(page, errors); await startGame(page);
    const result = await page.evaluate(({ mode, broken }) => {
      Cam.setMode(mode); Cam.applyPrefs(true); R3.setMode(mode === 'third' ? R3.MODE_FREE : R3.MODE_ELEVATED);
      if (mode === 'third') { Cam.yaw = Cam.yawTarget = 1.1; R3.yaw = 1.1; }
      R3.lookAt(G.player.x, G.player.y);
      const basis = R3.screenBasis();
      const dx = basis.rx, dy = basis.rz;
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
      rings: FX3.rings.count,
      flashes: FX3.flashes.count,
      bolts: FX3.bolts.count,
    };
  }, mutation === 'combat');
  expect(result.particles).toBeGreaterThan(0);
  expect(result.rings).toBeGreaterThan(0);
  expect(result.flashes).toBeGreaterThan(0);
  expect(result.bolts).toBeGreaterThan(0);
});

test('maximum effects and markers stay bounded by instance categories', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(() => {
    const x = G.player.x, y = G.player.y;
    G.parts.length = 0; G.rings.length = 0; G.flashes.length = 0;
    G.bolts.length = 0; G.projs.length = 0;
    for (let i = 0; i < FX3.MAX; i++) G.parts.push({
      x, y, z: 8, life: 1, maxLife: 1, color: '#ffffff', size: 2,
      add: !!(i & 1), vx: 0, vy: 0, vz: 0, grav: 0,
    });
    for (let i = 0; i < FX3.RINGS; i++) G.rings.push({ x, y, r: 1, maxR: 2, t: 1, maxT: 1, color: '#fff' });
    for (let i = 0; i < FX3.FLASHES; i++) G.flashes.push({ x, y, r: 2, t: 1, maxT: 1, color: '#fff' });
    for (let i = 0; i < FX3.BOLTS; i++) G.bolts.push({ x, y, t: 1, maxT: 1, color: '#fff' });
    for (let i = 0; i < FX3.PROJS; i++) G.projs.push({ x, y, vx: 1, vy: 0, elem: 'phys', kind: i & 1 ? 'arrow' : 'orb' });
    G.groundItems = Array.from({ length: Render.MARKERS }, (_, i) => ({ x: x + i * 0.01, y, gold: true }));
    FX3.sync(G.time);
    const map = G.map; G.map = null; Render.syncMarkers(G.time); G.map = map;

    const keep = new Set([FX3.group, Render.markerColumns, Render.markerBeads]);
    const visibility = R3.scene.children.map(o => [o, o.visible]);
    for (const [o] of visibility) o.visible = keep.has(o);
    R3.renderer.info.reset(); R3.renderer.render(R3.scene, R3.cam);
    const calls = R3.renderer.info.render.calls;
    for (const [o, visible] of visibility) o.visible = visible;
    return {
      calls,
      counts: [FX3.rings.count, FX3.flashes.count, FX3.bolts.count,
        FX3.beads.count, FX3.shafts.count, Render.markerColumns.count, Render.markerBeads.count],
    };
  });
  expect(result.counts).toEqual([24, 16, 12, 64, 32, 48, 48]);
  // Nine logical batches; transparent DoubleSide categories may use two GPU passes.
  expect(result.calls).toBeLessThanOrEqual(14);
  expect(errors).toEqual([]);
});

test('damage numbers retain their screen-space overlay payload', async ({ page }) => {
  const errors = [];
  await openGame(page, errors); await startGame(page);
  const result = await page.evaluate(broken => {
    const drawn = [], fillText = Render.ctx.fillText;
    Render.ctx.fillText = function (text) { drawn.push(text); };
    UI.dmgNum(G.player.x, G.player.y, broken ? '' : '321', '#fff', false);
    Render.drawDamage(Render.ctx);
    Render.ctx.fillText = fillText;
    return { payload: G.dmgNums.at(-1).txt, drawn };
  }, mutation === 'damage-overlay');
  expect(result.payload).toBe('321');
  expect(result.drawn).toContain('321');
});
