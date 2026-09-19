import * as THREE from 'three';
import { buildJet } from './aircraftModel.js';
import { clamp, DEG, G, rand } from './util.js';

// Semi-physical flight model: lift / drag / side force from angle of attack
// and sideslip, thrust, gravity. The stick commands rotation rates
// (fly-by-wire), limited by dynamic pressure, a G-limiter and an AoA limiter;
// aerodynamic stability turns the nose back into the airflow, so running
// out of airspeed really stalls the jet.

export const SPEC = {
  mass: 12000,
  S: 38,
  clA: 4.8,
  aStall: 17 * DEG,
  cd0: 0.042,
  k: 0.13,
  mil: 76000,
  ab: 128000,
  gearH: 2.0, // origin height above the wheels' contact patch
  bellyH: 1.0,
  radius: 7, // hit sphere
};

const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _vb = new THREE.Vector3(), _F = new THREE.Vector3();
const _vh = new THREE.Vector3(), _ld = new THREE.Vector3(), _sd = new THREE.Vector3(), _n = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

let SEQ = 0;

export class Aircraft {
  constructor(scene, { team = 'player', livery = {}, name = '' } = {}) {
    this.id = SEQ++;
    this.team = team;
    this.name = name;
    const m = buildJet(livery);
    this.mesh = m.group;
    this.parts = m.parts;
    this.eye = m.eye;
    this.scene = scene;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };
    this.ctrl = { pitch: 0, roll: 0, yaw: 0 };
    this.hitRadius = SPEC.radius;
    this.gunRate = 40;
    this.gunSpread = 0.0025;
    this.gunDamage = 9;
    this.fuelUse = 1;
    this.reset(new THREE.Vector3(), 0, 0, false);
  }

  reset(pos, heading, speed, onGround) {
    this.pos.copy(pos);
    this.quat.setFromEuler(_e.set(0, -heading, 0, 'YXZ'));
    this.updateAxes();
    this.vel.copy(this.fwd).multiplyScalar(speed);
    this.onGround = onGround;
    this.gearDown = onGround;
    this.gearAnim = onGround ? 1 : 0;
    this.engine = onGround ? 0 : 0.8;
    this.input.throttle = this.engine;
    this.input.pitch = this.input.roll = this.input.yaw = 0;
    this.ctrl.pitch = this.ctrl.roll = this.ctrl.yaw = 0;
    this.health = 100;
    this.alive = true;
    this.dying = false;
    this.mesh.visible = true;
    this.ammo = 600;
    this.missiles = this.parts.missiles.length;
    this.parts.missiles.forEach((m) => (m.visible = true));
    this.flares = 30;
    this.fuel = 1;
    this.gunCD = 0;
    this.missileCD = 0;
    this.flareCD = 0;
    this.firing = false;
    this.airbrake = 0;
    this.gLoad = 1;
    this.alpha = 0;
    this.beta = 0;
    this.speed = speed;
    this.agl = 0;
    this.stalled = false;
    this.lastAttacker = null;
    this.lastHitTime = -99;
    this.dieT = 0;
    this.touchdownV = 0;
    this.shake = 0;
    this.smokeAcc = 0;
    this.time = 0;
  }

  updateAxes() {
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
  }

  get heading() {
    return (Math.atan2(this.fwd.x, -this.fwd.z) / DEG + 360) % 360;
  }
  get pitchAngle() {
    return Math.asin(clamp(this.fwd.y, -1, 1));
  }
  get rollAngle() {
    _e.setFromQuaternion(this.quat, 'YXZ');
    return _e.z; // positive = left wing down
  }

  setGear(down, world) {
    if (!down && this.onGround) return;
    if (this.gearDown !== down) {
      this.gearDown = down;
      if (world && this === world.player) world.sound.gear();
    }
  }

  // -------------------------------------------------------------------------
  update(dt, world) {
    if (!this.alive) return;
    this.time += dt;
    if (this.dying) {
      this.dieT += dt;
      this.input.roll = this.dieRoll;
      this.input.pitch = -0.25;
      this.input.throttle = 0;
      this.firing = false;
      if (this.dieT > 12) {
        this.explode(world);
        return;
      }
    }
    const k = 1 - Math.exp(-dt * 9);
    this.ctrl.pitch += (clamp(this.input.pitch, -1, 1) - this.ctrl.pitch) * k;
    this.ctrl.roll += (clamp(this.input.roll, -1, 1) - this.ctrl.roll) * k;
    this.ctrl.yaw += (clamp(this.input.yaw, -1, 1) - this.ctrl.yaw) * k;
    const target = this.fuel > 0 ? clamp(this.input.throttle, 0, 1) : 0;
    this.engine += clamp(target - this.engine, -0.5 * dt, 0.45 * dt);
    this.gearAnim = clamp(this.gearAnim + (this.gearDown ? dt : -dt) / 4, 0, 1);
    this.airbrake = clamp(this.airbrake + ((this.input.brake && !this.onGround) ? dt : -dt) * 1.5, 0, 1);
    this.gunCD = Math.max(this.gunCD - dt, this.firing ? -1 : 0);
    this.missileCD -= dt;
    this.flareCD -= dt;

    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps && this.alive; i++) this.physics(h, world);
    if (!this.alive) return;

    this.fireGun(world);
    this.effects(dt, world);
    this.updateVisual();
  }

  physics(dt, world) {
    const S = SPEC, q = this.quat;
    this.updateAxes();
    const V = this.vel.length();
    _qi.copy(q).invert();
    _vb.copy(this.vel).applyQuaternion(_qi);
    const alpha = V > 3 ? Math.atan2(-_vb.y, -_vb.z) : 0;
    const beta = V > 3 ? Math.atan2(_vb.x, -_vb.z) : 0;
    this.alpha = alpha;
    this.beta = beta;
    const rho = 1.225 * Math.exp(-Math.max(0, this.pos.y) / 9500);
    const qd = 0.5 * rho * V * V;
    const aAbs = Math.abs(alpha);

    // lift coefficient: linear, then drops off past the stall
    let cl;
    if (aAbs <= S.aStall) cl = S.clA * alpha;
    else if (aAbs < Math.PI / 2) cl = Math.sign(alpha) * Math.max(0.5, S.clA * S.aStall - 2.5 * (aAbs - S.aStall)) * Math.cos(aAbs - S.aStall);
    else cl = 0;
    if (aAbs <= S.aStall) cl += this.gearAnim * 0.12 * Math.sign(alpha); // auto flaps with the gear
    this.stalled = aAbs > S.aStall && !this.onGround && V > 3;

    _F.set(0, 0, 0);
    if (V > 0.5) {
      _vh.copy(this.vel).divideScalar(V);
      _ld.crossVectors(this.right, _vh);
      if (_ld.lengthSq() > 1e-6) _F.addScaledVector(_ld.normalize(), qd * S.S * cl);
      const cd = S.cd0 + S.k * cl * cl + this.gearAnim * 0.025 + this.airbrake * 0.09 + Math.min(Math.abs(beta), 1) * 0.35;
      _F.addScaledVector(_vh, -qd * S.S * cd);
      _sd.copy(this.right).addScaledVector(_vh, -this.right.dot(_vh));
      if (_sd.lengthSq() > 1e-6) _F.addScaledVector(_sd.normalize(), -qd * S.S * 1.1 * clamp(beta, -1, 1));
    }
    const e = this.engine;
    let thrust = e <= 0.9 ? (0.05 + (0.95 * e) / 0.9) * S.mil : S.mil + ((e - 0.9) / 0.1) * (S.ab - S.mil);
    thrust *= Math.pow(rho / 1.225, 0.75);
    if (this.fuel <= 0 || this.dying) thrust = 0;
    _F.addScaledVector(this.fwd, thrust);
    this.fuel = Math.max(0, this.fuel - dt * this.fuelUse * (0.00025 + 0.0011 * Math.min(e, 0.9) / 0.9 + (e > 0.9 ? 0.0035 * (e - 0.9) / 0.1 : 0)));
    this.gLoad = this.onGround ? 1 : _F.dot(this.up) / (S.mass * G);
    _F.y -= S.mass * G;
    this.vel.addScaledVector(_F, dt / S.mass);

    // ------------------------------------------------------------ rotation
    const auth = clamp(qd / 11000, 0, 1);
    const stabF = clamp(qd / 6000, 0.15, 1.5);
    let pc = this.ctrl.pitch;
    const aLim = S.aStall * 0.85;
    if (pc > 0 && alpha > aLim) pc *= clamp(1 - (alpha - aLim) / (S.aStall * 0.3), 0, 1);
    let wp = pc >= 0 ? pc * Math.min(1.1, (9 * G) / Math.max(V, 40)) * auth : pc * Math.min(0.8, (3.5 * G) / Math.max(V, 40)) * auth;
    let wr = this.ctrl.roll * 3.6 * auth;
    let wy = -this.ctrl.yaw * 0.35 * auth;
    const aK = aAbs > S.aStall ? 2.5 : 0.35;
    if (!this.onGround) {
      wp -= clamp(alpha * aK * stabF, -1.5, 1.5);
      wy -= clamp(beta * 1.6 * stabF, -1.5, 1.5);
      if (this.stalled) wr += Math.sin(this.time * 2.3 + this.id) * 0.6 * (1 - auth);
    }
    const ang = Math.hypot(wp, wy, wr) * dt;
    if (ang > 1e-9) {
      _v.set(wp, wy, -wr).normalize();
      _dq.setFromAxisAngle(_v, ang);
      q.multiply(_dq).normalize();
    }

    // ------------------------------------------------------------ ground
    const terrain = world.terrain;
    if (this.onGround) {
      this.updateAxes();
      _v.set(this.right.x, 0, this.right.z).normalize();
      const vLat = this.vel.dot(_v);
      this.vel.addScaledVector(_v, -vLat * Math.min(1, dt * 12));
      _v2.set(this.fwd.x, 0, this.fwd.z).normalize();
      const vF = this.vel.dot(_v2);
      const paved = terrain.isPaved(this.pos.x, this.pos.z);
      const decel = (paved ? 0.25 : 1.2) + (this.input.brake ? 7 : 0);
      const nvF = Math.sign(vF) * Math.max(0, Math.abs(vF) - decel * dt);
      this.vel.addScaledVector(_v2, nvF - vF);
      const steer = -this.ctrl.yaw * clamp(1.4 / (1 + Math.abs(vF) * 0.12), 0.05, 0.5) * clamp(Math.abs(vF) / 3, 0, 1) * Math.sign(vF || 1);
      _dq.setFromAxisAngle(_v.set(0, 1, 0), steer * dt);
      q.premultiply(_dq);
    }

    this.pos.addScaledVector(this.vel, dt);

    const surface = terrain.surfaceAt(this.pos.x, this.pos.z);
    const water = terrain.groundAt(this.pos.x, this.pos.z) < 0;
    const bottom = this.gearAnim > 0.9 ? S.gearH : S.bellyH;
    const clearance = this.pos.y - bottom - surface;
    this.agl = this.pos.y - S.gearH - surface;

    if (this.onGround) {
      if (clearance > 0.05 && this.vel.y > 0) {
        this.onGround = false;
        world.onLiftoff?.(this);
      } else {
        this.pos.y = surface + bottom;
        if (this.vel.y < 0) this.vel.y = 0;
        _e.setFromQuaternion(q, 'YXZ');
        _e.z *= Math.max(0, 1 - dt * 6);
        if (_e.x < 0) _e.x = 0;
        if (this.ctrl.pitch < 0.05 && _e.x > 0) _e.x = Math.max(0, _e.x - 0.18 * dt);
        _e.x = Math.min(_e.x, 15 * DEG);
        q.setFromEuler(_e);
        const V2 = this.vel.length();
        if (!terrain.isPaved(this.pos.x, this.pos.z)) {
          terrain.normalAt(this.pos.x, this.pos.z, _n);
          if ((V2 > 12 && _n.y < 0.97) || water) return this.crash(world, 'terén');
          this.shake = Math.max(this.shake, Math.min(1, V2 / 60) * 0.5);
        }
      }
    } else if (clearance <= 0) {
      // touchdown or crash
      _e.setFromQuaternion(q, 'YXZ');
      const vs = -this.vel.y;
      const gearOk = this.gearAnim > 0.95;
      terrain.normalAt(this.pos.x, this.pos.z, _n);
      const ok =
        gearOk && !this.dying && !water && vs < 5.5 && Math.abs(_e.z) < 22 * DEG && _e.x > -4 * DEG && _e.x < 20 * DEG &&
        (terrain.isPaved(this.pos.x, this.pos.z) || _n.y > 0.985);
      if (!ok) return this.crash(world, water ? 'moře' : gearOk ? 'tvrdé přistání' : 'zem');
      this.onGround = true;
      this.touchdownV = vs;
      this.pos.y = surface + bottom;
      this.vel.y = 0;
      world.onTouchdown?.(this, vs);
    }
  }

  // -------------------------------------------------------------------------
  fireGun(world) {
    if (!this.firing || this.dying) return;
    while (this.ammo > 0 && this.gunCD <= 0) {
      this.gunCD += 1 / this.gunRate;
      this.ammo--;
      const p = _v.copy(this.parts.muzzle).applyQuaternion(this.quat).add(this.pos);
      const s = this.gunSpread;
      _v2.copy(this.fwd)
        .addScaledVector(this.right, rand(-s, s))
        .addScaledVector(this.up, rand(-s, s))
        .normalize()
        .multiplyScalar(1050)
        .add(this.vel);
      world.bullets.fire(p, _v2, this, this.gunDamage);
      if (Math.random() < 0.5) world.fx.muzzle(p);
    }
  }

  launchMissile(world, target) {
    if (this.missiles <= 0 || this.missileCD > 0 || this.dying) return false;
    const slot = this.parts.missiles.find((m) => m.visible);
    if (!slot) return false;
    this.mesh.updateMatrixWorld();
    const p = slot.getWorldPosition(new THREE.Vector3());
    slot.visible = false;
    this.missiles--;
    this.missileCD = 0.8;
    const v = this.vel.clone().addScaledVector(this.up, -6);
    world.missiles.launch(this, p, v, this.fwd.clone(), target);
    return true;
  }

  dropFlares(world) {
    if (this.flares <= 0 || this.flareCD > 0 || this.dying) return false;
    this.flares = Math.max(0, this.flares - 2);
    this.flareCD = 0.6;
    world.flares.drop(this, world);
    return true;
  }

  rearm() {
    this.ammo = 600;
    this.missiles = this.parts.missiles.length;
    this.parts.missiles.forEach((m) => (m.visible = true));
    this.flares = 30;
    this.fuel = 1;
    this.health = 100;
  }

  // -------------------------------------------------------------------------
  damage(amount, attacker, world) {
    if (!this.alive || this.dying) return;
    this.health -= amount;
    this.lastAttacker = attacker;
    this.lastHitTime = this.time;
    world.onDamage?.(this, amount, attacker);
    if (this.health <= 0) {
      this.health = 0;
      if (this.onGround) {
        world.onKilled?.(this, attacker, 'sestřelen');
        this.explode(world);
      } else {
        this.dying = true;
        this.dieT = 0;
        this.dieRoll = Math.random() < 0.5 ? -1 : 1;
        world.onKilled?.(this, attacker, 'sestřelen');
      }
    }
  }

  crash(world, reason) {
    if (!this.alive) return;
    if (!this.dying) {
      const recent = this.lastAttacker && this.time - this.lastHitTime < 15 ? this.lastAttacker : null;
      this.health = 0;
      world.onKilled?.(this, recent, reason);
    }
    const g = world.terrain.groundAt(this.pos.x, this.pos.z);
    this.explode(world);
    if (g > 0) world.fx.wreck(new THREE.Vector3(this.pos.x, g, this.pos.z));
  }

  explode(world) {
    if (!this.alive) return;
    this.alive = false;
    this.dying = false;
    this.firing = false;
    this.mesh.visible = false;
    world.fx.explosion(this.pos, 1.6, this.vel);
    world.sound.explosion(world.camera.position.distanceTo(this.pos), 1.2);
    world.onExploded?.(this);
  }

  dispose() {
    this.scene.remove(this.mesh);
  }

  // -------------------------------------------------------------------------
  effects(dt, world) {
    const fx = world.fx;
    // wingtip vortices when pulling hard
    if (this.gLoad > 5.5 && this.speed > 120) {
      for (const s of [-1, 1]) {
        _v.set(5.1 * s, 0, 3).applyQuaternion(this.quat).add(this.pos);
        fx.contrail(_v);
      }
    }
    this.smokeAcc += dt;
    if (this.health < 60 && this.smokeAcc > (this.dying ? 0.02 : 0.06)) {
      this.smokeAcc = 0;
      _v.set(0, 0.3, 6).applyQuaternion(this.quat).add(this.pos);
      fx.damageSmoke(_v, this.health < 30 || this.dying);
    }
    if (this.onGround && this.touchdownV > 0) {
      for (const s of [-1, 1]) {
        _v.set(1.2 * s, -1.9, 0.9).applyQuaternion(this.quat).add(this.pos);
        fx.tyreSmoke(_v);
      }
      this.touchdownV = 0;
    }
    this.speed = this.vel.length();
  }

  updateVisual() {
    const p = this.parts;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    const c = this.ctrl;
    p.ailerons[0].rotation.x = c.roll * 0.35;
    p.ailerons[1].rotation.x = -c.roll * 0.35;
    p.stabs[0].rotation.x = -c.pitch * 0.3 - c.roll * 0.12; // right
    p.stabs[1].rotation.x = -c.pitch * 0.3 + c.roll * 0.12; // left
    for (const r of p.rudders) r.rotation.y = c.yaw * 0.4;
    // gear: nose folds forward, mains fold inwards
    const g = this.gearAnim;
    p.gearNose.rotation.x = -(1 - g) * Math.PI * 0.5;
    p.gearNose.visible = g > 0.02;
    for (const m of p.gearMain) {
      m.rotation.z = -m.userData.side * (1 - g) * Math.PI * 0.5;
      m.visible = g > 0.02;
    }
    // flame
    const e = this.dying || this.fuel <= 0 ? 0 : this.engine;
    const ab = Math.max(0, (e - 0.9) / 0.1);
    const flick = 0.9 + Math.random() * 0.2;
    p.flame.visible = e > 0.05;
    p.flame.scale.set(0.8 + ab * 0.25, 0.8 + ab * 0.25, (0.6 + e * 1.2 + ab * 4.5) * flick);
    p.flameOuter.material.opacity = 0.12 + ab * 0.5;
    p.flameInner.material.opacity = 0.2 + ab * 0.6;
    p.nozzleGlow.color.setRGB(0.25 + e * 0.9 + ab, 0.08 + e * 0.3 + ab * 0.5, 0.02 + ab * 0.3);
    p.strobe.visible = this.time % 1.2 < 0.08;
  }
}
