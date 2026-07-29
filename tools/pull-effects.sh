#!/usr/bin/env bash
# ============================================================================
# DIABLOID — pull the curated effect pack from the fabclaude catalogue.
#
# Run this on a machine that can actually reach fabclaude.com. The build
# environment cannot: its egress gateway answers 403 to CONNECT, so curl,
# WebFetch and a headless Chromium all fail identically before any endpoint is
# reached. Everything here is plain curl and coreutils.
#
#   ./tools/pull-effects.sh                 # pull all 25 curated effects
#   ./tools/pull-effects.sh flamejet-3d     # pull just these
#   BASE=http://localhost:8099/api ./tools/pull-effects.sh   # point elsewhere
#
# Writes, per slug:
#   assets/effects/<slug>.json     metadata   (GET /api/effects/:slug)
#   assets/effects/<slug>.html     animation  (GET /api/effects/:slug/preview)
# and finally:
#   assets/effects/index.json      manifest the game reads
#
# Re-running is safe: anything already downloaded is skipped unless FORCE=1.
# ============================================================================
set -uo pipefail

BASE="${BASE:-https://fabclaude.com/api}"
OUT="${OUT:-assets/effects}"
RETRIES="${RETRIES:-3}"
SLEEP="${SLEEP:-0.3}"       # be polite between requests
FORCE="${FORCE:-0}"
TIMEOUT="${TIMEOUT:-25}"

# The curated list — mirrors the `effects` entries in js/assetpacks.js.
# Keep the two in step; ASSET_PACKS.md is generated from that file.
EFFECTS=(
  # Act I — The Weeping Parish
  soulflame-3d torch-3d dustmotes-3d groundfog-3d
  # Act II — Catacombs of Ash
  magic-circle-3d spawnportal-3d poison-cloud-3d runes-3d
  # Act III — The Molten Undercity
  geothermalsteam-3d steamvent-3d flamejet-3d lavaflow-3d embersdrift-3d blast-3d
  # Act IV — The Drowned Fane
  swampgas-3d acid-splash-3d pondripple-3d poisonswell-3d
  # Act V — The Burning Throne
  void-rift-3d falling-meteor-3d meteorwarn-3d fire-tornado-3d bossdeath-3d
  # trap / telegraph effects
  electriccharge-3d aoemarker-3d
)

# The full curated set, kept separate from whatever this run fetches. The
# manifest is always built from ALL of it — otherwise a targeted retry like
# `./pull-effects.sh runes-3d` would rewrite index.json down to that one slug
# and silently drop the other two dozen the game is expecting.
ALL_EFFECTS=("${EFFECTS[@]}")

# caller can override what THIS RUN fetches with positional args
if [ "$#" -gt 0 ]; then EFFECTS=("$@"); fi

mkdir -p "$OUT"

ok=0; skip=0; fail=0
failed=()

# fetch URL -> file. Returns non-zero and leaves no partial file on failure.
fetch() {
  local url="$1" dest="$2" tmp
  tmp="$(mktemp "${dest}.XXXXXX")"
  local code
  code="$(curl -sS -L \
      --retry "$RETRIES" --retry-delay 1 --retry-connrefused \
      --max-time "$TIMEOUT" \
      -H 'Accept: */*' \
      -w '%{http_code}' \
      -o "$tmp" "$url" 2>"${tmp}.err")"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '      curl failed: %s\n' "$(tr -d '\n' < "${tmp}.err" | cut -c1-120)"
    rm -f "$tmp" "${tmp}.err"; return 1
  fi
  if [ "$code" != "200" ]; then
    printf '      HTTP %s\n' "$code"
    rm -f "$tmp" "${tmp}.err"; return 1
  fi
  if [ ! -s "$tmp" ]; then
    printf '      empty body\n'
    rm -f "$tmp" "${tmp}.err"; return 1
  fi
  mv "$tmp" "$dest"; rm -f "${tmp}.err"
  return 0
}

printf 'Pulling %d effects from %s\n\n' "${#EFFECTS[@]}" "$BASE"

for slug in "${EFFECTS[@]}"; do
  meta="$OUT/$slug.json"
  prev="$OUT/$slug.html"

  if [ "$FORCE" != "1" ] && [ -s "$meta" ] && [ -s "$prev" ]; then
    printf '  ==  %-22s already present\n' "$slug"
    skip=$((skip + 1))
    continue
  fi

  printf '  ->  %-22s ' "$slug"
  if ! fetch "$BASE/effects/$slug" "$meta"; then
    printf '      metadata FAILED\n'
    failed+=("$slug (metadata)"); fail=$((fail + 1)); sleep "$SLEEP"; continue
  fi
  if ! fetch "$BASE/effects/$slug/preview" "$prev"; then
    printf '      preview FAILED\n'
    rm -f "$meta"
    failed+=("$slug (preview)"); fail=$((fail + 1)); sleep "$SLEEP"; continue
  fi

  mbytes=$(wc -c < "$meta" | tr -d ' ')
  pbytes=$(wc -c < "$prev" | tr -d ' ')
  printf 'ok  (%s B meta, %s B html)\n' "$mbytes" "$pbytes"
  ok=$((ok + 1))
  sleep "$SLEEP"
done

# ---- manifest ------------------------------------------------------------
# One file the game can load instead of 50. Lists what actually landed on
# disk, so a partial pull produces an honest manifest rather than a wrong one.
idx="$OUT/index.json"
{
  printf '{\n  "kind": "effects",\n  "base": "%s",\n' "$BASE"
  printf '  "pulled": "%s",\n  "entries": [\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  first=1
  for slug in "${ALL_EFFECTS[@]}"; do
    [ -s "$OUT/$slug.json" ] && [ -s "$OUT/$slug.html" ] || continue
    [ "$first" = 1 ] || printf ',\n'
    first=0
    printf '    { "slug": "%s", "meta": "%s.json", "html": "%s.html" }' "$slug" "$slug" "$slug"
  done
  printf '\n  ]\n}\n'
} > "$idx"

printf '\n----------------------------------------\n'
printf '  downloaded : %d\n  skipped    : %d\n  failed     : %d\n' "$ok" "$skip" "$fail"
printf '  manifest   : %s\n' "$idx"
if [ "$fail" -gt 0 ]; then
  printf '\n  failures:\n'
  for f in "${failed[@]}"; do printf '    - %s\n' "$f"; done
  printf '\n  Re-run to retry just those, e.g.:\n    ./tools/pull-effects.sh %s\n' "${failed[0]%% *}"
  exit 1
fi
# Same contract as pull-models.sh: nothing leaves this script holding a live
# CDN reference or a frame-postMessage channel. Printing a reminder instead of
# scrubbing is how 192 payloads silently reverted once already.
if [ "${SANITIZE:-1}" = "1" ] && [ "$ok" -gt 0 ]; then
  printf '\n'
  if node "$(dirname "$0")/sanitize-payloads.js" "$OUT"; then :; else
    printf '\n  SANITISE FAILED — the payloads on disk still reach for a CDN.\n'
    printf '  Do not open them in a browser. Re-run: node tools/sanitize-payloads.js %s\n' "$OUT"
    exit 1
  fi
fi

printf '\n  Next:\n'
printf '    node tools/audit-assets.js %s\n' "$OUT"
printf '    commit assets/effects/, then in the game console:\n'
printf '    await Assets.api.ingestLocal("assets/effects/index.json")\n'
