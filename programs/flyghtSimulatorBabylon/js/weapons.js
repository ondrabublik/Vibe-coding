'use strict';
// Machine-gun bullets with tracers, hit detection, and visual effects.
(function (BW) {
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion, MB = BABYLON.MeshBuilder, C3 = BABYLON.Color3;
  const MAX_BULLETS = 1200;
  const P = () => BW.PHYS;

  // Segment a->b against an AABB, returns entry parameter t in [0,1] or -1.
  function segAABB(a, b, min, max) {
    let t0 = 0, t1 = 1;
    for (const k of ['x', 'y', 'z']) {
      const d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) {
        if (a[k] < min[k] || a[k] > max[k]) return -1;
      } else {
        let ta = (min[k] - a[k]) / d, tb = (max[k] - a[k]) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return -1;
      }
    }
    return t0;
  }

  const tA = new V3(), tB = new V3(), tC = new V3(), invQ = new Q(), tM = new BABYLON.Matrix(), tQ = new Q(), tS = new V3(1, 1, 7);

  class Weapons {
    constructor(game) {
      this.game = game;
      this.scene = game.scene;
      this.bullets = [];
      this.pool = [];
      const mk = (name, hex) => {
        const m = MB.CreateBox(name, { width: 0.1, height: 0.1, depth: 1 }, this.scene);
        m.material = BW.getMat(this.scene, hex, { emissive: true });
        m.buf = new Float32Array(16 * MAX_BULLETS);
        m.thinInstanceSetBuffer('matrix', m.buf, 16, false);
        m.thinInstanceCount = 0;
        m.alwaysSelectAsActiveMesh = true;
        m.isPickable = false;
        if (game.glow) game.glow.addIncludedOnlyMesh(m);
        return m;
      };
      this.tracers = { ally: mk('tracerA', '#ffe08a'), enemy: mk('tracerE', '#ff7a3a') };
    }

    fire(plane, side) {
      plane.localToWorld(BW.MUZZLES[side], tB);
      this.fireFrom(plane, tB, plane.f, plane.gunSpread || 0.004, plane.vel);
    }

    // Generic shot (also used by bomber gunners and anti-aircraft machine guns).
    // owner needs pos, faction and hit/kill counters; baseVel is the gun's own velocity (or null).
    fireFrom(owner, pos, dir, spread, baseVel) {
      if (this.bullets.length >= MAX_BULLETS) return;
      const b = this.pool.pop() || { pos: new V3(), prev: new V3(), vel: new V3() };
      b.pos.copyFrom(pos);
      b.prev.copyFrom(b.pos);
      // Random cone around dir: two axes perpendicular to it.
      const ax = Math.abs(dir.y) < 0.9 ? V3.UpReadOnly : V3.RightReadOnly;
      V3.CrossToRef(dir, ax, tC).normalize();
      tA.copyFrom(dir);
      tC.scaleAndAddToRef((Math.random() - 0.5) * 2 * spread, tA);
      V3.CrossToRef(dir, tC, tC);
      tC.scaleAndAddToRef((Math.random() - 0.5) * 2 * spread, tA);
      tA.normalize();
      if (baseVel) b.vel.copyFrom(baseVel); else b.vel.setAll(0);
      tA.scaleAndAddToRef(P().bulletSpeed, b.vel);
      b.life = P().bulletLife;
      b.owner = owner;
      b.faction = owner.faction;
      this.bullets.push(b);
      this.game.audio.gun(owner);
    }

    update(dt) {
      const planes = this.game.planes;
      const list = this.bullets;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.prev.copyFrom(b.pos);
        b.vel.scaleToRef(dt, tA);
        b.pos.addInPlace(tA);
        b.life -= dt;
        let dead = b.life <= 0;
        if (!dead) {
          for (const p of planes) {
            if (p.faction === b.faction || !p.alive) continue;
            // Broad phase: segment vs bounding sphere
            b.pos.subtractToRef(b.prev, tA);
            p.pos.subtractToRef(b.prev, tB);
            const len2 = tA.lengthSquared();
            const t = BW.clamp(V3.Dot(tB, tA) / (len2 || 1), 0, 1);
            tA.scaleToRef(t, tC).subtractInPlace(tB);
            const hr = p.hitR || 6;
            if (tC.lengthSquared() > hr * hr) continue;
            // Narrow phase in plane local space
            Q.InverseToRef(p.q, invQ);
            b.prev.subtractToRef(p.pos, tA).applyRotationQuaternionInPlace(invQ);
            b.pos.subtractToRef(p.pos, tB).applyRotationQuaternionInPlace(invQ);
            let hitT = -1;
            for (const hb of p.hitboxes || BW.HITBOXES) {
              const ht = segAABB(tA, tB, hb.min, hb.max);
              if (ht >= 0 && (hitT < 0 || ht < hitT)) hitT = ht;
            }
            if (hitT >= 0) {
              const hitPoint = V3.Lerp(b.prev, b.pos, hitT);
              this.game.onBulletHit(p, b.owner, hitPoint);
              dead = true;
              break;
            }
          }
        }
        // Ground targets (only allied bullets can hit them).
        if (!dead && b.faction === 'ally' && this.game.targets.length) dead = this.hitTargets(b);
        if (!dead) {
          const gy = BW.groundHeight(b.pos.x, b.pos.z);
          if (b.pos.y < gy) {
            dead = true;
            if (b.owner.isPlayer || Math.random() < 0.25)
              this.game.effects.dust(new V3(b.pos.x, gy + 0.3, b.pos.z), BW.isWater(b.pos.x, b.pos.z));
          }
        }
        if (dead) {
          list[i] = list[list.length - 1];
          list.pop();
          this.pool.push(b);
        }
      }
      this.render();
    }

    hitTargets(b) {
      for (const t of this.game.targets) {
        if (!t.alive) continue;
        const c = t.center;
        // Broad phase: both ends far away in the same direction.
        if ((b.pos.x < c.x - t.radius && b.prev.x < c.x - t.radius) || (b.pos.x > c.x + t.radius && b.prev.x > c.x + t.radius) ||
            (b.pos.z < c.z - t.radius && b.prev.z < c.z - t.radius) || (b.pos.z > c.z + t.radius && b.prev.z > c.z + t.radius)) continue;
        const ht = segAABB(b.prev, b.pos, t.min, t.max);
        if (ht >= 0) {
          this.game.onTargetHit(t, b.owner, V3.Lerp(b.prev, b.pos, ht));
          return true;
        }
      }
      return false;
    }

    render() {
      const counts = { ally: 0, enemy: 0 };
      for (const b of this.bullets) {
        if (P().bulletLife - b.life < 0.02) continue; // don't draw inside the muzzle
        const m = this.tracers[b.faction];
        const n = counts[b.faction]++;
        tA.copyFrom(b.vel).normalize();
        const yaw = Math.atan2(tA.x, tA.z), pitch = -Math.asin(BW.clamp(tA.y, -1, 1));
        Q.RotationYawPitchRollToRef(yaw, pitch, 0, tQ);
        b.pos.subtractToRef(tA.scaleInPlace(3.5), tB);
        BABYLON.Matrix.ComposeToRef(tS, tQ, tB, tM);
        tM.copyToArray(m.buf, n * 16);
      }
      for (const k of ['ally', 'enemy']) {
        const m = this.tracers[k];
        m.thinInstanceCount = counts[k];
        m.thinInstanceBufferUpdated('matrix');
      }
    }

    clear() {
      this.bullets.forEach((b) => this.pool.push(b));
      this.bullets.length = 0;
    }
  }
  BW.Weapons = Weapons;

  // ------------------------------------------------------------ effects
  class Effects {
    constructor(game) {
      this.game = game;
      const scene = (this.scene = game.scene);
      this.puffTex = new BABYLON.DynamicTexture('puff', { width: 64, height: 64 }, scene, true);
      const ctx = this.puffTex.getContext();
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      this.puffTex.update();
      this.puffTex.hasAlpha = true;

      // Pooled billboards for sparks and dust
      const mkPool = (n, hex, emissive, alpha) => {
        const mat = new BABYLON.StandardMaterial('fx' + hex, scene);
        mat.diffuseTexture = this.puffTex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.opacityTexture = this.puffTex;
        if (emissive) { mat.emissiveColor = BW.hex(hex); mat.disableLighting = true; }
        else { mat.diffuseColor = BW.hex(hex); mat.emissiveColor = BW.hex(hex).scale(0.5); }
        mat.disableDepthWrite = true;
        mat.alpha = alpha;
        const base = MB.CreatePlane('fxbase', { size: 1 }, scene);
        base.material = mat;
        base.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        base.isPickable = false;
        base.setEnabled(false);
        const items = [];
        for (let i = 0; i < n; i++) {
          const inst = base.clone('fx');
          inst.setEnabled(false);
          items.push({ mesh: inst, life: 0, max: 1, size: 1, grow: 0, rise: 0 });
        }
        return { items, next: 0 };
      };
      this.sparks = mkPool(40, '#ffcf6a', true, 1);
      this.dusts = mkPool(50, '#9a8a6a', false, 0.8);
      this.splashes = mkPool(30, '#e8eef2', false, 0.85);
      this.smokers = new Map();
    }

    spawnFrom(pool, pos, size, life, grow, rise) {
      const it = pool.items[pool.next];
      pool.next = (pool.next + 1) % pool.items.length;
      it.mesh.position.copyFrom(pos);
      it.mesh.setEnabled(true);
      it.life = it.max = life;
      it.size = size; it.grow = grow; it.rise = rise;
      it.mesh.scaling.setAll(size);
    }
    spark(pos) { this.spawnFrom(this.sparks, pos, 1.6, 0.12, 6, 0); }
    dust(pos, water) {
      if (water) this.spawnFrom(this.splashes, pos, 2, 0.9, 5, 4);
      else this.spawnFrom(this.dusts, pos, 1.6, 0.8, 4, 1.5);
    }

    update(dt) {
      for (const pool of [this.sparks, this.dusts, this.splashes]) {
        for (const it of pool.items) {
          if (it.life <= 0) continue;
          it.life -= dt;
          if (it.life <= 0) { it.mesh.setEnabled(false); continue; }
          const k = it.life / it.max;
          it.mesh.scaling.setAll(it.size + (1 - k) * it.grow);
          it.mesh.position.y += it.rise * dt;
          it.mesh.visibility = k;
        }
      }
    }

    makeSystem(cap, emitter) {
      const ps = new BABYLON.ParticleSystem('ps', cap, this.scene);
      ps.particleTexture = this.puffTex;
      ps.emitter = emitter;
      // dispose() (also the automatic one after disposeOnStop) would dispose the texture too by default,
      // but it is shared by all effects: keep it alive.
      const dispose = ps.dispose.bind(ps);
      ps.dispose = () => dispose(false);
      return ps;
    }

    // frac: remaining hp fraction; -1 = shot down (burning); null = stop.
    updateDamageSmoke(plane, frac) {
      let s = this.smokers.get(plane);
      if (frac === null) {
        if (s) { s.forEach((ps) => { ps.stop(); ps.disposeOnStop = true; }); this.smokers.delete(plane); }
        return;
      }
      if (frac > 0.6) return;
      if (!s) {
        const smoke = this.makeSystem(400, plane.model.body);
        smoke.minEmitBox = new V3(-0.2, 0.2, 1.2);
        smoke.maxEmitBox = new V3(0.2, 0.4, 1.6);
        smoke.color1 = new BABYLON.Color4(0.35, 0.35, 0.35, 0.5);
        smoke.color2 = new BABYLON.Color4(0.2, 0.2, 0.2, 0.4);
        smoke.colorDead = new BABYLON.Color4(0.5, 0.5, 0.5, 0);
        smoke.minSize = 1; smoke.maxSize = 2.5;
        smoke.minLifeTime = 1.5; smoke.maxLifeTime = 3;
        smoke.minEmitPower = 0.2; smoke.maxEmitPower = 1;
        smoke.direction1 = new V3(-0.5, 0.5, -1); smoke.direction2 = new V3(0.5, 1, -1);
        smoke.gravity = new V3(0, 1.5, 0);
        smoke.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        smoke.addSizeGradient(0, 1.2); smoke.addSizeGradient(1, 6);
        smoke.emitRate = 15;
        smoke.start();
        s = [smoke];
        this.smokers.set(plane, s);
      }
      const smoke = s[0];
      if (frac < 0 || frac < 0.25) {
        smoke.emitRate = 80;
        smoke.color1 = new BABYLON.Color4(0.12, 0.12, 0.12, 0.7);
        smoke.color2 = new BABYLON.Color4(0.05, 0.05, 0.05, 0.6);
      } else {
        smoke.emitRate = 15 + (0.6 - frac) * 90;
      }
      if (frac < 0 && s.length === 1) {
        const fire = this.makeSystem(300, plane.model.body);
        fire.minEmitBox = new V3(-0.4, 0, 0.8);
        fire.maxEmitBox = new V3(0.4, 0.5, 1.8);
        fire.color1 = new BABYLON.Color4(1, 0.6, 0.15, 1);
        fire.color2 = new BABYLON.Color4(1, 0.3, 0.05, 1);
        fire.colorDead = new BABYLON.Color4(0.3, 0.1, 0, 0);
        fire.minSize = 0.8; fire.maxSize = 2;
        fire.minLifeTime = 0.2; fire.maxLifeTime = 0.5;
        fire.emitRate = 150;
        fire.direction1 = new V3(-0.3, 0.3, -1); fire.direction2 = new V3(0.3, 0.8, -1);
        fire.minEmitPower = 0.5; fire.maxEmitPower = 2;
        fire.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        fire.start();
        s.push(fire);
      }
    }

    explosion(pos, water) {
      const fire = this.makeSystem(250, pos.clone());
      fire.minEmitBox = new V3(-2, 0, -2); fire.maxEmitBox = new V3(2, 2, 2);
      fire.color1 = water ? new BABYLON.Color4(0.9, 0.95, 1, 1) : new BABYLON.Color4(1, 0.7, 0.2, 1);
      fire.color2 = water ? new BABYLON.Color4(0.7, 0.8, 0.9, 1) : new BABYLON.Color4(1, 0.35, 0.05, 1);
      fire.colorDead = new BABYLON.Color4(0.2, 0.1, 0.05, 0);
      fire.minSize = 3; fire.maxSize = 9;
      fire.minLifeTime = 0.4; fire.maxLifeTime = 1.2;
      fire.emitRate = 900; fire.targetStopDuration = 0.25;
      fire.direction1 = new V3(-1, 1.5, -1); fire.direction2 = new V3(1, 3, 1);
      fire.minEmitPower = 4; fire.maxEmitPower = 14;
      fire.gravity = new V3(0, water ? -12 : 2, 0);
      fire.blendMode = water ? BABYLON.ParticleSystem.BLENDMODE_STANDARD : BABYLON.ParticleSystem.BLENDMODE_ADD;
      fire.disposeOnStop = true;
      fire.start();
      if (water) return;
      const smoke = this.makeSystem(300, pos.clone());
      smoke.minEmitBox = new V3(-2, 0, -2); smoke.maxEmitBox = new V3(2, 2, 2);
      smoke.color1 = new BABYLON.Color4(0.15, 0.13, 0.12, 0.8);
      smoke.color2 = new BABYLON.Color4(0.3, 0.28, 0.26, 0.6);
      smoke.colorDead = new BABYLON.Color4(0.4, 0.4, 0.4, 0);
      smoke.minSize = 5; smoke.maxSize = 10;
      smoke.minLifeTime = 4; smoke.maxLifeTime = 8;
      smoke.emitRate = 25; smoke.targetStopDuration = 20;
      smoke.direction1 = new V3(-0.3, 1, -0.3); smoke.direction2 = new V3(0.3, 1, 0.3);
      smoke.minEmitPower = 2; smoke.maxEmitPower = 5;
      smoke.gravity = new V3(1.5, 2, 0);
      smoke.addSizeGradient(0, 5); smoke.addSizeGradient(1, 22);
      smoke.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
      smoke.disposeOnStop = true;
      smoke.start();
    }
  }
  BW.Effects = Effects;
})(window.BW);
