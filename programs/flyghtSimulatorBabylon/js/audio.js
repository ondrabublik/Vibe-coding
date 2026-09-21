'use strict';
// Procedural sounds via WebAudio: rotary engine, wind, guns, hits, explosions.
(function (BW) {
  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.lastGun = 0;
    }

    init() {
      if (this.ctx) { this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // Engine: sawtooth + square through a lowpass, amplitude-modulated by the cylinder "pops".
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2;
      this.engLp = lp;
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
      this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      this.am = ctx.createGain(); this.am.gain.value = 0.6;
      this.lfo = ctx.createOscillator(); this.lfo.type = 'square';
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.4;
      this.lfo.connect(lfoGain).connect(this.am.gain);
      this.osc1.connect(this.am);
      this.osc2.connect(g2).connect(this.am);
      this.am.connect(lp).connect(this.engGain).connect(this.master);
      this.osc1.start(); this.osc2.start(); this.lfo.start();

      // Wind
      const wind = ctx.createBufferSource();
      wind.buffer = this.noise; wind.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      wind.connect(bp).connect(this.windGain).connect(this.master);
      wind.start();
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.6;
    }

    update(player, active) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const on = active && player && player.alive;
      const thr = on ? player.throttle * player.enginePower : 0;
      const rpm = 18 + thr * 30 + (player ? player.V * 0.15 : 0);
      this.osc1.frequency.setTargetAtTime(rpm * 2, t, 0.1);
      this.osc2.frequency.setTargetAtTime(rpm, t, 0.1);
      this.lfo.frequency.setTargetAtTime(rpm * 0.5, t, 0.1);
      this.engLp.frequency.setTargetAtTime(350 + thr * 900, t, 0.1);
      this.engGain.gain.setTargetAtTime(on ? 0.18 + thr * 0.22 : 0, t, 0.15);
      const v = player && active ? player.V : 0;
      this.windGain.gain.setTargetAtTime(Math.min(0.35, (v / 70) ** 2 * 0.25), t, 0.2);
    }

    burst(opts) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = opts.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = opts.type || 'lowpass';
      f.frequency.value = opts.freq || 1000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(opts.vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random() * 1.5);
      src.stop(t + opts.dur + 0.05);
      if (opts.thump) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.frequency.setValueAtTime(opts.thump, t);
        o.frequency.exponentialRampToValueAtTime(opts.thump * 0.4, t + opts.dur);
        og.gain.setValueAtTime(opts.vol * 0.8, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
        o.connect(og).connect(this.master);
        o.start(t); o.stop(t + opts.dur + 0.05);
      }
    }

    gun(plane) {
      if (!this.ctx) return;
      const player = this.listener;
      if (plane.isPlayer) {
        this.burst({ vol: 0.22, dur: 0.07, freq: 1800, type: 'bandpass', thump: 140 });
        return;
      }
      if (!player) return;
      const d = BABYLON.Vector3.Distance(plane.pos, player.pos);
      if (d > 700) return;
      const now = performance.now();
      if (now - this.lastGun < 40) return;
      this.lastGun = now;
      this.burst({ vol: 0.16 * (1 - d / 700), dur: 0.06, freq: 1200, type: 'bandpass' });
    }

    hit() { this.burst({ vol: 0.25, dur: 0.05, freq: 3500, type: 'highpass' }); }
    hurt() { this.burst({ vol: 0.5, dur: 0.12, freq: 900, type: 'bandpass', thump: 90 }); }

    explosion(pos) {
      let vol = 0.9;
      if (this.listener && pos) vol = 0.9 * Math.max(0.08, 1 - BABYLON.Vector3.Distance(pos, this.listener.pos) / 3000);
      this.burst({ vol, dur: 1.8, freq: 380, rate: 0.5, thump: 60 });
    }
  }
  BW.Audio = Audio;
})(window.BW);
