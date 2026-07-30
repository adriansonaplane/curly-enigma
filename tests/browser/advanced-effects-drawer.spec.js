const { test, expect } = require('@playwright/test');

const EFFECT_KEYS = ['advancedEffects', 'advancedParticles', 'advancedGeometry', 'ambientEffects'];
const CHILD_KEYS = EFFECT_KEYS.slice(1);

async function openVideo(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof WUI !== 'undefined' && WUI.set && FX3.ready);
  await page.evaluate(() => {
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('VIDEO');
    document.getElementById('menu-screen').classList.add('hidden');
    UI.open('settings');
  });
}

test.beforeEach(async ({ page }) => openVideo(page));

function effectToggle(page, key) {
  return page.locator(`.ws-drawer .ws-row[data-setting="${key}"] .ws-toggle`);
}

async function confirmToggle(page, key, expected) {
  const toggle = effectToggle(page, key);
  await toggle.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => page.evaluate(k => WUI.set[k], key)).toBe(expected);
  await expect(toggle).toHaveAttribute('aria-checked', String(expected));
}

async function watchCurrentResources(page) {
  return page.evaluate(() => {
    const group = FX3.group;
    const seen = new Set();
    const records = [];
    const watch = (resource, type) => {
      if (!resource || seen.has(resource) || typeof resource.addEventListener !== 'function') return;
      seen.add(resource);
      const record = { type, events: 0 };
      records.push(record);
      resource.addEventListener('dispose', () => { record.events++; });
    };
    group.traverse(object => {
      watch(object.geometry, 'geometry');
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials.filter(Boolean)) {
        watch(material, 'material');
        for (const uniform of Object.values(material.uniforms || {})) {
          const value = uniform && uniform.value;
          if (value && value.isTexture) watch(value, 'texture');
        }
      }
    });
    window.__fxLifecycle = { group, records };
    return records.reduce((counts, record) => {
      counts[record.type]++; counts.total++;
      return counts;
    }, { geometry: 0, material: 0, texture: 0, total: 0 });
  });
}

async function readWatchedTransition(page) {
  return page.evaluate(() => {
    const watched = window.__fxLifecycle;
    return {
      total: watched.records.length,
      disposedOnce: watched.records.filter(record => record.events === 1).length,
      wrongDisposeCount: watched.records.filter(record => record.events !== 1)
        .map(record => ({ type: record.type, events: record.events })),
      oldRemoved: watched.group.parent === null && !R3.scene.children.includes(watched.group),
      currentReplaced: FX3.group !== watched.group,
      currentAttached: FX3.group.parent === R3.scene && R3.scene.children.includes(FX3.group),
    };
  });
}

async function expectWatchedDisposal(page, watched) {
  const transition = await readWatchedTransition(page);
  expect(transition).toEqual({
    total: watched.total,
    disposedOnce: watched.total,
    wrongDisposeCount: [],
    oldRemoved: true,
    currentReplaced: true,
    currentAttached: true,
  });
}

async function effectState(page, key) {
  return page.evaluate(k => {
    const savedWui = JSON.parse(localStorage.getItem(WUI.SETK));
    const savedGraphics = JSON.parse(localStorage.getItem(GraphicsConfig.STORAGE_KEY));
    return {
      setting: WUI.set[k],
      config: GraphicsConfig.current[k],
      persistedWui: savedWui[k],
      persistedGraphics: savedGraphics.config[k],
      effective: FX3.stats()[k],
      groupChildren: FX3.group.children.length,
      points: !!FX3.add && !!FX3.norm,
      geometry: !!FX3.rings && !!FX3.flashes && !!FX3.bolts && !!FX3.beads && !!FX3.shafts,
    };
  }, key);
}

