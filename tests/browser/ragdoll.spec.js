const { test, expect } = require('@playwright/test');

async function startGame(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
  await page.evaluate(() => Game.newGame('RagdollHero', 'warbringer', false));
  await page.waitForFunction(() => G.state === 'game' && Hero3.rig);
}

test('a dead procedural actor consumes rag state, settles, fades, and retires', async ({ page }) => {
  await startGame(page);

  const state = await page.evaluate(() => {
    Actors3.clear();
    G.monsters = [];
    Physics.debris.length = 0;
    const worldMinY = object => {
      object.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(object).min.y;
    };
    // The captured regression was a foot-rooted brute, so exercise that exact
    // procedural archetype rather than a smaller humanoid.
    const m = Ent.makeMonster('goatman', G.player.x + 1, G.player.y, { mlvl: 3 });
    Actors3.sync(G.monsters, G.time);
    const rig = m._rig;
    const startPosition = rig.position.clone();
    const startRotation = rig.quaternion.clone();
    let sharedMaterial = null;
    rig.traverse(node => { if (!sharedMaterial && node.isMesh) sharedMaterial = node.material; });

    const random = U.rand;
    U.rand = () => 0.75;
    try {
      Ent.killMonster(m, { x: G.player.x, y: G.player.y });
    } finally {
      U.rand = random;
    }
    Actors3.sync(G.monsters, G.time);
    const retained = m._rig === rig && rig.parent === R3.scene && Actors3.pool.includes(m);
    const earlyGround = worldMinY(rig);
    const corpseMaterials = rig.userData.corpseMaterials;
    const isolatedFadeMaterial = corpseMaterials.length > 0
      && corpseMaterials[0].material !== sharedMaterial && sharedMaterial.opacity === 1;
    const untargetable = !Target.isAlive(m) && Ent.damageMonster(m, 100, 'phys') === 0;
    const goreLifeBounded = Physics.debris.length > 0
      && Physics.debris.every(d => d.life > 0 && d.life <= 1);

    let previousAngle = m.rag.ang, earlyAngularDelta = 0, cruisingAngularDelta = 0;
    for (let i = 0; i < 12; i++) {
      Ent.updateMonster(m, 1 / 60);
      Physics.step(1 / 60);
      const angularDelta = Math.abs(m.rag.ang - previousAngle);
      if (i === 0) earlyAngularDelta = angularDelta;
      if (i === 7) cruisingAngularDelta = angularDelta;
      previousAngle = m.rag.ang;
      Actors3.sync(G.monsters, G.time + (i + 1) / 60);
    }
    const midGround = worldMinY(rig);
    const corpsePose = rig.userData.corpsePose;
    const armOffsets = corpsePose && corpsePose.arms.map(base => Math.abs(base.part.rotation.x - base.x));
    const asymmetricPose = !!(armOffsets && armOffsets.length > 1
      && armOffsets[0] > 0.05 && armOffsets[1] > 0.05
      && Math.abs(armOffsets[0] - armOffsets[1]) > 0.02);
    const posedRotations = corpsePose && corpsePose.arms.map(base => base.part.rotation.x);
    Actors3.sync(G.monsters, G.time + 12 / 60);
    const poseDoesNotAccumulate = !!(posedRotations && posedRotations.every((x, i) =>
      Math.abs(x - corpsePose.arms[i].part.rotation.x) < 1e-10));
    const reacted = {
      translation: Math.hypot(rig.position.x - startPosition.x, rig.position.z - startPosition.z),
      lift: rig.position.y,
      rotation: startRotation.angleTo(rig.quaternion),
    };

    let lateGround = null;
    for (let i = 12; i < 52; i++) {
      Ent.updateMonster(m, 1 / 60);
      Physics.step(1 / 60);
      Actors3.sync(G.monsters, G.time + (i + 1) / 60);
      if (i === 41) lateGround = worldMinY(rig); // 700ms capture point
    }
    const settled = !!m.rag.settled && m.rag.spin === 0 && m.rag.vx === 0 && m.rag.vy === 0;
    const settledGround = worldMinY(rig);
    const fadedOpacity = rig.userData.corpseMaterials[0].material.opacity;
    const shadowsDisabled = rig.userData.corpseMeshes.every(mesh => !mesh.castShadow);

    // The normal world sweep owns entity removal; the render pool observes it
    // and disposes the event-only corpse materials in the same frame.
    Ent.updateWorld(0.1);
    Physics.step(0.1);
    Actors3.sync(G.monsters, G.time + 1);
    Physics.step(0.05);
    return {
      retained,
      isolatedFadeMaterial,
      untargetable,
      goreLifeBounded,
      goreRetired: Physics.debris.length === 0,
      corpseMaterials: corpseMaterials.length,
      reacted,
      ground: { early: earlyGround, mid: midGround, late: lateGround, settled: settledGround },
      angularEase: { early: earlyAngularDelta, cruising: cruisingAngularDelta, age: m.rag && m.rag.age },
      asymmetricPose,
      poseDoesNotAccumulate,
      settled,
      fadedOpacity,
      shadowsDisabled,
      entityRemoved: !G.monsters.includes(m),
      rigRemoved: m._rig === null && rig.parent === null,
      bodyRemoved: m.rag === null,
      poolSize: Actors3.pool.length,
    };
  });

  expect(state.retained).toBe(true);
  expect(state.isolatedFadeMaterial).toBe(true);
  expect(state.untargetable).toBe(true);
  expect(state.goreLifeBounded).toBe(true);
  expect(state.goreRetired).toBe(true);
  expect(state.corpseMaterials).toBeGreaterThan(0);
  expect(state.reacted.translation).toBeGreaterThan(0.05);
  expect(state.reacted.lift).toBeGreaterThan(0);
  expect(state.reacted.rotation).toBeGreaterThan(0.35);
  expect(state.ground.early).toBeGreaterThanOrEqual(-0.01);
  expect(state.ground.mid).toBeGreaterThanOrEqual(-0.01);
  expect(state.ground.late).toBeGreaterThanOrEqual(-0.01);
  expect(state.ground.settled).toBeGreaterThanOrEqual(-0.01);
  expect(state.angularEase.early).toBeGreaterThan(0);
  expect(state.angularEase.cruising).toBeGreaterThan(state.angularEase.early * 4);
  expect(state.asymmetricPose).toBe(true);
  expect(state.poseDoesNotAccumulate).toBe(true);
  expect(state.settled).toBe(true);
  expect(state.fadedOpacity).toBeGreaterThan(0);
  expect(state.fadedOpacity).toBeLessThan(0.2);
  expect(state.shadowsDisabled).toBe(true);
  expect(state.entityRemoved).toBe(true);
  expect(state.rigRemoved).toBe(true);
  expect(state.bodyRemoved).toBe(true);
  expect(state.poolSize).toBe(0);
});

