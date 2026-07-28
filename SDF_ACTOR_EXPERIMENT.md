# Experimental SDF actor renderer (not adopted)

The experiment targets the `blob` archetype and lives in
`js/actors-sdf-experimental.js`. It is **not referenced by `index.html`**, so it
cannot enter the ordinary game download and cannot replace `Actors3`. To inspect
it, load that script explicitly from a local development harness and call
`SDFActorsExperimental.create(40)`.

## Scope and behavior

Each actor has a fixed eight-primitive budget; the current blob uses three
spheres/ellipsoids, one capsule, and one box plus two eye spheres. Only the two
overlapping body lobes use smooth union. An instanced conservative box produces
one draw call for the whole SDF crowd. The fragment shader writes ray-hit depth,
uses normal-derived directional lighting, and includes Three.js exponential/linear
fog chunks. Both elevated and free perspective cameras therefore work without a
special path. Existing screen-space targeting remains authoritative because the
experiment does not replace actor ownership or `worldToScreen`.

The path intentionally does not cast or receive shadow-map shadows. Animation is
a single phase attribute and one matrix/color update per live actor; `update()`
returns its CPU upload preparation time. These omissions must be included in any
visual comparison rather than hidden as performance wins.

## RTX 3060 gate and measurement matrix

No RTX 3060 is exposed in the automated environment, so GPU values have **not**
been fabricated. Capture at 2560×1440, DPR 1, production mood/fog, first in the
elevated camera and then in free/third-person camera. Warm up 300 frames and
record the median and p95 of the next 600 frames for each cell:

| renderer | actors | GPU ms | total ms | draw calls | proxy pixels shaded | update ms | visual notes |
|---|---:|---:|---:|---:|---:|---:|---|
| original unmerged primitive rig | 1 / 10 / 40 | pending | pending | pending | pending | pending | baseline |
| current statically merged rig | 1 / 10 / 40 | pending | pending | pending | pending | pending | production |
| experimental SDF blob | 1 / 10 / 40 | pending | pending | 1 | pending | pending | no shadows |

Use `EXT_disjoint_timer_query_webgl2` (discard disjoint samples) for GPU time,
`performance.now()` around the complete frame for total time, and
`renderer.info.render.calls` for draw calls. Measure proxy pixels with an
occlusion query while drawing the conservative boxes with color/depth writes
disabled; do not report viewport area or an analytical estimate as pixels
shaded. Record `update()` separately so animation upload work is visible.

Take paired screenshots for silhouette joins, fog transition, depth against a
waist-high wall, lighting, missing shadows, target reticle alignment, and both
camera modes. The acceptance gate is a visible silhouette improvement, no depth
or targeting failures, and p95 SDF GPU time within the project's frame budget at
40 actors. Until hardware results satisfy every gate, the decision is **do not
adopt**. Since static `BufferGeometry` merging already reduces static pieces to
one mesh per material bucket, the SDF file remains outside the production page.
