import * as THREE from 'three';
import { MAP } from './mapData.js';
import { makeTextures, setMaxAnisotropy, clamp, wrapAngle } from './util.js';
import { Track, buildTrackMeshes, HALF_W, KART_R } from './track.js';
import { buildWorld } from './world.js';
import { Kart, aiInput, MAX_SPEED } from './kart.js';
import { Items, ITEM_INFO } from './items.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => setTimeout(r, 20)); // lets the loading text repaint

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c9ea);
scene.fog = new THREE.Fog(0xc2d8ee, 160, 1100);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 6000);

const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x55683a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const SC = 60;
Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-70, 110, 60);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const COLORS = [
  { body: 0xe53935, helmet: 0xffffff, css: '#e53935' },
  { body: 0x1e88e5, helmet: 0xffeb3b, css: '#1e88e5' },
  { body: 0x43a047, helmet: 0xffffff, css: '#43a047' },
  { body: 0xfdd835, helmet: 0x1e3a8a, css: '#fdd835' },
  { body: 0x8e24aa, helmet: 0xff80ab, css: '#8e24aa' },
  { body: 0xfb8c00, helmet: 0x263238, css: '#fb8c00' },
];
const AI_NAMES = ['Pepa', 'Mařena', 'Franta', 'Jarka', 'Vašek'];
const DIFF = [
  { skill: [0.84, 0.9], lat: 0.85 },
  { skill: [0.93, 1.0], lat: 1.0 },
  { skill: [1.0, 1.06], lat: 1.15 },
];
const QUALITY = [
  { shadows: false, maxRatio: 0.75, shadowSize: 0 },
  { shadows: true, maxRatio: 1, shadowSize: 1024, soft: false },
  { shadows: true, maxRatio: Math.min(window.devicePixelRatio, 1.75), shadowSize: 2048, soft: true },
];
const settings = { color: 0, difficulty: 1, laps: 3, quality: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('dobranyKart') || '{}')); } catch (e) { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem('dobranyKart', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let track, decor, items, karts = [], player, world;
let obstacles = [], hazards = [];
const sound = new Sound();
const G = {
  state: 'loading', // loading | title | countdown | race | finished | results
  paused: false,
  countdown: 0,
  time: 0,
  raceTime: 0,
  camMode: 0,
  camHeading: 0,
  titleAngle: 0,
  msgTimer: 0,
  wrongTimer: 0,
  finishTimer: 0,
  hudTimer: 0,
  resScale: 1,
  perfT: 0,
  perfN: 0,
};

// Graphics quality + dynamic resolution (keeps weaker integrated GPUs smooth)
function applyRatio() {
  renderer.setPixelRatio(QUALITY[settings.quality].maxRatio * G.resScale);
  resize();
}
function applyQuality() {
  const q = QUALITY[settings.quality];
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = q.shadows;
  if (q.shadows) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  G.resScale = 1;
  applyRatio();
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
}
function trackPerformance(ms) {
  G.perfT += ms; G.perfN++;
  if (G.perfT < 1500) return;
  const avg = G.perfT / G.perfN;
  G.perfT = 0; G.perfN = 0;
  if (avg > 25 && G.resScale > 0.55) { G.resScale = Math.max(0.55, G.resScale - 0.1); applyRatio(); }
  else if (avg < 18 && G.resScale < 1) { G.resScale = Math.min(1, G.resScale + 0.05); applyRatio(); }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
const pressed = new Set();
const touchKeys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  sound.init();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readInput() {
  const k = (...c) => c.some((x) => keys.has(x));
  let steer = (k('ArrowRight', 'KeyD') || touchKeys.has('right') ? 1 : 0) - (k('ArrowLeft', 'KeyA') || touchKeys.has('left') ? 1 : 0);
  let throttle = k('ArrowUp', 'KeyW') || touchKeys.has('gas') ? 1 : 0;
  let brake = k('ArrowDown', 'KeyS') || touchKeys.has('brake') ? 1 : 0;
  let drift = k('Space', 'ShiftLeft', 'ShiftRight') || touchKeys.has('drift');
  let useItem = ['KeyE', 'ControlLeft', 'ControlRight', 'KeyX'].some((c) => pressed.has(c)) || pressed.has('touch-item');
  // gamepad
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.15) steer = clamp(ax, -1, 1);
    if (gp.buttons[0]?.pressed || gp.buttons[7]?.value > 0.2) throttle = Math.max(throttle, gp.buttons[7]?.value || 1);
    if (gp.buttons[1]?.pressed || gp.buttons[6]?.value > 0.2) brake = 1;
    if (gp.buttons[5]?.pressed || gp.buttons[4]?.pressed) drift = true;
    const it = gp.buttons[2]?.pressed || gp.buttons[3]?.pressed;
    if (it && !G.padItem) useItem = true;
    G.padItem = it;
  }
  return { steer, throttle, brake, drift, useItem };
}

// touch buttons
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.querySelectorAll('#touch button').forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); sound.init(); b.classList.add('on'); if (k === 'item') pressed.add('touch-item'); else touchKeys.add(k); };
    const off = (e) => { e.preventDefault(); b.classList.remove('on'); touchKeys.delete(k); };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('touchcancel', off, { passive: false });
  });
  G.touch = true;
}

