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
    return this.muted;
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
    // a torch catching, and the same torch going out: a rising whoomph
    // against a falling hiss, so the toggle is audible without looking
    case 'torchup':  AUDIO.noise(0.2, 0.15, 620); AUDIO.tone(170, 0.28, 'sawtooth', 0.09, 240); break;
    case 'torchdn':  AUDIO.noise(0.24, 0.11, 1700); AUDIO.tone(260, 0.2, 'sine', 0.07, -190); break;
    case 'nope':     AUDIO.tone(160, 0.14, 'square', 0.1, -40); break;
    case 'trap':     AUDIO.noise(0.1, 0.18, 1800); AUDIO.tone(500, 0.06, 'square', 0.08, -200); break;
    case 'door':     AUDIO.noise(0.3, 0.09, 260); AUDIO.tone(110, 0.28, 'sawtooth', 0.05, 25); break;
    case 'vent':     AUDIO.noise(0.45, 0.14, 1500); break;
  }
}
