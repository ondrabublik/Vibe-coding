'use strict';

// Dimensional + topological synthesis of planar linkages built only from rigid links
// and revolute joints, driven by one crank at constant speed.
//
// Structure (normalised mechanism units, input crank A-B has length 1, A at origin):
//   base four-bar     A (ground) - B (crank) - C (coupler) - D (ground)
//   dyad k (k = 0, 1) point X on body bx, point Y on body by, joined by two links
//                     X-G (length la) and Y-G (length lb): an RRR Assur group, keeps DOF = 1
//   pen               point on the chosen pen body
// Level 4 = four-bar, 6 = six-bar (one dyad, Watt/Stephenson), 8 = eight-bar (two dyads).
//
// Bodies: 0 ground, 1 crank, 2 coupler, 3 rocker, 4/5 links of dyad 0, 6/7 links of dyad 1.
// Each moving body has a frame (origin, unit x-axis); a body point is given in local coords (u, v).
//
// The pen curve is compared with the target modulo translation and scale (length-weighted
// centroid and RMS radius) plus a rotation gene, so the optimiser only searches for the shape.
//
// LinkageCore is self-contained so it can be stringified into a Web Worker.
function LinkageCore() {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI;
  const BX = [[1, 2, 3], [2, 3, 4, 5]];
  const BY = [[0, 1, 2, 3], [0, 1, 2, 3, 4, 5]];
  const PB = { 4: [2], 6: [4, 5], 8: [6, 7] };
  const ND = { 4: 0, 6: 1, 8: 2 };

  function buildSpec(level) {
    const g = [];
    const add = (name, kind, lo, hi) => g.push({ name, kind, lo, hi });
    add('rot', 'p', -PI, PI);
    add('g', 'c', 0.3, 5); add('phi', 'p', -PI, PI);
    add('r2', 'c', 0.3, 6); add('r3', 'c', 0.3, 6); add('s1', 's', -1, 1);
    for (let k = 0; k < ND[level]; k++) {
      add('bx' + k, 'd', 0, BX[k].length); add('by' + k, 'd', 0, BY[k].length);
      add('xu' + k, 'c', -4, 4); add('xv' + k, 'c', -4, 4);
      add('yu' + k, 'c', -5, 5); add('yv' + k, 'c', -5, 5);
      add('la' + k, 'c', 0.3, 7); add('lb' + k, 'c', 0.3, 7); add('s' + k, 's', -1, 1);
    }
    if (ND[level]) add('pb', 'd', 0, 2);
    add('pu', 'c', -4, 4); add('pv', 'c', -4, 4);
    return g;
  }
  const SPECS = { 4: buildSpec(4), 6: buildSpec(6), 8: buildSpec(8) };
  const gi = (level, name) => SPECS[level].findIndex(g => g.name === name);
  const disc = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v)));

  function decode(level, x) {
    let i = 0;
    const nx = () => x[i++];
    const p = { level, dy: [] };
    p.rot = nx(); p.g = nx(); p.phi = nx(); p.r2 = nx(); p.r3 = nx(); p.s1 = nx() < 0 ? -1 : 1;
    for (let k = 0; k < ND[level]; k++) {
      const d = {};
      d.bx = BX[k][disc(nx(), BX[k].length)];
      d.by = BY[k][disc(nx(), BY[k].length)];
      d.xu = nx(); d.xv = nx(); d.yu = nx(); d.yv = nx();
      d.la = nx(); d.lb = nx(); d.s = nx() < 0 ? -1 : 1;
      p.dy.push(d);
    }
    p.pb = ND[level] ? PB[level][disc(nx(), 2)] : 2;
    p.pu = nx(); p.pv = nx();
    return p;
  }

  // Circle-circle intersection; returns sine of the angle at the new joint, or -1.
  function isect(ax, ay, ra, bx, by, rb, s, out) {
    const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
    if (d < 1e-9 || d > ra + rb || d < Math.abs(ra - rb)) return -1;
    const a = (ra * ra - rb * rb + d2) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - a * a));
    const ux = dx / d, uy = dy / d;
    out[0] = ax + a * ux - s * h * uy;
    out[1] = ay + a * uy + s * h * ux;
    return d * h / (ra * rb);
  }

  // Joint layout in J (pairs): 0 A, 1 B, 2 C, 3 D, dyad k: X 4+3k, Y 5+3k, G 6+3k, then pen.
  const tmp = new Float64Array(2);
  function poseN(p, th, F, J) {
    const ct = Math.cos(th), st = Math.sin(th);
    F[0] = 0; F[1] = 0; F[2] = 1; F[3] = 0;
    F[4] = 0; F[5] = 0; F[6] = ct; F[7] = st;
    const Bx = ct, By = st, Dx = p.g * Math.cos(p.phi), Dy = p.g * Math.sin(p.phi);
    let ms = isect(Bx, By, p.r2, Dx, Dy, p.r3, p.s1, tmp);
    if (ms < 0) return -1;
    const Cx = tmp[0], Cy = tmp[1];
    F[8] = Bx; F[9] = By; F[10] = (Cx - Bx) / p.r2; F[11] = (Cy - By) / p.r2;
    F[12] = Dx; F[13] = Dy; F[14] = (Cx - Dx) / p.r3; F[15] = (Cy - Dy) / p.r3;
    J[0] = 0; J[1] = 0; J[2] = Bx; J[3] = By; J[4] = Cx; J[5] = Cy; J[6] = Dx; J[7] = Dy;
    for (let k = 0; k < p.dy.length; k++) {
      const d = p.dy[k], a = 4 * d.bx, b = 4 * d.by;
      const Xx = F[a] + d.xu * F[a + 2] - d.xv * F[a + 3], Xy = F[a + 1] + d.xu * F[a + 3] + d.xv * F[a + 2];
      const Yx = F[b] + d.yu * F[b + 2] - d.yv * F[b + 3], Yy = F[b + 1] + d.yu * F[b + 3] + d.yv * F[b + 2];
      const m = isect(Xx, Xy, d.la, Yx, Yy, d.lb, d.s, tmp);
      if (m < 0) return -1;
      if (m < ms) ms = m;
      const Gx = tmp[0], Gy = tmp[1], f1 = 4 * (4 + 2 * k), f2 = f1 + 4;
      F[f1] = Xx; F[f1 + 1] = Xy; F[f1 + 2] = (Gx - Xx) / d.la; F[f1 + 3] = (Gy - Xy) / d.la;
      F[f2] = Yx; F[f2 + 1] = Yy; F[f2 + 2] = (Gx - Yx) / d.lb; F[f2 + 3] = (Gy - Yy) / d.lb;
      const j = 8 + 6 * k;
      J[j] = Xx; J[j + 1] = Xy; J[j + 2] = Yx; J[j + 3] = Yy; J[j + 4] = Gx; J[j + 5] = Gy;
    }
    const o = 4 * p.pb, j = 8 + 6 * p.dy.length;
    J[j] = F[o] + p.pu * F[o + 2] - p.pv * F[o + 3];
    J[j + 1] = F[o + 1] + p.pu * F[o + 3] + p.pv * F[o + 2];
    return ms;
  }

  // Length-weighted centroid and RMS radius of a closed polyline stored as pairs.
  function curveStats(buf, n) {
    let L = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, len = Math.hypot(buf[2 * j] - buf[2 * i], buf[2 * j + 1] - buf[2 * i + 1]);
      L += len; cx += len * (buf[2 * i] + buf[2 * j]) / 2; cy += len * (buf[2 * i + 1] + buf[2 * j + 1]) / 2;
    }
    if (L < 1e-12) return null;
    cx /= L; cy /= L;
    let q = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, len = Math.hypot(buf[2 * j] - buf[2 * i], buf[2 * j + 1] - buf[2 * i + 1]);
      const mx = (buf[2 * i] + buf[2 * j]) / 2 - cx, my = (buf[2 * i + 1] + buf[2 * j + 1]) / 2 - cy;
      q += len * (mx * mx + my * my);
    }
    return { cx, cy, rms: Math.sqrt(q / L) };
  }

  function sizeOf(p) {
    let s = 1 + p.g + p.r2 + p.r3 + Math.hypot(p.pu, p.pv);
    for (const d of p.dy) s += d.la + d.lb + Math.hypot(d.xu, d.xv) + 0.5 * Math.hypot(d.yu, d.yv);
    return s;
  }

  function makeCost(level, T, S) {
    const M = T.length / 2, buf = new Float64Array(2 * S), mT = new Float64Array(M);
    const F = new Float64Array(32), J = new Float64Array(24), pi = 2 * (4 + 3 * ND[level]);
    return x => {
      const p = decode(level, x);
      let fails = 0, minSin = 1, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let i = 0; i < S; i++) {
        const m = poseN(p, TAU * i / S, F, J);
        if (m < 0) { fails++; continue; }
        buf[2 * i] = J[pi]; buf[2 * i + 1] = J[pi + 1];
        if (m < minSin) minSin = m;
        if ((i & 3) === 0) for (let j = 0; j < pi; j += 2) {
          if (J[j] < bx0) bx0 = J[j]; if (J[j] > bx1) bx1 = J[j];
          if (J[j + 1] < by0) by0 = J[j + 1]; if (J[j + 1] > by1) by1 = J[j + 1];
        }
      }
      if (fails) return 10 + 10 * fails / S;
      const st = curveStats(buf, S);
      if (!st || st.rms < 1e-6) return 20;
      const k = 1 / st.rms, cr = Math.cos(p.rot) * k, sr = Math.sin(p.rot) * k;
      for (let i = 0; i < S; i++) {
        const dx = buf[2 * i] - st.cx, dy = buf[2 * i + 1] - st.cy;
        buf[2 * i] = cr * dx - sr * dy; buf[2 * i + 1] = sr * dx + cr * dy;
      }
      mT.fill(Infinity);
      let sC = 0, maxC = 0;
      for (let j = 0; j < S; j++) {
        const cx = buf[2 * j], cy = buf[2 * j + 1];
        let mc = Infinity;
        for (let i = 0; i < M; i++) {
          const dx = T[2 * i] - cx, dy = T[2 * i + 1] - cy, d2 = dx * dx + dy * dy;
          if (d2 < mT[i]) mT[i] = d2;
          if (d2 < mc) mc = d2;
        }
        mc = Math.sqrt(mc); sC += mc; if (mc > maxC) maxC = mc;
      }
      let sT = 0, maxT = 0;
      for (let i = 0; i < M; i++) { const d = Math.sqrt(mT[i]); sT += d; if (d > maxT) maxT = d; }
      let c = sT / M + sC / S + 0.25 * maxT + 0.1 * maxC;
      if (minSin < 0.3) c += 0.2 * (0.3 - minSin);   // keep transmission angles above ~17 deg
      // prefer compact mechanisms: envelope of all joints relative to the curve, and total link length
      const env = Math.max(bx1 - bx0, by1 - by0) * k;
      if (env > 6) c += 0.03 * (env - 6);
      c += 0.001 * k * sizeOf(p);
      return c;
    };
  }

  function randomGenome(level) {
    const s = SPECS[level], x = new Float64Array(s.length);
    for (let j = 0; j < s.length; j++) x[j] = s[j].lo + Math.random() * (s[j].hi - s[j].lo);
    return x;
  }

  function assembles(level, x) {
    const p = decode(level, x), F = new Float64Array(32), J = new Float64Array(24);
    for (let i = 0; i < 72; i++) if (poseN(p, TAU * i / 72, F, J) < 0.12) return false;
    return true;
  }

  // Add one dyad attached exactly at the old pen point, pen moved onto the new link's origin:
  // the new mechanism draws the very same curve, and the optimiser can improve from there.
  function extendOnce(level, x) {
    const to = level + 2, k = ND[level], old = decode(level, x);
    const from = SPECS[level];
    for (let t = 0; t < 400; t++) {
      const y = randomGenome(to);
      from.forEach((g, j) => { if (g.name !== 'pb' && g.name !== 'pu' && g.name !== 'pv') y[gi(to, g.name)] = x[j]; });
      y[gi(to, 'bx' + k)] = BX[k].indexOf(old.pb) + 0.5;
      y[gi(to, 'xu' + k)] = old.pu; y[gi(to, 'xv' + k)] = old.pv;
      y[gi(to, 'pb')] = 0.5; y[gi(to, 'pu')] = 0; y[gi(to, 'pv')] = 0;
      if (assembles(to, y)) return y;
    }
    return null;
  }

  function extend(fromLevel, x, toLevel) {
    let lv = fromLevel, cur = x;
    while (cur && lv < toLevel) { cur = extendOnce(lv, cur); lv += 2; }
    return cur;
  }

  function nelderMead(f, x0, steps, iters) {
    const n = x0.length;
    let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simplex.push(x); }
    let vals = simplex.map(f);
    for (let it = 0; it < iters; it++) {
      const ord = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      simplex = ord.map(i => simplex[i]); vals = ord.map(i => vals[i]);
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      const w = simplex[n], at = t => c.map((cj, j) => cj + t * (w[j] - cj));
      const xr = at(-1), fr = f(xr);
      if (fr < vals[0]) {
        const xe = at(-2), fe = f(xe);
        if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
      } else if (fr < vals[n - 1]) {
        simplex[n] = xr; vals[n] = fr;
      } else {
        const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc);
        if (fc < Math.min(fr, vals[n])) { simplex[n] = xc; vals[n] = fc; }
        else for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          vals[i] = f(simplex[i]);
        }
      }
    }
    let bi = 0;
    for (let i = 1; i <= n; i++) if (vals[i] < vals[bi]) bi = i;
    return { x: simplex[bi], f: vals[bi] };
  }

  // One optimisation island: differential evolution (current-to-pbest/1/bin) with restarts,
  // seeded from lower-level solutions, finished by a Nelder-Mead polish.
  // m: {level, T, Tfine, budget, seedLevel, seeds: [genome]}
  function createRun(m) {
    const level = m.level, spec = SPECS[level], D = spec.length;
    const cost = makeCost(level, m.T, 96), costFine = makeCost(level, m.Tfine, 240);
    const NP = Math.max(40, Math.min(110, 5 * D));
    const seeds = m.seeds || [];
    const t0 = Date.now();
    const S = { best: null, bestF: Infinity, evals: 0, restarts: 0, done: false };
    let pop, fit, stallBest, stallGen;

    const ev = x => {
      const f = cost(x);
      S.evals++;
      if (f < S.bestF) { S.bestF = f; S.best = Float64Array.from(x); }
      return f;
    };
    const seedGenome = () => {
      const s = seeds[(Math.random() * seeds.length) | 0];
      return s ? (m.seedLevel === level ? Float64Array.from(s) : extend(m.seedLevel, s, level)) : null;
    };
    function init() {
      pop = []; fit = [];
      const useSeeds = seeds.length && S.restarts % 2 === 0;
      for (let i = 0; i < NP; i++) {
        let x = null;
        if (i === 0 && S.best && S.restarts % 3 === 1) x = Float64Array.from(S.best);
        else if (useSeeds && i < NP * 0.4) x = seedGenome();
        if (!x) x = randomGenome(level);
        pop.push(x); fit.push(ev(x));
      }
      stallBest = Math.min(...fit); stallGen = 0;
    }
    function generation() {
      const order = fit.map((f, i) => i).sort((a, b) => fit[a] - fit[b]);
      const pTop = Math.max(2, Math.round(0.12 * NP));
      for (let i = 0; i < NP; i++) {
        const xi = pop[i], pb = pop[order[(Math.random() * pTop) | 0]];
        let r1, r2;
        do { r1 = (Math.random() * NP) | 0; } while (r1 === i);
        do { r2 = (Math.random() * NP) | 0; } while (r2 === i || r2 === r1);
        const F = 0.4 + 0.5 * Math.random(), CR = Math.random() < 0.15 ? Math.random() : 0.9;
        const jr = (Math.random() * D) | 0, trial = new Float64Array(D);
        for (let j = 0; j < D; j++) {
          if (j !== jr && Math.random() >= CR) { trial[j] = xi[j]; continue; }
          const g = spec[j];
          let v = xi[j] + F * (pb[j] - xi[j]) + F * (pop[r1][j] - pop[r2][j]);
          if ((g.kind === 'd' || g.kind === 's') && Math.random() < 0.06) v = g.lo + Math.random() * (g.hi - g.lo);
          if (g.kind === 'p') { const span = g.hi - g.lo; v = g.lo + ((((v - g.lo) % span) + span) % span); }
          else if (v < g.lo) v = (g.lo + xi[j]) / 2;
          else if (v > g.hi) v = (g.hi + xi[j]) / 2;
          trial[j] = v;
        }
        const ft = ev(trial);
        if (ft <= fit[i]) { pop[i] = trial; fit[i] = ft; }
      }
      const pBest = Math.min(...fit);
      if (pBest < stallBest * (1 - 1e-3)) { stallBest = pBest; stallGen = 0; }
      else if (++stallGen > 80) { S.restarts++; init(); }
    }
    function polish() {
      const base = Float64Array.from(S.best), idx = [];
      spec.forEach((g, j) => {
        if (g.kind === 'c' || g.kind === 'p') idx.push(j);
        else if (g.kind === 's') base[j] = base[j] < 0 ? -0.5 : 0.5;
        else base[j] = disc(base[j], g.hi) + 0.5;
      });
      const merge = y => {
        const x = Float64Array.from(base);
        idx.forEach((j, k) => {
          const g = spec[j];
          let v = y[k];
          if (g.kind === 'p') { const span = g.hi - g.lo; v = g.lo + ((((v - g.lo) % span) + span) % span); }
          else v = Math.min(g.hi, Math.max(g.lo, v));
          x[j] = v;
        });
        return x;
      };
      const f0 = costFine(base);
      const res = nelderMead(y => costFine(merge(y)), idx.map(j => base[j]),
        idx.map(j => (spec[j].hi - spec[j].lo) * 0.005), Math.min(3000, 70 * idx.length));
      if (res.f < f0) { S.best = merge(res.x); S.bestF = res.f; } else { S.best = base; S.bestF = f0; }
    }

    init();
    S.step = ms => {
      if (S.done) return;
      const t = Date.now();
      while (Date.now() - t < ms) {
        if (Date.now() - t0 > 0.88 * m.budget) { polish(); S.done = true; return; }
        generation();
      }
    };
    return S;
  }

  return { decode, poseN, curveStats, createRun, ND, SPECS };
}

