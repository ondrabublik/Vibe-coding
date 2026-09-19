import * as THREE from 'three';
import { buildWorld, BASE_H, PAVE, SUN_DIR, HORIZON } from './terrain.js';
import { Aircraft, SPEC } from './aircraft.js';
import { buildCockpit } from './aircraftModel.js';
import { FX } from './effects.js';
import { Bullets, Missiles, Flares } from './weapons.js';
import { AIPilot } from './ai.js';
import { HUD } from './hud.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { clamp, DEG, rand } from './util.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const DIFF = {
  easy: { skill: 0.3, hp: 70, dmg: 2.5, max: 3, decoy: 0.45 },
  normal: { skill: 0.55, hp: 100, dmg: 4, max: 5, decoy: 0.35 },
  hard: { skill: 0.85, hp: 120, dmg: 6, max: 6, decoy: 0.25 },
};
const settings = { difficulty: 'normal', invert: false, shadows: true, view: 'chase' };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('flySim.settings') || '{}'));
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem('flySim.settings', JSON.stringify(settings));
  } catch {}
};

// ---------------------------------------------------------------------------
// Renderer, scene, lights
// ---------------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = settings.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = HORIZON.clone();
scene.fog = new THREE.Fog(HORIZON, 3000, 36000);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 80000);

scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a6b45, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -110;
sc.right = sc.top = 110;
sc.near = 10;
sc.far = 4000;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);

const hud = new HUD($('hud'));
const sound = new Sound();
const input = new Input(canvas);
let fx, terrain, sky, player, cockpit, world;
let playerBullets, enemyBullets, missiles, flares;

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let state = 'loading';
let view = settings.view;
// wave phases: takeoff → incoming → combat → rtb (land & resupply) → ready (take off) → incoming …
let score = 0, kills = 0, wave = 0, wavePhase = 'takeoff', nextWaveT = -1;
let enemies = [];
const pilots = new Map();
let target = null;
const lock = { progress: 0, locked: false, lockedFor: 0 };
const SEEKER = 11 * DEG;
const HOME = new THREE.Vector3(0, BASE_H, 0); // runway centre, shown on the HUD when returning to base
let rearmT = 0, flightT = 0, landingScored = true, wasAirborne = false, liftoffAnnounced = false;
let lookYaw = 0, lookPitch = 0;
const camQ = new THREE.Quaternion();
let deathT = -1, hitFlash = 0, gStress = 0, redout = 0, shakeT = 0, mfdT = 0, hitSoundT = 0, menuT = 0;
const keyAxis = { pitch: 0, roll: 0, yaw: 0 };

// ---------------------------------------------------------------------------
// World callbacks
// ---------------------------------------------------------------------------
function onKilled(victim, killer, reason) {
  if (victim === player) {
    hud.message(reason === 'sestřelen' ? 'SESTŘELEN!' : `HAVÁRIE (${reason})`, '#ff3b30', 4);
    return;
  }
  const pts = 100 + 50 * wave;
  if (killer === player) {
    score += pts;
    kills++;
    hud.message(reason === 'sestřelen' ? `SESTŘEL!  +${pts}` : `Nepřítel havaroval  +${pts}`, '#ffcf40', 3);
  } else {
    score += Math.round(pts / 2);
    kills++;
    hud.message(`Nepřítel havaroval  +${Math.round(pts / 2)}`, '#ffcf40', 3);
  }
  if (target === victim) {
    target = null;
    lock.progress = 0;
  }
}

function onExploded(ac) {
  if (ac === player) {
    if (deathT < 0) deathT = 0;
    return;
  }
  ac.dispose();
  enemies = enemies.filter((e) => e !== ac);
  world.aircraft = world.aircraft.filter((e) => e !== ac);
  pilots.delete(ac);
}

function onDamage(ac, amount, attacker) {
  if (ac === player) {
    hitFlash = Math.min(1, hitFlash + 0.25 + amount / 60);
    shakeT = Math.max(shakeT, 0.3);
    sound.hit();
  } else if (attacker === player) {
    hud.hitMark = 0.15;
    if (hitSoundT <= 0) {
      sound.hitMarker();
      hitSoundT = 0.08;
    }
  }
}

