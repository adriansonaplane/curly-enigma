#!/usr/bin/env bash
# ============================================================================
# DIABLOID — pull the curated model pack from the fabclaude catalogue.
#
# Run on a machine that can reach fabclaude.com. The build environment cannot:
# its egress gateway answers 403 to CONNECT, so curl, WebFetch and a headless
# Chromium all fail identically before any endpoint is reached.
#
#   ./tools/pull-models.sh                     # all 100 curated models
#   ./tools/pull-models.sh soul-cage-uoc ...   # just these
#   BASE=... OUT=... FORCE=1 SLEEP=1           # overrides
#
# START SMALL. Effects bake on black and composite additively, which is why
# they worked as-is. A statue does not: blitted on a black square it shows the
# square, so props need transparency out of the scene. Pull three first and
# let me look at them before committing to all 100:
#
#   ./tools/pull-models.sh soul-cage-uoc runic-pillar-uoc wooden-door-uoc
#
# Writes, per slug:
#   assets/models/<slug>.json     metadata   (GET /api/models/:slug)
#   assets/models/<slug>.html     scene      (GET /api/models/:slug/html)
# and:
#   assets/models/index.json      manifest the bake reads
#
# Re-running is safe: anything already downloaded is skipped unless FORCE=1.
# ============================================================================
set -uo pipefail

BASE="${BASE:-https://fabclaude.com/api}"
OUT="${OUT:-assets/models}"
RETRIES="${RETRIES:-3}"
SLEEP="${SLEEP:-0.3}"
FORCE="${FORCE:-0}"
TIMEOUT="${TIMEOUT:-25}"

# The curated list — mirrors the `models` entries in js/assetpacks.js, grouped
# by act. Keep the two in step; ASSET_PACKS.md is generated from that file.
MODELS=(
  # Act I — The Weeping Parish
  catacomb-niche-uoc crimson-crypt-slab-uoc sepulcher-effigy-uoc
  soul-cage-uoc reliquary-shrine-uoc ghost-in-chains-uoc haunted-mirror-uoc
  prison-cell-uoc corpse-shroud-uoc whipping-post-uoc grave-marker-small-uoc
  imperial-sarcophagus-uoc cursed-grave-uoc bone-heap-uoc cobweb-cluster-uoc
  wooden-door-uoc barred-dungeon-door-uoc
  # monsters
  ragm-ghoul ragm-skeleton ragm-zombie ragm-wraith

  # Act II — Catacombs of Ash
  ritual-circle-uoc embalming-slab-uoc necronomicon-stand-uoc plague-vat-uoc
  phylactery-uoc soul-gem-uoc spider-egg-sac-uoc cocooned-victim-uoc
  haunted-doll-uoc bloody-handprint-uoc bandit-tent-uoc cinerary-urn-uoc
  bookcase inferno-anvil-uoc battle-standard-uoc
  # monsters
  ragm-necromancer ragm-ratman ragm-mummy ragm-skeletal-mage

  # Act III — The Molten Undercity
  ore-smelter-uoc foundry-crucible-uoc lava-waterfall-uoc volcanic-vent-uoc
  stalactite-cluster-uoc echo-crystal-uoc amethyst-geode-uoc
  dwarven-runestone-uoc mining-support-beam-uoc dynamite-bundle-uoc
  ogre-bone-pile-uoc lava-bridge-uoc ore-vein-uoc crystal-growth-uoc
  cave-stalagmite-uoc glowspore-colony-uoc voodoo-cauldron-uoc
  # monsters
  ragm-troll ragm-ogre ragm-volcanic-imp

  # Act IV — The Drowned Fane
  fen-shrine-idol-uoc naga-statue-uoc coral-pillar-uoc
  sunken-monastery-bell-uoc marsh-grass-cluster-uoc poison-bubble-pool-uoc
  poison-vine-cluster-uoc bog-skeleton-uoc spore-cloud-vent-uoc
  toxic-fog-vent-uoc swamp-willow-tree-uoc will-o-wisp-uoc fey-pool-uoc
  giant-clam-uoc sunken-battlement-uoc elven-wellspring-uoc
  sunfire-brazier-uoc
  # monsters
  ragm-lizardman ragm-serpent

  # Act V — The Burning Throne
  demonic-sigil-ward-uoc fel-crystal-shard-uoc void-rift-uoc
  scorched-rampart-uoc titan-disc-uoc astral-obelisk-uoc twisted-tree-uoc
  corrupted-stone-uoc charred-bones-uoc dragon-nest-uoc ember-geyser-uoc
  cosmic-horror-eye-uoc scorched-weapons-uoc titan-watcher-statue-uoc
  runic-pillar-uoc obsidian-king-statue-uoc storm-keeper-brazier-uoc
  # monsters
  magma-golem-uoc ragm-cyclops ragm-ettin ragm-lich-lord
)

# Full set kept separate from what this run fetches. The manifest is always
# built from ALL of it — otherwise a targeted retry of one slug would rewrite
# index.json down to that slug and silently drop the other ninety-nine.
ALL_MODELS=("${MODELS[@]}")
if [ "$#" -gt 0 ]; then MODELS=("$@"); fi

mkdir -p "$OUT"

ok=0; skip=0; fail=0
failed=()

# fetch URL -> file, atomically. A failed or truncated download leaves nothing
# behind rather than a half file that later looks valid to the bake.
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

printf 'Pulling %d models from %s\n\n' "${#MODELS[@]}" "$BASE"

for slug in "${MODELS[@]}"; do
  meta="$OUT/$slug.json"
  scene="$OUT/$slug.html"

  if [ "$FORCE" != "1" ] && [ -s "$meta" ] && [ -s "$scene" ]; then
    printf '  ==  %-30s already present\n' "$slug"
    skip=$((skip + 1))
    continue
  fi

  printf '  ->  %-30s ' "$slug"
  if ! fetch "$BASE/models/$slug" "$meta"; then
    printf '      metadata FAILED\n'
    failed+=("$slug (metadata)"); fail=$((fail + 1)); sleep "$SLEEP"; continue
  fi
  if ! fetch "$BASE/models/$slug/html" "$scene"; then
    printf '      html FAILED\n'
    rm -f "$meta"
    failed+=("$slug (html)"); fail=$((fail + 1)); sleep "$SLEEP"; continue
  fi

  mbytes=$(wc -c < "$meta" | tr -d ' ')
  hbytes=$(wc -c < "$scene" | tr -d ' ')
  printf 'ok  (%s B meta, %s B html)\n' "$mbytes" "$hbytes"
  ok=$((ok + 1))
  sleep "$SLEEP"
done

# ---- manifest ------------------------------------------------------------
# Lists what actually landed on disk, so a partial pull produces an honest
# manifest rather than one promising files that are not there.
idx="$OUT/index.json"
{
  printf '{\n  "kind": "models",\n  "base": "%s",\n' "$BASE"
  printf '  "pulled": "%s",\n  "entries": [\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  first=1
  for slug in "${ALL_MODELS[@]}"; do
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
  printf '\n  Re-run to retry just those, e.g.:\n    ./tools/pull-models.sh %s\n' "${failed[0]%% *}"
  exit 1
fi
printf '\n  Next:\n'
printf '    node tools/audit-assets.js %s      # must be clean before anything else\n' "$OUT"
printf '    node tools/sanitize-payloads.js %s # strip the CDN + parent access\n' "$OUT"
printf '    then push, and I will bake them.\n'
