'use strict';
// Biplane 3D model (built from primitives) and flight physics.
(function (BW) {
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion, MB = BABYLON.MeshBuilder;

  // Physics constants (SI units). Roughly a Sopwith Camel, tuned for fun.
  const P = (BW.PHYS = {
    mass: 620, g: 9.81, rho: 1.225, S: 21,
    clA: 4.6, stall: 0.26, cd0: 0.034, k: 0.075,
    thrust: 4400, propV: 92,
    pitchRate: 1.5, rollRate: 2.4, yawRate: 0.55,
    bulletSpeed: 820, fireInterval: 1 / 15, bulletLife: 1.4, bulletDamage: 4,
  });
  P.clMax = P.clA * P.stall;

  // Local points (x right, y up, z forward) for ground contact.
  const WHEEL_L = new V3(-0.95, -1.45, 1.2), WHEEL_R = new V3(0.95, -1.45, 1.2), SKID = new V3(0, 0.07, -3.65); // tail rests on the fuselage bottom
  P.tailAngle = Math.atan2(SKID.y - WHEEL_L.y, WHEEL_L.z - SKID.z);
  const CRASH_POINTS = [
    new V3(4.3, 1.3, 0.75), new V3(-4.3, 1.3, 0.75), new V3(4.0, -0.42, 0.35), new V3(-4.0, -0.42, 0.35),
    new V3(0, 0.05, 2.75), new V3(0, 1.4, 0.75), new V3(0, 0.95, -4.1),
  ];
  BW.MUZZLES = [new V3(-0.18, 0.62, 1.95), new V3(0.18, 0.62, 1.95)];
  // Hit boxes in local space: wings and fuselage/tail.
  BW.HITBOXES = [
    { min: new V3(-4.4, -0.55, -0.4), max: new V3(4.4, 1.45, 1.55) },
    { min: new V3(-0.6, -0.7, -4.2), max: new V3(0.6, 0.9, 2.8) },
    { min: new V3(-1.6, -0.1, -4.2), max: new V3(1.6, 1.1, -3.0) },
  ];

  function liftCoef(a, stall) {
    const abs = Math.abs(a), sg = Math.sign(a), clMax = P.clA * stall;
    if (abs <= stall) return P.clA * a;
    if (abs < stall + 0.35) return sg * clMax * (1 - ((abs - stall) / 0.35) * 0.45);
    return sg * Math.min(0.55 * clMax, Math.sin(2 * abs));
  }

  function gearClearance(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return -Math.min(WHEEL_L.y * c + WHEEL_L.z * s, SKID.y * c + SKID.z * s);
  }
  BW.gearClearance = gearClearance;

  // ---------------------------------------------------------------- plane
  const tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), tmpF = new V3(), tmpQ = new Q();
  const AX_F = new V3(0, 0, 1), AX_U = new V3(0, 1, 0), AX_R = new V3(1, 0, 0);

  class Plane {
    constructor(game, o) {
      this.game = game;
      this.faction = o.faction;
      this.isPlayer = !!o.isPlayer;
      this.name = o.name || 'plane';
      this.maxHp = o.hp;
      // Performance multipliers (the player's plane gets a slightly better engine and wing).
      this.perf = Object.assign({ thrust: 1, rate: 1, stall: 1 }, o.perf);
      this.hp = o.hp;
      this.pos = o.pos.clone();
      this.vel = o.vel ? o.vel.clone() : V3.Zero();
      this.heading = o.heading || 0;
      this.theta = 0;
      this.onGround = !!o.onGround;
      this.q = new Q();
      if (this.onGround) {
        this.theta = P.tailAngle;
        Q.RotationYawPitchRollToRef(this.heading, -this.theta, 0, this.q);
        this.pos.y = BW.groundHeight(this.pos.x, this.pos.z) + gearClearance(this.theta);
      } else {
        Q.RotationYawPitchRollToRef(this.heading, 0, 0, this.q);
      }
      this.throttle = o.throttle || 0;
      this.ctrl = { pitch: 0, roll: 0, yaw: 0 };
      this.input = { pitch: 0, roll: 0, yaw: 0, fire: false, brake: false };
      this.alive = true;
      this.falling = false;
      this.destroyed = false;
      this.gunTimer = 0;
      this.gunSide = 0;
      this.flashTimer = 0;
      this.lastHitBy = null;
      this.kills = 0; this.shots = 0; this.hits = 0;
      this.enginePower = 1;
      this.seed = Math.random() * 100;
      this.spinDir = Math.random() < 0.5 ? -1 : 1;
      this.airTime = 0;
      this.fallTime = 0;
      this.V = this.vel.length();
      this.aoa = 0;
      this.stalled = false;
      this.f = new V3(); this.u = new V3(); this.r = new V3();
      this.propAngle = Math.random() * 6;
      this.model = BW.buildBiplane(game.scene, o.scheme, this.name);
      this.root = this.model.root;
      if (game.shadowGen) this.model.meshes.forEach((m) => game.shadowGen.addShadowCaster(m, false));
      this.updateAxes();
      this.syncMesh(0);
    }

    updateAxes() {
      AX_F.applyRotationQuaternionToRef(this.q, this.f);
      AX_U.applyRotationQuaternionToRef(this.q, this.u);
      AX_R.applyRotationQuaternionToRef(this.q, this.r);
    }
    localToWorld(p, out) {
      p.applyRotationQuaternionToRef(this.q, out);
      out.addInPlace(this.pos);
      return out;
    }
    get bank() { return Math.atan2(-this.r.y, this.u.y); }
    get pitchAtt() { return Math.asin(BW.clamp(this.f.y, -1, 1)); }
    get agl() { return this.pos.y - BW.groundHeight(this.pos.x, this.pos.z); }

    smoothControls(dt, rate) {
      const k = Math.min(1, dt * rate);
      this.ctrl.pitch += (this.input.pitch - this.ctrl.pitch) * k;
      this.ctrl.roll += (this.input.roll - this.ctrl.roll) * k;
      this.ctrl.yaw += (this.input.yaw - this.ctrl.yaw) * k;
    }

    step(dt) {
      if (this.destroyed) return;
      this.updateAxes();
      const f = this.f, u = this.u, r = this.r, c = this.ctrl;
      const V = this.vel.length();
      const vf = V3.Dot(this.vel, f), vu = V3.Dot(this.vel, u), vr = V3.Dot(this.vel, r);
      const aoa = V > 1 ? Math.atan2(-vu, vf) : 0;
      this.V = V; this.aoa = aoa;
      const qd = 0.5 * P.rho * V * V;
      const pf = this.perf, stall = P.stall * pf.stall;
      const CL = V > 1 ? liftCoef(aoa, stall) : 0;
      this.stalled = !this.onGround && V > 8 && Math.abs(aoa) > stall;
      const CD = P.cd0 + P.k * CL * CL + (this.stalled ? 0.12 : 0) + (this.falling ? 0.05 : 0);
      const thr = this.alive ? this.throttle * this.enginePower : 0;
      const T = thr * P.thrust * pf.thrust * Math.max(0, 1 - Math.max(vf, 0) / (P.propV * pf.thrust));

      const F = tmpF.copyFromFloats(0, -P.mass * P.g, 0);
      f.scaleAndAddToRef(T, F);
      if (V > 0.5) {
        const inv = 1 / V;
        tmpA.copyFrom(this.vel).scaleInPlace(inv);
        tmpA.scaleAndAddToRef(-qd * P.S * CD, F);
        V3.CrossToRef(tmpA, r, tmpB);
        const lm = tmpB.length();
        if (lm > 1e-3) tmpB.scaleAndAddToRef((qd * P.S * CL) / lm, F);
        r.scaleAndAddToRef(-vr * V * 6, F);
      }

      if (this.onGround) { this.groundStep(dt, F); return; }
      this.airTime += dt;

      this.vel.addInPlace(F.scaleInPlace(dt / P.mass));
      this.pos.addInPlace(tmpA.copyFrom(this.vel).scaleInPlace(dt));

      // Attitude: control surfaces give rotation rates, effectiveness grows with airspeed.
      const eff = BW.clamp(V / 38, 0.1, 1);
      let pr = c.pitch * P.pitchRate * pf.rate * eff, rr = c.roll * P.rollRate * pf.rate * eff, yr = c.yaw * P.yawRate * pf.rate * eff;
      if (this.stalled) {
        const t = this.game.time;
        // Wing drop in a stall (much milder on the player's assisted plane).
        rr += (Math.sin(t * 5.3 + this.seed) * 0.9 + Math.sin(t * 2.1 + this.seed * 2) * 0.5) * (this.assist ? 0.3 : 1);
      }
      if (this.falling) { rr += this.spinDir * 2.0; pr -= 0.35; }
      // Stability assist: with the stick released the wings slowly come back level.
      const assisted = this.assist && this.alive && !this.stalled;
      // (Skipped while the mouse-aim autopilot flies: it controls the bank itself.)
      if (assisted && !this.mouseFlying && Math.abs(c.roll) < 0.05) rr -= BW.clamp(this.bank * 1.2, -1.6, 1.6) * eff;
      Q.RotationYawPitchRollToRef(yr * dt, -pr * dt, -rr * dt, tmpQ);
      this.q.multiplyInPlace(tmpQ);

      // Weathervane stability: nose follows the flight path.
      if (V > 2) {
        tmpA.copyFrom(this.vel).scaleInPlace(1 / V);
        // Trim: the nose settles at the angle of attack that gives lift for level flight,
        // so the plane holds altitude with the stick released instead of sinking into the ground.
        if (assisted && u.y > 0.1) {
          // With the stick released also pull the flight path back to horizontal.
          const gamma = Math.asin(BW.clamp(this.vel.y / V, -1, 1));
          const w = BW.clamp(1 - Math.abs(c.pitch) / 0.1, 0, 1); // fades out smoothly with stick input
          const load = BW.clamp(1 - 3 * gamma * w, 0, 3);
          const need = (load * P.mass * P.g) / (Math.max(qd, 1) * P.S * Math.max(0.5, u.y));
          const trim = BW.clamp(need / P.clA, 0, stall * 0.75);
          tmpC.copyFrom(u).subtractInPlace(tmpB.copyFrom(tmpA).scaleInPlace(V3.Dot(u, tmpA)));
          if (tmpC.lengthSquared() > 1e-6) {
            tmpC.normalize().scaleInPlace(Math.sin(trim));
            tmpA.scaleInPlace(Math.cos(trim)).addInPlace(tmpC).normalize();
          }
        }
        const ang = Math.acos(BW.clamp(V3.Dot(f, tmpA), -1, 1));
        if (ang > 1e-4) {
          V3.CrossToRef(f, tmpA, tmpB);
          const al = tmpB.length();
          if (al > 1e-6) {
            tmpB.scaleInPlace(1 / al);
            const k = 0.6 + 2.4 * Math.min(1.5, (V / 45) * (V / 45));
            Q.RotationAxisToRef(tmpB, Math.min(ang, k * ang * dt), tmpQ);
            tmpQ.multiplyToRef(this.q, this.q);
          }
        }
      }
      this.q.normalize();
      this.updateAxes();

      if (this.falling) {
        this.fallTime += dt;
        if (this.fallTime > 30) this.crash('ground');
      }
      const gy = BW.groundHeight(this.pos.x, this.pos.z);
      if (this.pos.y - gy < 10) this.checkGround(gy);
    }

    checkGround(gy) {
      const water = BW.isWater(this.pos.x, this.pos.z);
      for (const p of CRASH_POINTS) {
        if (this.localToWorld(p, tmpA).y < gy) return this.crash(water ? 'water' : 'ground');
      }
      const low = Math.min(this.localToWorld(WHEEL_L, tmpA).y, this.localToWorld(WHEEL_R, tmpA).y, this.localToWorld(SKID, tmpA).y);
      if (low >= gy) return;
      if (water) return this.crash('water');
      const vs = this.vel.y;
      const hv = Math.hypot(this.vel.x, this.vel.z);
      const crashVs = this.isPlayer ? this.game.diff.crashVs : -7;
      if (!this.alive || vs < crashVs || Math.abs(this.bank) > 0.42 || this.pitchAtt < -0.2 || this.u.y < 0.6)
        return this.crash('ground');
      if (!BW.onAirfield(this.pos.x, this.pos.z) && hv > 38) return this.crash('rough');
      this.onGround = true;
      this.heading = Math.atan2(this.f.x, this.f.z);
      this.theta = BW.clamp(this.pitchAtt, 0, P.tailAngle);
      this.vel.y = 0;
      this.game.onTouchdown(this, vs);
      this.airTime = 0;
    }

    groundStep(dt, F) {
      const c = this.ctrl;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      let vAlong = this.vel.x * fx + this.vel.z * fz;
      let Fa = F.x * fx + F.z * fz;
      const normal = Math.max(0, -F.y);
      const rough = BW.onAirfield(this.pos.x, this.pos.z) ? 1 : 1.8;
      const mu = this.input.brake ? 0.42 : 0.035 * rough;
      const fr = mu * normal;
      if (Math.abs(vAlong) > 0.05) {
        const before = vAlong;
        vAlong += ((Fa - Math.sign(vAlong) * fr) / P.mass) * dt;
        if (Math.sign(before) !== Math.sign(vAlong) && Math.abs(Fa) < fr) vAlong = 0;
      } else if (Math.abs(Fa) > fr) {
        vAlong += ((Fa - Math.sign(Fa) * fr) / P.mass) * dt;
      } else vAlong = 0;

      let vy = 0;
      if (F.y > 0 && vAlong > 14 && this.alive && !this.input.brake) {
        vy = (F.y / P.mass) * dt;
        this.onGround = false;
      }

      this.heading += c.yaw * 0.9 * BW.clamp(Math.abs(vAlong) / 4, 0, 1) * dt;
      const s = BW.clamp((vAlong - 10) / 14, 0, 1);
      // With speed the tail lifts aerodynamically to ~10 deg, so the wing is not stalled at lift-off.
      let target = P.tailAngle - (P.tailAngle - 0.17) * s;
      if (c.pitch < 0) target *= 1 - s * -c.pitch;
      this.theta += (target - this.theta) * Math.min(1, dt * 2.5);
      Q.RotationYawPitchRollToRef(this.heading, -this.theta, 0, this.q);
      this.vel.set(fx * vAlong, vy, fz * vAlong);
      this.pos.addInPlace(tmpA.copyFrom(this.vel).scaleInPlace(dt));
      if (BW.isWater(this.pos.x, this.pos.z)) return this.crash('water');
      const gy = BW.groundHeight(this.pos.x, this.pos.z);
      if (this.onGround) this.pos.y = gy + gearClearance(this.theta);
      this.V = Math.abs(vAlong);
      this.updateAxes();
    }

    updateGuns(dt) {
      this.gunTimer -= dt;
      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        if (this.flashTimer <= 0) this.model.flashes.forEach((f) => f.setEnabled(false));
      }
      if (this.input.fire && this.alive && !this.destroyed) {
        if (this.gunTimer < -P.fireInterval) this.gunTimer = 0;
        while (this.gunTimer <= 0) {
          this.gunTimer += P.fireInterval;
          this.gunSide ^= 1;
          this.game.weapons.fire(this, this.gunSide);
          this.shots++;
          const fl = this.model.flashes[this.gunSide];
          fl.setEnabled(true);
          fl.scaling.x = fl.scaling.y = 0.7 + Math.random() * 0.6;
          this.flashTimer = 0.035;
        }
      }
    }

    damage(amount, attacker, point) {
      if (!this.alive) return;
      this.hp -= amount;
      this.lastHitBy = attacker;
      const frac = this.hp / this.maxHp;
      if (frac < 0.3) this.enginePower = 0.75;
      this.game.effects.updateDamageSmoke(this, frac);
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.falling = true;
        this.throttle = 0;
        this.input.fire = false;
        this.game.effects.updateDamageSmoke(this, -1);
        this.game.onShotDown(this, attacker);
      }
    }

    crash(reason) {
      if (this.destroyed) return;
      const wasAlive = this.alive;
      this.alive = false;
      this.destroyed = true;
      this.falling = false;
      this.input.fire = false;
      this.root.setEnabled(false);
      this.model.disc.setEnabled(false);
      this.game.effects.updateDamageSmoke(this, null);
      const gy = BW.groundHeight(this.pos.x, this.pos.z);
      this.game.effects.explosion(new V3(this.pos.x, Math.max(this.pos.y, gy + 1), this.pos.z), reason === 'water');
      this.game.onCrash(this, reason, wasAlive);
    }

    // The pilot turns his head toward the nearest opponent (or his target).
    updatePilotHead(dt) {
      const head = this.model.pilotHead;
      if (!head || !this.alive) return;
      let target = this.ai && this.ai.target && this.ai.target.alive ? this.ai.target : null;
      if (!target) {
        let best = 1500 * 1500;
        for (const o of this.game.planes) {
          if (o.faction === this.faction || !o.alive) continue;
          const d = V3.DistanceSquared(o.pos, this.pos);
          if (d < best) { best = d; target = o; }
        }
      }
      let yaw = 0, pitch = 0;
      if (target) {
        Q.InverseToRef(this.q, tmpQ);
        target.pos.subtractToRef(this.pos, tmpA).applyRotationQuaternionInPlace(tmpQ);
        yaw = BW.clamp(Math.atan2(tmpA.x, tmpA.z), -1.9, 1.9);
        pitch = BW.clamp(Math.atan2(tmpA.y, Math.hypot(tmpA.x, tmpA.z)), -0.5, 0.7);
      }
      const k = Math.min(1, dt * 3);
      head.rotation.y += (yaw - head.rotation.y) * k;
      head.rotation.x += (-pitch - head.rotation.x) * k;
      if (this.model.scarf) { const w = Math.min(1, this.V / 30); this.model.scarf.rotation.x = 0.15 + 1.1 * w + Math.sin(this.game.time * 13 + this.seed) * 0.12 * w; }
    }

    syncMesh(dt) {
      this.updatePilotHead(dt);
      const sf = this.model.surfaces, c = this.ctrl;
      if (sf) {
        sf.elev.rotation.x = c.pitch * 0.35;
        sf.rud.rotation.y = -c.yaw * 0.4;
        sf.ailR.rotation.x = c.roll * 0.3;
        sf.ailL.rotation.x = -c.roll * 0.3;
      }
      this.root.position.copyFrom(this.pos);
      this.root.rotationQuaternion.copyFrom(this.q);
      const rpm = this.alive ? 6 + this.throttle * this.enginePower * 55 : 3 + this.V * 0.1; // windmilling
      this.propAngle += rpm * dt;
      this.model.prop.rotation.z = this.propAngle;
      const fast = rpm > 20;
      this.model.blade.isVisible = !fast;
      this.model.disc.isVisible = fast;
    }

    dispose() {
      this.game.effects.updateDamageSmoke(this, null);
      this.root.dispose(false, false);
    }
  }
  BW.Plane = Plane;
})(window.BW);