function onTouchdown(ac, vs) {
  if (ac !== player) return;
  sound.touchdown(vs);
  if (!landingScored && flightT > 15) {
    landingScored = true;
    const onRwy = terrain.isRunway(player.pos.x, player.pos.z);
    const bonus = !onRwy ? 20 : vs < 1.5 ? 150 : vs < 3 ? 100 : 50;
    score += bonus;
    const q = vs < 1.5 ? 'Měkké přistání!' : vs < 3 ? 'Dobré přistání' : 'Tvrdé přistání';
    hud.message(`${onRwy ? q : 'Přistání mimo dráhu'}  ${vs.toFixed(1)} m/s  +${bonus}`, '#6dff8a', 4);
    if (onRwy) hud.message('Zastav na letišti pro doplnění (B = brzdy)', '#e8f4ff', 4);
  }
}

function onLiftoff(ac) {
  if (ac !== player) return;
  landingScored = false;
  flightT = 0;
  if (!liftoffAnnounced) {
    liftoffAnnounced = true;
    hud.message('Vzlet! Zatáhni podvozek (G)', '#6dff8a', 4);
  }
}

function onEnemyLaunch() {
  hud.message('RAKETA ODPÁLENA!', '#ff3b30', 2);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
async function init() {
  $('loadingText').textContent = 'Modeluji krajinu…';
  await nextFrame();
  ({ terrain, sky } = buildWorld(scene, renderer));
  $('loadingText').textContent = 'Tankuji stíhačku…';
  await nextFrame();
  fx = new FX(scene);
  playerBullets = new Bullets(scene, 0xffd36a);
  enemyBullets = new Bullets(scene, 0xff5a3c);
  missiles = new Missiles(scene);
  flares = new Flares();
  player = new Aircraft(scene, { team: 'player', livery: { color: 0x9aa3ab, marking: 'cz' }, name: 'Ty' });
  player.hitRadius = 6;
  cockpit = buildCockpit();
  player.mesh.add(cockpit.group);
  world = {
    scene, terrain, fx, sound, camera, missiles, flares, player,
    aircraft: [player],
    bullets: { fire: (p, v, owner, dmg) => (owner.team === 'player' ? playerBullets : enemyBullets).fire(p, v, owner, dmg) },
    aiDecoyChance: DIFF[settings.difficulty].decoy,
    onKilled, onExploded, onDamage, onTouchdown, onLiftoff, onEnemyLaunch,
  };
  resetPlayer();
  applySettingsUI();
  onResize();
  $('loading').classList.add('hidden');
  showMenu();
  requestAnimationFrame(loop);
}

function resetPlayer() {
  player.reset(new THREE.Vector3(0, BASE_H + PAVE + SPEC.gearH, 1420), 0, 0, true);
  player.input.brake = false;
  player.updateVisual();
  camQ.copy(player.quat);
}

function clearEnemies() {
  for (const e of enemies) e.dispose();
  enemies = [];
  pilots.clear();
  world.aircraft = [player];
}

function startGame() {
  sound.init();
  clearEnemies();
  playerBullets.clear();
  enemyBullets.clear();
  missiles.clear();
  flares.clear();
  fx.clear();
  hud.clearMessages();
  resetPlayer();
  world.aiDecoyChance = DIFF[settings.difficulty].decoy;
  score = kills = wave = 0;
  wavePhase = 'takeoff';
  nextWaveT = -1;
  target = null;
  lock.progress = 0;
  lock.locked = false;
  rearmT = flightT = 0;
  landingScored = true;
  liftoffAnnounced = false;
  deathT = -1;
  hitFlash = gStress = redout = 0;
  lookYaw = lookPitch = 0;
  keyAxis.pitch = keyAxis.roll = keyAxis.yaw = 0;
  state = 'play';
  for (const id of ['menu', 'pause', 'gameover']) $(id).classList.add('hidden');
  hud.message('Plný plyn (W) · při 280 km/h přitáhni (↓)', '#e8f4ff', 6);
  hud.message('Po vzletu přiletí nepřátelé', '#e8f4ff', 6);
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------
function spawnWave() {
  wave++;
  const d = DIFF[settings.difficulty];
  const n = Math.min(1 + wave, d.max);
  const baseBearing = player.heading * DEG + rand(-0.9, 0.9);
  for (let i = 0; i < n; i++) {
    const b = baseBearing + (i - (n - 1) / 2) * 0.12;
    const dist = rand(7500, 9500);
    const pos = new THREE.Vector3(player.pos.x + Math.sin(b) * dist, 0, player.pos.z - Math.cos(b) * dist);
    const r = Math.hypot(pos.x, pos.z);
    if (r > 16000) pos.multiplyScalar(16000 / r);
    pos.y = Math.max(clamp(player.pos.y + rand(0, 800), 1300, 4500), terrain.surfaceAt(pos.x, pos.z) + 900);
    const ac = new Aircraft(scene, { team: 'enemy', livery: { color: 0x7a6a58, marking: 'red', twin: true }, name: `Bandita ${i + 1}` });
    const hdg = Math.atan2(player.pos.x - pos.x, -(player.pos.z - pos.z));
    ac.reset(pos, hdg, 230, false);
    ac.health = d.hp;
    ac.gunDamage = d.dmg;
    ac.gunRate = 30;
    ac.gunSpread = 0.006 - d.skill * 0.003;
    ac.fuelUse = 0;
    ac.missiles = 2;
    ac.parts.missiles.forEach((m, k) => (m.visible = k < 2));
    enemies.push(ac);
    world.aircraft.push(ac);
    pilots.set(ac, new AIPilot(ac, clamp(d.skill + rand(-0.1, 0.1) + wave * 0.02, 0, 1)));
  }
  wavePhase = 'combat';
  hud.message(`VLNA ${wave}: ${n} ${n === 1 ? 'nepřítel' : n < 5 ? 'nepřátelé' : 'nepřátel'}`, '#ff9b40', 4);
}

function updateWaves(dt) {
  const airborne = !player.onGround && player.agl > 150;
  switch (wavePhase) {
    case 'takeoff':
    case 'ready':
      if (airborne) {
        nextWaveT = wavePhase === 'takeoff' ? 6 : 10;
        wavePhase = 'incoming';
        hud.message('Radar hlásí nepřátelské stroje!', '#ff9b40', 4);
      }
      break;
    case 'incoming':
      nextWaveT -= dt;
      if (nextWaveT <= 0) spawnWave();
      break;
    case 'combat':
      if (enemies.length === 0) {
        const bonus = 200 * wave;
        score += bonus;
        wavePhase = 'rtb';
        hud.message(`Vlna ${wave} zničena!  +${bonus}`, '#6dff8a', 4);
        hud.message('Přistaň na letišti pro doplnění zbraní a paliva', '#e8f4ff', 6);
      }
      break;
  }
}

/** Called when the ground crew has finished resupplying the player. */
function onResupplied() {
  if (wavePhase !== 'rtb') return;
  wavePhase = 'ready';
  hud.message('Stroj připraven — vzlétni, další vlna čeká', '#6dff8a', 5);
}

// ---------------------------------------------------------------------------
// Player input
// ---------------------------------------------------------------------------
function ramp(cur, dir, dt, rate, start) {
  if (!dir) return 0;
  if (Math.sign(cur) !== dir) cur = dir * start;
  return clamp(cur + dir * rate * dt, -1, 1);
}

function playerControls(dt) {
  const pad = input.pad;
  const inp = player.input;
  let pk = (input.down('ArrowDown') ? 1 : 0) - (input.down('ArrowUp') ? 1 : 0);
  if (settings.invert) pk = -pk;
  const rk = (input.down('ArrowRight') ? 1 : 0) - (input.down('ArrowLeft') ? 1 : 0);
  const yk = (input.down('KeyD', 'KeyE') ? 1 : 0) - (input.down('KeyA', 'KeyQ') ? 1 : 0);
  keyAxis.pitch = ramp(keyAxis.pitch, pk, dt, 2.2, 0.3);
  keyAxis.roll = ramp(keyAxis.roll, rk, dt, 4, 0.45);
  keyAxis.yaw = ramp(keyAxis.yaw, yk, dt, 4, 0.5);
  inp.pitch = keyAxis.pitch;
  inp.roll = keyAxis.roll;
  inp.yaw = keyAxis.yaw;
  if (pad) {
    inp.pitch = clamp(inp.pitch + (settings.invert ? -pad.pitch : pad.pitch), -1, 1);
    inp.roll = clamp(inp.roll + pad.roll, -1, 1);
    inp.yaw = clamp(inp.yaw + pad.yaw, -1, 1);
    inp.throttle = clamp(inp.throttle + (pad.throttleUp - pad.throttleDown) * 0.6 * dt, 0, 1);
  }
  if (input.down('KeyW', 'ShiftLeft')) inp.throttle = clamp(inp.throttle + 0.6 * dt, 0, 1);
  if (input.down('KeyS')) inp.throttle = clamp(inp.throttle - 0.6 * dt, 0, 1);
  inp.brake = input.down('KeyB');
  if (DEBUG && window.__flyCtl) window.__flyCtl(player); // test autopilot
  player.firing = input.down('Space') || !!(pad && pad.gun);

  if (input.hit('KeyR', 'Enter') || pad?.missile) {
    const tgt = lock.locked ? target : null;
    if (player.missiles <= 0) hud.message('Došly rakety', '#ffcf40', 1.5);
    else if (player.launchMissile(world, tgt)) {
      sound.launch();
      if (!tgt) hud.message('Raketa bez zámku cíle', '#ffcf40', 1.5);
    }
  }
  if (input.hit('KeyX') || pad?.flares) player.dropFlares(world);
  if (input.hit('KeyG') || pad?.gear) {
    if (player.onGround) hud.message('Na zemi nelze zatáhnout podvozek', '#ffcf40', 1.5);
    else player.setGear(!player.gearDown, world);
  }
  if (input.hit('KeyT', 'Tab') || pad?.target) cycleTarget();
  if (input.hit('KeyV', 'KeyC') || pad?.view) toggleView();
}

function toggleView() {
  view = view === 'cockpit' ? 'chase' : 'cockpit';
  settings.view = view;
  saveSettings();
  lookYaw = lookPitch = 0;
  camQ.copy(player.quat);
}

// ---------------------------------------------------------------------------
// Targeting & lock-on
// ---------------------------------------------------------------------------
const _to = new THREE.Vector3();
function targetScore(e) {
  _to.subVectors(e.pos, player.pos);
  const d = _to.length();
  return player.fwd.angleTo(_to) * 3 + d / 4000;
}

function cycleTarget() {
  const list = enemies.filter((e) => e.alive && !e.dying).sort((a, b) => targetScore(a) - targetScore(b));
  if (!list.length) return;
  const i = list.indexOf(target);
  target = list[(i + 1) % list.length];
  lock.progress = 0;
  sound.click();
}

function updateTargeting(dt) {
  if (target && (!target.alive || target.dying)) target = null;
  if (!target) {
    let best = null, bs = Infinity;
    for (const e of enemies) {
      if (!e.alive || e.dying || e.pos.distanceTo(player.pos) > 14000) continue;
      const s = targetScore(e);
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    target = best;
    lock.progress = 0;
  }
  // the seeker grabs whatever enemy is in its cone if the chosen target is not
  if (lock.progress === 0 && player.missiles > 0) {
    const inCone = (e) => {
      _to.subVectors(e.pos, player.pos);
      const d = _to.length();
      return d < 5000 && d > 250 && player.fwd.angleTo(_to) < SEEKER;
    };
    if (!target || !inCone(target)) {
      const c = enemies.find((e) => e.alive && !e.dying && inCone(e));
      if (c) target = c;
    }
  }
  let tracking = false;
  if (target && player.alive && !player.dying) {
    _to.subVectors(target.pos, player.pos);
    const d = _to.length();
    tracking = player.missiles > 0 && d < 5000 && d > 250 && player.fwd.angleTo(_to) < SEEKER;
  }
  lock.progress = tracking ? Math.min(1, lock.progress + dt / 1.1) : Math.max(0, lock.progress - dt * 2.5);
  const was = lock.locked;
  lock.locked = lock.progress >= 1;
  lock.lockedFor = lock.locked ? lock.lockedFor + dt : 0;
  if (lock.locked && !was) sound.click();
}

function gunPipper() {
  const bv = _to.copy(player.fwd).multiplyScalar(1050).add(player.vel);
  let range = 800, onTarget = false, rng = null;
  if (target && target.alive) {
    const d = target.pos.distanceTo(player.pos);
    if (d < 2500) {
      range = Math.max(150, d);
      rng = d;
    }
  }
  const tof = range / bv.length();
  const point = player.pos.clone().addScaledVector(bv, tof);
  point.y -= 0.5 * 9.81 * tof * tof;
  if (rng != null && rng < 1400) {
    const future = target.pos.clone().addScaledVector(target.vel, tof);
    onTarget = future.distanceTo(point) < 9 + rng * 0.008;
  }
  return { point, onTarget, range: rng };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const _lookQ = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _off = new THREE.Vector3(), _cv = new THREE.Vector3();
function setCamParams(fov, near) {
  if (camera.fov !== fov || camera.near !== near) {
    camera.fov = fov;
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}

function updateCamera(dt) {
  if (input.look.dragging) {
    lookYaw = clamp(lookYaw - input.look.dx * 0.005, -2.6, 2.6);
    lookPitch = clamp(lookPitch - input.look.dy * 0.005, -1.2, 1.4);
  } else {
    const k = Math.exp(-dt * 4);
    lookYaw *= k;
    lookPitch *= k;
  }
  _lookQ.setFromEuler(_e.set(lookPitch, lookYaw, 0, 'YXZ'));
  const inCockpit = view === 'cockpit' && player.alive;
  cockpit.group.visible = inCockpit;
  player.parts.canopy.visible = !inCockpit;
  player.parts.pilot.visible = !inCockpit;

  if (!player.alive) {
    // orbit around the crash site
    setCamParams(65, 0.5);
    const t = performance.now() / 1000;
    _cv.set(Math.cos(t * 0.2) * 90, 40, Math.sin(t * 0.2) * 90).add(player.pos);
    _cv.y = Math.max(_cv.y, terrain.surfaceAt(_cv.x, _cv.z) + 10);
    camera.position.lerp(_cv, 1 - Math.exp(-dt * 2));
    camera.up.set(0, 1, 0);
    camera.lookAt(player.pos);
  } else if (inCockpit) {
    setCamParams(76, 0.05);
    player.mesh.updateMatrixWorld(true);
    camera.position.copy(player.eye).applyMatrix4(player.mesh.matrixWorld);
    _lookQ.setFromEuler(_e.set(lookPitch - 5 * DEG, lookYaw, 0, 'YXZ')); // pilot looks slightly down over the nose
    camera.quaternion.copy(player.quat).multiply(_lookQ);
    // buffet near the stall, on rough ground, when hit or firing
    let sh = player.shake * 0.5 + (player.stalled ? 0.5 : Math.max(0, player.alpha / (SPEC.aStall) - 0.8) * 1.5) + shakeT * 3 + (player.firing && player.ammo > 0 ? 0.25 : 0);
    sh *= 0.004;
    if (sh > 0) camera.position.add(_cv.set(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
  } else {
    setCamParams(65, 0.5);
    camQ.slerp(player.quat, 1 - Math.exp(-dt * 5));
    _off.set(0, 4.2, 20).applyQuaternion(_lookQ).applyQuaternion(camQ);
    camera.position.copy(player.pos).add(_off);
    const g = terrain.surfaceAt(camera.position.x, camera.position.z) + 1.5;
    if (camera.position.y < g) camera.position.y = g;
    camera.up.set(0, 1, 0).applyQuaternion(camQ);
    camera.lookAt(_cv.copy(player.pos).addScaledVector(player.up, 2.2));
    const sh = shakeT * 0.6 + player.shake * 0.08;
    if (sh > 0) camera.position.add(_cv.set(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
  }
  player.shake = Math.max(0, player.shake - dt * 3);
  camera.updateMatrixWorld();
}

function menuCamera(dt) {
  menuT += dt * 0.12;
  setCamParams(55, 0.5);
  cockpit.group.visible = false;
  player.parts.canopy.visible = player.parts.pilot.visible = true;
  const r = 36;
  camera.position.set(player.pos.x + Math.cos(menuT) * r, player.pos.y + 6 + Math.sin(menuT * 0.7) * 3, player.pos.z + Math.sin(menuT) * r);
  camera.up.set(0, 1, 0);
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------------------
// Cockpit displays
// ---------------------------------------------------------------------------
function drawMFDs(hs) {
  const [left, right] = cockpit.mfds;
  let g = left.ctx;
  g.fillStyle = '#020a04';
  g.fillRect(0, 0, 256, 256);
  hud.drawRadar(g, 128, 124, 108, hs, 15000);
  g.fillStyle = '#6dff8a';
  g.font = 'bold 16px monospace';
  g.textAlign = 'left';
  g.fillText('RDR', 8, 18);
  left.tex.needsUpdate = true;

  g = right.ctx;
  g.fillStyle = '#020a04';
  g.fillRect(0, 0, 256, 256);
  g.font = 'bold 17px monospace';
  g.textAlign = 'left';
  const row = (y, label, v, c = '#6dff8a') => {
    g.fillStyle = '#6dff8a';
    g.fillText(label, 12, y);
    g.fillStyle = c;
    g.textAlign = 'right';
    g.fillText(v, 244, y);
    g.textAlign = 'left';
  };
  row(28, 'MOTOR', `${Math.round(player.engine * 100)}%`, player.engine > 0.9 ? '#ffae40' : '#6dff8a');
  row(54, 'PALIVO', `${Math.round(player.fuel * 100)}%`, player.fuel < 0.2 ? '#ff3b30' : '#6dff8a');
  row(80, 'DRAK', `${Math.round(player.health)}%`, player.health < 40 ? '#ff3b30' : '#6dff8a');
  row(106, 'KANÓN', String(player.ammo));
  row(132, 'RAKETY', String(player.missiles));
  row(158, 'KLAMNÉ', String(player.flares));
  // gear lights
  for (let i = 0; i < 3; i++) {
    const g2 = player.gearAnim;
    g.fillStyle = g2 >= 1 ? '#2bd14a' : g2 > 0 ? '#ff3b30' : '#1a2a1e';
    g.beginPath();
    g.arc(88 + i * 40, 200, 13, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#6dff8a';
  g.font = '14px monospace';
  g.textAlign = 'center';
  g.fillText('PODVOZEK', 128, 236);
  right.tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  frame(Math.min(clock.getDelta(), 0.05));
}

function frame(dt) {
  input.pollPad();

  if (input.hit('KeyM')) {
    sound.setMuted(!sound.muted);
    hud.message(sound.muted ? 'Zvuk vypnut' : 'Zvuk zapnut', '#e8f4ff', 1.2);
  }
  if (input.hit('KeyH') && state === 'play') $('help').classList.toggle('hidden');
  if ((input.hit('KeyP', 'Escape') || input.pad?.pause) && (state === 'play' || state === 'pause')) togglePause();

  if (state === 'play') update(dt);
  else if (state === 'menu') {
    menuCamera(dt);
    fx.update(dt, terrain);
  } else if (state === 'over') {
    updateCamera(dt);
    fx.update(dt, terrain);
  }
  if (state !== 'play') sound.update({ active: false, throttle: 0, speed: 0 });

  sky.position.copy(camera.position);
  sun.target.position.copy(player.pos);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 1500);
  fx.setScale((window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * DEG) / 2)));
  renderer.render(scene, camera);
  if (state !== 'play' && state !== 'pause') hud.draw(null, dt);
  input.endFrame();
}

function update(dt) {
  const dying = !player.alive || player.dying;
  if (!dying) playerControls(dt);
  else player.firing = false;
  hitSoundT -= dt;
  shakeT = Math.max(0, shakeT - dt);
  if (!player.onGround) flightT += dt;

  for (const [, p] of pilots) p.update(dt, world);
  for (const ac of [...world.aircraft]) ac.update(dt, world);

  // mid-air collisions
  const all = world.aircraft;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.alive && b.alive && a.pos.distanceToSquared(b.pos) < 81) {
        a.crash(world, 'srážka');
        b.crash(world, 'srážka');
      }
    }

  playerBullets.update(dt, world);
  enemyBullets.update(dt, world);
  missiles.update(dt, world);
  flares.update(dt, world);
  fx.update(dt, terrain);
  updateTargeting(dt);
  updateWaves(dt);

  // rearm / refuel / repair when stopped at the airbase
  let rearm = null;
  const needs =
    wavePhase === 'rtb' || player.ammo < 600 || player.missiles < 6 || player.flares < 30 || player.fuel < 0.99 || player.health < 100;
  if (player.alive && !player.dying && player.onGround && player.speed < 1.5 && terrain.inAirbase(player.pos.x, player.pos.z) && needs) {
    rearmT += dt / 4;
    rearm = Math.min(1, rearmT);
    if (rearmT >= 1) {
      player.rearm();
      rearmT = 0;
      hud.message('Doplněno: palivo, munice, oprava', '#6dff8a', 3);
      sound.click();
      onResupplied();
    }
  } else rearmT = 0;

  // G effects
  if (player.gLoad > 7) gStress = Math.min(1, gStress + (player.gLoad - 7) * dt * 0.28);
  else gStress = Math.max(0, gStress - dt * 0.45);
  if (player.gLoad < -2) redout = Math.min(1, redout + (-player.gLoad - 2) * dt * 0.4);
  else redout = Math.max(0, redout - dt * 0.6);
  hitFlash = Math.max(0, hitFlash - dt * 1.5);
  $('gfx').style.opacity = String(Math.min(0.92, gStress * 1.1));
  $('redout').style.opacity = String(redout * 0.8);
  $('hitflash').style.opacity = String(hitFlash * 0.7);

  updateCamera(dt);

  // warnings
  const incoming = missiles.list.some((m) => m.target === player && m.t > 0.3);
  let rwr = false;
  for (const [, p] of pilots) if (p.lockT > 0.6) rwr = true;
  const air = !player.onGround && player.alive && !player.dying;
  const warnings = {
    missile: incoming && air,
    rwr: rwr && air,
    pullUp: air && player.vel.y < -25 && player.agl < 600 && player.agl / -player.vel.y < 6,
    stall: air && player.stalled,
    gear: air && player.gearAnim < 1 && player.agl < 250 && player.speed < 110 && player.vel.y < 0,
    fuel: player.fuel < 0.15,
    bounds: Math.hypot(player.pos.x, player.pos.z) > 16000,
  };

  const hs = {
    camera, view: player.alive ? view : 'chase', player, target, lock, enemies,
    missiles: missiles.list, lookOff: Math.hypot(lookYaw, lookPitch), seekerCone: SEEKER,
    pipper: player.alive && !player.dying ? gunPipper() : null,
    warnings, score, kills, rearm,
    waveText: {
      takeoff: 'VZLÉTNI',
      incoming: `VLNA ${wave + 1} ZA ${Math.ceil(Math.max(0, nextWaveT))} s`,
      combat: `VLNA ${wave} · NEPŘÁTEL ${enemies.filter((e) => !e.dying).length}`,
      rtb: player.onGround ? 'ZASTAV NA LETIŠTI — DOPLŇOVÁNÍ' : 'PŘISTAŇ NA ZÁKLADNĚ',
      ready: 'VZLÉTNI — DALŠÍ VLNA ČEKÁ',
    }[wavePhase],
    home: wavePhase === 'rtb' && !player.onGround ? HOME : null,
  };
  hud.draw(hs, dt);
  mfdT -= dt;
  if (view === 'cockpit' && mfdT <= 0) {
    mfdT = 0.1;
    drawMFDs(hs);
  }

  sound.update({
    active: player.alive,
    throttle: player.dying ? 0 : player.engine,
    speed: player.speed,
    cockpit: view === 'cockpit',
    gun: player.firing && player.ammo > 0,
    lock: lock.locked ? 2 : lock.progress > 0 ? 1 : 0,
    missileWarn: warnings.missile,
    rwr: warnings.rwr,
    pullUp: warnings.pullUp,
    stall: warnings.stall,
  });

  if (deathT >= 0) {
    deathT += dt;
    if (deathT > 3.5) gameOver();
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function showMenu() {
  state = 'menu';
  clearEnemies();
  resetPlayer();
  missiles.clear();
  playerBullets.clear();
  enemyBullets.clear();
  flares.clear();
  for (const id of ['pause', 'gameover', 'help']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('gfx').style.opacity = $('redout').style.opacity = $('hitflash').style.opacity = '0';
}

function togglePause() {
  if (state === 'play') {
    state = 'pause';
    $('pause').classList.remove('hidden');
    sound.update({ active: false, throttle: 0, speed: 0 });
  } else if (state === 'pause') {
    state = 'play';
    $('pause').classList.add('hidden');
    clock.getDelta();
  }
}

function gameOver() {
  state = 'over';
  deathT = -1;
  $('finalScore').textContent = String(score);
  $('finalKills').textContent = String(kills);
  $('finalWave').textContent = String(wave);
  let best = 0;
  try {
    best = Number(localStorage.getItem('flySim.best') || 0);
    if (score > best) {
      localStorage.setItem('flySim.best', String(score));
      best = score;
    }
  } catch {}
  $('finalBest').textContent = String(best);
  $('gameover').classList.remove('hidden');
}

function applySettingsUI() {
  document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === settings.difficulty));
  $('optInvert').checked = settings.invert;
  $('optShadows').checked = settings.shadows;
  $('optView').checked = settings.view === 'cockpit';
}

document.querySelectorAll('[data-diff]').forEach((b) =>
  b.addEventListener('click', () => {
    settings.difficulty = b.dataset.diff;
    saveSettings();
    applySettingsUI();
  })
);
$('optInvert').addEventListener('change', (e) => {
  settings.invert = e.target.checked;
  saveSettings();
});
$('optShadows').addEventListener('change', (e) => {
  settings.shadows = e.target.checked;
  renderer.shadowMap.enabled = settings.shadows;
  scene.traverse((o) => {
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
  });
  saveSettings();
});
$('optView').addEventListener('change', (e) => {
  settings.view = view = e.target.checked ? 'cockpit' : 'chase';
  saveSettings();
});
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('menuBtn').addEventListener('click', showMenu);
$('resumeBtn').addEventListener('click', togglePause);
$('quitBtn').addEventListener('click', showMenu);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  hud.resize();
}
window.addEventListener('resize', onResize);
const DEBUG = new URLSearchParams(location.search).has('debug');
window.addEventListener('blur', () => {
  if (state === 'play' && !DEBUG) togglePause();
});

// ?debug: lets automated tests step the simulation while the page is hidden
if (DEBUG) {
  window.__fly = {
    step: (n = 60, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) frame(dt);
    },
    get player() { return player; },
    get enemies() { return enemies; },
    get world() { return world; },
    get state() { return { state, score, kills, wave, wavePhase, lock, target: target && target.name }; },
  };
}

init().catch((err) => {
  console.error(err);
  $('loadingText').textContent = 'Chyba při načítání: ' + err.message;
});
