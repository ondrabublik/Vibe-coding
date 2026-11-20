import * as THREE from 'three';
import { createBoatState, stepBoat, autoTrim, pointOfSail, wrap, clamp, DEG, KN } from './physics.js';
import { BOATS, WEATHER } from './config.js';
import { WaveField, WindField } from './waves.js';
import { createOcean, createSky } from './ocean.js';
import { createBoatModel, createBuoy, createIsland } from './models.js';
import { Wake, Spray, Rain } from './effects.js';
import { SailAudio } from './audio.js';
import { initUI, updateHUD, toast, drawMinimap, showMenu, setButtons } from './ui.js';

// ---------------- stav hry ----------------
const S = {
  boatId: 'skiff', weatherId: 'fresh', mode: 'free',
  running: false, paused: false, autoTrim: false, autoCenter: true, camMode: 0, sound: true, shadows: true,
  helmDrag: false,
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('sail3d_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sail3d_' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
Object.assign(S, store.get('prefs', {}));
S.running = false; S.paused = false; S.helmDrag = false;

// ---------------- renderer a scéna ----------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 12000);

const waves = new WaveField();
const wind = new WindField();
const ocean = createOcean(waves);
scene.add(ocean.mesh);
const sky = createSky();
scene.add(sky.mesh);

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x0b3550, 1.0);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xbcd8f0, 0.0002);

// ostrovy a maják
const islands = [];
[[2600, 1900, 420, 120, 3], [-3100, 900, 600, 180, 11], [-1500, -3400, 380, 90, 19], [3600, -2400, 700, 220, 29], [400, 4200, 520, 150, 37], [-4200, 3800, 900, 260, 41]]
  .forEach(([x, z, r, h, seed]) => {
    const m = createIsland(r, h, seed);
    m.position.set(x, 0, z);
    scene.add(m);
    islands.push({ x, z, r: r * 0.95 });
  });
{
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 34, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  tower.position.y = 17;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 8, 16), new THREE.MeshStandardMaterial({ color: 0xc0262b }));
  band.position.y = 20;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe28a, emissiveIntensity: 2 }));
  lamp.position.y = 36;
  lh.add(tower, band, lamp);
  lh.position.set(2600 - 300, 30, 1900 - 260);
  scene.add(lh);
}

const wake = new Wake(scene);
const spray = new Spray(scene);
const rain = new Rain(scene);
const audio = new SailAudio();

// ---------------- loď ----------------
let spec = null, boat = null, model = null, windex = null;
let weather = WEATHER[S.weatherId];
const vis = { heave: 0, pitch: 0, roll: 0, lastTwaSign: 0, maxSpd: 0, trail: [], trailAcc: 0, flash: 0, nextBolt: 8, spraySlam: 0 };
const env = { t: 0, windAt: (x, z, t) => wind.at(x, z, t), waveSlope: null, slopeCache: { sx: 0, sz: 0 }, rollForce: 0 };
env.waveSlope = () => env.slopeCache;

// ---------------- závod ----------------
const race = { active: false, legs: [], leg: 0, started: false, t0: 0, time: 0, finished: false, buoys: [], lineHalf: 40, D: 500, prevZ: 0 };

function clearBuoys() { for (const b of race.buoys) scene.remove(b.mesh); race.buoys = []; }
function setupRace() {
  clearBuoys();
  race.active = S.mode === 'race';
  if (!race.active) return;
  const D = { skiff: 450, cruiser: 650, ocean: 900 }[spec.id];
  const half = { skiff: 40, cruiser: 60, ocean: 85 }[spec.id];
  race.D = D; race.lineHalf = half;
  const W = { x: 0, z: D }, Lm = { x: 0, z: -D * 0.25 };
  race.legs = [
    { type: 'line', dir: 1, name: 'Start – proplujte čarou proti větru' },
    { type: 'mark', ...W, name: 'Návětrná bója (1)' },
    { type: 'mark', ...Lm, name: 'Závětrná bója' },
    { type: 'mark', ...W, name: 'Návětrná bója (2)' },
    { type: 'line', dir: -1, name: 'Cíl – proplujte čarou po větru' },
  ];
  const mk = (x, z, c, kind) => { const m = createBuoy(c); m.position.set(x, 0, z); scene.add(m); race.buoys.push({ mesh: m, x, z, kind }); };
  mk(W.x, W.z, 0xff7a00, 'mark');
  mk(Lm.x, Lm.z, 0xff7a00, 'mark');
  mk(-half, 0, 0xffd400, 'line');
  mk(half, 0, 0xffd400, 'line');
  race.leg = 0; race.started = false; race.finished = false; race.time = 0;
}
function markRadius() { return Math.max(18, spec.L * 2.4); }