test('master switch disposes and recreates resources while children become truly inert', async ({ page }) => {
  const drawer = page.locator('.ws-drawer[data-setting="advancedEffects"]');
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toHaveAttribute('open', '');
  for (const key of EFFECT_KEYS)
    await expect(drawer.locator(`.ws-row[data-setting="${key}"]`)).toHaveCount(1);

  const advancedResources = await watchCurrentResources(page);
  expect(advancedResources.geometry).toBeGreaterThan(0);
  expect(advancedResources.material).toBeGreaterThan(0);
  expect(advancedResources.texture).toBeGreaterThan(0);

  await confirmToggle(page, 'advancedEffects', false);
  await expectWatchedDisposal(page, advancedResources);

  const off = await page.evaluate(childKeys => {
    const savedWui = JSON.parse(localStorage.getItem(WUI.SETK));
    const savedGraphics = JSON.parse(localStorage.getItem(GraphicsConfig.STORAGE_KEY));
    return {
      setting: WUI.set.advancedEffects,
      config: GraphicsConfig.current.advancedEffects,
      persistedWui: savedWui.advancedEffects,
      persistedGraphics: savedGraphics.config.advancedEffects,
      childPreferences: childKeys.map(key => [WUI.set[key], GraphicsConfig.current[key]]),
      stats: FX3.stats(),
      groupChildren: FX3.group.children.length,
    };
  }, CHILD_KEYS);
  expect(off.setting).toBe(false);
  expect(off.config).toBe(false);
  expect(off.persistedWui).toBe(false);
  expect(off.persistedGraphics).toBe(false);
  expect(off.childPreferences).toEqual([[true, true], [true, true], [true, true]]);
  expect(off.stats).toEqual({
    mode: 'simplified', advancedEffects: false, advancedParticles: false,
    advancedGeometry: false, ambientEffects: false, ready: true,
    customParticleShaders: false, gpuResources: 0,
  });
  expect(off.groupChildren).toBe(0);

  for (const key of CHILD_KEYS) {
    const row = drawer.locator(`.ws-row[data-setting="${key}"]`);
    const toggle = effectToggle(page, key);
    await expect(row).toHaveAttribute('inert', '');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).toHaveAttribute('tabindex', '-1');
  }

  // Neither synthetic clicks nor keyboard events may bypass the disabled state.
  const blocked = await page.evaluate(() => {
    const toggle = document.querySelector('.ws-row[data-setting="advancedGeometry"] .ws-toggle');
    const before = WUI.set.advancedGeometry;
    toggle.click();
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return { before, after: WUI.set.advancedGeometry, dialog: !!document.querySelector('.wui-confirm') };
  });
  expect(blocked).toEqual({ before: true, after: true, dialog: false });

  const emptyResources = await watchCurrentResources(page);
  expect(emptyResources).toEqual({ geometry: 0, material: 0, texture: 0, total: 0 });
  await confirmToggle(page, 'advancedEffects', true);
  await expectWatchedDisposal(page, emptyResources);

  const restored = await effectState(page, 'advancedEffects');
  expect(restored).toEqual({
    setting: true, config: true, persistedWui: true, persistedGraphics: true,
    effective: true, groupChildren: 7, points: true, geometry: true,
  });
  for (const key of CHILD_KEYS) {
    const row = drawer.locator(`.ws-row[data-setting="${key}"]`);
    const toggle = effectToggle(page, key);
    await expect(row).not.toHaveAttribute('inert', '');
    await expect(row).toHaveAttribute('aria-disabled', 'false');
    await expect(toggle).toHaveAttribute('aria-disabled', 'false');
    await expect(toggle).toHaveAttribute('tabindex', '0');
  }
});

test('each child switch independently persists, disposes, and reinitializes its effective resources', async ({ page }) => {
  const expectedOffTopology = {
    advancedParticles: { groupChildren: 7, points: true, geometry: true },
    advancedGeometry: { groupChildren: 2, points: true, geometry: false },
    ambientEffects: { groupChildren: 7, points: true, geometry: true },
  };

  for (const key of CHILD_KEYS) {
    const beforeOff = await watchCurrentResources(page);
    await confirmToggle(page, key, false);
    await expectWatchedDisposal(page, beforeOff);
    expect(await effectState(page, key)).toEqual({
      setting: false, config: false, persistedWui: false, persistedGraphics: false,
      effective: false, ...expectedOffTopology[key],
    });

    const beforeOn = await watchCurrentResources(page);
    await confirmToggle(page, key, true);
    await expectWatchedDisposal(page, beforeOn);
    expect(await effectState(page, key)).toEqual({
      setting: true, config: true, persistedWui: true, persistedGraphics: true,
      effective: true, groupChildren: 7, points: true, geometry: true,
    });
  }
});