// ---------------------------------------------------------------------------
// Build everything
// ---------------------------------------------------------------------------
async function build() {
  const say = async (t) => { $('loadingText').textContent = t; await nextFrame(); };
  await say('Připravuji textury…');
  const T = makeTextures();
  await say('Vyměřuji trať podle ulic Tichá, Chlumčanská, U Lomy a Oty Kovala…');
  track = new Track();
  await say('Modeluji terén, domy a zahrady podle mapy Dobřan…');
  world = buildWorld(track, T, scene);
  decor = buildTrackMeshes(track, T, scene);
  items = new Items(scene, track, T);
  await say('Startuji motory…');
  addParkedVehicles();
  obstacles = [...decor.obstacles, ...parked.flatMap((p) => p.circles)];
  buildMinimap();
  createKarts();
  setupMenu();
  applyQuality();
  $('loading').classList.add('hidden');
  showTitle();
  renderer.compile(scene, camera);
}

// Parked vehicles on the circuit (the white van really stands in Tichá)
const parked = [];
function addParkedVehicles() {
  const segStart = (k) => (k === 0 ? 0 : track.segEndS[k - 1]);
  const specs = [
    { s: 21, lat: 3.6, type: 'van', color: 0xf2f2f2 },
    { s: segStart(2) + 42, lat: -3.7, type: 'car', color: 0x9aa3ad },
    { s: segStart(4) + 55, lat: 3.8, type: 'car', color: 0x7a1d1d },
  ];
  for (const sp of specs) {
    const i = track.idxAt(sp.s);
    const p = track.pos(sp.s, sp.lat);
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: sp.color, metalness: 0.3, roughness: 0.45 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2633, metalness: 0.6, roughness: 0.15 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x151515 });
    const L = sp.type === 'van' ? 4.6 : 4.2, W = 1.85;
    if (sp.type === 'van') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, 1.55, L), paint); b.position.y = 1.2; g.add(b);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(W, 0.7, 0.9), paint); hood.position.set(0, 0.8, L / 2 + 0.4); g.add(hood);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.7, 0.1), glass); ws.position.set(0, 1.55, L / 2 + 0.02); ws.rotation.x = -0.35; g.add(ws);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 1.2), glass); w.position.set(s * W / 2, 1.55, L / 2 - 0.8); g.add(w); }
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.75, L), paint); b.position.y = 0.72; g.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.6, 2.2), glass); c.position.set(0, 1.38, -0.2); g.add(c);
      const r = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.08, 1.9), paint); r.position.set(0, 1.7, -0.25); g.add(r);
    }
    for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 14), tire);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.33, z * (L / 4.2)); g.add(w);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, p.y + 0.1, p.z);
    const hd = track.heading(i);
    g.rotation.y = hd;
    scene.add(g);
    const circles = [];
    for (const f of [-0.36, 0, 0.36]) {
      circles.push({ x: p.x + Math.sin(hd) * L * f, z: p.z + Math.cos(hd) * L * f, r: 1.05 });
    }
    parked.push({ circles, idx: i, lat: sp.lat });
  }
}