function updateRace(dt) {
  if (!race.active || race.finished) return;
  if (race.started) race.time += dt;
  const leg = race.legs[race.leg];
  const bx = boat.x, bz = boat.z;
  if (leg.type === 'line') {
    const crossed = leg.dir > 0 ? race.prevZ < 0 && bz >= 0 : race.prevZ > 0 && bz <= 0;
    if (crossed && Math.abs(bx) < race.lineHalf) {
      if (race.leg === 0) { race.started = true; race.time = 0; toast('Start! Pluj k návětrné bóji', 2500); race.leg++; }
      else {
        race.finished = true;
        const key = `best_${spec.id}_${weather.id}`;
        const best = store.get(key, null);
        const t = race.time;
        if (best === null || t < best) { store.set(key, t); toast(`🏁 CÍL! ${fmtTime(t)} – nový rekord!`, 6000); }
        else toast(`🏁 CÍL! ${fmtTime(t)} (rekord ${fmtTime(best)})`, 6000);
      }
    }
  } else if (Math.hypot(bx - leg.x, bz - leg.z) < markRadius()) {
    toast(`✔ ${leg.name} obeplutá`, 1800);
    race.leg++;
  }
  race.prevZ = bz;
}
export function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }

// ---------------- počasí ----------------
function applyWeather(w) {
  weather = w;
  const windFrom = 0;
  wind.setup(w.tws / KN, windFrom, w.gust, w.shift);
  waves.setup(w.waveH, windFrom, w.chop);
  const k = w.sky;
  const zen = new THREE.Color(k.zenith), hor = new THREE.Color(k.horizon), sunC = new THREE.Color(k.sun);
  const e = k.sunElev * DEG, a = k.sunAz * DEG;
  const sd = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  for (const u of [ocean.uniforms, sky.uniforms]) {
    u.uZenith.value.copy(zen); u.uHorizon.value.copy(hor); u.uSunColor.value.copy(sunC); u.uSunDir.value.copy(sd);
  }
  sky.uniforms.uCloudColor.value.set(k.cloudColor);
  sky.uniforms.uClouds.value = k.clouds;
  sky.uniforms.uDrift.value.set(-Math.sin(windFrom), -Math.cos(windFrom)).multiplyScalar(0.004 * (0.5 + w.tws / 20));
  sky.uniforms.uFogColor.value.copy(hor);
  sky.uniforms.uHaze.value = clamp(w.fog * 1200, 0, 1);
  ocean.uniforms.uWater.value.set(w.water);
  ocean.uniforms.uFogColor.value.copy(hor);
  ocean.uniforms.uFogDensity.value = w.fog;
  ocean.uniforms.uChop.value = w.chop;
  ocean.uniforms.uFoam.value = clamp((w.tws - 9) / 18, 0.05, 1);
  ocean.uniforms.uLight.value = k.light;
  ocean.uniforms.uGustAmp.value = w.gust;
  ocean.uniforms.uGustDrift.value.set(wind.driftX, wind.driftZ);
  ocean.uniforms.uWindDir.value.set(-Math.sin(windFrom), -Math.cos(windFrom)).multiplyScalar(0.15 + w.tws * 0.012);
  scene.fog.color.copy(hor);
  scene.fog.density = w.fog;
  scene.background = hor;
  sun.color.copy(sunC);
  sun.intensity = 2.6 * k.light;
  sun.userData.dir = sd;
  hemi.color.copy(zen).lerp(new THREE.Color(0xffffff), 0.45);
  hemi.groundColor.set(w.water);
  hemi.intensity = k.ambient * 1.3;
  rain.mesh.visible = w.rain > 0;
  wake.mat.uniforms.uLight.value = k.light;
  spray.mat.uniforms.uLight.value = k.light;
}

