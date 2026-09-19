import * as THREE from 'three';
import { softTexture, rand } from './util.js';

// GPU point sprites sized in metres. Two layers: additive (fire, sparks,
// flares) and alpha-blended (smoke, dust, contrails).

const VS = /* glsl */ `
  attribute float size;
  attribute vec4 pcolor;
  uniform float scale;
  varying vec4 vColor;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vColor = pcolor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(size * scale / max(-mvPosition.z, 0.1), 1024.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;

const FS = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vColor;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float a = texture2D(map, gl_PointCoord).a * vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <fog_fragment>
  }`;

const F = 20; // floats per particle in the state buffer
// layout: 0-2 pos, 3-5 vel, 6 life, 7 maxLife, 8 s0, 9 s1, 10-12 c0, 13-15 c1, 16 a0, 17 a1, 18 drag, 19 grav

class ParticleLayer {
  constructor(scene, max, blending, tex) {
    this.max = max;
    this.n = 0;
    this.s = new Float32Array(max * F);
    const geo = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeA = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.colA = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posA);
    geo.setAttribute('size', this.sizeA);
    geo.setAttribute('pcolor', this.colA);
    geo.setDrawRange(0, 0);
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { scale: { value: 800 } }]);
    uniforms.map = { value: tex };
    this.material = new THREE.ShaderMaterial({
      uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending, fog: true,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 2 : 1;
    this.geo = geo;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, a1, drag = 0, grav = 0) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.n++;
    const s = this.s, o = i * F;
    s[o] = x; s[o + 1] = y; s[o + 2] = z;
    s[o + 3] = vx; s[o + 4] = vy; s[o + 5] = vz;
    s[o + 6] = life; s[o + 7] = life;
    s[o + 8] = s0; s[o + 9] = s1;
    s[o + 10] = c0[0]; s[o + 11] = c0[1]; s[o + 12] = c0[2];
    s[o + 13] = c1[0]; s[o + 14] = c1[1]; s[o + 15] = c1[2];
    s[o + 16] = a0; s[o + 17] = a1; s[o + 18] = drag; s[o + 19] = grav;
  }

  update(dt) {
    const s = this.s, P = this.posA.array, S = this.sizeA.array, C = this.colA.array;
    for (let i = 0; i < this.n; i++) {
      let o = i * F;
      s[o + 6] -= dt;
      if (s[o + 6] <= 0) {
        this.n--;
        if (i !== this.n) s.copyWithin(o, this.n * F, this.n * F + F);
        i--;
        continue;
      }
      const damp = Math.max(0, 1 - s[o + 18] * dt);
      s[o + 3] *= damp; s[o + 4] = s[o + 4] * damp + s[o + 19] * dt; s[o + 5] *= damp;
      s[o] += s[o + 3] * dt; s[o + 1] += s[o + 4] * dt; s[o + 2] += s[o + 5] * dt;
      const t = 1 - s[o + 6] / s[o + 7];
      P[i * 3] = s[o]; P[i * 3 + 1] = s[o + 1]; P[i * 3 + 2] = s[o + 2];
      S[i] = s[o + 8] + (s[o + 9] - s[o + 8]) * t;
      C[i * 4] = s[o + 10] + (s[o + 13] - s[o + 10]) * t;
      C[i * 4 + 1] = s[o + 11] + (s[o + 14] - s[o + 11]) * t;
      C[i * 4 + 2] = s[o + 12] + (s[o + 15] - s[o + 12]) * t;
      C[i * 4 + 3] = s[o + 16] + (s[o + 17] - s[o + 16]) * t;
    }
    this.geo.setDrawRange(0, this.n);
    this.posA.needsUpdate = this.sizeA.needsUpdate = this.colA.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
}

const FIRE0 = [3.0, 2.2, 1.0], FIRE1 = [0.9, 0.18, 0.02];
const SPARK = [3.0, 2.4, 1.2], SPARK1 = [1.2, 0.4, 0.05];
const SMOKE_DARK = [0.08, 0.08, 0.08], SMOKE_GREY = [0.35, 0.35, 0.36], SMOKE_WHITE = [0.85, 0.86, 0.88];
const DUST = [0.42, 0.36, 0.26];