function createKarts() {
  for (const k of karts) scene.remove(k.root);
  karts = [];
  const d = DIFF[settings.difficulty];
  const pc = COLORS[settings.color];
  player = new Kart({ scene, track, color: pc.body, helmet: pc.helmet, name: 'Ty', isPlayer: true, skill: 1 });
  player.css = pc.css;
  const others = COLORS.filter((_, i) => i !== settings.color);
  others.forEach((c, i) => {
    const skill = d.skill[0] + ((d.skill[1] - d.skill[0]) * i) / Math.max(1, others.length - 1);
    const k = new Kart({ scene, track, color: c.body, helmet: c.helmet, name: AI_NAMES[i], skill });
    k.css = c.css;
    karts.push(k);
  });
  // player starts at the back of the grid, like in the real thing
  karts.push(player);
  placeOnGrid();
}

function placeOnGrid() {
  karts.forEach((k, n) => {
    const row = Math.floor(n / 2);
    const lat = n % 2 ? 2.4 : -2.4;
    k.reset(track.startS - 4 - row * 6.5 - (n % 2) * 1.5, lat);
  });
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------
const mm = { canvas: $('minimap'), bg: null };
function buildMinimap() {
  const S = 220, pad = 14;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < track.N; i++) {
    minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]); maxZ = Math.max(maxZ, track.z[i]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) + 40;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const k = (S - pad * 2) / span;
  mm.tx = (x) => S / 2 + (x - cx) * k;
  mm.tz = (z) => S / 2 + (z - cz) * k;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.save();
  x.beginPath(); x.roundRect ? x.roundRect(0, 0, S, S, 12) : x.rect(0, 0, S, S); x.clip();
  x.fillStyle = 'rgba(255,255,255,0.18)';
  for (const b of MAP.buildings) {
    x.beginPath();
    b.p.forEach((p, i) => (i ? x.lineTo(mm.tx(p[0]), mm.tz(p[1])) : x.moveTo(mm.tx(p[0]), mm.tz(p[1]))));
    x.closePath(); x.fill();
  }
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2; x.lineCap = 'round';
  for (const r of MAP.roads) {
    if (!['residential', 'living_street', 'tertiary', 'pedestrian'].includes(r.t)) continue;
    x.beginPath();
    r.p.forEach((p, i) => (i ? x.lineTo(mm.tx(p[0]), mm.tz(p[1])) : x.moveTo(mm.tx(p[0]), mm.tz(p[1]))));
    x.stroke();
  }
  const trackPath = () => {
    x.beginPath();
    for (let i = 0; i <= track.N; i += 4) {
      const j = i % track.N;
      i ? x.lineTo(mm.tx(track.x[j]), mm.tz(track.z[j])) : x.moveTo(mm.tx(track.x[j]), mm.tz(track.z[j]));
    }
    x.closePath();
  };
  x.lineJoin = 'round';
  trackPath(); x.strokeStyle = 'rgba(20,30,50,0.9)'; x.lineWidth = 11; x.stroke();
  trackPath(); x.strokeStyle = '#f2f2f2'; x.lineWidth = 7; x.stroke();
  // start line
  const i = track.startIdx;
  x.strokeStyle = '#c8102e'; x.lineWidth = 3;
  x.beginPath();
  x.moveTo(mm.tx(track.x[i] + track.nx(i) * 7), mm.tz(track.z[i] + track.nz(i) * 7));
  x.lineTo(mm.tx(track.x[i] - track.nx(i) * 7), mm.tz(track.z[i] - track.nz(i) * 7));
  x.stroke();
  // labels
  x.font = 'bold 10px Segoe UI, Arial'; x.fillStyle = 'rgba(255,255,255,0.85)'; x.textAlign = 'center';
  x.fillText('TICHÁ', mm.tx(-40), mm.tz(-2));
  x.fillText('N ↑', S - 18, 16);
  x.restore();
  mm.bg = c;
}