// ---------------- start hry ----------------
function startGame() {
  spec = BOATS[S.boatId];
  if (model) tiltRemove();
  boat = createBoatState(spec);
  model = createBoatModel(spec);
  scene.add(model.root);
  windex = new THREE.Group();
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.05 * spec.L / 4.5, 0.4 * spec.L / 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xff3030 }));
  arrow.rotation.x = Math.PI / 2; arrow.position.z = 0.15 * spec.L / 4.5;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12 * spec.L / 4.5, 0.25 * spec.L / 4.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  tail.position.z = -0.15 * spec.L / 4.5;
  windex.add(arrow, tail);
  windex.position.set(0, spec.mast.top + 0.05, spec.mast.x);
  model.tilt.add(windex);

  applyWeather(WEATHER[S.weatherId]);
  setupRace();
  if (race.active) { boat.x = 0; boat.z = -Math.max(60, spec.L * 8); boat.psi = -50 * DEG; }
  else { boat.x = 0; boat.z = 0; boat.psi = -100 * DEG; }
  race.prevZ = boat.z;
  boat.u = 2.0;
  env.t = 0;
  stepBoat(boat, spec, env, 0.001);
  for (let i = 0; i < 40; i++) autoTrim(spec, boat, 0.2);
  vis.maxSpd = 0; vis.trail = []; vis.lastTwaSign = Math.sign(boat.twa);
  vis.heave = waves.height(boat.x, boat.z, 0);
  wake.reset();
  cam.yaw = 0; cam.pitch = 0.22; cam.dist = camDistDefault(); cam.init = true;
  S.running = true; S.paused = false;
  setShadowBounds();
  audio.start(); audio.setMuted(!S.sound);
  showMenu(false);
  setButtons(S, spec, boat);
  toast(`${spec.name} · ${weather.name} – vítr ${weather.tws} kn`, 3000);
  if (!store.get('helpSeen', false)) { document.getElementById('help').classList.remove('hidden'); store.set('helpSeen', true); S.paused = true; }
}
function tiltRemove() { scene.remove(model.root); model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

function setShadowBounds() {
  const s = spec.mast.top * 0.9 + spec.L * 0.6;
  const c = sun.shadow.camera;
  c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = s * 6;
  c.updateProjectionMatrix();
  renderer.shadowMap.enabled = S.shadows;
}

function resetBoat() {
  const keep = { x: boat.x, z: boat.z, psi: boat.psi };
  const b = createBoatState(spec);
  Object.assign(boat, b, keep);
  boat.u = 1;
  toast('Loď vrácena do výchozího stavu', 1500);
}

// ---------------- vstup ----------------
const keys = {};
const actions = {
  spin() { if (boat.capsized) return; boat.spinUp = !boat.spinUp; toast(boat.spinUp ? `${spec.spinName} vytažen` : `${spec.spinName} stažen`, 1400); },
  hike() { boat.trapeze = !boat.trapeze; toast(boat.trapeze ? (spec.id === 'skiff' ? 'Posádka na trapézu' : 'Posádka vyvěšená na hraně') : 'Posádka uvnitř lodi', 1400); },
  board() { if (!spec.keel.retract) return; boat.board = boat.board > 0.5 ? 0.25 : 1; toast(boat.board > 0.5 ? 'Meč spuštěn' : 'Meč vytažen (méně odporu, víc snosu)', 1600); },
  reef() { if (spec.id === 'skiff') { toast('Skif nemá refování – povol otěže nebo jdi na trapéz', 1800); return; } boat.reef = (boat.reef + 1) % 3; toast(['Plné plachty', 'Zarefováno – 1. ref', 'Zarefováno – 2. ref'][boat.reef], 1600); },
  auto() { S.autoTrim = !S.autoTrim; toast(S.autoTrim ? 'Automatický trim plachet ZAP' : 'Automatický trim VYP', 1400); },
  motor() { if (!spec.motor) { toast('Skif nemá motor', 1200); return; } boat.motor = !boat.motor; toast(boat.motor ? 'Motor nastartován' : 'Motor vypnut', 1400); },
  cam() { S.camMode = (S.camMode + 1) % 5; cam.init = true; toast(['Kamera: za lodí', 'Kamera: volná (orbit)', 'Kamera: kormidelník', 'Kamera: shora', 'Kamera: filmová'][S.camMode], 1200); },
  pause() { setPause(!S.paused); },
  help() { const h = document.getElementById('help'); h.classList.toggle('hidden'); S.paused = !h.classList.contains('hidden') || !document.getElementById('pause').classList.contains('hidden'); },
  right() { if (boat.capsized && boat.righting === 0) { boat.righting = 0.0001; toast('Vztyčuji loď…', 2000); } },
  reset() { resetBoat(); },
  mute() { S.sound = !S.sound; audio.setMuted(!S.sound); savePrefs(); toast(S.sound ? 'Zvuk zapnut' : 'Zvuk vypnut', 1000); },
};
function setPause(p) {
  S.paused = p;
  document.getElementById('pause').classList.toggle('hidden', !p);
  if (!p) document.getElementById('help').classList.add('hidden');
}
function savePrefs() { store.set('prefs', { boatId: S.boatId, weatherId: S.weatherId, mode: S.mode, autoCenter: S.autoCenter, sound: S.sound, shadows: S.shadows, autoTrim: S.autoTrim }); }

const keyMap = { KeyG: 'spin', Space: 'hike', KeyC: 'board', KeyR: 'reef', KeyT: 'auto', KeyM: 'motor', KeyV: 'cam', KeyP: 'pause', Escape: 'pause', KeyH: 'help', Enter: 'right', KeyB: 'reset', KeyN: 'mute' };
window.addEventListener('keydown', (e) => {
  if (!S.running) return;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!e.repeat && keyMap[e.code]) {
    if (S.paused && !['pause', 'help'].includes(keyMap[e.code])) return;
    actions[keyMap[e.code]]();
    setButtons(S, spec, boat);
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// kamera myší
const cam = { yaw: 0, pitch: 0.22, dist: 14, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: true, cine: new THREE.Vector3() };
function camDistDefault() { return { skiff: 13, cruiser: 24, ocean: 40 }[spec.id]; }
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.004, -0.15, 1.35);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('dblclick', () => { cam.yaw = 0; cam.pitch = 0.22; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (spec) cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), spec.L * 1.2, spec.L * 25); }, { passive: false });

