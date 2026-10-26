'use strict';
// Procedurální zvuky přes WebAudio: vítr, ptáci, cvrčci, voda, naviják, brzda, šplouchání.
(function (FS) {
  const A = { ready: false, reelRate: 0, dragRate: 0, spoolRate: 0, _acc: { reel: 0, drag: 0, spool: 0 } };
  FS.Audio = A;
  let ctx, master, noiseBuf;

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.ready = true;
    startAmbient();
  };
  A.setVolume = (v) => { if (master) master.gain.value = v; };

  function noise(loop = false) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function panner(p) {
    if (ctx.createStereoPanner) { const n = ctx.createStereoPanner(); n.pan.value = p; return n; }
    return ctx.createGain();
  }

  function startAmbient() {
    // vítr
    const w = noise(true);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    w.connect(bp); bp.connect(lp); lp.connect(wg); wg.connect(master);
    w.start();
    const lfo = () => {
      const t = ctx.currentTime;
      wg.gain.linearRampToValueAtTime(0.025 + Math.random() * 0.07, t + 2 + Math.random() * 3);
      bp.frequency.linearRampToValueAtTime(250 + Math.random() * 350, t + 3);
      setTimeout(lfo, 2500 + Math.random() * 2500);
    };
    lfo();
    // listí – šumění
    const l = noise(true);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const lg = ctx.createGain(); lg.gain.value = 0.012;
    l.connect(hp); hp.connect(lg); lg.connect(master); l.start();
    const leafLfo = () => { lg.gain.linearRampToValueAtTime(0.004 + Math.random() * 0.018, ctx.currentTime + 2); setTimeout(leafLfo, 2000 + Math.random() * 2000); };
    leafLfo();
    birdLoop();
    lapLoop();
    cricketLoop();
  }

  function chirp(t, f0, f1, dur, vol, pan) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, 0.005, vol, dur);
    const p = panner(pan);
    o.connect(g); g.connect(p); p.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function birdLoop() {
    const t = ctx.currentTime + 0.05;
    const kind = Math.floor(Math.random() * 4);
    const pan = Math.random() * 2 - 1, vol = 0.012 + Math.random() * 0.02;
    if (kind === 0) { // pěnkava – sestupná trylka
      let f = 4200 + Math.random() * 800;
      for (let i = 0; i < 9; i++) { chirp(t + i * 0.09, f, f * 0.8, 0.07, vol, pan); f *= 0.95; }
      chirp(t + 0.9, 3000, 5200, 0.18, vol, pan);
    } else if (kind === 1) { // sýkora – „cicibe"
      for (let i = 0; i < 3; i++) { chirp(t + i * 0.32, 5200, 5000, 0.08, vol, pan); chirp(t + i * 0.32 + 0.11, 3600, 3500, 0.12, vol, pan); }
    } else if (kind === 2) { // kos – melodie
      const notes = [1800, 2200, 1600, 2600, 2000, 1500];
      notes.forEach((n, i) => chirp(t + i * 0.16, n, n * (0.9 + Math.random() * 0.25), 0.13, vol * 0.9, pan));
    } else {
      for (let i = 0; i < 5; i++) chirp(t + i * 0.06, 6000, 7000, 0.04, vol * 0.6, pan);
    }
    setTimeout(birdLoop, 2500 + Math.random() * 6000);
  }
  function lapLoop() {
    const t = ctx.currentTime;
    const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350 + Math.random() * 300;
    const g = ctx.createGain(); env(g, t, 0.15, 0.03 + Math.random() * 0.03, 0.6);
    n.connect(lp); lp.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + 1);
    setTimeout(lapLoop, 900 + Math.random() * 2200);
  }
  function cricketLoop() {
    const t = ctx.currentTime;
    const pan = Math.random() * 2 - 1;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 4400;
      const g = ctx.createGain(); env(g, t + i * 0.05, 0.004, 0.0025, 0.03);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4400; bp.Q.value = 8;
      const p = panner(pan);
      o.connect(bp); bp.connect(g); g.connect(p); p.connect(master); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.05);
    }
    setTimeout(cricketLoop, 400 + Math.random() * 1500);
  }

  // ---- efekty ----
  A.whoosh = function (speed = 1) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    const n = noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(1500 + speed * 1500, t + 0.25);
    const g = ctx.createGain(); env(g, t, 0.05, Math.min(0.35, 0.08 + speed * 0.12), 0.3);
    n.connect(bp); bp.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + 0.5);
  };
  A.splash = function (size = 1) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500 + size * 1500, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const g = ctx.createGain(); env(g, t, 0.008, Math.min(0.6, 0.12 + size * 0.2), 0.35 + size * 0.2);
    n.connect(lp); lp.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + 1);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    const og = ctx.createGain(); env(og, t, 0.005, 0.08 * size, 0.15);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.3);
  };
  A.plop = function (vol = 0.15) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(250, t + 0.08);
    const g = ctx.createGain(); env(g, t, 0.003, vol, 0.1);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15);
  };
  function click(freq, vol, len = 0.012) {
    const t = ctx.currentTime;
    const n = noise(); const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = freq; hp.Q.value = 3;
    const g = ctx.createGain(); env(g, t, 0.001, vol, len);
    n.connect(hp); hp.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + len + 0.02);
  }
  A.snap = function () {
    if (!A.ready) return;
    click(2500, 0.6, 0.05);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = ctx.createGain(); env(g, t, 0.002, 0.2, 0.12);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  };
  A.coin = function () {
    if (!A.ready) return;
    const t = ctx.currentTime;
    [[1318, 0], [1760, 0.09], [2637, 0.18]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); env(g, t + d, 0.004, 0.14, 0.4);
      o.connect(g); g.connect(master); o.start(t + d); o.stop(t + d + 0.5);
    });
  };
  // křik racka
  A.gull = function (vol = 1) {
    if (!A.ready) return;
    const t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    const pan = Math.random() * 2 - 1;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.22;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1150 + Math.random() * 150, t);
      o.frequency.exponentialRampToValueAtTime(700, t + 0.17);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 2.5;
      const g = ctx.createGain(); env(g, t, 0.01, 0.035 * vol, 0.17);
      const p = panner(pan);
      o.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
      o.start(t); o.stop(t + 0.25);
    }
  };
  A.ui = function () { if (A.ready) click(1800, 0.12, 0.02); };
  A.tick = function () { if (A.ready) click(3200, 0.05, 0.008); };

  A.update = function (dt) {
    if (!A.ready) return;
    const a = A._acc;
    a.reel += A.reelRate * dt;
    while (a.reel >= 1) { click(2600, 0.07, 0.01); a.reel -= 1; }
    a.drag += A.dragRate * dt;
    if (a.drag > 6) a.drag = 6;
    while (a.drag >= 1) { click(4200, 0.11, 0.008); a.drag -= 1; }
    a.spool += A.spoolRate * dt;
    if (a.spool > 4) a.spool = 4;
    while (a.spool >= 1) { click(5200, 0.025, 0.006); a.spool -= 1; }
  };
})(window.FS);
