// Tiny WebAudio synth: engine drone + a few effects. No audio files needed.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // engine: two detuned saws through a lowpass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    this.engLP = lp;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.osc1.connect(lp); this.osc2.connect(lp);
    lp.connect(this.engGain); this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // noise buffer for skids / whooshes
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.skid = ctx.createBufferSource(); this.skid.buffer = buf; this.skid.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 1.5;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    this.skid.connect(bp); bp.connect(this.skidGain); this.skidGain.connect(this.master);
    this.skid.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  engine(speedNorm, on, drifting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + Math.abs(speedNorm) * 150;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.05);
    this.engLP.frequency.setTargetAtTime(500 + Math.abs(speedNorm) * 1400, t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.07 + Math.abs(speedNorm) * 0.06 : 0, t, 0.1);
    this.skidGain.gain.setTargetAtTime(drifting ? 0.05 : 0, t, 0.05);
  }

  tone(freq, dur = 0.15, type = 'square', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur = 0.3, vol = 0.3, freq = 1200) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur);
  }

  sfx(name) {
    switch (name) {
      case 'count': this.tone(440, 0.25, 'square', 0.18); break;
      case 'go': this.tone(880, 0.6, 'square', 0.2); break;
      case 'pickup': [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.08, 'triangle', 0.15, 0, i * 0.05)); break;
      case 'item': this.tone(1200, 0.1, 'triangle', 0.15); break;
      case 'boost': this.noise(0.6, 0.35, 3000); this.tone(300, 0.5, 'sawtooth', 0.08, 2.5); break;
      case 'turbo1': this.tone(500, 0.25, 'sawtooth', 0.1, 2); this.noise(0.3, 0.2, 2500); break;
      case 'turbo2': this.tone(400, 0.4, 'sawtooth', 0.12, 3); this.noise(0.5, 0.3, 3000); break;
      case 'hop': this.tone(300, 0.08, 'sine', 0.12, 1.6); break;
      case 'hit': this.tone(600, 0.5, 'square', 0.15, 0.2); this.noise(0.3, 0.25, 800); break;
      case 'wall': this.noise(0.15, 0.3, 600); break;
      case 'bump': this.noise(0.1, 0.15, 900); break;
      case 'throw': this.tone(700, 0.15, 'triangle', 0.12, 0.5); break;
      case 'lap': [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, 'square', 0.14, 0, i * 0.12)); break;
      case 'final': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.15, 0, i * 0.1)); break;
      case 'finish': [784, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'square', 0.15, 0, i * 0.15)); break;
    }
  }
}