// ---------------- UI ----------------
initUI({
  S, BOATS, WEATHER, actions, store, fmtTime,
  onStart: () => { savePrefs(); startGame(); },
  onResume: () => setPause(false),
  onMenu: () => { setPause(false); S.running = false; showMenu(true); },
  onPrefs: () => { savePrefs(); if (spec) setShadowBounds(); },
  onPreview: () => { if (S.running) return; if (model) tiltRemove(); model = null; spec = null; },
  getBoat: () => boat, getSpec: () => spec,
});
showMenu(true);

// ---------------- smyčka ----------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4();
let last = performance.now(), acc = 0, menuT = 0;
const FIX = 1 / 120;

function controls(dt) {
  const rRate = spec.steering === 'wheel' ? 0.85 : spec.id === 'skiff' ? 1.8 : 1.3;
  const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  if (steer) boat.rudder = clamp(boat.rudder + steer * rRate * dt, -1, 1);
  else if (S.autoCenter && !S.helmDrag) {
    const d = Math.min(Math.abs(boat.rudder), 1.4 * dt);
    boat.rudder -= Math.sign(boat.rudder) * d;
  }
  const sRate = spec.id === 'skiff' ? 0.5 : spec.id === 'cruiser' ? 0.35 : 0.25;
  const m = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const h = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if ((m || h) && S.autoTrim) { S.autoTrim = false; toast('Ruční trim – automatika vypnuta', 1400); setButtons(S, spec, boat); }
  if (m) boat.sheets.main = clamp(boat.sheets.main + m * sRate * dt, 0, 1);
  if (h) boat.sheets.head = clamp(boat.sheets.head + h * sRate * dt, 0, 1);
  if (S.autoTrim && !boat.capsized) autoTrim(spec, boat, dt);
}

