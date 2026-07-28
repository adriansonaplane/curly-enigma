# Three.js browser correctness smoke tests

Run from the repository root:

```sh
npm install
npm run test:browser
```

The Playwright config serves the repository with
`python3 -m http.server 4173 --bind 127.0.0.1`, opens
`http://127.0.0.1:4173/index.html`, and launches Chromium with
`--use-gl=swiftshader`. It fixes the viewport at **1100×640**, allows 60 seconds
per test, 10 seconds for assertions, 15 seconds for actions, and 30 seconds for
navigation. These deliberately generous limits account for software WebGL.

The suite is correctness-only. **Do not record GPU timings or make performance
claims from this SwiftShader run.** Keep hardware-GPU performance measurement in
a separate invocation and report.

## Mutation (red-test) check

Each probe contains a narrowly scoped, opt-in deliberate break. To prove an
assertion detects its regression, run its mutation and confirm Playwright exits
non-zero:

```sh
declare -A title=(
  [boot]='page boots' [character]='character creation' [monster]='Ent.makeMonster'
  [actors]='hero and nearby actor' [torch]='torch light'
  [movement-iso]='movement is camera-relative in iso'
  [movement-third]='movement is camera-relative in third'
  [props]='prop instance visibility' [combat]='representative combat effects'
)
for probe in "${!title[@]}"; do
  if BREAK_PROBE="$probe" npm run test:browser -- --grep "${title[$probe]}"; then
    echo "ERROR: $probe mutation did not make its probe fail" >&2; exit 1
  fi
done
```

The normal suite must then be run again without `BREAK_PROBE`. Mutation runs are
development validation, not part of CI's green correctness run.
