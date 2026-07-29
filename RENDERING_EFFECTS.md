# Deferred rendering effects

Ambient occlusion and water reflections are not part of the current renderer.
They were removed from the settings contract rather than exposing switches that
only persisted and forwarded unused values. This document is the gate for
reintroducing either control.

## Ambient occlusion

The intended implementation is a half-resolution screen-space pass after the
opaque world/actor render and before color grading. It should consume scene
depth and normals, blur at half resolution, and composite once into the existing
post-processing target. It must not add geometry submissions or another
full-resolution world render.

Budget at 1920x1080, render scale 1, on the High preset:

- no more than **1.0 ms median GPU time** and **1.5 ms p95**;
- no more than **16 MiB** of persistent render targets;
- at most **one half-resolution effect pass plus one half-resolution blur**;
- Auto quality must disable it before reducing light count or scene readability.

## Water reflections

The intended implementation is a planar reflection atlas rendered before the
main opaque scene, restricted to visible water planes. It should reuse a single
reflection target per frame, clip geometry below the water plane, omit particles,
UI, and transparent effects, and update at half rate when the camera is stable.
Screen-space reflections and one target per pool are explicitly out of scope.

Budget at 1920x1080, render scale 1, on the High preset:

- no more than **1.5 ms median GPU time** and **2.5 ms p95**;
- no more than **16 MiB** of persistent render targets;
- at most **one half-resolution reflection scene pass per rendered frame**;
- Auto quality must disable reflections before reducing light count or render scale.

Before either setting becomes visible, diagnostics must report its pass timing
and target memory, and the video settings contract test must prove that toggling
the control changes the renderer state consumed by that pass.