function physics(dt) {
  acc += dt;
  let n = 0;
  const sl = waves.slope(boat.x, boat.z, env.t);
  env.slopeCache.sx = sl.sx; env.slopeCache.sz = sl.sz;
  while (acc >= FIX && n < 12) {
    env.t += FIX;
    stepBoat(boat, spec, env, FIX);
    acc -= FIX; n++;
  }
  if (n >= 12) acc = 0;
  // ostrovy – mělčina
  for (const is of islands) {
    const dx = boat.x - is.x, dz = boat.z - is.z, d = Math.hypot(dx, dz);
    if (d < is.r) {
      boat.x = is.x + (dx / d) * is.r; boat.z = is.z + (dz / d) * is.r;
      boat.u *= -0.2; boat.v = 0; boat.r = 0;
      toast('Najel jsi na mělčinu!', 1500);
    }
  }
  // obrat / kosení
  const sg = Math.sign(boat.twa);
  if (sg !== 0 && sg !== vis.lastTwaSign && boat.aws > 0.5) {
    if (vis.lastTwaSign !== 0) toast(Math.abs(boat.twa) < Math.PI / 2 ? 'Obrat proti větru' : 'Obrat po větru (kosení)!', 1300);
    vis.lastTwaSign = sg;
  }
}

function updateVisuals(dt, t) {
  const sp = Math.sin(boat.psi), cp = Math.cos(boat.psi);
  const hl = spec.LWL * 0.42, hb = spec.B * 0.42;
  const fx = sp, fz = cp, px = cp, pz = -sp;
  const hB = waves.height(boat.x + fx * hl, boat.z + fz * hl, t);
  const hS = waves.height(boat.x - fx * hl, boat.z - fz * hl, t);
  const hP = waves.height(boat.x + px * hb, boat.z + pz * hb, t);
  const hR = waves.height(boat.x - px * hb, boat.z - pz * hb, t);
  const k = 1 - Math.exp(-dt * ({ skiff: 7, cruiser: 3.5, ocean: 2.2 }[spec.id]));
  const hump = Math.exp(-(((boat.Fn - 0.55) / 0.14) ** 2));
  const plane = boat.planing;
  const targetHeave = (hB + hS + hP + hR) / 4 + plane * 0.07 * spec.L / 4.5 - (boat.capsized ? 0.3 : 0) - hump * 0.03;
  const targetPitch = Math.atan2(hB - hS, 2 * hl) + hump * (spec.planing ? 5.5 : 2.5) * DEG + plane * 1.2 * DEG - clamp(boat.driveForce / (spec.mass * 9.81), 0, 0.2) * 0.1;
  const targetRoll = Math.atan2(hP - hR, 2 * hb);
  vis.heave += (targetHeave - vis.heave) * k;
  const prevPitch = vis.pitch;
  vis.pitch += (targetPitch - vis.pitch) * k;
  vis.roll += (targetRoll - vis.roll) * k;
  env.rollForce = 0;
  model.root.position.set(boat.x, vis.heave, boat.z);
  model.root.rotation.y = boat.psi;
  model.tilt.rotation.x = -vis.pitch;
  model.tilt.rotation.z = -(boat.phi - vis.roll * 0.8);
  model.update(boat, t);
  windex.rotation.y = boat.awa;

  // brázda
  const stern = { x: boat.x - fx * spec.L * 0.5, z: boat.z - fz * spec.L * 0.5 };
  wake.update(dt, stern, boat.psi, Math.hypot(boat.u, boat.v), spec.B, waves, t, spec.id === 'ocean' ? 22 : 16);
  wake.mat.uniforms.uTime.value = t;

  // spršky
  const spd = Math.hypot(boat.u, boat.v);
  const slam = Math.max(0, (prevPitch - vis.pitch) / Math.max(dt, 1e-3)) * spd;
  let rate = (plane * spd * 6 + slam * 8 + (spd > 3 ? (spd - 3) * 2 : 0)) * (spec.id === 'skiff' ? 1 : 1.6);
  if (boat.capsized) rate = 0;
  const bowX = boat.x + fx * spec.L * 0.32, bowZ = boat.z + fz * spec.L * 0.32;
  let nEmit = Math.min(30, Math.floor(rate * dt * 10 + Math.random()));
  const w = wind.at(boat.x, boat.z, t);
  const wX = -Math.sin(w.from) * w.spd, wZ = -Math.cos(w.from) * w.spd;
  while (nEmit-- > 0) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const out = 1.2 + spd * 0.25;
    spray.emit(bowX + px * side * spec.B * 0.3, vis.heave + 0.2, bowZ + pz * side * spec.B * 0.3,
      px * side * out + fx * spd * 0.6, 1.2 + spd * 0.25, pz * side * out + fz * spd * 0.6, 1.2);
  }
  spray.mat.uniforms.uSize.value = 60 * window.innerHeight / 900 * (spec.id === 'skiff' ? 1 : 1.8);
  spray.update(dt, wX, wZ);

  // trail na minimapě
  vis.trailAcc += dt;
  if (vis.trailAcc > 1) { vis.trailAcc = 0; vis.trail.push([boat.x, boat.z]); if (vis.trail.length > 400) vis.trail.shift(); }

  // bóje se houpou
  for (const b of race.buoys) {
    b.mesh.position.y = waves.height(b.x, b.z, t) - 0.3;
    b.mesh.userData.flag.rotation.y = w.from + Math.PI / 2 + Math.sin(t * 6) * 0.15;
  }
}