// --------------------------------------------------------------------------------------------
// Main-thread side: parallel islands (Web Workers when available), staged 4 -> 6 -> 8 links.
const Linkage = (() => {
  const core = LinkageCore();
  const TAU = 2 * Math.PI;

  function workerMain(e) {
    const run = CORE.createRun(e.data);
    let last = 0;
    const tick = () => {
      run.step(60);
      const t = Date.now();
      if (run.done || t - last > 250) {
        last = t;
        self.postMessage({ type: run.done ? 'done' : 'progress', best: run.best ? Array.from(run.best) : null,
                           bestF: run.bestF, evals: run.evals, restarts: run.restarts });
      }
      if (!run.done) setTimeout(tick, 0);
    };
    tick();
  }
  const WORKER_SRC = LinkageCore.toString() + '\nconst CORE = LinkageCore();\nself.onmessage = ' + workerMain.toString() + ';\n';
  let workerURL = null;
  function newWorker() {
    if (typeof Worker === 'undefined') return null;
    try {
      if (!workerURL) workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      return new Worker(workerURL);
    } catch (e) { return null; }
  }

  // Island running on the main thread (fallback when workers are unavailable).
  function localIsland(msg, onMsg) {
    const run = core.createRun(msg);
    let stopped = false, last = 0;
    const tick = () => {
      if (stopped) return;
      run.step(18);
      const t = Date.now();
      if (run.done || t - last > 250) {
        last = t;
        onMsg({ type: run.done ? 'done' : 'progress', best: run.best ? Array.from(run.best) : null,
                bestF: run.bestF, evals: run.evals, restarts: run.restarts });
      }
      if (!run.done) setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
    return { stop() { stopped = true; } };
  }

  function normalise(pts, tf) {
    const T = new Float64Array(pts.length * 2);
    pts.forEach((p, i) => { T[2 * i] = (p.x - tf.cx) / tf.rms; T[2 * i + 1] = (p.y - tf.cy) / tf.rms; });
    return T;
  }

  class Synthesis {
    // target: closed curve (world, arc-length resampled); maxLevel 4 | 6 | 8
    constructor(target, maxLevel, budgetMs) {
      const flat = new Float64Array(target.length * 2);
      target.forEach((p, i) => { flat[2 * i] = p.x; flat[2 * i + 1] = p.y; });
      this.tf = core.curveStats(flat, target.length);
      this.T = normalise(G.resampleClosed(target, 72), this.tf);
      this.Tfine = normalise(G.resampleClosed(target, 160), this.tf);
      this.levels = maxLevel === 4 ? [4] : maxLevel === 6 ? [4, 6] : [4, 6, 8];
      this.fractions = maxLevel === 4 ? [1] : maxLevel === 6 ? [0.3, 0.7] : [0.2, 0.35, 0.45];
      this.budget = budgetMs;
      this.nIslands = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
      this.results = [];
      this.t0 = performance.now();
      this.stage = -1;
      this.done = false;
      this.evalsDone = 0;
      this.usingWorkers = true;
      this.nextStage();
    }

    nextStage() {
      this.stage++;
      if (this.stage >= this.levels.length) { this.done = true; return; }
      const level = this.levels[this.stage];
      const prev = this.results[this.results.length - 1];
      const msg = {
        level, T: this.T, Tfine: this.Tfine,
        budget: this.budget * this.fractions[this.stage],
        seedLevel: prev ? prev.level : level,
        seeds: prev ? prev.pool : [],
      };
      this.stageStart = performance.now();
      this.islands = [];
      for (let i = 0; i < this.nIslands; i++) this.islands.push(this.spawn(msg));
    }

    spawn(msg) {
      const isl = { best: null, bestF: Infinity, evals: 0, restarts: 0, done: false, handle: null };
      const onMsg = d => {
        if (this.done) return;
        if (d.best && d.bestF <= isl.bestF) { isl.best = d.best; isl.bestF = d.bestF; }
        isl.evals = d.evals; isl.restarts = d.restarts;
        if (d.type === 'done') { isl.done = true; this.checkStage(); }
      };
      const w = this.usingWorkers ? newWorker() : null;
      if (w) {
        let heard = false;
        w.onmessage = e => { heard = true; onMsg(e.data); };
        w.onerror = ev => {
          ev.preventDefault();
          w.terminate();
          if (!heard) { this.usingWorkers = false; isl.handle = localIsland(msg, onMsg); }
        };
        w.postMessage(msg);
        isl.handle = { stop() { w.terminate(); } };
      } else {
        this.usingWorkers = false;
        // a single main-thread island is enough; extra ones would only slow the UI down
        if (this.islands.length === 0) isl.handle = localIsland(msg, onMsg);
        else isl.done = true;
      }
      return isl;
    }

    checkStage() {
      if (!this.islands.every(i => i.done)) return;
      this.finishStage();
      this.nextStage();
    }

    finishStage() {
      const level = this.levels[this.stage];
      const ok = this.islands.filter(i => i.best).sort((a, b) => a.bestF - b.bestF);
      this.islands.forEach(i => { this.evalsDone += i.evals; i.handle && i.handle.stop(); });
      if (!ok.length) return;
      this.results.push({ level, genome: ok[0].best, cost: ok[0].bestF, pool: ok.map(i => i.best) });
    }

    cancel() {
      if (this.done) return;
      this.finishStage();
      this.done = true;
    }

    progress() { return Math.min(1, (performance.now() - this.t0) / this.budget); }
    evals() { return this.evalsDone + (this.islands || []).reduce((s, i) => s + i.evals, 0); }
    restarts() { return (this.islands || []).reduce((s, i) => s + i.restarts, 0); }
    currentLevel() { return this.levels[Math.min(this.stage, this.levels.length - 1)]; }
    currentBest() {
      const live = (this.islands || []).filter(i => i.best).sort((a, b) => a.bestF - b.bestF)[0];
      if (live && !this.done) return { level: this.currentLevel(), genome: live.best, cost: live.bestF };
      return this.results[this.results.length - 1] || null;
    }
  }

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const BODY_NAMES = ['Rám', 'Klika', 'Ojnice', 'Vahadlo', 'Člen 5', 'Člen 6', 'Člen 7', 'Člen 8'];

  // World-space mechanism from a genome; tf maps normalised target space to the world.
  function makeSolution(level, genome, tf) {
    const p = core.decode(level, genome), nd = core.ND[level];
    const F = new Float64Array(32), J = new Float64Array(24);
    const nJ = 4 + 3 * nd + 1, penIdx = nJ - 1;
    // alignment of the pen curve, exactly as in the cost function
    const N = 720, buf = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) {
      core.poseN(p, TAU * i / N, F, J);
      buf[2 * i] = J[2 * penIdx]; buf[2 * i + 1] = J[2 * penIdx + 1];
    }
    const st = core.curveStats(buf, N), k = 1 / st.rms;
    const cr = Math.cos(p.rot) * k * tf.rms, sr = Math.sin(p.rot) * k * tf.rms;
    const toWorld = (x, y) => {
      const dx = x - st.cx, dy = y - st.cy;
      return { x: tf.cx + cr * dx - sr * dy, y: tf.cy + sr * dx + cr * dy };
    };
    const scale = k * tf.rms;

    // which joints belong to which body
    const bodies = { 1: [0, 1], 2: [1, 2], 3: [3, 2] }, grounds = [0, 3];
    p.dy.forEach((d, i) => {
      const X = 4 + 3 * i, Y = 5 + 3 * i, Gj = 6 + 3 * i;
      bodies[d.bx].push(X);
      if (d.by === 0) grounds.push(Y); else bodies[d.by].push(Y);
      bodies[4 + 2 * i] = [X, Gj];
      bodies[5 + 2 * i] = [Y, Gj];
    });
    bodies[p.pb].push(penIdx);
    const labels = [];
    for (let i = 0; i < nJ - 1; i++) labels.push(LETTERS[i]);
    labels.push('P');

    let last = null;
    const sol = {
      type: 'linkage', level, genome, p,
      name: level === 4 ? 'Kloubový čtyřčlen' : level === 6 ? 'Kloubový šestičlen' : 'Kloubový osmičlen',
      bodies, grounds, penIdx, labels, bodyNames: BODY_NAMES,
      nLinks: level, nJoints: 4 + 3 * nd,
      pose(th) {
        if (core.poseN(p, th, F, J) < 0) return last;
        const pts = [];
        for (let i = 0; i < nJ; i++) pts.push(toWorld(J[2 * i], J[2 * i + 1]));
        last = { pts, P: pts[penIdx] };
        return last;
      },
      pen(th) { const q = this.pose(th); return q ? q.P : null; },
      extentPoints() {
        const out = [];
        for (let i = 0; i < 90; i++) { const q = this.pose(TAU * i / 90); if (q) out.push(...q.pts); }
        return out;
      },
      // paths of all moving joints over one revolution (for the "joint paths" overlay)
      jointPaths() {
        if (this._paths) return this._paths;
        const paths = [];
        for (let j = 0; j < nJ - 1; j++) if (!grounds.includes(j)) paths.push({ j, pts: [] });
        for (let i = 0; i < 360; i++) {
          const q = this.pose(TAU * i / 360);
          if (q) paths.forEach(pa => pa.pts.push(q.pts[pa.j]));
        }
        return (this._paths = paths);
      },
      topology() {
        if (level === 4) return 'čtyřkloubový mechanismus, pero na ojnici';
        const d = p.dy[0], a = d.bx, b = d.by;
        const adjacent = [[0, 1], [1, 2], [2, 3], [0, 3]].some(([u, v]) => (a === u && b === v) || (a === v && b === u));
        let s = a === b ? 'dvojčlen na jednom členu' : adjacent ? 'Wattův řetězec' : 'Stephensonův řetězec';
        s += ` – dvojčlen E–G–F spojuje ${BODY_NAMES[a].toLowerCase()} a ${BODY_NAMES[b].toLowerCase()}`;
        if (level === 8) {
          const e = p.dy[1];
          s += `; druhý dvojčlen H–J–I spojuje ${BODY_NAMES[e.bx].toLowerCase()} a ${BODY_NAMES[e.by].toLowerCase()}`;
        }
        return s;
      },
      // side lengths of every moving body (world units)
      dimensions() {
        const q = this.pose(0), rows = [];
        for (const b of Object.keys(bodies).map(Number).sort((u, v) => u - v)) {
          const js = [...new Set(bodies[b])];
          const sides = [];
          for (let i = 0; i < js.length; i++) for (let j = i + 1; j < js.length; j++) {
            const d = G.dist(q.pts[js[i]], q.pts[js[j]]);
            if (d > 1e-6) sides.push(`${labels[js[i]]}${labels[js[j]]} ${d.toFixed(1)}`);
          }
          rows.push({ body: b, name: BODY_NAMES[b], sides });
        }
        return rows;
      },
      groundPivots() { const q = this.pose(0); return grounds.map(j => ({ label: labels[j], p: q.pts[j] })); },
      scale,
    };
    return sol;
  }

  return { Synthesis, makeSolution };
})();
