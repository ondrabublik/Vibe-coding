import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF_W, LAT_LIMIT, KART_R } from './track.js';
import { clamp, wrapAngle } from './util.js';

export const MAX_SPEED = 23;   // m/s (~83 km/h — plenty in a residential street)
const ACCEL = 13;
const BRAKE = 26;
const REVERSE = 6;
const TURN = 1.85;
const BOOST_MULT = 1.38;
const SPIN_TIME = 1.15;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
function buildKartModel(color, helmet) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.9, roughness: 0.25 });
  const statics = [];
  const add = (geo, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = cast;
    g.add(m); statics.push(m); return m;
  };
  // chassis
  add(new THREE.BoxGeometry(1.25, 0.12, 2.1), dark, 0, 0.22, 0);
  add(new THREE.BoxGeometry(1.0, 0.32, 1.5), paint, 0, 0.42, -0.05);
  const nose = add(new THREE.BoxGeometry(0.9, 0.24, 0.8), paint, 0, 0.38, 0.95);
  nose.rotation.x = 0.18;
  add(new THREE.BoxGeometry(1.35, 0.14, 0.35), paint, 0, 0.3, 1.25); // front bumper
  // side pods
  add(new THREE.BoxGeometry(0.28, 0.26, 1.1), paint, 0.66, 0.36, -0.05);
  add(new THREE.BoxGeometry(0.28, 0.26, 1.1), paint, -0.66, 0.36, -0.05);
  // seat
  add(new THREE.BoxGeometry(0.62, 0.55, 0.14), dark, 0, 0.8, -0.62);
  // engine + exhausts
  add(new THREE.BoxGeometry(0.7, 0.35, 0.45), dark, 0, 0.55, -0.95);
  const ex1 = add(new THREE.CylinderGeometry(0.07, 0.08, 0.4, 10), chrome, 0.22, 0.62, -1.2);
  ex1.rotation.x = Math.PI / 2 - 0.3;
  const ex2 = add(new THREE.CylinderGeometry(0.07, 0.08, 0.4, 10), chrome, -0.22, 0.62, -1.2);
  ex2.rotation.x = Math.PI / 2 - 0.3;
  // spoiler
  add(new THREE.BoxGeometry(1.2, 0.06, 0.32), paint, 0, 1.05, -1.15);
  add(new THREE.BoxGeometry(0.06, 0.4, 0.1), dark, 0.4, 0.85, -1.12);
  add(new THREE.BoxGeometry(0.06, 0.4, 0.1), dark, -0.4, 0.85, -1.12);
  // steering wheel
  const sw = add(new THREE.TorusGeometry(0.17, 0.035, 8, 16), dark, 0, 0.82, 0.35);
  sw.rotation.x = -0.9;

  // driver
  const suit = new THREE.MeshStandardMaterial({ color: helmet, roughness: 0.6 });
  add(new THREE.CylinderGeometry(0.24, 0.28, 0.6, 12), suit, 0, 0.92, -0.35);
  add(new THREE.SphereGeometry(0.19, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf1c7a1 }), 0, 1.33, -0.3);
  const helm = add(new THREE.SphereGeometry(0.25, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: helmet, metalness: 0.3, roughness: 0.3 }), 0, 1.36, -0.32);
  helm.rotation.x = -0.25;
  const visor = add(new THREE.BoxGeometry(0.32, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x111820, metalness: 0.8, roughness: 0.1 }), 0, 1.35, -0.1);
  visor.rotation.x = 0.1;
  // arms
  for (const s of [-1, 1]) {
    const arm = add(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), suit, s * 0.24, 0.95, -0.05);
    arm.rotation.x = 1.1;
  }

  // merge the static parts per material (fewer draw calls)
  const byMat = new Map();
  for (const m of statics) {
    m.updateMatrix();
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(geo);
    g.remove(m);
  }
  for (const [mat, geos] of byMat) {
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    merged.castShadow = true;
    g.add(merged);
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.28, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z, front] of [[0.72, 0.8, true], [-0.72, 0.8, true], [0.75, -0.8, false], [-0.75, -0.8, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.3, z);
    const w = new THREE.Mesh(wheelGeo, tire); w.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, chrome);
    w.add(hub);
    if (!front) w.scale.set(1.25, 1.08, 1.08);
    pivot.add(w);
    g.add(pivot);
    wheels.push({ pivot, w, front });
  }

  // drift sparks (two glowing bits behind rear wheels)
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 });
  const sparks = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), sparkMat);
    sp.position.set(s * 0.75, 0.12, -1.15);
    sp.visible = false;
    g.add(sp); sparks.push(sp);
  }
  // boost flame
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a1c, transparent: true, opacity: 0.85 });
  const flames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 10), flameMat);
    f.rotation.x = -Math.PI / 2 - 0.3;
    f.position.set(s * 0.22, 0.52, -1.6);
    f.visible = false;
    g.add(f); flames.push(f);
  }
  return { group: g, wheels, sparks, sparkMat, flames };
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------
export class Kart {
  constructor({ scene, track, color, helmet, name, isPlayer = false, skill = 1 }) {
    this.track = track;
    this.name = name;
    this.color = color;
    this.isPlayer = isPlayer;
    this.skill = skill;
    const m = buildKartModel(color, helmet);
    this.model = m;
    this.root = new THREE.Group(); // position + heading
    this.body = new THREE.Group(); // pitch, hop, spin
    this.body.add(m.group);
    this.root.add(this.body);
    scene.add(this.root);
    this.reset(0, 0);
  }

