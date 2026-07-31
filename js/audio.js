// ============ DIABLOID: audio.js — WebAudio synthesized SFX ============
'use strict';

const AUDIO = {
  ctx: null, master: null, muted: false, vol: 0.5,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.vol;
    if (this._ambGain) this._ambGain.gain.value = this.muted ? 0 : this._ambVol;
    return this.muted;
  },
  _ambNodes: null, _ambGain: null, _ambVol: 0, _ambIntervals: [], _ambTheme: null,

  startAmbient(theme) {
    if (!this.ensure()) return;
    if (this._ambTheme === theme) return;

    // Crossfade: fade out old over 1.5s before starting new
    if (this._ambGain) {
      const oldGain = this._ambGain;
      const oldNodes = this._ambNodes;
      const oldIntervals = this._ambIntervals;
      const t = this.ctx.currentTime;
      oldGain.gain.setValueAtTime(oldGain.gain.value, t);
      oldGain.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => {
        for (const n of oldNodes || []) { try { n.stop(); } catch (_) {} }
        for (const id of oldIntervals) clearTimeout(id);
        try { oldGain.disconnect(); } catch (_) {}
      }, 1600);
      this._ambNodes = null; this._ambGain = null; this._ambIntervals = [];
    } else {
      this.stopAmbient();
    }

    this._ambTheme = theme;
    const ctx = this.ctx, nodes = [], timeouts = [];
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);

    // Longer buffer with fade taper at loop boundary
    const noiseDur = 8;
    const buf = ctx.createBuffer(1, ctx.sampleRate * noiseDur | 0, ctx.sampleRate);
    const nd = buf.getChannelData(0);
    const fadeLen = Math.floor(ctx.sampleRate * 0.1);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    for (let i = 0; i < fadeLen; i++) {
      const f = i / fadeLen;
      nd[i] *= f;
      nd[nd.length - 1 - i] *= f;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';

    const self = this;
    const drip = () => {
      if (!self.muted) {
        self.tone(1800 + Math.random() * 1400, 0.05, 'sine', 0.03, -(600 + Math.random() * 500));
        if (Math.random() < 0.3) setTimeout(() => self.tone(1400 + Math.random() * 800, 0.03, 'sine', 0.015, -400), 80 + Math.random() * 120);
      }
      timeouts.push(setTimeout(drip, 2500 + Math.random() * 4000));
    };
    const creak = () => {
      if (!self.muted) {
        self.tone(180 + Math.random() * 120, 0.35, 'sawtooth', 0.025, -(40 + Math.random() * 30));
        self.noise(0.15, 0.012, 600 + Math.random() * 400);
      }
      timeouts.push(setTimeout(creak, 7000 + Math.random() * 12000));
    };
    const rumble = () => {
      if (!self.muted) {
        self.tone(40 + Math.random() * 25, 0.6, 'sine', 0.04);
        self.noise(0.3, 0.02, 120 + Math.random() * 80);
      }
      timeouts.push(setTimeout(rumble, 5000 + Math.random() * 10000));
    };
    const hiss = () => {
      if (!self.muted) self.noise(0.18, 0.03, 1200 + Math.random() * 1000);
      timeouts.push(setTimeout(hiss, 3000 + Math.random() * 6000));
    };
    const chains = () => {
      if (!self.muted) {
        for (let i = 0; i < 3; i++) setTimeout(() => self.tone(3000 + Math.random() * 2000, 0.02, 'square', 0.015, -(1000 + Math.random() * 800)), i * 40);
      }
      timeouts.push(setTimeout(chains, 10000 + Math.random() * 15000));
    };
    const moan = () => {
      if (!self.muted) {
        const f = 150 + Math.random() * 100;
        self.tone(f, 0.8, 'sawtooth', 0.018, Math.random() > 0.5 ? 30 : -30);
        self.tone(f * 1.5, 0.6, 'sine', 0.008, -20);
      }
      timeouts.push(setTimeout(moan, 15000 + Math.random() * 20000));
    };

    let targetGain;
    switch (theme) {
      case 'crypt':
        lp.frequency.value = 160; targetGain = 0.04;
        timeouts.push(setTimeout(drip, 1500 + Math.random() * 2000));
        timeouts.push(setTimeout(creak, 4000 + Math.random() * 5000));
        timeouts.push(setTimeout(chains, 8000 + Math.random() * 6000));
        break;
      case 'catacomb':
        lp.frequency.value = 200; targetGain = 0.045;
        timeouts.push(setTimeout(drip, 2000 + Math.random() * 3000));
        timeouts.push(setTimeout(moan, 6000 + Math.random() * 8000));
        timeouts.push(setTimeout(creak, 5000 + Math.random() * 4000));
        break;
      case 'cavern':
        lp.frequency.value = 120; targetGain = 0.06;
        timeouts.push(setTimeout(rumble, 2000 + Math.random() * 3000));
        timeouts.push(setTimeout(drip, 3000 + Math.random() * 4000));
        timeouts.push(setTimeout(hiss, 4000 + Math.random() * 3000));
        break;
      case 'fane':
        lp.frequency.value = 260; targetGain = 0.035;
        timeouts.push(setTimeout(drip, 3000 + Math.random() * 4000));
        timeouts.push(setTimeout(hiss, 5000 + Math.random() * 5000));
        timeouts.push(setTimeout(chains, 10000 + Math.random() * 8000));
        break;
      case 'hell':
        lp.frequency.value = 300; targetGain = 0.07;
        timeouts.push(setTimeout(hiss, 1000 + Math.random() * 2000));
        timeouts.push(setTimeout(rumble, 3000 + Math.random() * 4000));
        timeouts.push(setTimeout(moan, 5000 + Math.random() * 8000));
        break;
      default:
        lp.frequency.value = 350; targetGain = 0.022;
        timeouts.push(setTimeout(hiss, 4000 + Math.random() * 5000));
        break;
    }
    src.connect(lp); lp.connect(g); src.start();
    nodes.push(src); nodes.push(lp);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this.muted ? 0 : targetGain, t + 1.5);
    this._ambNodes = nodes; this._ambGain = g; this._ambVol = targetGain; this._ambIntervals = timeouts;
  },

  stopAmbient() {
    if (this._ambNodes) {
      for (const n of this._ambNodes) { try { n.stop(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
      try { this._ambGain.disconnect(); } catch (_) {}
      this._ambNodes = null; this._ambGain = null;
    }
    for (const id of this._ambIntervals) clearTimeout(id);
    this._ambIntervals = [];
    this._ambTheme = null;
  },
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  },
  noise(dur, vol = 0.2, freq = 800) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  },
};