function updateCamera(dt) {
  const top = spec.mast.top;
  const lookH = top * 0.3;
  const k = cam.init ? 1 : 1 - Math.exp(-dt * 4);
  const bx = boat.x, bz = boat.z, by = vis.heave;
  const mode = S.camMode;
  let px, py, pz, lx = bx, ly = by + lookH, lz = bz;
  if (mode === 0 || mode === 1) {
    const base = mode === 0 ? boat.psi + Math.PI : 0;
    const a = base + cam.yaw;
    const dist = cam.dist * (camera.aspect < 1 ? 1.25 / Math.max(0.45, camera.aspect) : 1);
    const horiz = dist * Math.cos(cam.pitch);
    px = bx + Math.sin(a) * horiz; pz = bz + Math.cos(a) * horiz;
    py = by + lookH * 0.6 + dist * Math.sin(cam.pitch);
  } else if (mode === 2) {
    // pohled kormidelníka
    const helmLocal = new THREE.Vector3(spec.id === 'ocean' ? 0 : -0.25 * spec.B, spec.deck + 1.25, spec.rudder.x + (spec.id === 'ocean' ? 0.2 : 1.0));
    model.tilt.updateWorldMatrix(true, false);
    helmLocal.applyMatrix4(model.tilt.matrixWorld);
    px = helmLocal.x; py = helmLocal.y; pz = helmLocal.z;
    const a = boat.psi + cam.yaw * 1.2;
    lx = px + Math.sin(a) * 20; lz = pz + Math.cos(a) * 20; ly = py + 1.5 - (cam.pitch - 0.22) * 20;
    camera.position.set(px, py, pz);
    camera.up.set(0, 1, 0);
    camera.lookAt(lx, ly, lz);
    cam.init = false;
    return;
  } else if (mode === 3) {
    const h = cam.dist * 2.8;
    px = bx + Math.sin(boat.psi + Math.PI) * h * 0.08; pz = bz + Math.cos(boat.psi + Math.PI) * h * 0.08; py = by + h;
    ly = by;
  } else {
    // filmová kamera – statická pozice, kterou loď míjí
    if (cam.init || Math.hypot(cam.cine.x - bx, cam.cine.z - bz) > spec.L * 22) {
      const a = boat.psi + (Math.random() < 0.5 ? 0.5 : -0.5);
      const d = spec.L * 12;
      cam.cine.set(bx + Math.sin(a) * d, 0, bz + Math.cos(a) * d);
    }
    px = cam.cine.x; pz = cam.cine.z;
    py = Math.max(waves.height(px, pz, env.t) + 1.5, 1.5) + spec.L * 0.15;
    cam.pos.set(px, py, pz);
    cam.look.lerp(tmpV.set(lx, ly, lz), cam.init ? 1 : 1 - Math.exp(-dt * 6));
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    cam.init = false;
    return;
  }
  // nepodlézt pod hladinu
  const wh = waves.height(px, pz, env.t);
  py = Math.max(py, wh + 0.8);
  tmpV.set(px, py, pz);
  if (cam.init) cam.pos.copy(tmpV); else cam.pos.lerp(tmpV, k);
  tmpV2.set(lx, ly, lz);
  if (cam.init) cam.look.copy(tmpV2); else cam.look.lerp(tmpV2, 1 - Math.exp(-dt * 8));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  cam.init = false;
}

