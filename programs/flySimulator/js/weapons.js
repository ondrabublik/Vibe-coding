import * as THREE from 'three';
import { buildMissileMesh } from './aircraftModel.js';
import { G, rand, clamp } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const NOSE = new THREE.Vector3(0, 0, -1);
const IDENT = new THREE.Quaternion();
const _mp = new THREE.Vector3();

/** Squared distance from the origin to segment a→b; returns the parameter t in `out.t`. */
function segDist2(a, b, out) {
  _d.subVectors(b, a);
  const l2 = _d.lengthSq();
  const t = l2 > 0 ? clamp(-a.dot(_d) / l2, 0, 1) : 0;
  out.t = t;
  return _p.copy(a).addScaledVector(_d, t).lengthSq();
}

// ---------------------------------------------------------------------------
// Cannon rounds – every round is a tracer, drawn with one InstancedMesh.
// ---------------------------------------------------------------------------
export class Bullets {
  constructor(scene, color, max = 700) {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 11);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.max = max;
    this.list = [];
    this.pool = [];
  }

  fire(pos, vel, owner, dmg) {
    if (this.list.length >= this.max) return;
    const b = this.pool.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), p0: new THREE.Vector3() };
    b.p.copy(pos);
    b.v.copy(vel);
    b.life = 2.2;
    b.owner = owner;
    b.dmg = dmg;
    this.list.push(b);
  }

  update(dt, world) {
    const out = {};
    const targets = world.aircraft;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.p0.copy(b.p);
      b.v.y -= G * dt;
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        const step = b.v.length() * dt + 40;
        for (const t of targets) {
          if (!t.alive || t.team === b.owner.team) continue;
          if (t.pos.distanceToSquared(b.p) > step * step) continue;
          // relative motion: segment of the round in the target's frame
          _a.copy(b.p0).sub(t.pos).addScaledVector(t.vel, dt);
          _b.copy(b.p).sub(t.pos);
          if (segDist2(_a, _b, out) < t.hitRadius * t.hitRadius) {
            _p.lerpVectors(b.p0, b.p, out.t);
            world.fx.hitSparks(_p);
            t.damage(b.dmg, b.owner, world);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        const g = world.terrain.groundAt(b.p.x, b.p.z);
        if (b.p.y < Math.max(g, 0)) {
          if (Math.random() < 0.35) world.fx.groundImpact(b.p, g < 0);
          dead = true;
        }
      }
      if (dead) {
        this.pool.push(b);
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
      }
    }
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      _d.copy(b.v).normalize();
      _q.setFromUnitVectors(NOSE, _d);
      _m4.compose(b.p, _q, _s);
      this.mesh.setMatrixAt(i, _m4);
    }
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.pool.push(...this.list);
    this.list.length = 0;
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Flares – decoys for heat-seeking missiles
// ---------------------------------------------------------------------------
export class Flares {
  constructor() {
    this.list = [];
  }

  drop(owner, world) {
    const burst = [];
    for (let i = 0; i < 2; i++) {
      const f = {
        pos: owner.pos.clone().addScaledVector(owner.fwd, 5),
        vel: owner.vel.clone().addScaledVector(owner.up, -25).addScaledVector(owner.right, (i ? 1 : -1) * 18).add(new THREE.Vector3(rand(-5, 5), rand(-5, 5), rand(-5, 5))),
        life: 4,
        alive: true,
        isFlare: true,
        owner,
      };
      this.list.push(f);
      burst.push(f);
    }
    if (owner === world.player) world.sound.flare();
    // missiles tracking the dropper may be seduced by the new flares
    const chance = owner === world.player ? 0.65 : world.aiDecoyChance ?? 0.35;
    for (const m of world.missiles.list) {
      if (m.target !== owner || m.t < 0.4) continue;
      if (Math.random() < chance) m.target = burst[0];
    }
  }

  update(dt, world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      f.vel.multiplyScalar(1 - 1.8 * dt);
      f.vel.y -= G * dt;
      f.pos.addScaledVector(f.vel, dt);
      world.fx.flare(f.pos);
      if (f.life <= 0) {
        f.alive = false;
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const f of this.list) f.alive = false;
    this.list.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Heat-seeking missiles with lead-pursuit guidance
// ---------------------------------------------------------------------------
const BURN = 2.6, ACCEL = 210, MAX_G = 32, FUSE = 9, LIFE = 14;

export class Missiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.proto = buildMissileMesh();
  }

  launch(owner, pos, vel, dir, target) {
    const mesh = this.proto.clone();
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const speed = Math.max(vel.length(), 60);
    this.list.push({
      owner,
      target,
      pos: pos.clone(),
      prev: pos.clone(),
      dir: dir.clone().normalize(),
      drop: vel.clone(),
      speed,
      t: 0,
      mesh,
      alive: true,
    });
  }