function sfx(name) {
  switch (name) {
    case 'hit':      AUDIO.noise(0.09, 0.25, 900); AUDIO.tone(140, 0.08, 'square', 0.12, -60); break;
    case 'hurt':     AUDIO.tone(190, 0.16, 'sawtooth', 0.16, -90); break;
    case 'swing':    AUDIO.noise(0.07, 0.10, 2200); break;
    case 'shoot':    AUDIO.tone(680, 0.12, 'sawtooth', 0.09, -420); break;
    case 'fire':     AUDIO.noise(0.22, 0.16, 500); AUDIO.tone(120, 0.2, 'sawtooth', 0.08, -40); break;
    case 'ice':      AUDIO.tone(980, 0.16, 'triangle', 0.13, -300); break;
    case 'lightning':AUDIO.noise(0.12, 0.22, 3200); AUDIO.tone(60, 0.1, 'sawtooth', 0.14, 0); break;
    case 'poison':   AUDIO.tone(300, 0.25, 'triangle', 0.09, -160); break;
    case 'die':      AUDIO.noise(0.35, 0.24, 420); AUDIO.tone(90, 0.4, 'sawtooth', 0.13, -50); break;
    case 'bigdie':   AUDIO.noise(0.7, 0.3, 300); AUDIO.tone(55, 0.8, 'sawtooth', 0.2, -25); break;
    case 'gold':     AUDIO.tone(1250, 0.07, 'square', 0.10); AUDIO.tone(1650, 0.09, 'square', 0.08); break;
    case 'drop':     AUDIO.tone(320, 0.1, 'triangle', 0.12, -80); break;
    case 'rare':     AUDIO.tone(520, 0.12, 'triangle', 0.14); AUDIO.tone(780, 0.2, 'triangle', 0.12); break;
    case 'unique':   AUDIO.tone(440, 0.15, 'triangle', 0.15); AUDIO.tone(660, 0.15, 'triangle', 0.13); AUDIO.tone(880, 0.3, 'triangle', 0.12); break;
    case 'potion':   AUDIO.tone(500, 0.15, 'sine', 0.16, 220); break;
    case 'levelup':  [392, 523, 659, 784].forEach((f, i) => setTimeout(() => AUDIO.tone(f, 0.28, 'triangle', 0.18), i * 90)); break;
    case 'ui':       AUDIO.tone(700, 0.05, 'square', 0.06); break;
    case 'equip':    AUDIO.noise(0.08, 0.12, 1400); AUDIO.tone(240, 0.08, 'square', 0.07); break;
    case 'stairs':   AUDIO.tone(220, 0.3, 'sine', 0.14, -120); break;
    case 'portal':   AUDIO.tone(300, 0.5, 'sine', 0.13, 500); break;
    case 'shrine':   [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => AUDIO.tone(f, 0.2, 'sine', 0.12), i * 60)); break;
    case 'explode':  AUDIO.noise(0.4, 0.3, 350); break;
    case 'torchup':  AUDIO.noise(0.2, 0.15, 620); AUDIO.tone(170, 0.28, 'sawtooth', 0.09, 240); break;
    case 'torchdn':  AUDIO.noise(0.24, 0.11, 1700); AUDIO.tone(260, 0.2, 'sine', 0.07, -190); break;
    case 'nope':     AUDIO.tone(160, 0.14, 'square', 0.1, -40); break;
    case 'trap':     AUDIO.noise(0.1, 0.18, 1800); AUDIO.tone(500, 0.06, 'square', 0.08, -200); break;
    case 'door':     AUDIO.noise(0.3, 0.09, 260); AUDIO.tone(110, 0.28, 'sawtooth', 0.05, 25); break;
    case 'vent':     AUDIO.noise(0.45, 0.14, 1500); break;
  }
}
