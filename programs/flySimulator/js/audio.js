// All sounds are synthesised with WebAudio – no audio files needed.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    const sr = ctx.sampleRate;
    const noise = ctx.createBuffer(1, sr * 2, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const brown = ctx.createBuffer(1, sr * 2, sr);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    // "brrrt" – noise bursts at ~33 rounds per second
    const gun = ctx.createBuffer(1, sr, sr);
    const gd = gun.getChannelData(0);
    for (let i = 0; i < gd.length; i++) {
      const t = i / sr, ph = (t * 33) % 1, env = Math.exp(-ph * 9);
      gd[i] = ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 70 * t) * 0.6) * env;
    }
    this.noise = noise;

    const loop = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    const gain = (v, dest) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(dest);
      return g;
    };
    const filter = (type, f, q = 1) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };

    // engine chain goes through a "canopy" low-pass that closes in cockpit view
    this.canopy = filter('lowpass', 20000);
    this.canopy.connect(this.master);
    this.engGain = gain(0, this.canopy);
    this.engFilter = filter('lowpass', 400);
    this.engFilter.connect(this.engGain);
    loop(brown).connect(this.engFilter);
    this.whineGain = gain(0, this.canopy);
    this.whine = ctx.createOscillator();
    this.whine.type = 'sawtooth';
    this.whine.frequency.value = 300;
    const wf = filter('bandpass', 1200, 2);
    this.whine.connect(wf);
    wf.connect(this.whineGain);
    this.whine.start();
    this.abGain = gain(0, this.canopy);
    const abf = filter('lowpass', 500);
    abf.connect(this.abGain);
    loop(noise).connect(abf);
    // wind
    this.windGain = gain(0, this.master);
    this.windFilter = filter('bandpass', 700, 0.6);
    this.windFilter.connect(this.windGain);
    loop(noise).connect(this.windFilter);
    // gun
    this.gunGain = gain(0, this.master);
    const gf = filter('lowpass', 2500);
    gf.connect(this.gunGain);
    loop(gun).connect(gf);
    // seeker tone
    this.toneGain = gain(0, this.master);
    this.tone = ctx.createOscillator();
    this.tone.type = 'sine';
    this.tone.frequency.value = 800;
    this.tone.connect(this.toneGain);
    this.tone.start();
    // warning beeper
    this.warnGain = gain(0, this.master);
    this.warn = ctx.createOscillator();
    this.warn.type = 'square';
    this.warn.frequency.value = 1000;
    const wlp = filter('lowpass', 2500);
    this.warn.connect(wlp);
    wlp.connect(this.warnGain);
    this.warn.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** Continuous sounds – called every frame. */
  update(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const on = s.active ? 1 : 0;
    const thr = s.throttle;
    const ab = Math.max(0, (thr - 0.9) / 0.1);
    this.engGain.gain.setTargetAtTime(on * (0.25 + thr * 0.45), t, k);
    this.engFilter.frequency.setTargetAtTime(250 + thr * 1400, t, k);
    this.whine.frequency.setTargetAtTime(250 + thr * 900, t, k);
    this.whineGain.gain.setTargetAtTime(on * (0.02 + thr * 0.035), t, k);
    this.abGain.gain.setTargetAtTime(on * ab * 0.55, t, 0.15);
    this.canopy.frequency.setTargetAtTime(s.cockpit ? 1800 : 16000, t, 0.1);
    const w = Math.min(1, s.speed / 350);
    this.windGain.gain.setTargetAtTime(on * w * w * (s.cockpit ? 0.12 : 0.3), t, k);
    this.windFilter.frequency.setTargetAtTime(400 + w * 1600, t, k);
    this.gunGain.gain.setTargetAtTime(on * (s.gun ? 0.7 : 0), t, 0.015);

    // seeker: growl while tracking, high steady tone when locked
    let tg = 0, tf = 800;
    if (s.lock === 2) {
      tg = 0.07;
      tf = 1650;
    } else if (s.lock === 1) {
      tg = 0.045;
      tf = 700 + 80 * Math.sin(t * 40);
    }
    this.toneGain.gain.setTargetAtTime(on * tg, t, 0.02);
    this.tone.frequency.setTargetAtTime(tf, t, 0.01);

    // warnings: missile (fast high beeps) > RWR lock > stall / pull-up
    let wg = 0, wfreq = 1000;
    if (s.missileWarn) {
      wg = (t * 8) % 1 < 0.5 ? 0.09 : 0;
      wfreq = 1250;
    } else if (s.pullUp) {
      wg = (t * 4) % 1 < 0.5 ? 0.08 : 0;
      wfreq = 700;
    } else if (s.stall) {
      wg = (t * 3) % 1 < 0.6 ? 0.06 : 0;
      wfreq = 450;
    } else if (s.rwr) {
      wg = (t * 2.5) % 1 < 0.25 ? 0.05 : 0;
      wfreq = 900;
    }
    this.warnGain.gain.setTargetAtTime(on * wg, t, 0.005);
    this.warn.frequency.setTargetAtTime(wfreq, t, 0.005);
  }

  _burst({ dur, gain, type = 'lowpass', f0, f1, q = 1, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  _thump(freq, dur, gain) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  explosion(dist = 0, big = 1) {
    const v = Math.min(1, 600 / (dist + 300)) * big;
    if (v < 0.03) return;
    const delay = Math.min(dist / 343, 3) * 0.5;
    this._burst({ dur: 1.8, gain: 0.9 * v, f0: 900, f1: 60, delay });
    this._thump(70, 1.0, 0.6 * v);
  }

  launch() {
    this._burst({ dur: 1.4, gain: 0.5, type: 'bandpass', f0: 3000, f1: 500, q: 0.8 });
  }

  hit() {
    this._burst({ dur: 0.12, gain: 0.6, type: 'highpass', f0: 1500, f1: 800 });
  }

  hitMarker() {
    this._burst({ dur: 0.06, gain: 0.25, type: 'bandpass', f0: 3500, f1: 3000, q: 4 });
  }

  touchdown(v) {
    this._burst({ dur: 0.35, gain: Math.min(0.6, 0.15 + v * 0.1), type: 'bandpass', f0: 1800, f1: 900, q: 3 });
  }

  click() {
    this._burst({ dur: 0.05, gain: 0.25, type: 'bandpass', f0: 2000, f1: 1500, q: 2 });
  }

  gear() {
    this._burst({ dur: 1.2, gain: 0.12, type: 'bandpass', f0: 300, f1: 500, q: 3 });
  }

  flare() {
    this._burst({ dur: 0.25, gain: 0.3, type: 'bandpass', f0: 1200, f1: 400, q: 1 });
  }
}