  reset(s, lat) {
    const t = this.track;
    const p = t.pos(s, lat);
    this.x = p.x; this.z = p.z;
    this.idx = t.nearest(this.x, this.z);
    this.y = t.surfaceY(this.x, this.z, this.idx);
    this.heading = t.heading(this.idx);
    this.moveAngle = this.heading;
    this.speed = 0;
    this.vy = 0; this.hop = 0;
    this.drift = { active: false, dir: 0, time: 0 };
    this.boostTime = 0;
    this.spinTime = 0; this.spinAngle = 0;
    this.item = null; this.itemRoll = 0;
    this.steerVis = 0;
    this.wheelRot = 0;
    this.lastS = t.sOf(this.x, this.z, this.idx);
    let d = this.lastS - t.startS;
    if (d > t.length / 2) d -= t.length;
    if (d < -t.length / 2) d += t.length;
    this.dist = d;
    this.lap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.stuck = 0;
    this.offroad = false;
    this.wallHit = 0;
    this.ai = { line: (Math.random() - 0.5) * 4, lineTimer: 0, itemTimer: 1 + Math.random() * 3 };
    this.syncMesh(0);
  }

  get lapNumber() {
    return clamp(Math.floor(this.dist / this.track.length) + 1, 1, 99);
  }

  startBoost(t) {
    this.boostTime = Math.max(this.boostTime, t);
  }

  hit() {
    if (this.spinTime > 0) return false;
    this.spinTime = SPIN_TIME;
    this.drift.active = false;
    return true;
  }

