'use strict';
// AI pilots: takeoff, target selection, pursuit with lead, evasion, ground avoidance.
(function (BW) {
  const V3 = BABYLON.Vector3;
  const tA = new V3(), tB = new V3(), tC = new V3(), UP = new V3(0, 1, 0);

  class AIPilot {
    constructor(plane, game, cfg) {
      this.p = plane;
      this.g = game;
      this.cfg = cfg;
      plane.ai = this;
      plane.gunSpread = cfg.spread;
      this.state = plane.onGround ? 'parked' : 'engage';
      this.target = null;
      this.retargetT = Math.random() * 2;
      this.thinkT = 0;
      this.desired = plane.f.clone();
      this.evadeT = 0;
      this.evadeDir = new V3();
      this.burstT = 0;
      this.pauseT = 0;
      this.wobble = new V3();
      this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    }

    // Steer toward a world-space direction using the same controls as the player.
    steer(d, maxPull) {
      const p = this.p;
      const lx = V3.Dot(d, p.r), ly = V3.Dot(d, p.u), lz = V3.Dot(d, p.f);
      const off = Math.acos(BW.clamp(lz, -1, 1));
      const bank = p.bank;
      // Desired lift direction: toward the target plus enough "up" to hold against gravity.
      const pl = Math.hypot(lx, ly) || 1;
      const turn = Math.min(1, Math.acos(BW.clamp(lz, -1, 1)) * 3);
      const gx = V3.Dot(UP, p.r) * 0.3, gy = V3.Dot(UP, p.u) * 0.3;
      const bankErr = Math.atan2((lx / pl) * turn + gx, (ly / pl) * turn + gy);
      const w = BW.smoothstep(0.03, 0.3, off);
      const rollCoarse = BW.clamp(bankErr * 2.5, -1, 1);
      const rollFine = BW.clamp(lx * 5 - bank * 0.6, -1, 1);
      const pitchCoarse = maxPull * BW.clamp(1.3 - Math.abs(bankErr), 0, 1);
      const pitchFine = BW.clamp(Math.atan2(ly, Math.max(lz, 0.05)) * 6, -1, 1);
      let pitch = BW.lerp(pitchFine, pitchCoarse, w);
      const roll = BW.lerp(rollFine, rollCoarse, w) * this.cfg.skill;
      const yaw = BW.clamp(lx * 4, -1, 1) * (1 - w);
      // Energy management: avoid stalling
      if (p.V < 30) pitch = Math.min(pitch, BW.clamp((p.V - 22) / 8, 0, 1) * maxPull);
      if (Math.abs(p.aoa) > BW.PHYS.stall * 0.85) pitch = Math.min(pitch, 0.1);
      p.input.pitch = BW.clamp(pitch, -1, 1);
      p.input.roll = roll;
      p.input.yaw = yaw;
    }

    levelDir(climb) {
      const p = this.p;
      tA.set(p.f.x, 0, p.f.z);
      if (tA.lengthSquared() < 1e-4) tA.set(p.u.x, 0, p.u.z);
      tA.normalize();
      tA.y = climb;
      return tA.normalize();
    }

    pickTarget() {
      const p = this.p, g = this.g;
      let best = null, bestScore = Infinity;
      for (const o of g.planes) {
        if (o.faction === p.faction || !o.alive || o.onGround) continue;
        let score = V3.Distance(o.pos, p.pos);
        if (o.isPlayer && p.faction === 'enemy') {
          let n = 0;
          for (const e of g.planes) if (e !== p && e.ai && e.alive && e.ai.target === o) n++;
          score *= n < this.cfg.maxOnPlayer ? 0.55 : 3;
        }
        if (o === this.target) score *= 0.7; // hysteresis
        if (score < bestScore) { bestScore = score; best = o; }
      }
      this.target = best;
    }

    update(dt) {
      const p = this.p, g = this.g;
      if (!p.alive) { p.input.fire = false; return; }
      p.input.fire = false;
      p.input.brake = false;

      if (this.state === 'parked') {
        p.throttle = 0.08;
        p.input.brake = true;
        p.input.pitch = p.input.roll = p.input.yaw = 0;
        if (g.alliesGo) { this.state = 'takeoff'; this.startDelay = 0.3 + Math.random() * 1.5; }
        return;
      }
      if (this.state === 'takeoff') {
        this.startDelay -= dt;
        if (this.startDelay > 0) { p.input.brake = true; return; }
        p.throttle = 1;
        if (p.onGround) {
          p.input.yaw = BW.clamp(-Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) * 4, -1, 1);
          p.input.pitch = p.V < 26 ? -0.7 : 0.35;
          p.input.roll = 0;
        } else {
          const climb = BW.clamp((0.16 - p.pitchAtt) * 3, -1, 1);
          p.input.pitch = climb;
          p.input.roll = BW.clamp(-p.bank * 2, -1, 1);
          p.input.yaw = 0;
          if (p.agl > 120) this.state = 'engage';
        }
        return;
      }

      p.throttle = 1;
      this.retargetT -= dt;
      if (this.retargetT <= 0 || !this.target || !this.target.alive || this.target.onGround) {
        this.pickTarget();
        this.retargetT = 3 + Math.random() * 2;
      }

      // Ground and boundary avoidance take priority.
      const gh = Math.max(
        BW.groundHeight(p.pos.x, p.pos.z),
        BW.groundHeight(p.pos.x + p.vel.x * 3, p.pos.z + p.vel.z * 3),
        BW.groundHeight(p.pos.x + p.vel.x * 6, p.pos.z + p.vel.z * 6)
      );
      const predicted = p.pos.y + Math.min(0, p.vel.y) * 4 - gh;
      if (predicted < 110) {
        const urgency = BW.clamp((110 - predicted) / 80, 0.3, 1.2);
        this.steer(this.levelDir(urgency), 1);
        return;
      }
      const r = Math.hypot(p.pos.x, p.pos.z);
      if (r > BW.BATTLE_RADIUS - 500) {
        tA.set(-p.pos.x, 0, -p.pos.z).normalize();
        tA.y = 0.15;
        this.steer(tA.normalize(), 0.8);
        return;
      }

      // Out of energy with the nose high: lower the nose and gain speed first.
      if (p.V < 24 && p.f.y > 0.15) {
        this.steer(this.levelDir(-0.4), 0.3);
        return;
      }

      const t = this.target;
      if (!t) { this.orbit(dt); return; }

      // Evasion when an enemy sits on our tail.
      if (this.evadeT > 0) {
        this.evadeT -= dt;
        this.steer(this.evadeDir, this.cfg.skill);
        return;
      }
      for (const o of g.planes) {
        if (o.faction === p.faction || !o.alive) continue;
        tA.copyFrom(p.pos).subtractInPlace(o.pos);
        const d = tA.length();
        if (d < 380 && d > 20 && V3.Dot(o.f, tA) / d > 0.96 && V3.Dot(p.f, tA) / d > 0.2) {
          if (Math.random() < this.cfg.evade * dt * 1.5) {
            const side = Math.random() < 0.5 ? -1 : 1;
            this.evadeDir.copyFrom(p.f).scaleInPlace(0.3);
            p.r.scaleAndAddToRef(side, this.evadeDir);
            this.evadeDir.y += Math.random() < 0.5 ? -0.35 : 0.45;
            this.evadeDir.normalize();
            this.evadeT = 1.5 + Math.random() * 2;
          }
          break;
        }
      }

      // Pursuit with lead
      tA.copyFrom(t.pos).subtractInPlace(p.pos);
      const dist = tA.length();
      const headOn = V3.Dot(t.f, tA) / -dist > 0.85; // target is flying straight at us
      const tof = dist / BW.PHYS.bulletSpeed;
      tB.copyFrom(t.vel).subtractInPlace(p.vel).scaleInPlace(tof).addInPlace(tA);
      const leadDir = tB.normalize();
      // Steer with a little extra lead so the turn is cut inside the target's circle.
      const steerDir = this.steerDir || (this.steerDir = new V3());
      steerDir.copyFrom(t.vel).scaleInPlace(tof * 0.6).addInPlace(leadDir.scale(dist)).normalize();

      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = this.cfg.reaction * (0.6 + Math.random() * 0.8);
        const n = (1 - this.cfg.skill) * 0.12 + 0.01;
        this.wobble.set((Math.random() - 0.5) * n, (Math.random() - 0.5) * n, (Math.random() - 0.5) * n);
        if (dist > 900) {
          this.desired.copyFrom(t.pos).subtractInPlace(p.pos);
          // Try to get some altitude advantage on the way in
          this.desired.y += (t.pos.y + 80 - p.pos.y) * 0.3;
          this.desired.normalize();
        } else this.desired.copyFrom(V3.Dot(p.f, leadDir) < 0.94 ? steerDir : leadDir);
        this.desired.addInPlace(this.wobble).normalize();
      }
      // Close to a firing solution the aim is tracked every frame.
      if (dist < 900 && V3.Dot(p.f, leadDir) > 0.985) this.desired.copyFrom(leadDir).addInPlace(this.wobble).normalize();
      tC.copyFrom(p.vel).subtractInPlace(t.vel);
      if (dist < 30 && V3.Dot(tA, tC) > 0) {
        // Too close: pull away to avoid a collision
        this.steer(this.levelDir(0.8), 1);
      } else {
        this.steer(this.desired, this.cfg.skill);
      }

      // Trigger discipline: short bursts when the solution is good.
      const aimErr = Math.acos(BW.clamp(V3.Dot(p.f, leadDir), -1, 1));
      // Accept a miss distance of a few metres, so close targets get a wider cone.
      let cone = Math.max(this.cfg.aimCone, (2 + 3 * this.cfg.skill) / Math.max(dist, 1));
      let range = this.cfg.fireRange;
      // Head-on passes: huge closing speed, so only a narrow cone at short range.
      if (headOn) { cone = this.cfg.aimCone * 0.5; range *= 0.5; }
      if (this.pauseT > 0) this.pauseT -= dt;
      else if (dist < range && aimErr < cone) {
        p.input.fire = true;
        this.burstT += dt;
        if (this.burstT > 0.6 + Math.random() * 1.2) { this.burstT = 0; this.pauseT = 0.3 + Math.random() * 0.6; }
      } else this.burstT = 0;
    }

    orbit() {
      const p = this.p;
      const alt = this.p.faction === 'ally' ? 450 : 650;
      const a = Math.atan2(p.pos.x, p.pos.z) + 0.35 * this.orbitDir;
      tA.set(Math.sin(a) * 800, alt, Math.cos(a) * 800 - 100).subtractInPlace(p.pos).normalize();
      this.steer(tA, 0.6);
    }
  }
  BW.AIPilot = AIPilot;
})(window.BW);
