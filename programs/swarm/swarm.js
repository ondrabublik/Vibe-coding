'use strict';
/*
 * Hejno a dravec — boids simulation with a mouse-controlled predator.
 * Pure canvas 2D, no dependencies.
 */
(() => {

// ---------------------------------------------------------------------------
// Canvas & helpers
// ---------------------------------------------------------------------------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const trail = document.createElement('canvas');
const tctx = trail.getContext('2d');
let W = 0, H = 0, DPR = 1;

const TAU = Math.PI * 2;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * DPR));
  c.height = Math.max(1, Math.round(h * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  return [c, g];
}
function makeSprite(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
// ridge line for hills / mountains
function ridge(rng, base, amp, freqs) {
  const ph = freqs.map(() => rng() * TAU);
  return x => {
    let y = 0;
    freqs.forEach((f, k) => { y += Math.sin(x * f + ph[k]) / (k + 1); });
    return base + y * amp;
  };
}
function fillRidge(g, f, color, step = 6) {
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W + step; x += step) g.lineTo(x, f(x));
  g.lineTo(W, H);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

// ---------------------------------------------------------------------------
// Agent storage (structure of arrays)
// ---------------------------------------------------------------------------
const MAX = 3200;
const px = new Float32Array(MAX), py = new Float32Array(MAX);
const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
const hc = new Float32Array(MAX), hs = new Float32Array(MAX);   // heading cos/sin
const sp = new Uint8Array(MAX);       // species
const dep = new Float32Array(MAX);    // depth 0 far .. 1 near
const ph = new Float32Array(MAX);     // animation phase (tail / wings)
const ph2 = new Float32Array(MAX);    // flash phase (fireflies)
const om = new Float32Array(MAX);     // natural flash frequency
const pan = new Float32Array(MAX);    // panic 0..1
const bk = new Uint8Array(MAX);       // render bucket
let N = 0;

// uniform grid for neighbour search
let cell = 40, cols = 1, rows = 1;
let head = new Int32Array(1);
const next = new Int32Array(MAX);

function buildGrid() {
  cols = Math.ceil(W / cell) + 1;
  rows = Math.ceil(H / cell) + 1;
  const n = cols * rows;
  if (head.length < n) head = new Int32Array(n);
  head.fill(-1, 0, n);
  for (let i = 0; i < N; i++) {
    const c = cellOf(px[i], py[i]);
    next[i] = head[c];
    head[c] = i;
  }
}
function cellOf(x, y) {
  let gx = (x / cell) | 0, gy = (y / cell) | 0;
  if (gx < 0) gx = 0; else if (gx >= cols) gx = cols - 1;
  if (gy < 0) gy = 0; else if (gy >= rows) gy = rows - 1;
  return gy * cols + gx;
}

// ---------------------------------------------------------------------------
// User parameters
// ---------------------------------------------------------------------------
const P = { cohesion: 1, alignment: 1, separation: 1, fear: 1, speed: 1, trails: false };
let caught = 0;

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------
const SCENES = [
  {
    id: 'ocean', name: 'Oceán', sub: 'Hejno sardinek a žralok', icon: '🐟', accent: '#5fd4ff',
    count: 700, R: 44, sep: 17, maxSp: 2.5, minSp: 1.0,
    align: 0.06, coh: 0.02, sepW: 0.11, flee: 0.6, fleeR: 180, maxAcc: 0.14,
    wander: 0.05, flow: 0.012, edge: 0.22, margin: { l: 70, r: 70, t: 110, b: 150 },
    boost: 1.0, maxNb: 14, species: [0.86, 0.14],
    predSp: 3.1, predAcc: 0.13, catchR: 15, mouth: 4, trailFade: 0.35,
  },
  {
    id: 'sky', name: 'Soumrak', sub: 'Hejno špačků a sokol', icon: '🐦', accent: '#ffa36b',
    count: 1500, R: 36, sep: 12, maxSp: 3.0, minSp: 1.7,
    align: 0.08, coh: 0.022, sepW: 0.11, flee: 0.65, fleeR: 190, maxAcc: 0.16,
    wander: 0.04, flow: 0.014, edge: 0.2, margin: { l: 80, r: 80, t: 60, b: 0.36 },
    boost: 0.9, maxNb: 10, species: [1],
    predSp: 3.6, predAcc: 0.12, catchR: 13, mouth: 14, trailFade: 0.3,
  },
  {
    id: 'night', name: 'Světlušky', sub: 'Letní noc a netopýr', icon: '✨', accent: '#c8ff6a',
    count: 480, R: 55, sep: 15, maxSp: 1.25, minSp: 0.35,
    align: 0.02, coh: 0.008, sepW: 0.06, flee: 0.35, fleeR: 150, maxAcc: 0.07,
    wander: 0.09, flow: 0.012, edge: 0.08, margin: { l: 60, r: 60, t: 0.28, b: 90 },
    boost: 2.2, maxNb: 12, species: [1], fire: true, K: 0.035,
    predSp: 2.6, predAcc: 0.12, catchR: 14, mouth: 10, trailFade: 0.18,
  },
  {
    id: 'neon', name: 'Neon', sub: 'Roj světel a prázdnota', icon: '🌌', accent: '#ff5bd8',
    count: 1200, R: 40, sep: 12, maxSp: 3.6, minSp: 1.8,
    align: 0.07, coh: 0.02, sepW: 0.1, flee: 0.75, fleeR: 210, maxAcc: 0.2,
    wander: 0.05, flow: 0.02, edge: 0.25, margin: { l: 70, r: 70, t: 70, b: 0.3 },
    boost: 0.8, maxNb: 12, species: [0.5, 0.5], trails: true,
    predSp: 3.4, predAcc: 0.16, catchR: 26, mouth: 0, trailFade: 0.2,
  },
];
let scene = SCENES[0];
const margin = { l: 0, r: 0, t: 0, b: 0 };
function computeMargins() {
  const m = scene.margin;
  margin.l = m.l < 1 ? m.l * W : m.l;
  margin.r = m.r < 1 ? m.r * W : m.r;
  margin.t = m.t < 1 ? m.t * H : m.t;
  margin.b = m.b < 1 ? m.b * H : m.b;
}

// ---------------------------------------------------------------------------
// Agents: spawn / respawn
// ---------------------------------------------------------------------------
function initAgent(i) {
  let r = Math.random(), s = 0;
  const fr = scene.species;
  while (s < fr.length - 1 && r > fr[s]) { r -= fr[s]; s++; }
  sp[i] = s;
  dep[i] = Math.pow(Math.random(), 0.7);
  ph[i] = rand(TAU);
  ph2[i] = rand(TAU);
  om[i] = TAU / rand(130, 175);
  pan[i] = 0;
}
function placeInside(i, cx, cy, ang) {
  const x0 = margin.l, x1 = W - margin.r, y0 = margin.t, y1 = H - margin.b;
  px[i] = clamp(cx + gauss() * 110, x0, x1);
  py[i] = clamp(cy + gauss() * 80, y0, y1);
  const a = ang + gauss() * 0.4, v = (scene.minSp + scene.maxSp) * 0.5;
  vx[i] = Math.cos(a) * v; vy[i] = Math.sin(a) * v;
}
function respawn(i) {
  initAgent(i);
  const side = (Math.random() * 4) | 0, v = scene.minSp * 1.5;
  const yMid = rand(margin.t, H - margin.b), xMid = rand(margin.l, W - margin.r);
  if (side === 0) { px[i] = -30; py[i] = yMid; vx[i] = v; vy[i] = 0; }
  else if (side === 1) { px[i] = W + 30; py[i] = yMid; vx[i] = -v; vy[i] = 0; }
  else if (side === 2) { px[i] = xMid; py[i] = -30; vx[i] = 0; vy[i] = v; }
  else { px[i] = xMid; py[i] = H + 30; vx[i] = 0; vy[i] = -v; }
  if (scene.id === 'sky' || scene.id === 'night') { // don't come out of the ground
    if (side === 3) { py[i] = -30; vy[i] = v; }
  }
}
function spawnAll(n) {
  N = Math.min(n, MAX);
  const k = 4 + ((Math.random() * 3) | 0), centers = [];
  for (let c = 0; c < k; c++) centers.push({
    x: rand(margin.l, W - margin.r), y: rand(margin.t, H - margin.b), a: rand(TAU),
  });
  for (let i = 0; i < N; i++) {
    initAgent(i);
    const c = centers[i % k];
    placeInside(i, c.x, c.y, c.a);
  }
}
function setCount(n) {
  n = Math.min(n, MAX);
  for (let i = N; i < n; i++) respawn(i);
  N = n;
}

// ---------------------------------------------------------------------------
// Predators
// ---------------------------------------------------------------------------
const preds = [];
const mouse = { x: 0, y: 0, active: false, last: 0, down: false };

function makePred(ai) {
  const p = {
    ai, x: ai ? rand(W) : W / 2, y: ai ? rand(H * 0.2, H * 0.6) : H / 2,
    vx: rand(-1, 1), vy: rand(-1, 1), angle: rand(TAU), speed: 0,
    lunge: 0, cool: 0, flap: rand(TAU), target: -1, retarget: 0, spine: [],
  };
  for (let k = 0; k < 11; k++) p.spine.push({ x: p.x - k * 9, y: p.y });
  return p;
}
function lunge(p) {
  if (p.cool > 0) return;
  p.lunge = 24; p.cool = 36;
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  p.vx += c * scene.predSp * 1.2; p.vy += s * scene.predSp * 1.2;
}

function updatePred(p, dt) {
  let tx, ty;
  const player = !p.ai && mouse.active;
  if (player) { tx = mouse.x; ty = mouse.y; }
  else {
    p.retarget -= dt;
    if (p.target < 0 || p.target >= N || p.retarget <= 0) {
      p.target = (Math.random() * N) | 0;
      p.retarget = rand(200, 420);
    }
    const j = p.target;
    tx = px[j] + vx[j] * 18; ty = py[j] + vy[j] * 18;
  }
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
  const lunging = p.lunge > 0;
  const maxS = scene.predSp * (lunging ? 2.3 : 1) * (player ? 1 : 0.85);
  const want = Math.min(maxS, d * (player ? 0.07 : 0.05) + (player ? 0 : 0.8));
  let sx = dx / d * want - p.vx, sy = dy / d * want - p.vy;
  const acc = scene.predAcc * (lunging ? 2.6 : 1);
  const sm = Math.hypot(sx, sy);
  if (sm > acc) { sx *= acc / sm; sy *= acc / sm; }
  p.vx += sx * dt; p.vy += sy * dt;
  p.x += p.vx * dt; p.y += p.vy * dt;

  const spd = Math.hypot(p.vx, p.vy);
  p.speed = spd;
  if (spd > 0.15) {
    let da = Math.atan2(p.vy, p.vx) - p.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.angle += da * Math.min(1, 0.22 * dt);
  }
  p.flap += dt * (0.1 + spd * 0.045) * (lunging ? 1.5 : 1);
  if (p.lunge > 0) p.lunge -= dt;
  if (p.cool > 0) p.cool -= dt;
  if (!player && d < 120 && p.cool <= 0 && Math.random() < 0.05) { lunge(p); p.cool = rand(120, 220); }

  // spine (used by the shark)
  const s = p.spine;
  s[0].x = p.x; s[0].y = p.y;
  for (let k = 1; k < s.length; k++) {
    const ex = s[k].x - s[k - 1].x, ey = s[k].y - s[k - 1].y, el = Math.hypot(ex, ey) || 1;
    s[k].x = s[k - 1].x + ex / el * 9;
    s[k].y = s[k - 1].y + ey / el * 9;
  }

  // wake bubbles / sparks
  if (scene.id === 'ocean' && Math.random() < spd * 0.05 * dt) {
    const t = s[s.length - 1];
    bubbles.push({ x: t.x + rand(-4, 4), y: t.y + rand(-4, 4), r: rand(1, 3), vy: rand(0.3, 0.7), w: rand(TAU) });
  }
  if (scene.id === 'neon' && Math.random() < 0.6 * dt) {
    const a = rand(TAU), r = rand(10, 22);
    addParticle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, -p.vx * 0.2 + rand(-0.4, 0.4), -p.vy * 0.2 + rand(-0.4, 0.4), 40, 'spark', `hsl(${rand(290, 330)},100%,70%)`, 1.5);
  }

  if (lunging || spd > scene.predSp * 0.92) eat(p);
}

function eat(p) {
  const mx = p.x + Math.cos(p.angle) * scene.mouth, my = p.y + Math.sin(p.angle) * scene.mouth;
  const r = scene.catchR * (p.lunge > 0 ? 1.3 : 1), r2 = r * r;
  const gx = clamp((mx / cell) | 0, 0, cols - 1), gy = clamp((my / cell) | 0, 0, rows - 1);
  for (let yy = gy - 1; yy <= gy + 1; yy++) {
    if (yy < 0 || yy >= rows) continue;
    for (let xx = gx - 1; xx <= gx + 1; xx++) {
      if (xx < 0 || xx >= cols) continue;
      let j = head[yy * cols + xx];
      while (j !== -1) {
        const nj = next[j];
        const dx = px[j] - mx, dy = py[j] - my;
        if (dx * dx + dy * dy < r2 && px[j] > -10 && px[j] < W + 10) {
          catchEffect(px[j], py[j], vx[j], vy[j], sp[j]);
          respawn(j);
          caught++;
          caughtEl.textContent = caught;
        }
        j = nj;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Particles & ambient
// ---------------------------------------------------------------------------
const parts = [];
function addParticle(x, y, pvx, pvy, life, type, color, size) {
  if (parts.length > 1800) return;
  parts.push({ x, y, vx: pvx, vy: pvy, life, max: life, type, color, size, rot: rand(TAU), vr: rand(-0.2, 0.2) });
}
function catchEffect(x, y, fvx, fvy, s) {
  const id = scene.id;
  if (id === 'ocean') {
    for (let k = 0; k < 14; k++) {
      const a = rand(TAU), v = rand(0.3, 2.2);
      addParticle(x, y, Math.cos(a) * v + fvx * 0.3, Math.sin(a) * v + fvy * 0.3, rand(30, 60), 'scale',
        s ? `hsl(${rand(35, 50)},95%,${rand(55, 75)}%)` : `hsl(${rand(190, 210)},40%,${rand(70, 92)}%)`, rand(1, 2.2));
    }
    for (let k = 0; k < 6; k++) bubbles.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), r: rand(1.5, 4), vy: rand(0.4, 1), w: rand(TAU) });
  } else if (id === 'sky') {
    for (let k = 0; k < 9; k++) {
      const a = rand(TAU), v = rand(0.4, 1.8);
      addParticle(x, y, Math.cos(a) * v + fvx * 0.4, Math.sin(a) * v + fvy * 0.4, rand(90, 160), 'feather', `rgba(${rand(30, 70) | 0},${rand(20, 40) | 0},${rand(40, 60) | 0},1)`, rand(2.5, 4.5));
    }
  } else if (id === 'night') {
    for (let k = 0; k < 18; k++) {
      const a = rand(TAU), v = rand(0.3, 2.2);
      addParticle(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(30, 70), 'glow', 'fire', rand(6, 14));
    }
  } else {
    for (let k = 0; k < 22; k++) {
      const a = rand(TAU), v = rand(1, 5);
      addParticle(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(20, 45), 'spark', `hsl(${s ? rand(20, 50) : rand(170, 200)},100%,70%)`, rand(1, 2.2));
    }
  }
}
function updateParticles(dt) {
  for (let k = parts.length - 1; k >= 0; k--) {
    const q = parts[k];
    q.life -= dt;
    if (q.life <= 0) { parts[k] = parts[parts.length - 1]; parts.pop(); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    if (q.type === 'feather') {
      q.vx *= Math.pow(0.96, dt); q.vy = q.vy * Math.pow(0.96, dt) + 0.02 * dt;
      q.vx += Math.sin(q.life * 0.08 + q.rot) * 0.03 * dt;
    } else {
      q.vx *= Math.pow(0.94, dt); q.vy *= Math.pow(0.94, dt);
      if (q.type === 'scale') q.vy += 0.01 * dt;
    }
  }
}
function drawParticles(g) {
  for (const q of parts) {
    const a = q.life / q.max;
    if (q.type === 'scale') {
      g.globalAlpha = a;
      g.fillStyle = q.color;
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
      g.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(q.life * 0.3)));
      g.beginPath(); g.arc(0, 0, q.size, 0, TAU); g.fill();
      g.restore();
    } else if (q.type === 'feather') {
      g.globalAlpha = Math.min(1, a * 2) * 0.85;
      g.fillStyle = q.color;
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
      g.beginPath(); g.ellipse(0, 0, q.size, q.size * 0.3, 0, 0, TAU); g.fill();
      g.restore();
    } else if (q.type === 'glow') {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      const s = q.size * (0.4 + a);
      g.drawImage(spriteOrange, q.x - s, q.y - s, s * 2, s * 2);
      g.globalCompositeOperation = 'source-over';
    } else if (q.type === 'spark') {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      g.strokeStyle = q.color;
      g.lineWidth = q.size;
      g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 3, q.y - q.vy * 3); g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
  }
  g.globalAlpha = 1;
}

// ambient state (per scene)
let bubbles = [], snow = [], weeds = [], stars = [], fogs = [], clouds = [], shooting = null;

// ---------------------------------------------------------------------------
// Sprites (resolution independent)
// ---------------------------------------------------------------------------
const spriteFire = makeSprite(64, [[0, 'rgba(255,255,220,1)'], [0.08, 'rgba(235,255,150,1)'], [0.22, 'rgba(190,255,90,0.45)'], [0.5, 'rgba(120,230,60,0.12)'], [1, 'rgba(80,200,40,0)']]);
const spriteOrange = makeSprite(64, [[0, 'rgba(255,255,230,1)'], [0.1, 'rgba(255,210,120,1)'], [0.25, 'rgba(255,140,60,0.45)'], [0.55, 'rgba(255,90,40,0.12)'], [1, 'rgba(255,60,20,0)']]);
const spriteMagenta = makeSprite(64, [[0, 'rgba(255,230,255,1)'], [0.12, 'rgba(255,90,220,0.8)'], [0.35, 'rgba(170,60,255,0.3)'], [1, 'rgba(90,40,255,0)']]);
const spriteSoft = makeSprite(128, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);

// ---------------------------------------------------------------------------
// Backgrounds (prerendered on resize / scene change)
// ---------------------------------------------------------------------------
let bg = null, vignette = null, rayGrad = null, floorGrad = null;

function buildVignette(strength) {
  const [c, g] = makeCanvas(W, H);
  const r = Math.hypot(W, H) / 2;
  const gr = g.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${strength})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  vignette = c;
}