async function probeProjectilePixels(page) {
  return page.evaluate(() => {
    const ctx = Render.ctx;
    const dpr = Render.dpr;
    const x = G.player.x + 0.35, y = G.player.y + 0.25;
    const analyze = projectile => {
      ctx.clearRect(0, 0, Render.W, Render.H);
      G.projs = [projectile];
      const drawn = Render.drawProjectileTelegraphs(ctx);
      const center = R3.worldToScreen(projectile.x, projectile.y, 0.55);
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const ahead = R3.worldToScreen(projectile.x + projectile.vx / speed * 0.45,
        projectile.y + projectile.vy / speed * 0.45, 0.55);
      const dx = ahead[0] - center[0], dy = ahead[1] - center[1];
      const length = Math.hypot(dx, dy) || 1, ex = dx / length, ey = dy / length;
      const radius = 24;
      const left = Math.max(0, Math.floor((center[0] - radius) * dpr));
      const top = Math.max(0, Math.floor((center[1] - radius) * dpr));
      const right = Math.min(Render.cv.width, Math.ceil((center[0] + radius) * dpr));
      const bottom = Math.min(Render.cv.height, Math.ceil((center[1] + radius) * dpr));
      const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
      const data = ctx.getImageData(left, top, width, height).data;
      let opaque = 0, elemental = 0;
      let minAlong = Infinity, maxAlong = -Infinity, minAcross = Infinity, maxAcross = -Infinity;
      for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        const offset = (py * width + px) * 4;
        if (data[offset + 3] < 16) continue;
        opaque++;
        if (data[offset] > data[offset + 1] * 1.25 && data[offset] > data[offset + 2] * 1.6) elemental++;
        const cssX = (left + px + 0.5) / dpr - center[0];
        const cssY = (top + py + 0.5) / dpr - center[1];
        const along = cssX * ex + cssY * ey;
        const across = -cssX * ey + cssY * ex;
        minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along);
        minAcross = Math.min(minAcross, across); maxAcross = Math.max(maxAcross, across);
      }
      return {
        drawn, opaque, elemental,
        alongSpan: maxAlong - minAlong,
        acrossSpan: maxAcross - minAcross,
      };
    };
    const arrow = analyze({ x, y, vx: 8, vy: 2, elem: 'phys', kind: 'arrow', ttl: 2 });
    const orb = analyze({ x, y, vx: -3, vy: 7, elem: 'fire', kind: 'orb', ttl: 2 });
    return {
      arrow, orb,
      diagnostic: Render.diagnosticSnapshot().effects.projectileTelegraphs,
      resources: FX3.group.children.length,
      advancedEffects: FX3.advancedEffects,
      advancedGeometry: FX3.advancedGeometry,
    };
  });
}

function expectVisibleProjectileTelegraph(probe, expectedResources, expectedMaster, expectedGeometry) {
  expect(probe.resources).toBe(expectedResources);
  expect(probe.advancedEffects).toBe(expectedMaster);
  expect(probe.advancedGeometry).toBe(expectedGeometry);
  expect(probe.arrow.drawn).toBe(1);
  expect(probe.arrow.opaque).toBeGreaterThan(30);
  expect(probe.arrow.alongSpan).toBeGreaterThan(probe.arrow.acrossSpan * 1.25);
  expect(probe.orb.drawn).toBe(1);
  expect(probe.orb.opaque).toBeGreaterThan(45);
  expect(probe.orb.elemental).toBeGreaterThan(10);
  expect(probe.diagnostic).toBe(1);
}

test('arrow and elemental orb remain pixel-visible in every advanced-effects mode', async ({ page }) => {
  await page.evaluate(() => {
    UI.closeAll();
    Game.newGame('FallbackProjectileHero', 'warbringer', false);
  });
  await page.waitForFunction(() => G.state === 'game' && Hero3.rig && Render.W > 0);
  await page.evaluate(() => {
    WUI.settingsTab = WUI.SETTINGS_TABS.indexOf('VIDEO');
    UI.open('settings');
  });

  expectVisibleProjectileTelegraph(await probeProjectilePixels(page), 7, true, true);

  await confirmToggle(page, 'advancedGeometry', false);
  expectVisibleProjectileTelegraph(await probeProjectilePixels(page), 2, true, false);

  await confirmToggle(page, 'advancedGeometry', true);
  await confirmToggle(page, 'advancedEffects', false);
  expectVisibleProjectileTelegraph(await probeProjectilePixels(page), 0, false, false);
});
