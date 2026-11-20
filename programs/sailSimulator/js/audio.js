// Jednoduchý zvuk: vítr, šumění vody, třepetání plachet, déšť a hrom (WebAudio, bez souborů)
export class SailAudio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    this.ctx = ctx;
    const len = ctx.sampleRate * 3;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = white.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    const src = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // vítr
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.8;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src(white).connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    // voda
    this.waterF = ctx.createBiquadFilter(); this.waterF.type = 'lowpass'; this.waterF.frequency.value = 600;
    this.waterG = ctx.createGain(); this.waterG.gain.value = 0;
    src(brown).connect(this.waterF); this.waterF.connect(this.waterG); this.waterG.connect(this.master);
    // třepetání plachty – modulovaný šum
    this.flapF = ctx.createBiquadFilter(); this.flapF.type = 'bandpass'; this.flapF.frequency.value = 900; this.flapF.Q.value = 0.6;
    this.flapG = ctx.createGain(); this.flapG.gain.value = 0;
    this.flapMod = ctx.createGain(); this.flapMod.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7; lfo.connect(this.flapMod.gain); lfo.start();
    src(white).connect(this.flapF); this.flapF.connect(this.flapMod); this.flapMod.connect(this.flapG); this.flapG.connect(this.master);
    this.lfo = lfo;
    // déšť
    this.rainF = ctx.createBiquadFilter(); this.rainF.type = 'highpass'; this.rainF.frequency.value = 2500;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    src(white).connect(this.rainF); this.rainF.connect(this.rainG); this.rainG.connect(this.master);
    this.brown = brown;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }

  update(aws, speed, flap, rain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(Math.min(0.5, 0.02 + aws * aws * 0.0012), t, 0.3);
    this.windF.frequency.setTargetAtTime(300 + aws * 45, t, 0.3);
    this.waterG.gain.setTargetAtTime(Math.min(0.9, speed * 0.09), t, 0.3);
    this.waterF.frequency.setTargetAtTime(300 + speed * 90, t, 0.3);
    this.flapG.gain.setTargetAtTime(Math.min(0.5, flap * aws * 0.05), t, 0.1);
    this.lfo.frequency.setTargetAtTime(4 + aws * 0.6, t, 0.3);
    this.rainG.gain.setTargetAtTime(rain * 0.12, t, 0.5);
  }

  thunder(delay = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.2, t + 0.15); g.gain.exponentialRampToValueAtTime(0.01, t + 4);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 4.5);
  }
}