test('minimum random spin still completes a grounded prone fall before cleanup', async ({ page }) => {
  await startGame(page);

  const state = await page.evaluate(() => {
    Actors3.clear();
    G.monsters = [];
    Physics.debris.length = 0;
    const worldMinY = object => {
      object.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(object).min.y;
    };
    const m = Ent.makeMonster('goatman', G.player.x + 1, G.player.y, { mlvl: 3 });
    Actors3.sync(G.monsters, G.time);

    const random = U.rand;
    U.rand = () => 0;
    try {
      Ent.killMonster(m, { x: G.player.x, y: G.player.y });
    } finally {
      U.rand = random;
    }
    Actors3.sync(G.monsters, G.time);
    let minimumGround = worldMinY(m._rig);
    for (let i = 0; i < 52; i++) {
      Ent.updateMonster(m, 1 / 60);
      Physics.step(1 / 60);
      Actors3.sync(G.monsters, G.time + (i + 1) / 60);
      minimumGround = Math.min(minimumGround, worldMinY(m._rig));
    }

    const final = {
      angle: m.rag.ang,
      fall: m.rag.fall,
      age: m.rag.age,
      settled: m.rag.settled,
      minimumGround,
      finalGround: worldMinY(m._rig),
      retainedUntilDeadline: m.deathT > 0 && m._rig.parent === R3.scene,
    };
    Ent.updateWorld(0.1);
    Actors3.sync(G.monsters, G.time + 1);
    final.cleaned = !G.monsters.includes(m) && m._rig === null && m.rag === null
      && Actors3.pool.length === 0;
    return final;
  });

  expect(Math.abs(state.angle)).toBeGreaterThanOrEqual(1.45);
  expect(Math.sign(state.angle)).toBe(Math.sign(state.fall));
  expect(state.age).toBeGreaterThanOrEqual(0.8);
  expect(state.settled).toBe(true);
  expect(state.minimumGround).toBeGreaterThanOrEqual(-0.01);
  expect(state.finalGround).toBeGreaterThanOrEqual(-0.01);
  expect(state.retainedUntilDeadline).toBe(true);
  expect(state.cleaned).toBe(true);
});

