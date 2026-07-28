const { test, expect } = require('@playwright/test');

// The elevated preset is not a second camera — it is the one camera with the
// player's inputs refused and a long lens fitted. These probes assert both
// halves, because both have already been wrong once: the lock leaked through
// Cam.orbit (middle-drag shoved the view and a per-frame re-pin yanked it
// back), and "isometric" was a pitch picked by eye rather than the geometry.
const BREAK = process.env.BREAK_PROBE;

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof R3 !== 'undefined' && R3.ready);
}

test('elevated and third person share one camera and one rig path', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    R3.setMode(R3.MODE_ELEVATED); const a = R3.cam;
    R3.setMode(R3.MODE_FREE);     const b = R3.cam;
    R3.setMode(R3.MODE_ELEVATED);
    return { same: a === b && a === R3.perspCam, ortho: R3.orthoCam !== undefined,
             branch: /this\.mode/.test(R3.updateCamera.toString()) };
  });
  expect(r.same).toBe(true);
  expect(r.ortho).toBe(false);
  // a mode branch in the rig maths is how a "preset" becomes a second camera
  expect(r.branch).toBe(false);
});

test('elevated approximates an isometric projection', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((brk) => {
    if (brk === 'iso') R3.PRESETS.elevated.fov = 48;   // mutation: short lens
    // Isometric means screen size does not vary with depth. Measure a 1-unit
    // vertical rod near and far and compare; 1.000 is a true parallel camera.
    const spread = (mode) => {
      R3.setMode(mode); R3.lookAt(0, 0); R3.updateCamera();
      const f = R3.screenBasis();
      const at = (d) => {
        const a = R3.worldToScreen(f.fx * d, f.fz * d, 0);
        const c = R3.worldToScreen(f.fx * d, f.fz * d, 1);
        return Math.abs(c[1] - a[1]);
      };
      return at(-12) / at(12);
    };
    const elevated = spread(R3.MODE_ELEVATED), free = spread(R3.MODE_FREE);
    R3.setMode(R3.MODE_ELEVATED);
    const P = R3.PRESETS.elevated;
    const frame = (fov, d) => 2 * d * Math.tan(fov * Math.PI / 360);
    return { elevated, free, yawDeg: P.yaw * 180 / Math.PI, pitchDeg: P.pitch * 180 / Math.PI,
             framing: frame(P.fov, P.dist) };
  }, BREAK);
  expect(r.elevated).toBeLessThan(1.4);
  expect(r.elevated).toBeLessThan(r.free);
  expect(r.yawDeg).toBeCloseTo(45, 2);
  // atan(1/sqrt 2): the actual isometric elevation, not a number chosen by eye
  expect(r.pitchDeg).toBeCloseTo(35.264, 2);
  // the long lens must not have re-framed the view (fov 48 at dist 30)
  expect(r.framing).toBeCloseTo(26.71, 1);
});

test('the elevated preset refuses every orbit and zoom input', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((brk) => {
    Cam.mode = 'elevated'; Cam.applyPrefs(true);
    R3.setMode(R3.MODE_ELEVATED); R3.updateCamera();
    // Snapshot BOTH layers. Checking only the rig hid a Cam-side leak: R3
    // refuses the orientation push, so Cam.yaw could drift while the rig held
    // still and the assertion stayed green. Cam.yaw is persisted and read by
    // other callers, so it has to be pinned in its own right.
    const snap = () => [R3.yaw, R3.pitch, R3.zoom, R3.dist,
                        Cam.yaw, Cam.yawTarget, Cam.pitchTarget, Cam.zoomTarget]
      .map(v => +v.toFixed(6)).join(',');
    const before = snap(), prefs = JSON.stringify(Cam.prefs);
    const tries = {
      r3Orbit: () => R3.orbit(0.9, 0.4), r3Zoom: () => R3.adjustZoom(0.5),
      r3Orient: () => R3.setOrientation(2, 1.2),
      camOrbit: () => brk === 'lock' ? (Cam.yawTarget += 0.9, false) : Cam.orbit(0.9, 0.4),
      camZoom: () => Cam.adjustZoom(0.5), camPitch: () => Cam.setPitch(1.2),
      camRotate: () => Cam.rotate(1),
    };
    const refused = {};
    for (const k in tries) refused[k] = tries[k]() === false;
    for (let i = 0; i < 90; i++) Cam.update(1 / 60, { x: 0, y: 0 });
    R3.setZoom(Cam.zoom); R3.setOrientation(Cam.yaw, Cam.pitch); R3.updateCamera();
    return { refused, stable: snap() === before, prefs: JSON.stringify(Cam.prefs) === prefs };
  }, BREAK);
  for (const k of Object.keys(r.refused)) expect(r.refused[k], k).toBe(true);
  expect(r.stable).toBe(true);
  // a refused input must not still write the preset to localStorage
  expect(r.prefs).toBe(true);
});

test('third person stays fully free and the preset restores exactly', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    R3.setMode(R3.MODE_ELEVATED); R3.updateCamera();
    const snap = () => [R3.yaw, R3.pitch, R3.zoom, R3.dist].map(v => +v.toFixed(6)).join(',');
    const preset = snap();
    Cam.mode = 'third'; Cam.applyPrefs(true);
    R3.setMode(R3.MODE_FREE);
    const allowed = R3.orbit(0.8, 0.2) && R3.adjustZoom(0.3) && Cam.orbit(0.5, 0.1) && Cam.rotate(1);
    const moved = snap() !== preset;
    R3.setMode(R3.MODE_ELEVATED); R3.updateCamera();
    return { allowed, moved, restored: snap() === preset };
  });
  expect(r.allowed).toBe(true);
  expect(r.moved).toBe(true);
  expect(r.restored).toBe(true);
});
