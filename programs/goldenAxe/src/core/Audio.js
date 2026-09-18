// Tiny WebAudio synth – every sound is generated, no audio files needed.
export class AudioFx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.1, vol = 0.3, filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'swing': this.noise({ dur: 0.13, vol: 0.25, filter: 'highpass', f0: 800, f1: 3000 }); break;
      case 'hit':
        this.tone({ type: 'square', f0: 190, f1: 55, dur: 0.12, vol: 0.28 });
        this.noise({ dur: 0.08, vol: 0.35, f0: 1500, f1: 400 });
        break;
      case 'hurt': this.tone({ type: 'sawtooth', f0: 260, f1: 90, dur: 0.2, vol: 0.25 }); break;
      case 'thud':
        this.tone({ type: 'sine', f0: 110, f1: 35, dur: 0.25, vol: 0.5 });
        this.noise({ dur: 0.15, vol: 0.2, filter: 'lowpass', f0: 400 });
        break;
      case 'jump': this.tone({ type: 'square', f0: 250, f1: 520, dur: 0.1, vol: 0.12 }); break;
      case 'grab': this.tone({ type: 'square', f0: 160, f1: 120, dur: 0.08, vol: 0.2 }); break;
      case 'pickup':
        [660, 880, 1320].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.09, vol: 0.25, delay: i * 0.07 }));
        break;
      case 'magic':
        this.noise({ dur: 1.3, vol: 0.4, filter: 'lowpass', f0: 200, f1: 3000, q: 4 });
        this.tone({ type: 'sawtooth', f0: 80, f1: 500, dur: 1.0, vol: 0.18 });
        break;
      case 'thunder':
        this.noise({ dur: 0.9, vol: 0.6, filter: 'lowpass', f0: 1200, f1: 80 });
        break;
      case 'die': this.tone({ type: 'sawtooth', f0: 420, f1: 60, dur: 0.6, vol: 0.25 }); break;
      case 'select': this.tone({ type: 'square', f0: 880, dur: 0.05, vol: 0.15 }); break;
      case 'confirm':
        this.tone({ type: 'square', f0: 440, dur: 0.08, vol: 0.2 });
        this.tone({ type: 'square', f0: 880, dur: 0.15, vol: 0.2, delay: 0.08 });
        break;
      case 'go':
        this.tone({ type: 'square', f0: 660, dur: 0.1, vol: 0.18 });
        this.tone({ type: 'square', f0: 660, dur: 0.1, vol: 0.18, delay: 0.18 });
        break;
      case 'fanfare':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.18, vol: 0.2, delay: i * 0.15 }));
        break;
    }
  }
}