  update(dt, world) {
    const steps = 3, h = dt / steps;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      for (let s = 0; s < steps && m.alive; s++) this.step(m, h, world);
      if (!m.alive) {
        this.scene.remove(m.mesh);
        this.list.splice(i, 1);
        continue;
      }
      m.mesh.position.copy(m.pos);
      _q.setFromUnitVectors(NOSE, m.dir);
      m.mesh.quaternion.copy(_q);
      // smoke trail, spaced along the path
      if (m.t > 0.3 && m.t < BURN + 0.3) {
        const dist = m.pos.distanceTo(m.prev);
        const n = Math.min(12, Math.ceil(dist / 5));
        for (let k = 0; k < n; k++) {
          _a.lerpVectors(m.prev, m.pos, k / n).addScaledVector(m.dir, -1.6);
          world.fx.missileTrail(_a);
        }
        _a.copy(m.pos).addScaledVector(m.dir, -1.7);
        world.fx.missileFlame(_a);
      }
      m.prev.copy(m.pos);
    }
  }

  step(m, h, world) {
    m.t += h;
    const tgt = m.target;
    if (m.t < 0.3) {
      // ejected from the rail, motor not yet lit
      m.drop.y -= G * h;
      m.pos.addScaledVector(m.drop, h);
      return;
    }
    if (m.t < BURN) m.speed += ACCEL * h;
    m.speed -= (m.speed * m.speed * 4.5e-5 + (m.t > BURN ? 8 : 0)) * h;
    if (tgt && !tgt.alive) m.target = null;
    if (m.target) {
      const tp = m.target.pos, tv = m.target.vel;
      _a.subVectors(tp, m.pos);
      const dist = _a.length();
      _b.subVectors(tv, _d.copy(m.dir).multiplyScalar(m.speed));
      const closing = Math.max(150, -_b.dot(_a) / Math.max(dist, 1));
      const tgo = clamp(dist / closing, 0, 6);
      _b.copy(tp).addScaledVector(tv, tgo).sub(m.pos).normalize();
      const ang = m.dir.angleTo(_b);
      if (m.dir.angleTo(_a) > 1.3) m.target = null; // target left the seeker's view
      else if (ang > 1e-5) {
        const maxTurn = ((MAX_G * G) / Math.max(m.speed, 100)) * h;
        const f = Math.min(1, maxTurn / ang);
        _q.setFromUnitVectors(m.dir, _b);
        _q.slerp(IDENT, 1 - f);
        m.dir.applyQuaternion(_q).normalize();
      }
    } else if (m.t > BURN) {
      m.dir.y -= (G / m.speed) * h;
      m.dir.normalize();
    }
    _mp.copy(m.pos);
    m.pos.addScaledVector(m.dir, m.speed * h);

    // proximity fuse against the target and anything else nearby
    const out = {};
    for (const ac of world.aircraft) {
      if (!ac.alive || ac === m.owner) continue;
      if (ac.pos.distanceToSquared(m.pos) > 400 * 400) continue;
      _a.copy(_mp).sub(ac.pos).addScaledVector(ac.vel, h);
      _b.copy(m.pos).sub(ac.pos);
      const r = ac === m.target ? FUSE : 5;
      if (segDist2(_a, _b, out) < r * r) {
        m.pos.lerpVectors(_mp, m.pos, out.t);
        return this.detonate(m, world);
      }
    }
    if (m.target && m.target.isFlare && m.target.pos.distanceTo(m.pos) < 8) return this.detonate(m, world);
    const g = world.terrain.groundAt(m.pos.x, m.pos.z);
    if (m.pos.y < Math.max(g, 0)) {
      world.fx.groundImpact(m.pos, g < 0);
      return this.detonate(m, world);
    }
    if (m.t > LIFE || (m.t > BURN && m.speed < 180)) this.detonate(m, world);
  }

  detonate(m, world) {
    m.alive = false;
    world.fx.explosion(m.pos, 0.55);
    world.sound.explosion(world.camera.position.distanceTo(m.pos), 0.7);
    for (const ac of world.aircraft) {
      if (!ac.alive || ac.dying || (ac === m.owner && m.t < 1.5)) continue;
      const d = ac.pos.distanceTo(m.pos);
      if (d < 22) ac.damage(Math.round(115 * (1 - d / 26)), m.owner, world);
    }
  }

  clear() {
    for (const m of this.list) this.scene.remove(m.mesh);
    this.list.length = 0;
  }
}