export class FX {
  constructor(scene) {
    const tex = softTexture(64);
    this.scene = scene;
    this.add = new ParticleLayer(scene, 7000, THREE.AdditiveBlending, tex);
    this.smoke = new ParticleLayer(scene, 9000, THREE.NormalBlending, tex);
    this.emitters = []; // burning wrecks
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(1, 0.2, 0.8);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 });
  }

  setScale(v) {
    this.add.material.uniforms.scale.value = v;
    this.smoke.material.uniforms.scale.value = v;
  }

  fire(p, v, life, s0, s1) {
    this.add.spawn(p.x, p.y, p.z, v.x, v.y, v.z, life, s0, s1, FIRE0, FIRE1, 0.9, 0, 1.5, 3);
  }

  smokePuff(p, vx, vy, vz, life, s0, s1, color = SMOKE_GREY, alpha = 0.55, grav = 1.5) {
    this.smoke.spawn(p.x, p.y, p.z, vx, vy, vz, life, s0, s1, color, color, alpha, 0, 0.6, grav);
  }

  explosion(p, scale = 1, vel = null) {
    const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
    const n = Math.round(40 * scale);
    for (let i = 0; i < n; i++) {
      const sp = rand(5, 35) * scale;
      const d = randDir();
      this.add.spawn(p.x, p.y, p.z, vx + d.x * sp, vy + d.y * sp, vz + d.z * sp, rand(0.5, 1.3), rand(6, 12) * scale,
        rand(16, 30) * scale, FIRE0, FIRE1, 1, 0, 2.2, 2);
    }
    for (let i = 0; i < n; i++) {
      const sp = rand(3, 20) * scale;
      const d = randDir();
      const c = Math.random() < 0.5 ? SMOKE_DARK : SMOKE_GREY;
      this.smoke.spawn(p.x, p.y, p.z, vx + d.x * sp, vy + d.y * sp, vz + d.z * sp, rand(3, 6), rand(8, 14) * scale,
        rand(30, 55) * scale, c, c, 0.7, 0, 0.9, 1.5);
    }
    for (let i = 0; i < 30 * scale; i++) {
      const sp = rand(40, 120);
      const d = randDir();
      this.add.spawn(p.x, p.y, p.z, vx + d.x * sp, vy + d.y * sp, vz + d.z * sp, rand(0.5, 1.4), 1.2, 0.4, SPARK, SPARK1, 1, 0.2, 1.0, -9.8);
    }
    const count = Math.min(Math.round(8 * scale), 12);
    for (let i = 0; i < count && this.debris.length < 50; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat);
      m.position.copy(p);
      m.scale.setScalar(rand(0.4, 1.4));
      const d = randDir();
      const sp = rand(15, 60);
      this.scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3(vx + d.x * sp, vy + Math.abs(d.y) * sp, vz + d.z * sp), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), t: rand(2.5, 5) });
    }
  }

  hitSparks(p) {
    for (let i = 0; i < 6; i++) {
      const d = randDir(), sp = rand(15, 50);
      this.add.spawn(p.x, p.y, p.z, d.x * sp, d.y * sp, d.z * sp, rand(0.15, 0.4), 1.5, 0.5, SPARK, SPARK1, 1, 0, 2, -9.8);
    }
    this.smokePuff(p, 0, 1, 0, 1.2, 2, 6, SMOKE_GREY, 0.4);
  }

  groundImpact(p, water) {
    if (water) {
      for (let i = 0; i < 3; i++) this.smoke.spawn(p.x, 0.5, p.z, rand(-2, 2), rand(8, 16), rand(-2, 2), 1.0, 1.5, 4, SMOKE_WHITE, SMOKE_WHITE, 0.7, 0, 0.5, -12);
    } else {
      this.smoke.spawn(p.x, p.y + 0.5, p.z, rand(-1, 1), rand(2, 5), rand(-1, 1), 1.4, 1.5, 6, DUST, DUST, 0.6, 0, 1, 0);
    }
  }

  tyreSmoke(p) {
    for (let i = 0; i < 4; i++)
      this.smoke.spawn(p.x + rand(-0.5, 0.5), p.y + 0.3, p.z + rand(-0.5, 0.5), rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), 1.5, 1.2, 5, SMOKE_WHITE, SMOKE_WHITE, 0.6, 0, 1, 0.3);
  }

  contrail(p) {
    this.smoke.spawn(p.x, p.y, p.z, 0, 0, 0, 0.7, 0.4, 1.4, SMOKE_WHITE, SMOKE_WHITE, 0.35, 0, 0, 0);
  }

  missileTrail(p) {
    this.smoke.spawn(p.x, p.y, p.z, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), 2.8, 1.2, 7, SMOKE_WHITE, SMOKE_GREY, 0.5, 0, 0.3, 0.6);
  }

  missileFlame(p) {
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.06, 1.6, 0.8, SPARK, FIRE1, 1, 0.3, 0, 0);
  }

  damageSmoke(p, heavy) {
    const c = heavy ? SMOKE_DARK : SMOKE_GREY;
    this.smoke.spawn(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), heavy ? 3 : 2, 2, heavy ? 12 : 8, c, c, 0.6, 0, 0.4, 1);
    if (heavy) this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.25, 3, 1.5, FIRE0, FIRE1, 0.9, 0, 0, 0);
  }

  flare(p) {
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.12, 5, 3, [3, 3, 2.6], [2, 1.2, 0.4], 1, 0.4, 0, 0);
    this.smoke.spawn(p.x, p.y, p.z, 0, 0, 0, 1.6, 1, 4, SMOKE_WHITE, SMOKE_WHITE, 0.4, 0, 0, 0.5);
  }

  muzzle(p) {
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.04, 1.6, 0.6, SPARK, FIRE1, 1, 0.2, 0, 0);
  }

  /** Burning wreck: smoke column + fire for a while. */
  wreck(p, t = 25) {
    this.emitters.push({ p: p.clone(), t, acc: 0 });
  }

  update(dt, terrain) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t -= dt;
      e.acc += dt;
      while (e.acc > 0.06) {
        e.acc -= 0.06;
        const k = Math.min(1, e.t / 8);
        this.smoke.spawn(e.p.x + rand(-3, 3), e.p.y + 1, e.p.z + rand(-3, 3), rand(-1, 1) + 2, rand(8, 12), rand(-1, 1), 7, 6, 40, SMOKE_DARK, SMOKE_GREY, 0.55 * k, 0, 0.05, 0.5);
        if (Math.random() < 0.6 * k) this.add.spawn(e.p.x + rand(-3, 3), e.p.y + 1, e.p.z + rand(-3, 3), 0, rand(4, 9), 0, 0.6, 5, 2, FIRE0, FIRE1, 0.9, 0, 0, 0);
      }
      if (e.t <= 0) this.emitters.splice(i, 1);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t -= dt;
      d.v.y -= 9.81 * dt;
      d.v.multiplyScalar(1 - 0.4 * dt);
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.spin.x * dt;
      d.m.rotation.y += d.spin.y * dt;
      d.m.rotation.z += d.spin.z * dt;
      if (Math.random() < 0.5) this.smoke.spawn(d.m.position.x, d.m.position.y, d.m.position.z, 0, 0, 0, 1.2, 1, 4, SMOKE_DARK, SMOKE_GREY, 0.5, 0, 0, 0.5);
      const g = terrain.surfaceAt(d.m.position.x, d.m.position.z);
      if (d.t <= 0 || d.m.position.y < g) {
        this.scene.remove(d.m);
        this.debris.splice(i, 1);
      }
    }
    this.add.update(dt);
    this.smoke.update(dt);
  }

  clear() {
    this.add.clear();
    this.smoke.clear();
    this.emitters.length = 0;
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris.length = 0;
  }
}

const _d = new THREE.Vector3();
function randDir() {
  do _d.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  while (_d.lengthSq() > 1 || _d.lengthSq() < 0.01);
  return _d.normalize();
}
