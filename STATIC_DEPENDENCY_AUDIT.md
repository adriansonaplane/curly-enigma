# Static 2D dependency audit

This audit follows the globals from their call sites and the load order in
`index.html`. It distinguishes a Canvas 2D implementation detail from the old
world renderer: using a canvas does not by itself make a path legacy.

## Classification of the remaining paths

| Classification | Remaining path | Runtime callers / reason retained |
| --- | --- | --- |
| Required screen-space UI or overlay | `Render`'s transparent overlay: target indicators, nameplates and health bars, the sconce prompt, damage numbers, chat bubbles, and physics debris | `Render.frame()` composes these after `R3.render()`. Fixed-size text and interaction hints must remain crisp and screen aligned. |
| Required screen-space UI or overlay | `Render.drawMinimap()` and the `#minimap` canvas | Map transitions and exploration updates call it from `main.js`; it is a top-down HUD, not a world projection. |
| Required screen-space UI or overlay | `UI` and `WUI` canvases, including hotbar/skill icons, item icons, character portraits, meters, and menu ambience | These canvases are embedded in DOM HUD, menu, inventory, skills, and social/settings frames. |
| Required screen-space UI or overlay | `Target.draw()` | `Render.frame()` calls it for cursor/range/targeting feedback. Its world anchors are projected onto the overlay. |
| Required screen-space UI or overlay | `Physics.drawSmall()` | `Render.frame()` calls it for deliberately retained debris overlays. Simulation remains world anchored, while chips are screen-space decoration. |
| Required compatibility adapter | `Render.worldToScreen(x, y, z)` | `target.js` and `physics.js` call the stable API. Its `z` argument is legacy pixels and is converted through `FX3.PX`; removing that conversion without migrating every producer and consumer would alter trajectories and heights. |
| Required compatibility adapter | `Figure` | `Actors3` consumes its proportions, poses, and equipment description for Three.js rigs. `Sprites` also consumes its pose/draw API lazily to generate menu portraits. The script must remain after `physics.js` and before UI callers. |
| Still-used procedural asset generation | `Sprites` actor portraits, skill icons, and item icons | `ui.js` and `wui.js` request them on demand for screen-space canvases. Legacy tile, fog, AO, particle-atlas, and alternate humanoid generators had no callers and were removed. |
| Still-used procedural asset generation | Canvas work in `assets.js` and `fx3d.js` | These canvases generate textures/atlases consumed by Three.js; they do not draw the world in 2D. |
| Dead legacy world rendering | None retained | The uncalled sprite tile/fog/AO/particle generators, unused camera projection helpers, alternate humanoid painter, and unused large-debris painter were removed only after repository-wide caller searches. |

## Unit boundary

Three coordinate systems intentionally remain:

* simulation/world positions (`x`, `y`) are in tiles;
* Three.js positions are in world units, with elevation on Three.js `Y`;
* particle/debris elevation and sizes (`G.parts[].z`, `G.parts[].size`,
  `G.dmgNums[].z`, and physics debris `z`/`size`) remain in legacy pixels.

`FX3.PX = 1 / 32` is the single read-time boundary for the latter values.
`FX3.sync()` converts particle elevation and size together, damage-number
projection applies the same conversion, and `Render.worldToScreen()` preserves
the pixel-height contract for physics and targeting callers. A future world-unit
migration must change emitters, integration constants, culling, shadows,
projection, and Three.js consumers in one tested change; deleting `1 / 32` alone
is not a migration.

## Script-order conclusion

No whole script in the requested set is unused:

* `sprites.js` supplies UI portraits and icons;
* `camera.js` supplies persisted camera state and camera-relative input;
* `figure.js` supplies both 3D rig data and portrait posing;
* `physics.js` supplies live simulation and its retained overlay;
* `renderer.js` is the frame coordinator, compatibility projection adapter,
  and overlay/minimap renderer.

Accordingly `index.html` keeps all five. Its important lazy dependency is
intentional: `sprites.js` loads before `figure.js`, but only calls `Figure` after
the page has loaded and a portrait is requested; `actors3d.js` likewise reads
`Figure` only while constructing/syncing a rig after initialization.