function drawMinimap() {
  const c = mm.canvas, x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(mm.bg, 0, 0);
  for (const k of karts) {
    if (k === player) continue;
    x.fillStyle = k.css; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(mm.tx(k.x), mm.tz(k.z), 4.5, 0, Math.PI * 2); x.fill(); x.stroke();
  }
  // player arrow
  const px = mm.tx(player.x), pz = mm.tz(player.z), h = player.heading;
  x.save(); x.translate(px, pz); x.rotate(-h + Math.PI);
  x.fillStyle = player.css; x.strokeStyle = '#fff'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.fill(); x.stroke();
  x.restore();
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
function setupMenu() {
  const colors = $('colors');
  colors.innerHTML = '';
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c.css;
    b.title = 'Barva ' + (i + 1);
    b.onclick = () => { settings.color = i; saveSettings(); refreshMenu(); createKarts(); };
    colors.appendChild(b);
  });
  for (const key of ['difficulty', 'laps', 'quality']) {
    $(key).querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        settings[key] = +b.dataset.v; saveSettings(); refreshMenu();
        if (key === 'difficulty') createKarts();
        if (key === 'quality') applyQuality();
      };
    });
  }
  $('startBtn').onclick = () => { sound.init(); startRace(); };
  $('resumeBtn').onclick = () => setPaused(false);
  $('restartBtn').onclick = () => { setPaused(false); startRace(); };
  $('menuBtn').onclick = () => { setPaused(false); showTitle(); };
  $('againBtn').onclick = () => startRace();
  $('menuBtn2').onclick = () => showTitle();
  refreshMenu();
}
function refreshMenu() {
  [...$('colors').children].forEach((b, i) => b.classList.toggle('sel', i === settings.color));
  $('difficulty').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === settings.difficulty));
  $('laps').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === settings.laps));
  $('quality').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === settings.quality));
}

function showTitle() {
  G.state = 'title';
  items.clear();
  placeOnGrid();
  for (const l of decor.startLights) l.material.emissive.setHex(0);
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('results').classList.add('hidden');
  $('touch').classList.add('hidden');
  sound.engine(0, false, false);
}

function startRace() {
  items.clear();
  createKarts();
  G.state = 'countdown';
  G.countdown = 4;
  G.raceTime = 0;
  G.lastCount = 5;
  G.camHeading = player.heading;
  G.finishTimer = 0;
  player.lastLap = 1;
  $('menu').classList.add('hidden');
  $('results').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (G.touch) $('touch').classList.remove('hidden');
  $('lapTimes').innerHTML = '';
  $('itemIcon').textContent = '';
  showMsg('', 0);
}

function setPaused(p) {
  if (!['countdown', 'race', 'finished'].includes(G.state)) return;
  G.paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) sound.engine(0, false, false);
}

function showMsg(text, dur = 1.2) {
  const el = $('centerMsg');
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  G.msgTimer = dur;
}

const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

