// Jednoduchý zvuk: vítr, šumění vody, třepetání plachet, déšť a hrom (WebAudio, bez souborů)
//
// Aby nebylo slyšet žádné periodické opakování:
// - každý zdroj má vlastní, různě dlouhý šumový buffer s plynulým (prolnutým) švem smyčky,
// - zdroje startují v náhodném místě bufferu,
// - třepetání plachty je nepravidelná obálka „pleskání“, ne pravidelný obdélníkový oscilátor.

// smyčkovatelný buffer: vygeneruje len + fade vzorků a začátek prolne s přesahem konce
function loopBuffer(ctx, seconds, gen) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds), fade = Math.floor(sr * 0.25);
  const raw = new Float32Array(len + fade);
  gen(raw, sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const w = i / fade; // equal-power prolnutí
    d[i] = raw[i] * Math.sin(w * Math.PI / 2) + raw[len + i] * Math.cos(w * Math.PI / 2);
  }
  return buf;
}

const whiteGen = (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; };

// hnědý šum bez stejnosměrné složky (jinak bubláním „dýchá“ a na švu cvaká)
const brownGen = (a) => {
  let x = 0, hp = 0, prev = 0;
  for (let i = 0; i < a.length; i++) {
    x = x * 0.995 + 0.06 * (Math.random() * 2 - 1);
    hp = 0.999 * (hp + x - prev); prev = x; // jednopólová horní propust ~7 Hz
    a[i] = hp * 1.2;
  }
};

// obálka třepetání: nepravidelná pleskání různé síly a rozestupu (0 … 1)
const flutterGen = (a, sr) => {
  a.fill(0);
  let t = 0;
  while (t < a.length) {
    const amp = 0.35 + Math.random() * 0.65;
    const decay = sr * (0.025 + Math.random() * 0.06);
    const att = Math.floor(sr * 0.004);
    const n = Math.floor(decay * 5);
    for (let k = 0; k < n && t + k < a.length; k++) {
      const e = k < att ? k / att : Math.exp(-(k - att) / decay);
      a[t + k] = Math.max(a[t + k], amp * e);
    }
    t += Math.floor(sr * (0.05 + Math.random() * Math.random() * 0.22));
  }
};

export class SailAudio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    const play = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; };

    // vítr
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.6;
    this.windLP = ctx.createBiquadFilter(); this.windLP.type = 'lowpass'; this.windLP.frequency.value = 2200;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    play(loopBuffer(ctx, 9.3, whiteGen)).connect(this.windF);
    this.windF.connect(this.windLP); this.windLP.connect(this.windG); this.windG.connect(this.master);

    // voda
    this.brown = loopBuffer(ctx, 7.7, brownGen);
    this.waterF = ctx.createBiquadFilter(); this.waterF.type = 'lowpass'; this.waterF.frequency.value = 600;
    this.waterG = ctx.createGain(); this.waterG.gain.value = 0;
    play(this.brown).connect(this.waterF); this.waterF.connect(this.waterG); this.waterG.connect(this.master);

    // třepetání plachty – šum tvarovaný nepravidelnou obálkou
    this.flapF = ctx.createBiquadFilter(); this.flapF.type = 'bandpass'; this.flapF.frequency.value = 700; this.flapF.Q.value = 0.5;
    this.flapMod = ctx.createGain(); this.flapMod.gain.value = 0; // řízeno obálkou
    this.flapG = ctx.createGain(); this.flapG.gain.value = 0;
    play(loopBuffer(ctx, 5.9, whiteGen)).connect(this.flapF);
    this.flapF.connect(this.flapMod); this.flapMod.connect(this.flapG); this.flapG.connect(this.master);
    this.flutter = play(loopBuffer(ctx, 11.3, flutterGen));
    this.flutter.connect(this.flapMod.gain);

    // déšť
    this.rainF = ctx.createBiquadFilter(); this.rainF.type = 'highpass'; this.rainF.frequency.value = 2500;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    play(loopBuffer(ctx, 6.4, whiteGen)).connect(this.rainF); this.rainF.connect(this.rainG); this.rainG.connect(this.master);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  update(aws, speed, flap, rain) {
    if (!this.ctx) return;
    const fin = (x) => (Number.isFinite(x) ? x : 0);
    aws = fin(aws); speed = fin(speed); flap = fin(flap); rain = fin(rain);
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(Math.min(0.4, 0.015 + aws * aws * 0.001), t, 0.4);
    this.windF.frequency.setTargetAtTime(250 + aws * 35, t, 0.4);
    this.waterG.gain.setTargetAtTime(Math.min(0.6, speed * 0.06), t, 0.3);
    this.waterF.frequency.setTargetAtTime(300 + speed * 90, t, 0.3);
    // slabé třepetání skoro neslyšet, silné až při výrazném pleskání
    this.flapG.gain.setTargetAtTime(Math.min(0.3, flap * flap * aws * 0.03), t, 0.15);
    this.flutter.playbackRate.setTargetAtTime(Math.min(1.6, 0.6 + aws * 0.06), t, 0.5);
    this.rainG.gain.setTargetAtTime(rain * 0.1, t, 0.5);
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
    s.start(t, Math.random() * (this.brown.duration - 5)); s.stop(t + 4.5);
  }
}
