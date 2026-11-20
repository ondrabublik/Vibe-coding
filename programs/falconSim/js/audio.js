'use strict';
// Synthesised sound: wind rush that scales with airspeed, wingbeats, falcon cry, strike thump.
(function (FS) {
  class Audio {
    constructor() { this.ctx = null; this.enabled = true; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 3; }
      this.noiseBuf = buf;
      // wind
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.6;
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
      src.start();
      // whistle for very high speeds
      const src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 1.3;
      this.whF = ctx.createBiquadFilter(); this.whF.type = 'bandpass'; this.whF.frequency.value = 2400; this.whF.Q.value = 8;
      this.whG = ctx.createGain(); this.whG.gain.value = 0;
      src2.connect(this.whF); this.whF.connect(this.whG); this.whG.connect(this.master);
      src2.start();
    }
    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
    }
    update(speed, tuck, paused) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const v = paused ? 0 : Math.min(1, Math.max(0, (speed - 4) / 85));
      this.windG.gain.setTargetAtTime(Math.pow(v, 1.3) * 0.55 + (paused ? 0 : 0.02), t, 0.1);
      this.windF.frequency.setTargetAtTime(250 + speed * 22, t, 0.1);
      this.whG.gain.setTargetAtTime(paused ? 0 : Math.max(0, v - 0.45) * 0.35 * (0.4 + tuck), t, 0.2);
      this.whF.frequency.setTargetAtTime(1500 + speed * 18, t, 0.2);
    }
    noiseBurst(dur, freq, gain, type = 'lowpass', q = 1) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    }
    flap(strength = 1) { this.noiseBurst(0.16, 520, 0.35 * strength, 'lowpass', 0.8); }
    cry() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const n = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const t = ctx.currentTime + k * 0.17;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(1650, t + 0.12);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.15);
      }
    }
    strike() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.32);
      this.noiseBurst(0.35, 2500, 0.5, 'highpass', 0.7);
    }
    alarm() { for (let k = 0; k < 4; k++) setTimeout(() => this.noiseBurst(0.07, 1800, 0.12, 'bandpass', 2), k * 70); }
    crash() { this.noiseBurst(0.6, 300, 0.9, 'lowpass', 0.5); }
    chime() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      [880, 1320, 1760].forEach((fr, k) => {
        const t = ctx.currentTime + k * 0.09;
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.55);
      });
    }
  }
  FS.Audio = Audio;
})(window.FS);