function showResults() {
  G.state = 'results';
  const L = track.length * settings.laps;
  const list = karts.map((k) => ({
    k,
    t: k.finished ? k.finishTime : G.raceTime + Math.max(0, L - k.dist) / (MAX_SPEED * 0.75),
    est: !k.finished,
  }));
  list.sort((a, b) => a.t - b.t);
  const tbl = $('resultTable');
  tbl.innerHTML = '';
  list.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.k === player) tr.className = 'me';
    tr.innerHTML = `<td>${i + 1}.</td><td><span class="dot" style="background:${r.k.css}"></span>${r.k.name}</td><td>${r.est ? '~' : ''}${fmt(r.t)}</td>`;
    tbl.appendChild(tr);
  });
  const place = list.findIndex((r) => r.k === player) + 1;
  $('resultTitle').textContent = place === 1 ? '🏆 VÍTĚZSTVÍ!' : place <= 3 ? `${place}. MÍSTO — NA BEDNĚ!` : `${place}. MÍSTO`;
  $('results').classList.remove('hidden');
  $('touch').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function rankings() {
  const sorted = [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.dist - a.dist;
  });
  const m = new Map();
  sorted.forEach((k, i) => m.set(k, i + 1));
  return { sorted, map: m };
}

function handleEvents(kart, evs) {
  if (kart !== player) return;
  for (const e of evs) {
    if (e === 'turbo1' || e === 'turbo2' || e === 'hop' || e === 'wall' || e === 'bump') sound.sfx(e);
  }
}