function buildOcean() {
  const [c, g] = makeCanvas(W, H);
  const rng = mulberry32(7);
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2b9ac2');
  gr.addColorStop(0.18, '#136f9c');
  gr.addColorStop(0.55, '#07385f');
  gr.addColorStop(1, '#020c1d');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // surface glow
  gr = g.createRadialGradient(W * 0.55, -H * 0.2, 0, W * 0.55, -H * 0.2, H * 0.9);
  gr.addColorStop(0, 'rgba(190,245,255,0.45)');
  gr.addColorStop(1, 'rgba(190,245,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // distant rocks & sand
  fillRidge(g, ridge(rng, H * 0.8, H * 0.05, [0.004, 0.011, 0.03]), 'rgba(4,34,58,0.7)');
  fillRidge(g, ridge(rng, H * 0.88, H * 0.04, [0.003, 0.009, 0.02]), 'rgba(3,22,40,0.85)');
  const sand = ridge(rng, H * 0.95, H * 0.025, [0.002, 0.007, 0.018]);
  g.save();
  gr = g.createLinearGradient(0, H * 0.9, 0, H);
  gr.addColorStop(0, '#0b3148'); gr.addColorStop(1, '#03121f');
  fillRidge(g, sand, gr);
  g.restore();
  // rocks with a little coral
  for (let k = 0; k < 7; k++) {
    const x = rng() * W, y = sand(x) + 6, r = 20 + rng() * 50;
    g.fillStyle = '#041826';
    g.beginPath(); g.ellipse(x, y, r * 1.4, r * 0.7, 0, Math.PI, TAU); g.fill();
    for (let m = 0; m < 5; m++) {
      const cx = x + (rng() - 0.5) * r * 2, cy = y - rng() * r * 0.5;
      g.fillStyle = `hsla(${[340, 15, 280, 190][(rng() * 4) | 0]},55%,${22 + rng() * 12}%,0.8)`;
      g.beginPath(); g.arc(cx, cy, 3 + rng() * 7, 0, TAU); g.fill();
    }
  }
  bg = c;
  rayGrad = ctx.createLinearGradient(0, 0, 0, H * 0.85);
  rayGrad.addColorStop(0, 'rgba(200,245,255,0.16)');
  rayGrad.addColorStop(1, 'rgba(200,245,255,0)');

  snow = [];
  for (let k = 0; k < 160; k++) snow.push({ x: rand(W), y: rand(H), z: rand(0.2, 1), w: rand(TAU) });
  weeds = [];
  for (let k = 0; k < Math.round(W / 45); k++) {
    const x = rand(W), front = Math.random() < 0.25;
    weeds.push({
      x, y: sand(x) + 4, h: front ? rand(H * 0.2, H * 0.38) : rand(H * 0.1, H * 0.28), segs: 12, ph: rand(TAU),
      w: front ? rand(7, 12) : rand(3, 6), front,
      col: front ? `hsl(${rand(150, 175)},45%,${rand(6, 10)}%)` : `hsl(${rand(150, 180)},40%,${rand(14, 22)}%)`,
    });
  }
  bubbles = [];
  buildVignette(0.55);
}

function buildSky() {
  const [c, g] = makeCanvas(W, H);
  const rng = mulberry32(11);
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#120b2c');
  gr.addColorStop(0.3, '#3d2260');
  gr.addColorStop(0.55, '#a8466f');
  gr.addColorStop(0.72, '#ec7a55');
  gr.addColorStop(0.82, '#ffc07a');
  gr.addColorStop(1, '#ffd9a0');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const sx = W * 0.68, sy = H * 0.74;
  gr = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.6);
  gr.addColorStop(0, 'rgba(255,230,160,0.75)');
  gr.addColorStop(0.2, 'rgba(255,170,110,0.35)');
  gr.addColorStop(1, 'rgba(255,120,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(sx, sy, 0, sx, sy, 46);
  gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.7, '#ffe7a8'); gr.addColorStop(1, 'rgba(255,210,140,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, 46, 0, TAU); g.fill();
  // few stars in the dark top
  for (let k = 0; k < 90; k++) {
    const y = Math.pow(rng(), 2) * H * 0.35;
    g.fillStyle = `rgba(255,240,255,${0.15 + rng() * 0.5 * (1 - y / (H * 0.35))})`;
    g.fillRect(rng() * W, y, 1.2, 1.2);
  }
  // hills
  fillRidge(g, ridge(rng, H * 0.76, H * 0.05, [0.003, 0.008, 0.021]), 'rgba(150,70,110,0.55)');
  fillRidge(g, ridge(rng, H * 0.82, H * 0.045, [0.004, 0.01, 0.025]), 'rgba(88,38,82,0.8)');
  const near = ridge(rng, H * 0.9, H * 0.04, [0.0025, 0.007, 0.02]);
  fillRidge(g, near, '#28122f');
  // trees on the near hill
  g.fillStyle = '#1c0b22';
  for (let x = rng() * 30; x < W; x += 12 + rng() * 60) {
    const y = near(x) + 3;
    if (rng() < 0.45) { // poplar
      const h = 30 + rng() * 45;
      g.beginPath(); g.ellipse(x, y - h * 0.5, 5 + rng() * 3, h * 0.55, 0, 0, TAU); g.fill();
    } else { // round tree
      const r = 9 + rng() * 14;
      for (let m = 0; m < 4; m++) { g.beginPath(); g.arc(x + (rng() - 0.5) * r, y - r - rng() * r * 0.7, r * (0.6 + rng() * 0.4), 0, TAU); g.fill(); }
      g.fillRect(x - 1.5, y - r, 3, r);
    }
  }
  fillRidge(g, ridge(rng, H * 0.96, H * 0.02, [0.003, 0.012]), '#120616');
  bg = c;
  clouds = [];
  for (let k = 0; k < 9; k++) clouds.push({ x: rand(W), y: rand(H * 0.12, H * 0.62), w: rand(160, 420), h: rand(10, 26), v: rand(0.05, 0.2), a: rand(0.12, 0.3) });
  buildVignette(0.45);
}

function buildNight() {
  const [c, g] = makeCanvas(W, H);
  const rng = mulberry32(23);
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#01020a'); gr.addColorStop(0.45, '#061130'); gr.addColorStop(0.75, '#0f2448'); gr.addColorStop(1, '#0a1630');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // milky way
  g.save();
  g.translate(W * 0.5, H * 0.3); g.rotate(-0.45);
  gr = g.createLinearGradient(0, -H * 0.12, 0, H * 0.12);
  gr.addColorStop(0, 'rgba(120,140,255,0)'); gr.addColorStop(0.5, 'rgba(150,160,255,0.12)'); gr.addColorStop(1, 'rgba(120,140,255,0)');
  g.fillStyle = gr; g.fillRect(-W, -H * 0.12, W * 2, H * 0.24);
  for (let k = 0; k < 1400; k++) {
    g.fillStyle = `rgba(220,225,255,${rng() * 0.45})`;
    g.fillRect((rng() - 0.5) * W * 2, gauss() * H * 0.06, 1, 1);
  }
  g.restore();
  for (let k = 0; k < 500; k++) {
    const s = rng() < 0.93 ? 1 : 1.8;
    g.fillStyle = `rgba(230,235,255,${0.2 + rng() * 0.7})`;
    g.fillRect(rng() * W, rng() * H * 0.75, s, s);
  }
  // moon
  const mx = W * 0.18, my = H * 0.18;
  gr = g.createRadialGradient(mx, my, 0, mx, my, 260);
  gr.addColorStop(0, 'rgba(200,215,255,0.35)'); gr.addColorStop(1, 'rgba(200,215,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(mx - 10, my - 10, 4, mx, my, 38);
  gr.addColorStop(0, '#fbfcff'); gr.addColorStop(1, '#c9d3ea');
  g.fillStyle = gr; g.beginPath(); g.arc(mx, my, 36, 0, TAU); g.fill();
  g.fillStyle = 'rgba(140,150,180,0.25)';
  [[8, -6, 7], [-12, 8, 9], [10, 14, 5], [-6, -14, 4]].forEach(([a, b, r]) => { g.beginPath(); g.arc(mx + a, my + b, r, 0, TAU); g.fill(); });
  // mountains
  fillRidge(g, ridge(rng, H * 0.68, H * 0.08, [0.002, 0.006, 0.017]), '#0c1a36');
  fillRidge(g, ridge(rng, H * 0.76, H * 0.05, [0.003, 0.009, 0.02]), '#081228');
  // pine forest
  const fr = ridge(rng, H * 0.84, H * 0.03, [0.003, 0.011]);
  g.fillStyle = '#040915';
  for (let x = -10; x < W + 10; x += 6 + rng() * 14) {
    const y = fr(x) + 10, h = 40 + rng() * 80, w = h * 0.28;
    g.beginPath(); g.moveTo(x, y - h);
    for (let t = 1; t <= 5; t++) { g.lineTo(x + w * t / 5, y - h + h * t / 5 - 4); g.lineTo(x + w * t / 5 * 0.55, y - h + h * t / 5); }
    for (let t = 5; t >= 1; t--) { g.lineTo(x - w * t / 5 * 0.55, y - h + h * t / 5); g.lineTo(x - w * t / 5, y - h + h * t / 5 - 4); }
    g.closePath(); g.fill();
  }
  fillRidge(g, fr, '#040915');
  // meadow with grass
  const mead = ridge(rng, H * 0.93, H * 0.015, [0.004, 0.013]);
  fillRidge(g, mead, '#03060e');
  g.strokeStyle = '#03060e'; g.lineWidth = 1.4;
  for (let x = 0; x < W; x += 2.5) {
    const y = mead(x) + 2, h = 6 + rng() * 22, b = (rng() - 0.5) * 10;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + b * 0.3, y - h * 0.6, x + b, y - h); g.stroke();
  }
  bg = c;
  stars = [];
  for (let k = 0; k < 70; k++) stars.push({ x: rand(W), y: rand(H * 0.6), p: rand(TAU), s: rand(0.5, 2) });
  fogs = [];
  for (let k = 0; k < 5; k++) fogs.push({ x: rand(W), y: rand(H * 0.72, H * 0.95), w: rand(300, 600), v: rand(0.08, 0.25) });
  buildVignette(0.6);
}

let horizonY = 0;
function buildNeon() {
  const [c, g] = makeCanvas(W, H);
  const rng = mulberry32(41);
  horizonY = H * 0.7;
  let gr = g.createLinearGradient(0, 0, 0, horizonY);
  gr.addColorStop(0, '#030010'); gr.addColorStop(0.6, '#12052c'); gr.addColorStop(1, '#3b0a4f');
  g.fillStyle = gr; g.fillRect(0, 0, W, horizonY);
  // nebulae
  g.globalCompositeOperation = 'lighter';
  const neb = [['255,60,200', 0.3, 0.3], ['60,200,255', 0.75, 0.22], ['140,80,255', 0.5, 0.45]];
  for (const [col, fx, fy] of neb) {
    for (let k = 0; k < 6; k++) {
      const x = W * fx + gauss() * W * 0.12, y = H * fy + gauss() * H * 0.1, r = rand(120, 320);
      gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${col},0.07)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 450; k++) {
    g.fillStyle = `rgba(255,255,255,${rng() * 0.8})`;
    const s = rng() < 0.95 ? 1 : 2;
    g.fillRect(rng() * W, rng() * horizonY, s, s);
  }
  // striped sun
  const R = Math.min(W, H) * 0.2, cx = W / 2, cy = horizonY - R * 0.25;
  gr = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
  gr.addColorStop(0, 'rgba(255,80,160,0.35)'); gr.addColorStop(1, 'rgba(255,80,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, horizonY);
  const [sc, sg] = makeCanvas(R * 2 + 4, R * 2 + 4);
  gr = sg.createLinearGradient(0, 0, 0, R * 2);
  gr.addColorStop(0, '#ffe76a'); gr.addColorStop(0.5, '#ff8a5c'); gr.addColorStop(1, '#ff2d95');
  sg.fillStyle = gr; sg.beginPath(); sg.arc(R + 2, R + 2, R, 0, TAU); sg.fill();
  sg.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 8; k++) {
    const y = R * (1.0 + k * 0.13), h = 1.5 + k * 1.6;
    sg.fillRect(0, y, R * 2 + 4, h);
  }
  g.drawImage(sc, cx - R - 2, cy - R - 2, R * 2 + 4, R * 2 + 4);
  // mountains at horizon
  const m1 = ridge(rng, horizonY - H * 0.04, H * 0.035, [0.006, 0.017, 0.04]);
  g.beginPath(); g.moveTo(0, horizonY);
  for (let x = 0; x <= W; x += 14) g.lineTo(x, Math.min(horizonY, m1(x) + Math.abs(x - W / 2) * -0.04 + H * 0.02));
  g.lineTo(W, horizonY); g.closePath();
  g.fillStyle = '#0b0220'; g.fill();
  g.strokeStyle = 'rgba(0,240,255,0.55)'; g.lineWidth = 1.2; g.stroke();
  // floor
  gr = g.createLinearGradient(0, horizonY, 0, H);
  gr.addColorStop(0, '#1a0430'); gr.addColorStop(1, '#05000c');
  g.fillStyle = gr; g.fillRect(0, horizonY, W, H - horizonY);
  bg = c;
  floorGrad = ctx.createLinearGradient(0, horizonY, 0, H);
  floorGrad.addColorStop(0, 'rgba(255,60,210,0)');
  floorGrad.addColorStop(0.25, 'rgba(255,60,210,0.35)');
  floorGrad.addColorStop(1, 'rgba(255,80,220,0.85)');
  buildVignette(0.35);
}

const builders = { ocean: buildOcean, sky: buildSky, night: buildNight, neon: buildNeon };

// ---------------------------------------------------------------------------
// Colour tables for agent buckets
// ---------------------------------------------------------------------------
let colorTable = [];
function buildColors() {
  colorTable = [];
  if (scene.id === 'ocean') {
    // species(2) x depth(3) x shimmer(6)
    for (let s = 0; s < 2; s++) for (let d = 0; d < 3; d++) for (let k = 0; k < 6; k++) {
      const sh = k / 5, df = [0.5, 0.75, 1][d];
      let col;
      if (s === 0) col = `hsl(${200 - sh * 12},${30 + sh * 25 - (2 - d) * 5}%,${(26 + sh * 56) * df + (1 - df) * 22}%)`;
      else col = `hsl(${40 + sh * 10},${70 + 25 * df}%,${(38 + sh * 22) * df + (1 - df) * 20}%)`;
      colorTable.push(col);
    }
  } else if (scene.id === 'sky') {
    colorTable = ['rgba(105,50,95,0.55)', 'rgba(62,26,64,0.75)', 'rgba(34,12,38,0.9)', 'rgba(16,5,20,1)'];
  } else if (scene.id === 'neon') {
    for (let s = 0; s < 2; s++) for (let k = 0; k < 4; k++) {
      const h = s ? 30 - k * 10 : 188 + k * 30;
      colorTable.push(`hsl(${h},100%,${58 + k * 9}%)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------
let T = 0;
function update(dt) {
  const cfg = scene;
  cell = cfg.R;
  buildGrid();

  const maxSp = cfg.maxSp * P.speed, minSp = cfg.minSp * P.speed;
  const R2 = cfg.R * cfg.R, S2 = cfg.sep * cfg.sep;
  const fleeR = cfg.fleeR * Math.sqrt(P.fear), fr2 = fleeR * fleeR;
  const wA = cfg.align * P.alignment, wC = cfg.coh * P.cohesion, wS = cfg.sepW * P.separation, wF = cfg.flee * P.fear;
  const ml = margin.l, mr = W - margin.r, mt = margin.t, mb = H - margin.b;
  const ef = cfg.edge, maxNb = cfg.maxNb, fire = !!cfg.fire, K = cfg.K || 0;
  const np = preds.length;
  const tt = T * 0.25;

  for (let i = 0; i < N; i++) {
    const x = px[i], y = py[i], s = sp[i];
    const vxi = vx[i], vyi = vy[i];
    let cx = 0, cy = 0, avx = 0, avy = 0, sx = 0, sy = 0, cnt = 0, maxPan = 0, kur = 0;

    let gx = (x / cell) | 0, gy = (y / cell) | 0;
    if (gx < 0) gx = 0; else if (gx >= cols) gx = cols - 1;
    if (gy < 0) gy = 0; else if (gy >= rows) gy = rows - 1;
    outer:
    for (let yy = gy - 1; yy <= gy + 1; yy++) {
      if (yy < 0 || yy >= rows) continue;
      for (let xx = gx - 1; xx <= gx + 1; xx++) {
        if (xx < 0 || xx >= cols) continue;
        let j = head[yy * cols + xx];
        while (j !== -1) {
          if (j !== i) {
            const dx = px[j] - x, dy = py[j] - y, d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              if (pan[j] > maxPan) maxPan = pan[j];
              if (sp[j] === s) {
                cnt++; cx += dx; cy += dy; avx += vx[j]; avy += vy[j];
                if (fire) kur += Math.sin(ph2[j] - ph2[i]);
              }
              if (d2 < S2 && d2 > 1e-4) { sx -= dx / d2; sy -= dy / d2; }
            }
          }
          j = next[j];
        }
        if (cnt >= maxNb) break outer;
      }
    }

    let ax = 0, ay = 0, m;
    if (cnt > 0) {
      m = Math.hypot(avx, avy);
      if (m > 0) { ax += (avx / m * maxSp - vxi) * wA; ay += (avy / m * maxSp - vyi) * wA; }
      m = Math.hypot(cx, cy);
      if (m > 0) { ax += (cx / m * maxSp - vxi) * wC; ay += (cy / m * maxSp - vyi) * wC; }
    }
    if (sx !== 0 || sy !== 0) {
      m = Math.hypot(sx, sy);
      ax += (sx / m * maxSp - vxi) * wS; ay += (sy / m * maxSp - vyi) * wS;
    }

    // predators
    let p0 = pan[i] * Math.pow(0.985, 1);
    for (let k = 0; k < np; k++) {
      const pr = preds[k];
      // look slightly ahead of the predator
      const qx = pr.x + pr.vx * 6, qy = pr.y + pr.vy * 6;
      const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
      if (d2 < fr2) {
        const d = Math.sqrt(d2) || 1;
        let f = 1 - d / fleeR; f *= f;
        ax += dx / d * f * wF * 2.2; ay += dy / d * f * wF * 2.2;
        // turn sideways (fountain effect)
        const cr = pr.vx * dy - pr.vy * dx, ps = Math.hypot(pr.vx, pr.vy) || 1, sg = cr > 0 ? 1 : -1;
        ax += -pr.vy / ps * sg * f * wF; ay += pr.vx / ps * sg * f * wF;
        const pp = Math.min(1, f * 2.5 + 0.1);
        if (pp > p0) p0 = pp;
      }
    }
    // panic spreads through the flock
    if (maxPan > 0.15 && maxPan * 0.9 > p0) p0 = maxPan * 0.9;
    pan[i] = p0 < 0.005 ? 0 : p0;

    // edges
    if (x < ml) ax += (ml - x) / ml * ef; else if (x > mr) ax -= (x - mr) / (W - mr) * ef;
    if (y < mt) ay += (mt - y) / mt * ef; else if (y > mb) ay -= (y - mb) / (H - mb) * ef;

    // wander + slow flow field
    const fa = Math.sin(x * 0.0023 + tt) * 2.1 + Math.cos(y * 0.0031 - tt * 1.3) * 2.3 + tt * 0.3;
    ax += Math.cos(fa) * cfg.flow + (Math.random() - 0.5) * cfg.wander;
    ay += Math.sin(fa) * cfg.flow + (Math.random() - 0.5) * cfg.wander;

    // clamp acceleration
    const amax = cfg.maxAcc * (1 + p0 * 1.5);
    m = Math.hypot(ax, ay);
    if (m > amax) { ax *= amax / m; ay *= amax / m; }

    let nvx = vxi + ax * dt, nvy = vyi + ay * dt;
    const spd = Math.hypot(nvx, nvy) || 1e-3;
    const top = maxSp * (1 + p0 * cfg.boost), low = minSp * (1 + p0 * 0.5);
    let ns = spd;
    if (ns > top) ns = top; else if (ns < low) ns = low;
    nvx = nvx / spd * ns; nvy = nvy / spd * ns;
    vx[i] = nvx; vy[i] = nvy;
    hc[i] = nvx / ns; hs[i] = nvy / ns;
    px[i] = x + nvx * dt; py[i] = y + nvy * dt;

    ph[i] += dt * (0.18 + ns * 0.09) * (1 + p0);
    if (fire) {
      ph2[i] += dt * (om[i] + (cnt ? K * kur / cnt : 0));
      if (ph2[i] > TAU) ph2[i] -= TAU;
    }
  }

  for (const p of preds) updatePred(p, dt);
  updateParticles(dt);
  updateAmbient(dt);
}

function updateAmbient(dt) {
  const id = scene.id;
  if (id === 'ocean') {
    for (const s of snow) {
      s.y += (0.08 + s.z * 0.12) * dt; s.x += Math.sin(T * 0.6 + s.w) * 0.1 * dt;
      if (s.y > H) { s.y = -5; s.x = rand(W); }
    }
    if (Math.random() < 0.08 * dt) {
      const w = weeds[(Math.random() * weeds.length) | 0];
      bubbles.push({ x: w ? w.x : rand(W), y: H * 0.95, r: rand(1, 3.5), vy: rand(0.4, 1), w: rand(TAU) });
    }
    for (let k = bubbles.length - 1; k >= 0; k--) {
      const b = bubbles[k];
      b.y -= b.vy * dt; b.vy = Math.min(b.vy + 0.004 * dt, 2); b.x += Math.sin(T * 3 + b.w) * 0.25 * dt;
      if (b.y < -10) bubbles.splice(k, 1);
    }
    if (bubbles.length > 400) bubbles.splice(0, bubbles.length - 400);
  } else if (id === 'sky') {
    for (const c of clouds) { c.x += c.v * dt; if (c.x - c.w > W) c.x = -c.w; }
  } else if (id === 'night') {
    for (const f of fogs) { f.x += f.v * dt; if (f.x - f.w > W) f.x = -f.w; }
    if (!shooting && Math.random() < 0.002 * dt) {
      shooting = { x: rand(W * 0.2, W), y: rand(H * 0.05, H * 0.35), vx: -rand(8, 14), vy: rand(2, 5), life: 50 };
    }
    if (shooting) { shooting.x += shooting.vx * dt; shooting.y += shooting.vy * dt; shooting.life -= dt; if (shooting.life <= 0) shooting = null; }
  }
}

// ---------------------------------------------------------------------------
// Rendering: agents
// ---------------------------------------------------------------------------
function drawFish(g) {
  const shimT = T * 0.3;
  for (let i = 0; i < N; i++) {
    const c = hc[i], s = hs[i];
    // heading dependent flash, like a school of sardines turning
    const c2 = c * c - s * s, s2 = 2 * c * s;
    let sh = 0.5 + 0.5 * (c2 * 0.7 - s2 * 0.7) * Math.cos(shimT) + 0.5 * (c2 * 0.7 + s2 * 0.7) * Math.sin(shimT) * 0.6;
    sh = clamp(sh + pan[i] * 0.25, 0, 0.999);
    const dl = dep[i] < 0.35 ? 0 : dep[i] < 0.7 ? 1 : 2;
    bk[i] = sp[i] * 18 + dl * 6 + ((sh * 6) | 0);
  }
  for (let d = 0; d < 3; d++) {
    for (let s = 0; s < 2; s++) {
      for (let k = 0; k < 6; k++) {
        const b = s * 18 + d * 6 + k;
        g.fillStyle = colorTable[b];
        g.beginPath();
        for (let i = 0; i < N; i++) {
          if (bk[i] !== b) continue;
          const big = sp[i] === 1;
          const L = (big ? 15 : 10) * (0.55 + 0.6 * dep[i]);
          const Wd = L * (big ? 0.42 : 0.24);
          const x = px[i], y = py[i], c = hc[i], sn = hs[i], nx = -sn, ny = c;
          const wag = Math.sin(ph[i]) * (0.35 + pan[i] * 0.4);
          const hx = x + c * L * 0.55, hy = y + sn * L * 0.55;
          const bx = x - c * L * 0.36 + nx * wag * Wd * 0.5, by = y - sn * L * 0.36 + ny * wag * Wd * 0.5;
          const tw = wag * Wd * 1.6;
          const ex = x - c * L * 0.8, ey = y - sn * L * 0.8;
          g.moveTo(hx, hy);
          g.quadraticCurveTo(x + nx * Wd * 1.3 + c * L * 0.08, y + ny * Wd * 1.3 + sn * L * 0.08, bx, by);
          g.lineTo(ex + nx * (Wd * 0.95 + tw), ey + ny * (Wd * 0.95 + tw));
          g.lineTo(x - c * L * 0.66 + nx * tw * 0.7, y - sn * L * 0.66 + ny * tw * 0.7);
          g.lineTo(ex + nx * (-Wd * 0.95 + tw), ey + ny * (-Wd * 0.95 + tw));
          g.lineTo(bx, by);
          g.quadraticCurveTo(x - nx * Wd * 1.3 + c * L * 0.08, y - ny * Wd * 1.3 + sn * L * 0.08, hx, hy);
        }
        g.fill();
      }
    }
  }
}

function drawBirds(g) {
  for (let i = 0; i < N; i++) bk[i] = Math.min(3, (dep[i] * 4) | 0);
  for (let b = 0; b < 4; b++) {
    g.fillStyle = colorTable[b];
    g.beginPath();
    for (let i = 0; i < N; i++) {
      if (bk[i] !== b) continue;
      const sz = 3 + 4.2 * dep[i];
      const x = px[i], y = py[i], c = hc[i], s = hs[i], nx = -s, ny = c;
      const f = Math.sin(ph[i] * 1.6);
      const span = sz * (0.45 + 0.75 * Math.abs(f));
      const sw = sz * (0.2 + 0.25 * f);
      g.moveTo(x + c * sz * 0.6, y + s * sz * 0.6);
      g.lineTo(x + c * sz * 0.1 + nx * sz * 0.15, y + s * sz * 0.1 + ny * sz * 0.15);
      g.lineTo(x + nx * span - c * sw, y + ny * span - s * sw);
      g.lineTo(x - c * sz * 0.2, y - s * sz * 0.2);
      g.lineTo(x - c * sz * 0.65 + nx * sz * 0.14, y - s * sz * 0.65 + ny * sz * 0.14);
      g.lineTo(x - c * sz * 0.65 - nx * sz * 0.14, y - s * sz * 0.65 - ny * sz * 0.14);
      g.lineTo(x - c * sz * 0.2, y - s * sz * 0.2);
      g.lineTo(x - nx * span - c * sw, y - ny * span - s * sw);
      g.lineTo(x + c * sz * 0.1 - nx * sz * 0.15, y + s * sz * 0.1 - ny * sz * 0.15);
      g.closePath();
    }
    g.fill();
  }
}

function flashOf(t) { return t < 0.8 ? Math.sin(t / 0.8 * Math.PI) : 0; }
function drawFireflies(g) {
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < N; i++) {
    const f = flashOf(ph2[i]), p = pan[i];
    const b = Math.max(f, p * 0.95);
    const dd = 0.45 + 0.75 * dep[i];
    const sz = (5 + 20 * b) * dd;
    g.globalAlpha = (0.14 + 0.86 * b) * (0.55 + 0.45 * dep[i]);
    g.drawImage(p > 0.35 ? spriteOrange : spriteFire, px[i] - sz, py[i] - sz, sz * 2, sz * 2);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawNeonAgents(g) {
  for (let i = 0; i < N; i++) bk[i] = sp[i] * 4 + Math.min(3, (pan[i] * 4) | 0);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let b = 0; b < 8; b++) {
    g.strokeStyle = colorTable[b];
    g.lineWidth = 1.2 + (b % 4) * 0.35;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      if (bk[i] !== b) continue;
      const k = 2.2 + dep[i] * 2;
      g.moveTo(px[i], py[i]);
      g.lineTo(px[i] - vx[i] * k, py[i] - vy[i] * k);
    }
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

function drawAgents(g) {
  switch (scene.id) {
    case 'ocean': drawFish(g); break;
    case 'sky': drawBirds(g); break;
    case 'night': drawFireflies(g); break;
    case 'neon': drawNeonAgents(g); break;
  }
}

// ---------------------------------------------------------------------------
// Rendering: predators
// ---------------------------------------------------------------------------
function smoothClosed(g, pts) {
  const n = pts.length;
  let a = pts[n - 1], b = pts[0];
  g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
  for (let k = 0; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % n];
    g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  g.closePath();
}

const SHARK_PROF = [0.42, 0.78, 0.96, 1, 0.97, 0.88, 0.74, 0.58, 0.42, 0.28, 0.16];
function drawShark(g, p) {
  const s = p.spine, n = s.length, BW = 12;
  const wig = 0.35 + Math.min(1, p.speed / 3) * 0.9;
  const q = [], nrm = [], fw = [];
  for (let k = 0; k < n; k++) {
    let fx, fy;
    if (k === 0) { fx = s[0].x - s[1].x; fy = s[0].y - s[1].y; }
    else { fx = s[k - 1].x - s[k].x; fy = s[k - 1].y - s[k].y; }
    const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
    const nx = -fy, ny = fx;
    const off = Math.sin(p.flap * 1.3 - k * 0.6) * (k / n) * 7 * wig;
    q.push({ x: s[k].x + nx * off, y: s[k].y + ny * off });
    nrm.push({ x: nx, y: ny }); fw.push({ x: fx, y: fy });
  }
  const tail = q[n - 1], tf = fw[n - 1], tn = nrm[n - 1];
  g.fillStyle = '#3a5369';
  // caudal fin
  g.beginPath();
  g.moveTo(tail.x + tf.x * 4, tail.y + tf.y * 4);
  g.quadraticCurveTo(tail.x + tn.x * 8 - tf.x * 6, tail.y + tn.y * 8 - tf.y * 6, tail.x + tn.x * 17 - tf.x * 16, tail.y + tn.y * 17 - tf.y * 16);
  g.quadraticCurveTo(tail.x - tf.x * 6, tail.y - tf.y * 6, tail.x - tn.x * 12 - tf.x * 12, tail.y - tn.y * 12 - tf.y * 12);
  g.quadraticCurveTo(tail.x - tn.x * 5 - tf.x * 4, tail.y - tn.y * 5 - tf.y * 4, tail.x + tf.x * 4, tail.y + tf.y * 4);
  g.fill();
  // pectoral fins
  for (const sg of [1, -1]) {
    const a = q[2], nn = nrm[2], ff = fw[2], w = BW * SHARK_PROF[2];
    g.beginPath();
    g.moveTo(a.x + nn.x * w * sg + ff.x * 4, a.y + nn.y * w * sg + ff.y * 4);
    g.quadraticCurveTo(a.x + nn.x * (w + 14) * sg, a.y + nn.y * (w + 14) * sg,
      a.x + nn.x * (w + 20) * sg - ff.x * 16, a.y + nn.y * (w + 20) * sg - ff.y * 16);
    g.lineTo(a.x + nn.x * w * 0.8 * sg - ff.x * 10, a.y + nn.y * w * 0.8 * sg - ff.y * 10);
    g.fill();
  }
  // body
  const outline = [{ x: q[0].x + fw[0].x * 12, y: q[0].y + fw[0].y * 12 }];
  for (let k = 0; k < n; k++) { const w = BW * SHARK_PROF[k]; outline.push({ x: q[k].x + nrm[k].x * w, y: q[k].y + nrm[k].y * w }); }
  outline.push({ x: tail.x - tf.x * 4, y: tail.y - tf.y * 4 });
  for (let k = n - 1; k >= 0; k--) { const w = BW * SHARK_PROF[k]; outline.push({ x: q[k].x - nrm[k].x * w, y: q[k].y - nrm[k].y * w }); }
  g.beginPath(); smoothClosed(g, outline);
  const gr = g.createRadialGradient(q[2].x, q[2].y, 2, q[4].x, q[4].y, 70);
  gr.addColorStop(0, '#6c8aa3'); gr.addColorStop(1, '#314a5f');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(190,230,255,0.28)'; g.lineWidth = 1.2; g.stroke();
  // dorsal ridge and fin
  g.strokeStyle = 'rgba(25,40,55,0.7)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(q[1].x, q[1].y);
  for (let k = 2; k < n; k++) g.lineTo(q[k].x, q[k].y);
  g.stroke();
  const d = q[4], dn = nrm[4], df = fw[4];
  g.fillStyle = '#233646';
  g.beginPath();
  g.moveTo(d.x + df.x * 6, d.y + df.y * 6);
  g.lineTo(d.x + dn.x * 3.5 - df.x * 8, d.y + dn.y * 3.5 - df.y * 8);
  g.lineTo(d.x - dn.x * 3.5 - df.x * 8, d.y - dn.y * 3.5 - df.y * 8);
  g.fill();
  // eyes
  g.fillStyle = '#081018';
  for (const sg of [1, -1]) {
    g.beginPath();
    g.arc(q[0].x + fw[0].x * 4 + nrm[0].x * 4.5 * sg, q[0].y + fw[0].y * 4 + nrm[0].y * 4.5 * sg, 1.6, 0, TAU);
    g.fill();
  }
}

function drawFalcon(g, p) {
  g.save();
  g.translate(p.x, p.y); g.rotate(p.angle); g.scale(1.3, 1.3);
  const stoop = p.lunge > 0;
  const f = Math.sin(p.flap * 1.4);
  const span = (stoop ? 17 : 32) * (0.6 + 0.4 * Math.abs(f));
  const back = stoop ? -18 : -6 - f * 4;
  // one closed silhouette: beak → head → wing → tail → wing → head
  g.beginPath();
  g.moveTo(17.5, 0);
  g.quadraticCurveTo(16, -3.6, 11, -4.2);                       // head
  g.quadraticCurveTo(8, -3.6, 5, -3.6);                          // neck → shoulder
  g.quadraticCurveTo(4, -span * 0.55, back, -span);              // leading edge
  g.quadraticCurveTo(-3, -span * 0.45, -8, -3.6);                // trailing edge
  g.lineTo(-11, -3);
  g.lineTo(-22, -6);                                             // tail
  g.quadraticCurveTo(-24.5, 0, -22, 6);
  g.lineTo(-11, 3);
  g.lineTo(-8, 3.6);
  g.quadraticCurveTo(-3, span * 0.45, back, span);               // trailing edge
  g.quadraticCurveTo(4, span * 0.55, 5, 3.6);                    // leading edge
  g.quadraticCurveTo(8, 3.6, 11, 4.2);
  g.quadraticCurveTo(16, 3.6, 17.5, 0);
  g.closePath();
  // rim light first, fill on top keeps only the outer edge
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,170,120,0.5)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#150914';
  g.fill();
  g.fillStyle = '#e9b44c';
  g.beginPath(); g.moveTo(16.3, -1.2); g.lineTo(19.5, 0); g.lineTo(16.3, 1.2); g.closePath(); g.fill();
  g.restore();
}

function drawBat(g, p) {
  g.save();
  g.translate(p.x, p.y); g.rotate(p.angle); g.scale(1.4, 1.4);
  const f = Math.sin(p.flap * 1.8);
  const span = 34 * (0.5 + 0.5 * Math.abs(f));
  g.fillStyle = '#07060e';
  g.strokeStyle = 'rgba(150,170,235,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  for (const s of [1, -1]) {
    const tip = { x: -4, y: span * s }, f1 = { x: -11, y: span * 0.72 * s }, f2 = { x: -12, y: span * 0.42 * s }, hip = { x: -8, y: 3 * s };
    g.moveTo(3, 3 * s);
    g.quadraticCurveTo(10, span * 0.35 * s, 6 - f * 2, span * 0.6 * s);
    g.lineTo(tip.x, tip.y);
    g.quadraticCurveTo((tip.x + f1.x) / 2 + 5, (tip.y + f1.y) / 2, f1.x, f1.y);
    g.quadraticCurveTo((f1.x + f2.x) / 2 + 5, (f1.y + f2.y) / 2, f2.x, f2.y);
    g.quadraticCurveTo((f2.x + hip.x) / 2 + 4, (f2.y + hip.y) / 2, hip.x, hip.y);
    g.closePath();
  }
  g.fill(); g.stroke();
  g.beginPath();
  g.ellipse(-1, 0, 9, 4.5, 0, 0, TAU);
  g.moveTo(11.5, 0); g.arc(8, 0, 3.6, 0, TAU);
  g.moveTo(7, -2.5); g.lineTo(10, -6.5); g.lineTo(10.5, -2);
  g.moveTo(7, 2.5); g.lineTo(10, 6.5); g.lineTo(10.5, 2);
  g.fill(); g.stroke();
  g.globalCompositeOperation = 'lighter';
  g.drawImage(spriteOrange, 7, -5, 8, 8);
  g.drawImage(spriteOrange, 7, -3, 8, 8);
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

function drawVoid(g, p) {
  const t = T * 3 + p.flap;
  const pulse = 1 + Math.sin(T * 5) * 0.06 + (p.lunge > 0 ? 0.25 : 0);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.9;
  g.drawImage(spriteMagenta, p.x - 80 * pulse, p.y - 80 * pulse, 160 * pulse, 160 * pulse);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#05000a';
  g.beginPath(); g.arc(p.x, p.y, 14 * pulse, 0, TAU); g.fill();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = k === 1 ? 'rgba(90,230,255,0.9)' : 'rgba(255,90,220,0.9)';
    g.lineWidth = 2.2 - k * 0.4;
    const r = (19 + k * 7) * pulse, a0 = t * (k % 2 ? -1 : 1) * (1 + k * 0.3) + k;
    g.beginPath(); g.arc(p.x, p.y, r, a0, a0 + 1.9); g.stroke();
    g.beginPath(); g.arc(p.x, p.y, r, a0 + Math.PI, a0 + Math.PI + 1.2); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

function drawPred(g, p) {
  switch (scene.id) {
    case 'ocean': drawShark(g, p); break;
    case 'sky': drawFalcon(g, p); break;
    case 'night': drawBat(g, p); break;
    case 'neon': drawVoid(g, p); break;
  }
}

// ---------------------------------------------------------------------------
// Rendering: scene layers
// ---------------------------------------------------------------------------
function drawWeeds(g, front) {
  g.lineCap = 'round';
  for (const w of weeds) {
    if (w.front !== front) continue;
    g.strokeStyle = w.col;
    let x = w.x, y = w.y, a = -Math.PI / 2;
    const seg = w.h / w.segs;
    for (let k = 0; k < w.segs; k++) {
      a += Math.sin(T * 0.9 + w.ph + k * 0.35) * 0.06 + Math.sin(T * 0.37 + w.ph) * 0.02;
      const nx = x + Math.cos(a) * seg, ny = y + Math.sin(a) * seg;
      g.lineWidth = w.w * (1 - k / w.segs * 0.7);
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny;
    }
  }
}

function drawBack(g) {
  const id = scene.id;
  if (id === 'ocean') {
    // god rays
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rayGrad;
    for (let k = 0; k < 7; k++) {
      const x = W * (k + 0.5) / 7 + Math.sin(T * 0.21 + k * 1.7) * 60;
      const w = 30 + 25 * Math.sin(T * 0.33 + k);
      const skew = 120 + Math.sin(T * 0.15 + k) * 40;
      g.globalAlpha = 0.55 + 0.45 * Math.sin(T * 0.4 + k * 2.1);
      g.beginPath();
      g.moveTo(x - w, 0); g.lineTo(x + w, 0);
      g.lineTo(x + w * 2.4 + skew, H * 0.85); g.lineTo(x - w * 0.6 + skew, H * 0.85);
      g.fill();
    }
    g.globalAlpha = 1;
    // surface ripples
    g.strokeStyle = 'rgba(210,250,255,0.10)';
    g.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const y = 8 + r * 11 + Math.sin(x * 0.02 + T * (1 + r * 0.3) + r) * 3 + Math.sin(x * 0.047 - T * 1.7) * 2;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    drawWeeds(g, false);
    g.fillStyle = 'rgba(200,235,255,0.5)';
    for (const s of snow) {
      g.globalAlpha = s.z * 0.55;
      g.fillRect(s.x, s.y, s.z * 1.8, s.z * 1.8);
    }
    g.globalAlpha = 1;
  } else if (id === 'sky') {
    for (const c of clouds) {
      g.globalAlpha = c.a;
      g.drawImage(spriteSoft, c.x - c.w, c.y - c.h, c.w * 2, c.h * 2);
    }
    g.globalAlpha = 1;
  } else if (id === 'night') {
    g.fillStyle = '#fff';
    for (const s of stars) {
      g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(T * s.s + s.p));
      g.fillRect(s.x, s.y, 1.5, 1.5);
    }
    if (shooting) {
      g.globalAlpha = Math.min(1, shooting.life / 20);
      const gr = g.createLinearGradient(shooting.x, shooting.y, shooting.x - shooting.vx * 8, shooting.y - shooting.vy * 8);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(shooting.x, shooting.y); g.lineTo(shooting.x - shooting.vx * 8, shooting.y - shooting.vy * 8); g.stroke();
    }
    g.globalAlpha = 1;
  } else if (id === 'neon') {
    // synthwave floor
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = floorGrad;
    g.lineWidth = 1.3;
    g.beginPath();
    const fh = H - horizonY, n = 18, off = (T * 0.35) % 1;
    for (let k = 0; k < n; k++) {
      const u = (k + off) / n, y = horizonY + fh * u * u * u;
      g.moveTo(0, y); g.lineTo(W, y);
    }
    for (let m = -24; m <= 24; m++) {
      g.moveTo(W / 2 + m * W * 0.018, horizonY);
      g.lineTo(W / 2 + m * W * 0.16, H);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }
}

function drawFront(g) {
  const id = scene.id;
  if (id === 'ocean') {
    drawWeeds(g, true);
    g.strokeStyle = 'rgba(220,245,255,0.55)';
    g.lineWidth = 1;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (const b of bubbles) {
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke();
      g.fillRect(b.x - b.r * 0.4, b.y - b.r * 0.5, b.r * 0.4, b.r * 0.4);
    }
  } else if (id === 'night') {
    for (const f of fogs) {
      g.globalAlpha = 0.07;
      g.drawImage(spriteSoft, f.x - f.w, f.y - 60, f.w * 2, 120);
    }
    g.globalAlpha = 1;
  }
}

function drawCursor(g) {
  if (!mouse.active) return;
  const col = scene.id === 'sky' ? 'rgba(40,10,40,0.6)' : 'rgba(255,255,255,0.55)';
  g.strokeStyle = col; g.lineWidth = 1.2;
  const r = 7 + Math.sin(T * 4) * 1;
  g.beginPath(); g.arc(mouse.x, mouse.y, r, 0, TAU); g.stroke();
  g.beginPath(); g.arc(mouse.x, mouse.y, 1.5, 0, TAU); g.fillStyle = col; g.fill();
}

let fade = 1;
function render(dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(bg, 0, 0, W, H);
  drawBack(ctx);

  if (P.trails) {
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = `rgba(0,0,0,${Math.min(1, scene.trailFade * dt)})`;
    tctx.fillRect(0, 0, W, H);
    tctx.globalCompositeOperation = 'source-over';
    drawAgents(tctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const glow = scene.id === 'neon' || scene.id === 'night';
    if (glow) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(trail, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  } else {
    drawAgents(ctx);
  }

  drawParticles(ctx);
  for (const p of preds) drawPred(ctx, p);
  drawFront(ctx);
  if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
  drawCursor(ctx);

  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, W, H);
    fade = Math.max(0, fade - 0.03 * dt);
  }
}

// ---------------------------------------------------------------------------
// Scene switching & resize
// ---------------------------------------------------------------------------
function clearTrail() {
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, trail.width, trail.height);
}

function setScene(idx, keepCount) {
  scene = SCENES[idx];
  document.documentElement.style.setProperty('--accent', scene.accent);
  computeMargins();
  builders[scene.id]();
  buildColors();
  parts.length = 0;
  P.trails = !!scene.trails;
  trailsBtn.classList.toggle('on', P.trails);
  clearTrail();
  spawnAll(keepCount ? N : scene.count);
  countSlider.value = N; countVal.textContent = N;
  for (const p of preds) { p.x = rand(W); p.y = rand(H * 0.2, H * 0.6); p.spine.forEach((s, k) => { s.x = p.x - k * 9; s.y = p.y; }); }
  document.querySelectorAll('.scene-btn').forEach((b, k) => b.classList.toggle('active', k === idx));
  fade = 1;
  const t = document.getElementById('title');
  t.querySelector('.t-name').textContent = scene.name;
  t.querySelector('.t-sub').textContent = scene.sub;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const oW = W || window.innerWidth, oH = H || window.innerHeight;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  trail.width = canvas.width; trail.height = canvas.height;
  // keep agents in relative positions
  const sx = W / oW, sy = H / oH;
  for (let i = 0; i < N; i++) { px[i] *= sx; py[i] *= sy; }
  computeMargins();
  builders[scene.id]();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const caughtEl = document.getElementById('caught');
const fpsEl = document.getElementById('fps');
const predCountEl = document.getElementById('predCount');
const panel = document.getElementById('panel');
const trailsBtn = document.getElementById('trails');
const countSlider = document.getElementById('s-count');
const countVal = document.getElementById('v-count');

const scenesEl = document.getElementById('scenes');
SCENES.forEach((s, k) => {
  const b = document.createElement('button');
  b.className = 'scene-btn';
  b.innerHTML = `<span class="ico">${s.icon}</span>${s.name}`;
  b.title = `${s.sub} (${k + 1})`;
  b.addEventListener('click', () => setScene(k));
  scenesEl.appendChild(b);
});

for (const key of ['cohesion', 'alignment', 'separation', 'fear', 'speed']) {
  const s = document.getElementById('s-' + key), v = document.getElementById('v-' + key);
  s.value = P[key]; v.textContent = (+P[key]).toFixed(2);
  s.addEventListener('input', () => { P[key] = +s.value; v.textContent = (+s.value).toFixed(2); });
}
countSlider.addEventListener('input', () => { setCount(+countSlider.value); countVal.textContent = N; });

function updatePredCount() { predCountEl.textContent = preds.length; }
document.getElementById('addPred').addEventListener('click', () => { if (preds.length < 8) preds.push(makePred(true)); updatePredCount(); });
document.getElementById('delPred').addEventListener('click', () => { if (preds.length > 1) preds.pop(); updatePredCount(); });
trailsBtn.addEventListener('click', () => { P.trails = !P.trails; trailsBtn.classList.toggle('on', P.trails); clearTrail(); });
document.getElementById('collapse').addEventListener('click', e => {
  panel.classList.toggle('collapsed');
  e.currentTarget.textContent = panel.classList.contains('collapsed') ? '+' : '–';
});

// pointer: the mouse is the predator
function setMouse(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.active = true; mouse.last = performance.now();
  preds[0].ai = false;
}
canvas.addEventListener('pointermove', setMouse);
canvas.addEventListener('pointerdown', e => { setMouse(e); lunge(preds[0]); });
canvas.addEventListener('pointerleave', () => { mouse.active = false; });
window.addEventListener('blur', () => { mouse.active = false; });

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.key.length > 1) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '4') setScene(+k - 1);
  else if (k === 'h') panel.classList.toggle('hidden');
  else if (k === 't') trailsBtn.click();
  else if (k === 'p') document.getElementById('addPred').click();
  else if (k === ' ') { lunge(preds[0]); e.preventDefault(); }
});

const hint = document.getElementById('hint');
setTimeout(() => hint.classList.add('fade'), 9000);

window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
resize();
preds.push(makePred(false));
setScene(0);

let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  let dt = (now - last) / 16.667;
  last = now;
  if (dt > 3) dt = 3; else if (dt < 0) dt = 0;
  T += dt / 60;
  // idle mouse → the predator hunts on its own
  if (mouse.active && now - mouse.last > 5000) mouse.active = false;
  if (!mouse.active) preds[0].ai = true;

  update(dt);
  render(dt);

  fpsAcc += dt; fpsN++;
  if (fpsN >= 30) { fpsEl.textContent = Math.round(60 * fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})();