  // input: {throttle, brake, steer (-1..1, + = right), drift (held)}
  update(dt, input, obstacles) {
    const t = this.track;
    const events = [];
    let { throttle, brake, steer, drift } = input;
    if (this.spinTime > 0) {
      this.spinTime = Math.max(0, this.spinTime - dt);
      // two full turns, easing out, ending exactly where it started
      const k = 1 - this.spinTime / SPIN_TIME;
      this.spinAngle = (1 - (1 - k) * (1 - k)) * Math.PI * 4;
      throttle = 0; brake = 0; steer = 0; drift = false;
      this.speed *= 1 - 2.8 * dt;
      if (this.spinTime <= 0) this.spinAngle = 0;
    }
    this.boostTime = Math.max(0, this.boostTime - dt);
    const boosting = this.boostTime > 0;
    let maxV = MAX_SPEED * this.skill * (boosting ? BOOST_MULT : 1);
    if (this.offroad && !boosting) maxV *= 0.72;

    // longitudinal
    if (boosting) {
      this.speed += (maxV - this.speed) * Math.min(1, 3 * dt);
    } else if (throttle > 0) {
      if (this.speed < maxV) this.speed += ACCEL * throttle * (1 - 0.55 * Math.max(0, this.speed) / maxV) * dt;
      else this.speed -= (this.speed - maxV) * 2.2 * dt;
    }
    if (brake > 0 && !boosting) {
      if (this.speed > 0.5) this.speed -= BRAKE * brake * dt;
      else this.speed = Math.max(-REVERSE, this.speed - 9 * brake * dt);
    }
    if (!(throttle > 0) && !(brake > 0) && !boosting) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (3 + Math.abs(this.speed) * 0.25) * dt);
    }

    // drift (hold drift + steer at speed)
    const onGround = this.hop <= 0.001;
    if (drift && !this.drift.active && Math.abs(steer) > 0.3 && this.speed > 9 && this.spinTime <= 0) {
      this.drift.active = true;
      this.drift.dir = Math.sign(steer);
      this.drift.time = 0;
      if (onGround) { this.vy = 3.2; events.push('hop'); }
    }
    if (this.drift.active && (!drift || this.speed < 7)) {
      if (this.drift.time > 1.9) { this.startBoost(1.25); events.push('turbo2'); }
      else if (this.drift.time > 0.95) { this.startBoost(0.7); events.push('turbo1'); }
      this.drift.active = false;
    }

    // steering
    const abs = Math.abs(this.speed);
    const sf = clamp(abs / 5, 0, 1) * (1 - 0.45 * Math.min(1, abs / MAX_SPEED));
    let yaw;
    if (this.drift.active) {
      this.drift.time += dt;
      yaw = this.drift.dir * (1.15 + 0.75 * steer * this.drift.dir) * 1.2;
    } else {
      yaw = steer * TURN * sf * Math.sign(this.speed || 1);
    }
    this.heading = wrapAngle(this.heading - yaw * dt);
    const grip = this.drift.active ? 3.2 : this.spinTime > 0 ? 0.5 : 9;
    this.moveAngle = wrapAngle(this.moveAngle + wrapAngle(this.heading - this.moveAngle) * Math.min(1, grip * dt));

    // integrate
    this.x += Math.sin(this.moveAngle) * this.speed * dt;
    this.z += Math.cos(this.moveAngle) * this.speed * dt;

    // obstacles (lamps, bins, parked cars)
    for (const o of obstacles) {
      const dx = this.x - o.x, dz = this.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + KART_R;
      if (d < min && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        this.x = o.x + nx * min; this.z = o.z + nz * min;
        this.bounce(nx, nz);
        events.push('bump');
      }
    }

    // track walls
    this.idx = t.nearest(this.x, this.z, this.idx, 24);
    const lat = t.lateral(this.x, this.z, this.idx);
    this.offroad = Math.abs(lat) > HALF_W + 0.4;
    if (Math.abs(lat) > LAT_LIMIT) {
      const sgn = Math.sign(lat);
      const nx = t.nx(this.idx) * sgn, nz = t.nz(this.idx) * sgn;
      const over = Math.abs(lat) - LAT_LIMIT;
      this.x -= nx * over; this.z -= nz * over;
      if (this.bounce(-nx, -nz) > 3) events.push('wall');
    }

    // vertical
    const ground = t.surfaceY(this.x, this.z, this.idx);
    this.vy -= 18 * dt;
    this.hop = Math.max(0, this.hop + this.vy * dt);
    if (this.hop <= 0) this.vy = 0;
    this.y += (ground - this.y) * Math.min(1, 18 * dt);

    // progress
    const s = t.sOf(this.x, this.z, this.idx);
    let ds = s - this.lastS;
    if (ds > t.length / 2) ds -= t.length;
    if (ds < -t.length / 2) ds += t.length;
    this.dist += ds;
    this.lastS = s;

    // stuck detection (mostly for AI)
    if (Math.abs(this.speed) < 1.5 && (throttle > 0 || brake > 0)) this.stuck += dt; else this.stuck = 0;

    this.steerVis += (steer - this.steerVis) * Math.min(1, 10 * dt);
    this.syncMesh(dt);
    return events;
  }

  // remove the velocity component going into a surface with normal (nx,nz)
  bounce(nx, nz) {
    let vx = Math.sin(this.moveAngle) * this.speed, vz = Math.cos(this.moveAngle) * this.speed;
    const vn = vx * nx + vz * nz;
    if (vn >= 0) return 0;
    vx -= nx * vn * 1.35; vz -= nz * vn * 1.35;
    const fwd = Math.sin(this.heading) * vx + Math.cos(this.heading) * vz;
    const sp = Math.hypot(vx, vz) * 0.93;
    this.speed = fwd >= 0 ? sp : -sp;
    if (sp > 0.1) this.moveAngle = Math.atan2(vx, vz) + (fwd >= 0 ? 0 : Math.PI);
    return -vn;
  }

  syncMesh(dt) {
    const t = this.track;
    this.root.position.set(this.x, this.y + this.hop, this.z);
    const driftYaw = this.drift.active ? this.drift.dir * -0.35 : 0;
    this.visDrift = (this.visDrift || 0) + (driftYaw - (this.visDrift || 0)) * Math.min(1, 8 * dt);
    this.root.rotation.y = this.heading + this.visDrift + this.spinAngle;
    // pitch from the track slope
    const a = (this.idx - 6 + t.N) % t.N, b = (this.idx + 6) % t.N;
    const slope = (t.y[b] - t.y[a]) / (12 * t.step);
    const along = Math.cos(this.heading - t.heading(this.idx));
    this.body.rotation.x = -Math.atan(slope * along);
    this.body.rotation.z = -this.steerVis * Math.min(1, Math.abs(this.speed) / MAX_SPEED) * 0.06 + (this.drift.active ? this.drift.dir * 0.05 : 0);
    // wheels
    this.wheelRot += (this.speed * dt) / 0.3;
    for (const w of this.model.wheels) {
      w.w.rotation.x = this.wheelRot;
      if (w.front) w.pivot.rotation.y = -this.steerVis * 0.45;
    }
    // sparks / flames
    const d = this.drift;
    const sparkOn = d.active && d.time > 0.35;
    for (const sp of this.model.sparks) {
      sp.visible = sparkOn;
      if (sparkOn) {
        sp.scale.setScalar(0.6 + Math.random() * 0.9);
        sp.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      }
    }
    if (sparkOn) this.model.sparkMat.color.set(d.time > 1.9 ? 0xff8a1c : d.time > 0.95 ? 0x3fb6ff : 0xfff3a0);
    const boosting = this.boostTime > 0;
    for (const f of this.model.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 0.8 + Math.random() * 0.8, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// AI driver
// ---------------------------------------------------------------------------
export function aiInput(k, dt, ctx) {
  const t = k.track;
  const ai = k.ai;
  ai.lineTimer -= dt;
  if (ai.lineTimer <= 0) {
    ai.line = clamp(ai.line + (Math.random() - 0.5) * 3, -3.2, 3.2);
    ai.lineTimer = 2 + Math.random() * 3;
  }
  const s = k.idx * t.step;
  const look = 5 + Math.abs(k.speed) * 0.5;
  // dodge obstacles / bananas / slower karts ahead on our line
  let line = ai.line;
  // hazards: {idx, lat, r} (parked vehicles, bananas)
  for (const o of ctx.hazards) {
    let ahead = (o.idx - k.idx) * t.step;
    if (ahead < -t.length / 2) ahead += t.length;
    if (ahead > t.length / 2) ahead -= t.length;
    if (ahead > -2 && ahead < 24) {
      if (Math.abs(o.lat - line) < o.r + 1.6) line = o.lat > 0 ? o.lat - o.r - 1.9 : o.lat + o.r + 1.9;
    }
  }
  line = clamp(line, -HALF_W + 1.2, HALF_W - 1.2);
  const target = t.pos(s + look, line);
  const desired = Math.atan2(target.x - k.x, target.z - k.z);
  const diff = wrapAngle(desired - k.heading);
  let steer = clamp(-diff * 2.6, -1, 1);

  // speed planning from curvature ahead
  let maxC = 0;
  for (let d = 4; d < 40; d += 2) maxC = Math.max(maxC, t.curv[t.idxAt(s + d)]);
  const aLat = 15 * ctx.difficulty;
  let vmax = Math.sqrt(aLat / Math.max(maxC, 0.004));
  vmax = Math.min(vmax, MAX_SPEED * k.skill * ctx.rubber);
  let throttle = 1, brake = 0;
  if (k.speed > vmax + 1.5) { throttle = 0; brake = clamp((k.speed - vmax) / 6, 0.2, 1); }
  else if (k.speed > vmax) throttle = 0.2;

  // un-stick
  if (k.stuck > 1.2) { ai.reverse = 0.9; k.stuck = 0; }
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    return { throttle: 0, brake: 1, steer: -steer, drift: false, useItem: false };
  }

  // items
  let useItem = false;
  if (k.item && k.itemRoll <= 0) {
    ai.itemTimer -= dt;
    if (ai.itemTimer <= 0) {
      if (k.item === 'mushroom') useItem = maxC < 0.02;
      else if (k.item === 'banana') useItem = true;
      else if (k.item === 'shell') useItem = ctx.targetAhead(k);
      if (useItem) ai.itemTimer = 1.5 + Math.random() * 3;
    }
  }
  return { throttle, brake, steer, drift: false, useItem };
}