function step(dt) {
  G.time += dt;
  const racing = G.state === 'race' || G.state === 'finished' || G.state === 'results';
  const { sorted, map: ranks } = rankings();

  if (G.state === 'countdown') {
    G.countdown -= dt;
    const n = Math.ceil(G.countdown - 1);
    if (n !== G.lastCount) {
      G.lastCount = n;
      if (n >= 1 && n <= 3) { showMsg(String(n), 0.9); sound.sfx('count'); }
      decor.startLights.forEach((l, i) => l.material.emissive.setHex(i < 4 - n && n >= 1 ? 0xff1a1a : 0));
      if (n <= 0) {
        G.state = 'race';
        showMsg('START!', 1.0);
        sound.sfx('go');
        decor.startLights.forEach((l) => l.material.emissive.setHex(0x22ff44));
      }
    }
  }

  if (G.state === 'countdown' || racing) {
    if (racing) G.raceTime += dt;
    hazards = [...parked.map((p) => ({ idx: p.idx, lat: p.lat, r: 1.2 })), ...items.hazards()];
    const ctx = {
      hazards,
      difficulty: DIFF[settings.difficulty].lat,
      rubber: 1,
      targetAhead: (k) => karts.some((o) => {
        if (o === k) return false;
        let d = o.dist - k.dist;
        return d > 2 && d < 35;
      }),
    };
    const inp = readInput();
    for (const k of karts) {
      let input;
      const auto = k !== player || player.finished || G.autopilot;
      if (G.state === 'countdown') input = { throttle: 0, brake: 0, steer: 0, drift: false, useItem: false };
      else if (auto) {
        // rubber band relative to the player so the race stays close
        const gap = k.dist - player.dist;
        ctx.rubber = k === player ? 0.9 : gap > 40 ? 0.94 : gap < -40 ? 1.08 : 1;
        input = aiInput(k, dt, ctx);
      } else input = inp;
      const evs = k.update(dt, input, obstacles);
      handleEvents(k, evs);
      if (racing && input.useItem && k.item && k.itemRoll <= 0) {
        const ie = [];
        items.use(k, ie);
        if (k === player) sound.sfx(ie[0]?.type === 'boost' ? 'boost' : 'throw');
      }
    }
    // kart-kart collisions
    for (let a = 0; a < karts.length; a++) for (let b = a + 1; b < karts.length; b++) {
      const A = karts[a], B = karts[b];
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), min = KART_R * 2;
      if (d < min && d > 1e-4) {
        const nx = dx / d, nz = dz / d, push = (min - d) / 2;
        A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
        A.bounce(-nx, -nz); B.bounce(nx, nz);
        if (A === player || B === player) sound.sfx('bump');
      }
    }
    if (racing) {
      const evs = items.update(dt, karts, G.time, ranks);
      for (const e of evs) {
        if (e.kart !== player) continue;
        if (e.type === 'pickup') sound.sfx('pickup');
        else if (e.type === 'gotItem') sound.sfx('item');
        else if (e.type === 'pad') sound.sfx('boost');
        else if (e.type === 'hit') sound.sfx('hit');
      }
      // laps & finish
      const L = track.length;
      for (const k of karts) {
        if (k.finished) continue;
        const lap = k.lapNumber;
        if (k.dist >= settings.laps * L) {
          k.finished = true;
          k.finishTime = G.raceTime;
          if (k === player) {
            G.state = 'finished';
            G.finishTimer = 3;
            const place = rankings().map.get(player);
            showMsg(place === 1 ? 'VÍTĚZ!' : 'CÍL!', 3);
            sound.sfx('finish');
          }
        } else if (k === player && lap > player.lastLap) {
          const lt = G.raceTime - (player.lapStart || 0);
          player.lapStart = G.raceTime;
          player.lapTimes.push(lt);
          $('lapTimes').innerHTML = player.lapTimes.map((t, i) => `kolo ${i + 1}: ${fmt(t)}`).join('<br>');
          if (lap === settings.laps) { showMsg('POSLEDNÍ KOLO!', 1.8); sound.sfx('final'); }
          else { showMsg(`KOLO ${lap}`, 1.4); sound.sfx('lap'); }
        }
        if (k === player) player.lastLap = Math.max(player.lastLap, lap);
      }
      if (G.state === 'finished') {
        G.finishTimer -= dt;
        if (G.finishTimer <= 0) showResults();
      }
    }
    // respawn
    if (pressed.has('KeyR') && G.state === 'race') {
      const s = player.idx * track.step;
      const d = player.dist;
      player.x = track.x[player.idx]; player.z = track.z[player.idx];
      player.heading = player.moveAngle = track.heading(player.idx);
      player.speed = 0;
      player.lastS = s;
      player.dist = d;
    }
    // wrong way
    if (G.state === 'race') {
      const dot = Math.cos(player.heading - track.heading(player.idx));
      G.wrongTimer = dot < -0.3 && Math.abs(player.speed) > 2 ? G.wrongTimer + dt : 0;
      $('wrongWay').classList.toggle('hidden', G.wrongTimer < 0.8);
    } else $('wrongWay').classList.add('hidden');

    const onStreet = G.state !== 'results';
    sound.engine(player.speed / MAX_SPEED, onStreet, player.drift.active);
    updateHud(dt, sorted, ranks);
  } else {
    items.update(dt, [], G.time, new Map());
  }

  if (G.msgTimer > 0) {
    G.msgTimer -= dt;
    if (G.msgTimer <= 0) $('centerMsg').textContent = '';
  }
  pressed.clear();
}

