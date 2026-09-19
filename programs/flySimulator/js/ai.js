import * as THREE from 'three';
import { clamp, DEG, rand } from './util.js';

const _db = new THREE.Vector3(), _qi = new THREE.Quaternion(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
const _u = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

/**
 * Enemy pilot. Flies the same flight model as the player by moving the
 * stick: roll the target into the lift plane, then pull.
 */
export class AIPilot {
  constructor(ac, skill) {
    this.ac = ac;
    this.skill = skill; // 0..1
    this.mode = 'attack';
    this.modeT = 0;
    this.threatT = 0;
    this.breakDir = 1;
    this.burst = 0;
    this.pause = 0;
    this.trackT = 0;
    this.missileCD = rand(14, 24);
    this.flareCD = 0;
    this.orbitA = rand(0, Math.PI * 2);
    this.lockT = 0; // how long the player has been in our missile cone (for the RWR)
  }

  /** Steer the nose towards a world direction. aggr 0..1 limits the pull. */
  steer(dir, aggr = 1) {
    const ac = this.ac, inp = ac.input;
    _qi.copy(ac.quat).invert();
    _db.copy(dir).applyQuaternion(_qi);
    const off = Math.acos(clamp(-_db.z, -1, 1));
    const pitchErr = Math.atan2(_db.y, -_db.z);
    if (_db.y < 0 && off < 25 * DEG && off > 2 * DEG) {
      // slightly below: push rather than rolling inverted
      inp.roll = clamp(-Math.atan2(_db.x, -_db.y) * 2.2, -1, 1);
      inp.pitch = clamp(pitchErr * 4, -0.6, 0);
    } else {
      let rollErr = Math.atan2(_db.x, _db.y);
      if (off < 8 * DEG) {
        _u.copy(UP).applyQuaternion(_qi);
        const level = Math.atan2(_u.x, _u.y);
        rollErr = level + (rollErr - level) * (off / (8 * DEG));
      }
      inp.roll = clamp(rollErr * 2.2, -1, 1);
      let p = clamp(pitchErr * 4, -0.3, 1);
      if (Math.abs(rollErr) > 1.3 && off > 20 * DEG) p = 0.25;
      inp.pitch = p * aggr;
    }
    inp.yaw = off < 10 * DEG ? clamp(Math.atan2(_db.x, -_db.z) * 3, -1, 1) : 0;
  }

  update(dt, world) {
    const ac = this.ac;
    if (!ac.alive || ac.dying) return;
    const player = world.player;
    const terrain = world.terrain;
    const sk = this.skill;
    this.modeT -= dt;
    this.missileCD -= dt;
    this.flareCD -= dt;
    ac.firing = false;
    ac.gearDown = false;

    // ------------------------------------------------ terrain avoidance
    let minClear = Infinity;
    for (const t of [0, 2.5, 5]) {
      _t.copy(ac.pos).addScaledVector(ac.vel, t);
      minClear = Math.min(minClear, _t.y - terrain.surfaceAt(_t.x, _t.z));
    }
    if (minClear < 320 || (ac.agl < 900 && ac.vel.y < -60)) {
      _w.set(ac.fwd.x, 0, ac.fwd.z).normalize().multiplyScalar(0.6).add(UP).normalize();
      this.steer(_w, 1);
      ac.input.throttle = 1;
      return;
    }
    // stay inside the map
    if (Math.hypot(ac.pos.x, ac.pos.z) > 17000) {
      _w.set(-ac.pos.x, 0, -ac.pos.z).normalize();
      _w.y = 0.1;
      this.steer(_w.normalize(), 0.8);
      ac.input.throttle = 0.9;
      return;
    }

    // ------------------------------------------------ player on the ground: loiter
    const pAlive = player.alive && !player.dying;
    if (!pAlive || player.onGround || player.agl < 60) {
      this.orbitA += dt * 0.045;
      _t.set(Math.cos(this.orbitA) * 5000, 0, Math.sin(this.orbitA) * 5000);
      _t.y = Math.max(terrain.surfaceAt(_t.x, _t.z) + 1200, 1600);
      _w.subVectors(_t, ac.pos).normalize();
      this.steer(_w, 0.6);
      ac.input.throttle = 0.75;
      this.lockT = 0;
      return;
    }

    _t.subVectors(player.pos, ac.pos);
    const dist = _t.length();
    const toP = _t.divideScalar(dist);
    const offNose = ac.fwd.angleTo(toP);

    // ------------------------------------------------ incoming missile → flares + break
    let threat = null;
    for (const m of world.missiles.list)
      if (m.target === ac && m.t > 0.3 && m.pos.distanceTo(ac.pos) < 3500) threat = m;
    if (threat) {
      if (this.flareCD <= 0 && Math.random() < 0.3 + sk * 0.6) {
        ac.dropFlares(world);
        this.flareCD = rand(1.0, 2.2) - sk * 0.6;
      }
      if (Math.random() < sk * dt * 3 && this.mode !== 'evade') {
        this.mode = 'evade';
        this.modeT = rand(2.5, 4);
        this.breakDir = Math.random() < 0.5 ? -1 : 1;
      }
    }

    // ------------------------------------------------ player on our six → defensive break
    const aspect = player.fwd.angleTo(_u.subVectors(ac.pos, player.pos).normalize());
    if (dist < 1600 && aspect < 25 * DEG) this.threatT += dt;
    else this.threatT = Math.max(0, this.threatT - dt);
    if (this.mode === 'attack' && this.threatT > 2.2 - sk * 1.2 && Math.random() < dt * (0.5 + sk)) {
      this.mode = 'evade';
      this.modeT = rand(2.5, 5);
      this.breakDir = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.mode === 'evade') {
      if (this.modeT <= 0) this.mode = 'attack';
      _w.crossVectors(ac.fwd, UP).normalize().multiplyScalar(this.breakDir);
      _w.addScaledVector(ac.fwd, 0.25);
      _w.y += ac.agl > 1500 ? -0.25 : 0.2;
      this.steer(_w.normalize(), 1);
      ac.input.throttle = 1;
      this.lockT = 0;
      return;
    }

    // ------------------------------------------------ attack: lead pursuit
    const tof = dist / (1050 + ac.speed * 0.3);
    const lead = 0.55 + sk * 0.45;
    _w.copy(player.pos).addScaledVector(player.vel, tof * lead).sub(ac.pos);
    _w.y += 0.5 * 9.81 * tof * tof;
    _w.normalize();
    this.steer(_w, 0.85 + sk * 0.15);
    const aimErr = ac.fwd.angleTo(_w);

    // throttle management
    // aim for corner speed in the dogfight, faster when closing in
    let want = dist > 3000 ? 260 : 215;
    if (dist < 500 && offNose < 40 * DEG) want = Math.min(want, player.speed * 0.95);
    ac.input.throttle = clamp(0.8 + (want - ac.speed) * 0.02, 0.3, 1);

    // cannon bursts
    const gunCone = (4.5 - sk * 2.2) * DEG;
    this.pause -= dt;
    if (dist < 1100 && aimErr < gunCone && this.pause <= 0) {
      this.burst += dt;
      ac.firing = true;
      if (this.burst > rand(0.4, 0.9)) {
        this.burst = 0;
        this.pause = rand(0.6, 1.6) - sk * 0.4;
      }
    }

    // missiles
    if (offNose < 14 * DEG && dist > 800 && dist < 3800) {
      this.trackT += dt;
      this.lockT += dt;
    } else {
      this.trackT = Math.max(0, this.trackT - dt * 2);
      this.lockT = Math.max(0, this.lockT - dt * 2);
    }
    if (ac.missiles > 0 && this.missileCD <= 0 && this.trackT > 2.2 - sk) {
      if (ac.launchMissile(world, player)) {
        this.missileCD = rand(12, 20) - sk * 5;
        this.trackT = 0;
        world.onEnemyLaunch?.(ac);
      }
    }
  }
}
