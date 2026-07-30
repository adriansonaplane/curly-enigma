const { test, expect } = require('@playwright/test');

async function openRenderer(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof Render !== 'undefined' && Render.mmCtx);
}

test('camera-up minimap rotates world content around the centred player', async ({ page }) => {
  await openRenderer(page);
  const colors = await page.evaluate(() => {
    const old = { map: G.map, player: G.player, monsters: G.monsters, npcs: G.npcs,
      portalOnMap: G.portalOnMap, yaw: R3.yaw };
    const map = { w: 31, h: 31, t: new Uint8Array(31 * 31), haz: new Uint8Array(31 * 31),
      explored: new Uint8Array(31 * 31).fill(1), entry: { x: 0, y: 0 }, exit: { x: 30, y: 30 } };
    const pixel = (x, y) => Array.from(Render.mmCtx.getImageData(x, y, 1, 1).data);
    try {
      G.map = map; G.player = { x: 15.5, y: 15.5, dir: 0 };
      G.monsters = [{ x: 20.5, y: 15.5, dead: false }]; G.npcs = [];
      G.portalOnMap = () => null;
      R3.yaw = 0; Render.drawMinimap();
      const eastAtZero = pixel(155, 110);
      R3.yaw = Math.PI / 2; Render.drawMinimap();
      return { oldEast: eastAtZero, newNorth: pixel(110, 65), clearedEast: pixel(155, 110) };
    } finally { Object.assign(G, old); R3.yaw = old.yaw; }
  });
  expect(colors.oldEast[0]).toBeGreaterThan(colors.oldEast[1] * 1.5);
  expect(colors.newNorth[0]).toBeGreaterThan(colors.newNorth[1] * 1.5);
  expect(colors.clearedEast[0]).toBeLessThan(100);
});

test('screen-fixed chevron follows player heading relative to camera', async ({ page }) => {
  await openRenderer(page);
  const angles = await page.evaluate(() => {
    const old = { map: G.map, player: G.player, monsters: G.monsters, npcs: G.npcs,
      portalOnMap: G.portalOnMap, yaw: R3.yaw };
    const map = { w: 3, h: 3, t: new Uint8Array(9), haz: new Uint8Array(9),
      explored: new Uint8Array(9).fill(1), entry: { x: 0, y: 0 }, exit: { x: 2, y: 2 } };
    // Capture the canvas geometry transform instead of sampling the dark,
    // antialiased outline at one browser-dependent pixel. drawMap rotates once
    // for the world and then once for the screen-fixed player chevron.
    const rotations = [], rotate = Render.mmCtx.rotate;
    Render.mmCtx.rotate = function (angle) { rotations.push(angle); return rotate.call(this, angle); };
    try {
      G.map = map; G.player = { x: 1.5, y: 1.5, dir: 0 }; G.monsters = []; G.npcs = [];
      G.portalOnMap = () => null; R3.yaw = 0; Render.drawMinimap();
      const right = rotations.at(-1);
      rotations.length = 0;
      G.player.dir = Math.PI / 2; Render.drawMinimap();
      return { right, down: rotations.at(-1) };
    } finally { Render.mmCtx.rotate = rotate; Object.assign(G, old); R3.yaw = old.yaw; }
  });
  expect(angles.right).toBeCloseTo(0, 8);
  expect(angles.down).toBeCloseTo(Math.PI / 2, 8);
});

test('map stays player-centred at boundaries and unexplored actors remain masked', async ({ page }) => {
  await openRenderer(page);
  const result = await page.evaluate(() => {
    const old = { map: G.map, player: G.player, monsters: G.monsters, npcs: G.npcs,
      portalOnMap: G.portalOnMap, yaw: R3.yaw };
    const explored = new Uint8Array(100); explored[0] = 1;
    const map = { w: 10, h: 10, t: new Uint8Array(100), haz: new Uint8Array(100), explored,
      entry: { x: 0, y: 0 }, exit: { x: 9, y: 9 } };
    const pixel = (x, y) => Array.from(Render.mmCtx.getImageData(x, y, 1, 1).data);
    try {
      G.map = map; G.player = { x: 0.5, y: 0.5, dir: 0 };
      G.monsters = [{ x: 4.5, y: 0.5, dead: false }]; G.npcs = [];
      G.portalOnMap = () => null; R3.yaw = 0;
      const calls = [], translate = Render.mmCtx.translate;
      Render.mmCtx.translate = function (x, y) { calls.push([x, y]); return translate.call(this, x, y); };
      Render.drawMinimap(); Render.mmCtx.translate = translate;
      const hidden = pixel(146, 110);
      map.explored[4] = 1; Render.drawMinimap();
      return { calls, hidden, revealed: pixel(146, 110) };
    } finally { Object.assign(G, old); R3.yaw = old.yaw; }
  });
  expect(result.calls).toContainEqual([110, 110]);
  expect(result.calls).toContainEqual([-0.5, -0.5]);
  expect(result.hidden[0]).toBeLessThan(100);
  expect(result.revealed[0]).toBeGreaterThan(result.revealed[1] * 1.5);
});