function updateHud(dt, sorted, ranks) {
  const pos = ranks.get(player);
  $('position').innerHTML = `${pos}<sup>.</sup>`;
  $('lap').textContent = `${Math.min(settings.laps, player.lapNumber)}/${settings.laps}`;
  $('time').textContent = fmt(G.raceTime);
  $('speedVal').textContent = Math.round(Math.abs(player.speed) * 3.6);
  const slot = $('itemSlot');
  if (player.itemRoll > 0) {
    const keys = Object.keys(ITEM_INFO);
    $('itemIcon').textContent = ITEM_INFO[keys[Math.floor(G.time * 14) % keys.length]].icon;
    slot.classList.add('rolling');
  } else {
    slot.classList.remove('rolling');
    $('itemIcon').textContent = player.item ? ITEM_INFO[player.item].icon : '';
  }
  G.hudTimer -= dt;
  if (G.hudTimer <= 0) {
    G.hudTimer = 0.25;
    $('street').textContent = track.street(player.idx).toUpperCase();
    $('standings').innerHTML = sorted
      .map((k, i) => `<div class="${k === player ? 'me' : ''}"><span class="dot" style="background:${k.css}"></span>${i + 1}. ${k.name}</div>`)
      .join('');
  }
  drawMinimap();
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
function updateCamera(dt) {
  if (G.state === 'title' || G.state === 'loading') {
    G.titleAngle += dt * 0.07;
    const cx = 10, cz = 55;
    const r = 150;
    const x = cx + Math.cos(G.titleAngle) * r, z = cz + Math.sin(G.titleAngle) * r;
    camera.position.set(x, 70, z);
    camera.lookAt(cx, 0, cz);
    camera.fov = 55; camera.updateProjectionMatrix();
    sun.position.set(cx, 0, cz).add(SUN_OFFSET);
    sun.target.position.set(cx, 0, cz);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -160;
    sun.shadow.camera.right = sun.shadow.camera.top = 160;
    sun.shadow.camera.updateProjectionMatrix();
    return;
  }
  if (sun.shadow.camera.right !== SC) {
    Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC });
    sun.shadow.camera.updateProjectionMatrix();
  }
  const k = player;
  // heading follows the kart smoothly (not the spin)
  const target = k.moveAngle * 0.35 + 0 + k.heading * 0.65;
  G.camHeading += wrapAngle(target - G.camHeading) * Math.min(1, 6 * dt);
  const modes = [
    { dist: 6.2, h: 2.6, look: 1.1 },
    { dist: 10, h: 4.2, look: 1.4 },
    { dist: -0.1, h: 1.35, look: 1.3 },
  ];
  const m = modes[G.camMode];
  const fx = Math.sin(G.camHeading), fz = Math.cos(G.camHeading);
  camPos.set(k.x - fx * m.dist, k.y + k.hop + m.h, k.z - fz * m.dist);
  if (G.camMode === 2) camPos.set(k.x + fx * 0.3, k.y + k.hop + m.h, k.z + fz * 0.3);
  const lerpK = G.camMode === 2 ? 1 : Math.min(1, 10 * dt);
  if (camera.position.distanceToSquared(camPos) > 400) camera.position.copy(camPos);
  else camera.position.lerp(camPos, lerpK);
  // keep camera above the ground
  const minY = k.y + 0.8;
  if (camera.position.y < minY) camera.position.y = minY;
  camLook.set(k.x + fx * 5, k.y + m.look, k.z + fz * 5);
  camera.lookAt(camLook);
  const boost = k.boostTime > 0 ? 1 : 0;
  const fov = 68 + Math.abs(k.speed) / MAX_SPEED * 6 + boost * 8;
  camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt);
  camera.updateProjectionMatrix();
  tmp.set(k.x, k.y, k.z);
  sun.position.copy(tmp).add(SUN_OFFSET);
  sun.target.position.copy(tmp);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const ms = now - last;
  let dt = Math.min(0.05, ms / 1000);
  last = now;
  if (G.state === 'loading') return;
  if (!document.hidden && !G.paused) trackPerformance(ms);
  if (pressed.has('Escape') || pressed.has('KeyP')) setPaused(!G.paused);
  if (pressed.has('KeyC')) G.camMode = (G.camMode + 1) % 3;
  if (pressed.has('KeyM')) sound.setMuted(!sound.muted);
  if (!G.paused) {
    const sub = dt > 0.025 ? 2 : 1;
    for (let i = 0; i < sub; i++) step(dt / sub);
  } else pressed.clear();
  updateCamera(dt);
  renderer.render(scene, camera);
}

build().then(() => requestAnimationFrame(frame)).catch((e) => {
  console.error(e);
  $('loadingText').textContent = 'Chyba při načítání: ' + e.message;
});
window.game = { G, renderer, scene, camera, step, get player() { return player; }, get track() { return track; }, get karts() { return karts; } };
