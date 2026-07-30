// ============ DIABLOID: graphics-config.js — boot-safe graphics options ============
'use strict';

// This file deliberately has no dependency on THREE (or any game module).  It
// runs before the renderer and remains usable on machines where WebGL cannot
// be created, which is also why the recovery screen talks to it directly.
const GraphicsConfig = (() => {
  const VERSION = 1;
  const STORAGE_KEY = 'diabloid.graphicsConfig';
  const DEFAULTS = Object.freeze({
    profile: 'default', antialias: true, powerPreference: 'high-performance',
    webglVersion: 'auto', dprCap: 2, renderScale: 1, shadows: true,
    lightBudget: 12, grading: true, fog: false, shafts: true, gpuTimers: true,
    authoredModels: true, advancedEffects: true, advancedParticles: true,
    advancedGeometry: true, ambientEffects: true, textures: true, ambientAudio: true,
  });
  const enumOf = values => value => values.indexOf(value) >= 0 ? value : undefined;
  const bool = value => typeof value === 'boolean' ? value : undefined;
  const number = (min, max) => value => typeof value === 'number' && Number.isFinite(value)
    && value >= min && value <= max ? value : undefined;
  const integer = (min, max) => value => Number.isInteger(value) && value >= min && value <= max
    ? value : undefined;
  const VALIDATE = {
    profile: enumOf(['default', 'conservative']), antialias: bool,
    powerPreference: enumOf(['default', 'high-performance', 'low-power']),
    webglVersion: enumOf(['auto', 1, 2]), dprCap: number(0.5, 4),
    renderScale: number(0.25, 1), shadows: bool, lightBudget: integer(0, 32),
    grading: bool, fog: bool, shafts: bool, gpuTimers: bool,
    authoredModels: bool, advancedEffects: bool, advancedParticles: bool,
    advancedGeometry: bool, ambientEffects: bool, textures: bool, ambientAudio: bool,
  };
  const parseValue = (key, value) => {
    if (typeof value !== 'string') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (key === 'webglVersion' && value === '1') return 1;
    if (key === 'webglVersion' && value === '2') return 2;
    if (['dprCap', 'renderScale', 'lightBudget'].indexOf(key) >= 0 && value.trim() !== '') return Number(value);
    return value;
  };
  const validated = source => {
    const out = Object.assign({}, DEFAULTS);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
    for (const key of Object.keys(VALIDATE)) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = VALIDATE[key](parseValue(key, source[key]));
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  const readSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      // Never interpret an unversioned or future/obsolete document. A bad
      // property in the current document, however, cannot discard its peers.
      if (!saved || saved.version !== VERSION) return null;
      return saved.config && typeof saved.config === 'object' ? saved.config : saved;
    } catch (_) { return null; }
  };
  const readUrl = () => {
    const out = {};
    try {
      const params = new URLSearchParams(location.search);
      const packed = params.get('graphics');
      if (packed) {
        try { Object.assign(out, JSON.parse(packed)); } catch (_) {}
      }
      for (const key of Object.keys(VALIDATE)) {
        const value = params.get('gfx.' + key) || params.get('graphics.' + key);
        if (value !== null) out[key] = value;
      }
    } catch (_) {}
    return out;
  };
  const overlay = (base, source) => {
    const out = Object.assign({}, base);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
    for (const key of Object.keys(VALIDATE)) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = VALIDATE[key](parseValue(key, source[key]));
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  let current = overlay(validated(readSaved()), readUrl());
  const save = config => {
    current = validated(config);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, config: current })); } catch (_) {}
    return current;
  };
  const reset = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    current = overlay(validated(null), readUrl());
    return current;
  };
  const safeMode = () => save(Object.assign({}, DEFAULTS, {
    profile: 'conservative', antialias: false, powerPreference: 'low-power',
    dprCap: 1, renderScale: 0.75, shadows: false, lightBudget: 6,
    grading: false, fog: false, shafts: false, gpuTimers: false,
    authoredModels: false, advancedEffects: false, advancedParticles: false,
    advancedGeometry: false, ambientEffects: false, textures: false, ambientAudio: false,
  }));
  const compatibilityMode = () => save(Object.assign({}, current, {
    profile: 'conservative', antialias: false, powerPreference: 'default', webglVersion: 1,
  }));
  return {
    VERSION, STORAGE_KEY, DEFAULTS, get current() { return current; },
    validate: validated, save, reset, safeMode, compatibilityMode,
    diagnostics() { return { version: VERSION, storageKey: STORAGE_KEY, config: current }; },
  };
})();