function updateEnvironment(dt, t) {
  ocean.uniforms.uTime.value = t;
  ocean.uniforms.uCamPos.value.copy(camera.position);
  const step = 1.0;
  ocean.mesh.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
  sky.mesh.position.copy(camera.position);
  sky.uniforms.uTime.value = t;
  // slunce a stíny sledují loď
  const center = boat ? tmpV.set(boat.x, 0, boat.z) : tmpV.set(0, 0, 0);
  const d = sun.userData.dir || new THREE.Vector3(0, 1, 0);
  const dist = spec ? spec.mast.top * 3 : 50;
  sun.position.copy(center).addScaledVector(d, dist);
  sun.target.position.copy(center);
  // blesky
  if (weather.lightning) {
    vis.nextBolt -= dt;
    if (vis.nextBolt <= 0) { vis.flash = 1; vis.nextBolt = 6 + Math.random() * 14; audio.thunder(0.6 + Math.random() * 2.5); }
  }
  vis.flash = Math.max(0, vis.flash - dt * 2.2);
  const fl = vis.flash > 0 ? vis.flash * (0.6 + 0.4 * Math.sin(t * 60)) : 0;
  sky.uniforms.uFlash.value = fl * 0.8;
  ocean.uniforms.uFlash.value = fl * 0.5;
  hemi.intensity = weather.sky.ambient * 1.3 + fl * 3;
  // déšť
  if (rain.mesh.visible) {
    rain.mat.uniforms.uTime.value = t;
    rain.mat.uniforms.uCenter.value.copy(camera.position);
    const w = boat ? wind.at(boat.x, boat.z, t) : { spd: 10, from: 0 };
    rain.mat.uniforms.uWind.value.set(-Math.sin(w.from) * w.spd, -Math.cos(w.from) * w.spd);
  }
}

// pozadí menu – loď kotví a kamera krouží
function menuScene(dt) {
  menuT += dt;
  if (!spec) {
    spec = BOATS[S.boatId];
    boat = createBoatState(spec);
    model = createBoatModel(spec); scene.add(model.root);
    windex = new THREE.Group(); model.tilt.add(windex);
    applyWeather(WEATHER[S.weatherId]);
    boat.psi = -100 * DEG; boat.u = 0;
    stepBoat(boat, spec, env, 0.001);
    for (let i = 0; i < 40; i++) autoTrim(spec, boat, 0.2);
    setShadowBounds();
  }
  env.t += dt;
  updateVisuals(dt, env.t);
  const a = menuT * 0.08;
  const d = spec.L * 3.2;
  camera.position.set(boat.x + Math.sin(a) * d, spec.mast.top * 0.45, boat.z + Math.cos(a) * d);
  camera.lookAt(boat.x, spec.mast.top * 0.35, boat.z);
  cam.init = true;
}

function hud() {
  const spd = Math.hypot(boat.u, boat.v);
  vis.maxSpd = Math.max(vis.maxSpd, boat.u * KN);
  const flap = Math.max(...Object.values(boat.sailInfo).map((s) => s.flap || 0), 0);
  audio.update(boat.aws, spd, flap, weather.rain);
  updateHUD(boat, spec, { maxSpd: vis.maxSpd, pos: pointOfSail(boat.twa / DEG), race, markRadius: race.active ? markRadius() : 0, autoTrim: S.autoTrim });
  drawMinimap(boat, spec, race, islands, vis.trail, wind.dirAt(boat.x, boat.z, env.t));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!S.running) {
    menuScene(dt);
  } else if (!S.paused) {
    controls(dt);
    physics(dt);
    updateRace(dt);
    updateVisuals(dt, env.t);
    updateCamera(dt);
    hud();
  } else {
    updateCamera(0);
    audio.update(0, 0, 0, 0);
  }
  updateEnvironment(dt, env.t);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ladicí rozhraní (konzole): __sail.advance(10) posune simulaci o 10 s
window.__sail = {
  S, get boat() { return boat; }, get spec() { return spec; }, startGame, wind, waves, renderer, scene, camera,
  advance(sec, dt = 1 / 60) {
    for (let t = 0; t < sec; t += dt) { controls(dt); physics(dt); updateRace(dt); updateVisuals(dt, env.t); }
    updateCamera(1); hud(); updateEnvironment(0, env.t); renderer.render(scene, camera);
  },
  timeRender() { const t0 = performance.now(); renderer.render(scene, camera); renderer.getContext().finish(); return performance.now() - t0; },
};