test('authored corpses share the pose path and repeated death waves stay bounded', async ({ page }) => {
  await startGame(page);

  const state = await page.evaluate(() => {
    Actors3.clear();
    G.monsters = [];
    const worldMinY = object => {
      object.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(object).min.y;
    };

    // Build the same normalized rigid root requestModel() supplies, then pass
    // it through the production authored-model instancer.
    const geometry = new THREE.BoxGeometry(0.6, 1.5, 0.4);
    const material = new THREE.MeshStandardMaterial({ color: 0x776655 });
    const template = new THREE.Group();
    const templateMesh = new THREE.Mesh(geometry, material);
    templateMesh.castShadow = true;
    template.add(templateMesh);
    template.userData.sourceHeight = 1.5;
    template.userData.minY = -0.75;
    template.userData.unitsPerMetre = 1;

    const authoredOwner = Ent.makeMonster('fallen', G.player.x + 1, G.player.y);
    Actors3.sync(G.monsters, G.time);
    const fallback = authoredOwner._rig;
    const authored = Actors3.instanceModel(template, {
      height: 1.5, animation: 'rigid', slug: 'ragdoll-contract',
    }, authoredOwner.def, authoredOwner.size);
    R3.scene.remove(fallback);
    authoredOwner._rig = authored;
    R3.scene.add(authored);
    const authoredStart = authored.quaternion.clone();
    authoredOwner.dead = true;
    authoredOwner.deathT = 0.6;
    authoredOwner.rag = {
      x: authoredOwner.x, y: authoredOwner.y, z: 8,
      vx: 0, vy: 0, vz: 0, ang: 0, spin: 0,
      dir: Math.PI / 2, fall: 1, rest: 0.2, settled: false, age: 0,
    };
    Actors3.sync(G.monsters, G.time);
    const authoredGround = { early: worldMinY(authored) };
    const authoredShadowBeforeFade = authored.userData.corpseMeshes.some(mesh => mesh.castShadow);
    authoredOwner.rag.ang = Math.PI / 3;
    authoredOwner.rag.age = 0.2;
    authoredOwner.deathT = 0.3;
    Actors3.sync(G.monsters, G.time);
    authoredGround.mid = worldMinY(authored);
    const authoredState = {
      tagged: authored.userData.authored === true && authored.userData.corpse === true,
      lift: authored.position.y,
      rotation: authoredStart.angleTo(authored.quaternion),
      faded: authored.userData.corpseMaterials.every(entry => entry.material.transparent),
      rootOnly: !authored.userData.corpsePose,
      shadowBeforeFade: authoredShadowBeforeFade,
    };
    authoredOwner.rag.ang = Math.PI / 2;
    authoredOwner.rag.z = 0;
    authoredOwner.rag.settled = true;
    authoredOwner.deathT = 0.1;
    Actors3.sync(G.monsters, G.time);
    authoredGround.settled = worldMinY(authored);
    authoredState.shadowsDisabled = authored.userData.corpseMeshes.every(mesh => !mesh.castShadow);
    authoredOwner.deathT = 0;
    G.monsters = [];
    Actors3.sync(G.monsters, G.time);
    const authoredRetired = authoredOwner._rig === null && authoredOwner.rag === null && authored.parent === null;
    geometry.dispose();
    material.dispose();

    const sceneBaseline = R3.scene.children.length;
    const owners = [];
    let maxPool = 0;
    for (let wave = 0; wave < 4; wave++) {
      for (let i = 0; i < 12; i++)
        owners.push(Ent.makeMonster('fallen', G.player.x + 1 + (i % 3) * 0.1,
          G.player.y + Math.floor(i / 3) * 0.1));
      Actors3.sync(G.monsters, G.time);
      for (const m of G.monsters) {
        m.dead = true;
        m.deathT = 0.05;
        Physics.ragdoll(m, 0, 1.4);
      }
      Actors3.sync(G.monsters, G.time);
      maxPool = Math.max(maxPool, Actors3.pool.length);
      Ent.updateWorld(0.06);
      Physics.step(0.06);
      Actors3.sync(G.monsters, G.time);
    }

    return {
      authoredState,
      authoredGround,
      authoredRetired,
      maxPool,
      finalPool: Actors3.pool.length,
      finalEntities: G.monsters.length,
      sceneBalanced: R3.scene.children.length === sceneBaseline,
      allRigsCleared: owners.every(m => m._rig === null),
      allBodiesCleared: owners.every(m => m.rag === null),
    };
  });

  expect(state.authoredState.tagged).toBe(true);
  expect(state.authoredState.lift).toBeGreaterThan(8 * (1 / 32));
  expect(state.authoredState.rotation).toBeGreaterThan(0.9);
  expect(state.authoredState.faded).toBe(true);
  expect(state.authoredState.rootOnly).toBe(true);
  expect(state.authoredState.shadowBeforeFade).toBe(true);
  expect(state.authoredState.shadowsDisabled).toBe(true);
  expect(state.authoredGround.early).toBeGreaterThanOrEqual(8 * (1 / 32) - 0.01);
  expect(state.authoredGround.mid).toBeGreaterThanOrEqual(8 * (1 / 32) - 0.01);
  expect(state.authoredGround.settled).toBeGreaterThanOrEqual(-0.01);
  expect(state.authoredRetired).toBe(true);
  expect(state.maxPool).toBe(12);
  expect(state.finalPool).toBe(0);
  expect(state.finalEntities).toBe(0);
  expect(state.sceneBalanced).toBe(true);
  expect(state.allRigsCleared).toBe(true);
  expect(state.allBodiesCleared).toBe(true);
});
