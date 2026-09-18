import * as THREE from 'three';
import { rand, pick } from '../core/util.js';

// Pooled low-poly particles + lightning bolts + full-screen flash.
export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.gfx.scene;
    this.parts = [];
    this.pool = [];
    this.bolts = [];
    this.geos = {
      cube: new THREE.BoxGeometry(1, 1, 1),
      tetra: new THREE.TetrahedronGeometry(0.7, 0),
      rock: new THREE.DodecahedronGeometry(0.6, 0),
    };
    this.mats = new Map();
    this.flashEl = document.getElementById('flash');
  }

  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.mats.get(color);
  }

  spawn(o) {
    let m = this.pool.pop();
    if (!m) {
      m = new THREE.Mesh(this.geos.cube, this.mat(0xffffff));
      this.scene.add(m);
    }
    m.geometry = this.geos[o.shape || 'cube'];
    m.material = o.lit ? o.lit : this.mat(o.color);
    m.visible = true;
    m.position.set(o.x, o.y, o.z);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    m.castShadow = !!o.castShadow;
    this.parts.push({
      m, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life, max: o.life, size: o.size, g: o.gravity ?? -12,
      spin: o.spin ?? 8, onGround: o.onGround, delay: o.delay || 0,
    });
    m.scale.setScalar(o.delay ? 0.0001 : o.size);
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      p.vy += p.g * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      p.m.rotation.x += p.spin * dt;
      p.m.rotation.y += p.spin * dt;
      let dead = p.life <= 0;
      if (p.m.position.y < 0 && p.vy < 0) {
        if (p.onGround) { p.onGround(p.m.position); dead = true; }
        else { p.m.position.y = 0; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      }
      p.m.scale.setScalar(p.size * Math.sqrt(Math.max(0, p.life / p.max)));
      if (dead) {
        p.m.visible = false;
        this.pool.push(p.m);
        this.parts.splice(i, 1);
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.rejag -= dt;
      if (b.rejag <= 0) { this.jagBolt(b); b.rejag = 0.05; }
      b.group.visible = Math.random() > 0.15;
      if (b.life <= 0) {
        b.group.removeFromParent();
        this.bolts.splice(i, 1);
      }
    }
  }

  sparks(x, y, z, color = 0xfff0a0, n = 10) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x, y, z, color: i % 3 === 0 ? 0xffffff : color, shape: 'tetra',
        vx: rand(-4, 4), vy: rand(1, 5), vz: rand(-2, 2), life: rand(0.2, 0.4), size: rand(0.06, 0.13), gravity: -18,
      });
    }
  }

  dust(x, z, n = 8) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + rand(-0.3, 0.3), y: 0.1, z: z + rand(-0.2, 0.2), color: pick([0xb09a78, 0x9c8765, 0xc4b08c]),
        vx: rand(-2, 2), vy: rand(0.5, 2), vz: rand(-0.6, 0.6), life: rand(0.35, 0.6), size: rand(0.1, 0.2), gravity: -3, spin: 2,
      });
    }
  }

  flash(color = '#ffffff', duration = 0.25) {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = '0.75';
    void el.offsetWidth;
    el.style.transition = `opacity ${duration}s ease-out`;
    el.style.opacity = '0';
  }

  // --- magic spells
  magic(type, level, caster, targets) {
    const g = this.game, hw = g.gfx.halfWidth(), cx = g.camX;
    const zMin = g.level.zMin, zMax = g.level.zMax;

    if (type === 'fire') {
      this.flash('#ff7a1a', 0.6);
      const n = 20 + level * 18;
      for (let i = 0; i < n; i++) {
        this.spawn({
          x: cx + rand(-hw, hw), y: rand(0, 0.5), z: rand(zMin, zMax), color: pick([0xff3300, 0xff8800, 0xffcc33]),
          vx: rand(-0.5, 0.5), vy: rand(3, 6 + level), vz: 0, life: rand(0.6, 1.2), size: rand(0.2, 0.45), gravity: 1, delay: rand(0, 0.5),
          shape: 'tetra',
        });
      }
      for (const t of targets) {
        for (let i = 0; i < 10 + level * 4; i++) {
          this.spawn({
            x: t.x + rand(-0.4, 0.4), y: rand(0, 0.4), z: t.z, color: pick([0xff2200, 0xff9900, 0xffee55]),
            vy: rand(4, 9), life: rand(0.5, 1.0), size: rand(0.25, 0.5), gravity: 0, delay: rand(0.25, 0.55), shape: 'tetra',
          });
        }
      }
      g.gfx.shake(0.15, 0.8);
    } else if (type === 'lightning') {
      this.flash('#e8f0ff', 0.4);
      g.audio.play('thunder');
      const strikes = targets.map((t) => ({ x: t.x, z: t.z }));
      for (let i = 0; i < level * 2; i++) strikes.push({ x: cx + rand(-hw, hw), z: rand(zMin, zMax) });
      strikes.forEach((s, i) => {
        g.schedule(0.1 + i * 0.05, () => {
          this.addBolt(s.x, s.z, 0.45 + level * 0.05);
          this.sparks(s.x, 0.3, s.z, 0x9fd0ff, 12);
          this.flash('#cfe6ff', 0.15);
        });
      });
      g.gfx.shake(0.25, 0.6);
    } else {
      // earth: boulders rain down
      this.flash('#c49a5a', 0.4);
      const drops = targets.map((t) => ({ x: t.x, z: t.z, big: true }));
      for (let i = 0; i < 4 + level * 4; i++) drops.push({ x: cx + rand(-hw, hw), z: rand(zMin, zMax) });
      for (const d of drops) {
        const size = d.big ? 0.5 + level * 0.08 : rand(0.25, 0.45);
        this.spawn({
          x: d.x + rand(-0.3, 0.3), y: rand(9, 12), z: d.z, lit: this.rockMat(), shape: 'rock', castShadow: true,
          vx: rand(-0.5, 0.5), vy: -6, life: 3, size, gravity: -30, spin: 3, delay: rand(0, 0.35),
          onGround: (pos) => { this.dust(pos.x, pos.z, 8); g.gfx.shake(0.3, 0.15); g.audio.play('thud'); },
        });
      }
    }
  }

  rockMat() {
    if (!this._rockMat) this._rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7458, flatShading: true, roughness: 1 });
    return this._rockMat;
  }

  // Bolt = chain of thin glowing boxes (WebGL lines are only 1px wide).
  addBolt(x, z, life) {
    const group = new THREE.Group();
    const core = this.mat(0xeaf4ff), glow = this.mat(0x7fb8ff);
    for (let i = 0; i < 12; i++) {
      group.add(new THREE.Mesh(this.geos.cube, core));
      group.add(new THREE.Mesh(this.geos.cube, glow));
    }
    this.scene.add(group);
    const b = { group, x, z, life, rejag: 0 };
    this.jagBolt(b);
    this.bolts.push(b);
  }

  jagBolt(b) {
    const segs = b.group.children.length / 2;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const j = i === 0 || i === segs ? 0 : 0.5;
      pts.push(new THREE.Vector3(b.x + rand(-j, j), 12 * (1 - i / segs), b.z + rand(-j, j) * 0.4));
    }
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      dir.subVectors(pts[i + 1], pts[i]);
      const len = dir.length();
      dir.normalize();
      for (const [k, w] of [[0, 0.07], [1, 0.2]]) {
        const m = b.group.children[i * 2 + k];
        m.position.copy(pts[i]).addScaledVector(dir, len / 2);
        m.quaternion.setFromUnitVectors(up, dir);
        m.scale.set(w, len, w);
      }
    }
  }

  clear() {
    for (const p of this.parts) { p.m.visible = false; this.pool.push(p.m); }
    this.parts.length = 0;
    for (const b of this.bolts) b.group.removeFromParent();
    this.bolts.length = 0;
  }
}
