'use strict';
// Shared helpers: math, noise, seeded RNG and a tiny procedural geometry builder.
window.FS = window.FS || {};

(function (FS) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const expDecay = (rate, dt) => 1 - Math.exp(-rate * dt);

  function hash2(ix, iz, seed) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function grad(ix, iz, seed, dx, dz) {
    const a = hash2(ix, iz, seed) * 6.283185307;
    return Math.cos(a) * dx + Math.sin(a) * dz;
  }
  // 2D gradient noise, roughly in [-1, 1]
  function perlin(x, z, seed = 0) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fade(fx), v = fade(fz);
    const n00 = grad(ix, iz, seed, fx, fz);
    const n10 = grad(ix + 1, iz, seed, fx - 1, fz);
    const n01 = grad(ix, iz + 1, seed, fx, fz - 1);
    const n11 = grad(ix + 1, iz + 1, seed, fx - 1, fz - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.414;
  }
  function fbm(x, z, oct, seed) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * perlin(x * f, z * f, seed + i * 17);
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  }
  function ridged(x, z, oct, seed) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(perlin(x * f, z * f, seed + i * 31));
      v *= v;
      s += a * v; n += a; a *= 0.5; f *= 2.1;
    }
    return s / n;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Babylon's ComputeNormals convention: normal = SIGN * cross(b - a, c - a)
  let NSIGN = 0;
  function normalSign() {
    if (NSIGN) return NSIGN;
    const n = [];
    BABYLON.VertexData.ComputeNormals([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2], n);
    // cross((1,0,0),(0,0,1)) = (0,-1,0)
    NSIGN = n[1] < 0 ? 1 : -1;
    return NSIGN;
  }

  // Minimal geometry accumulator with per-triangle orientation control.
  class Geo {
    constructor() { this.p = []; this.c = []; this.i = []; }
    v(x, y, z, col) {
      this.p.push(x, y, z);
      this.c.push(col[0], col[1], col[2], 1);
      return this.p.length / 3 - 1;
    }
    // dir = desired outward direction of the triangle (front side)
    tri(a, b, c, dir) {
      if (dir) {
        const P = this.p;
        const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
        const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
        const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if ((nx * dir[0] + ny * dir[1] + nz * dir[2]) * normalSign() < 0) { const t = b; b = c; c = t; }
      }
      this.i.push(a, b, c);
    }
    quad(a, b, c, d, dir) { this.tri(a, b, c, dir); this.tri(a, c, d, dir); }
    transform(fn, from = 0) {
      const P = this.p;
      for (let k = from * 3; k < P.length; k += 3) {
        const r = fn(P[k], P[k + 1], P[k + 2]);
        P[k] = r[0]; P[k + 1] = r[1]; P[k + 2] = r[2];
      }
    }
    toMesh(name, scene, mat, parent) {
      const m = new BABYLON.Mesh(name, scene);
      const vd = new BABYLON.VertexData();
      vd.positions = this.p; vd.indices = this.i; vd.colors = this.c;
      const n = [];
      BABYLON.VertexData.ComputeNormals(this.p, this.i, n);
      vd.normals = n;
      vd.applyToMesh(m, false);
      if (mat) m.material = mat;
      if (parent) m.parent = parent;
      return m;
    }
  }

  // Catmull-Rom interpolation of keyed ring descriptors (all numeric props).
  function interpKeys(keys, n) {
    const out = [];
    const props = Object.keys(keys[0]);
    for (let s = 0; s < n; s++) {
      const u = (s / (n - 1)) * (keys.length - 1);
      const i = Math.min(Math.floor(u), keys.length - 2);
      const t = u - i;
      const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, keys.length - 1)];
      const r = {};
      for (const p of props) {
        const p0 = k0[p], p1 = k1[p], p2 = k2[p], p3 = k3[p];
        r[p] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      }
      out.push(r);
    }
    return out;
  }

  // Loft along +Z. rings: {z, y, x?, rx, ryT, ryB}. colorFn(x,y,z,cos,sin,ringT)
  function loft(geo, rings, segs, colorFn, capStart = true, capEnd = true) {
    const base = geo.p.length / 3;
    const nr = rings.length;
    for (let r = 0; r < nr; r++) {
      const R = rings[r];
      const t = r / (nr - 1);
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const ry = s >= 0 ? R.ryT : R.ryB;
        const x = (R.x || 0) + R.rx * c, y = R.y + ry * s;
        geo.v(x, y, R.z, colorFn(x, y, R.z, c, s, t));
      }
    }
    for (let r = 0; r < nr - 1; r++) {
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % segs;
        const a = base + r * segs + j, b = base + r * segs + j2;
        const c = base + (r + 1) * segs + j2, d = base + (r + 1) * segs + j;
        const th = ((j + 0.5) / segs) * Math.PI * 2;
        geo.quad(a, b, c, d, [Math.cos(th), Math.sin(th), 0]);
      }
    }
    const cap = (r, dirZ) => {
      const R = rings[r];
      const ci = geo.v(R.x || 0, R.y, R.z + dirZ * 0.0005, colorFn(R.x || 0, R.y, R.z, 0, 0, r / (nr - 1)));
      for (let j = 0; j < segs; j++) {
        geo.tri(ci, base + r * segs + j, base + r * segs + ((j + 1) % segs), [0, 0, dirZ]);
      }
    };
    if (capStart) cap(0, -1);
    if (capEnd) cap(nr - 1, 1);
  }

  // Tube along an arbitrary polyline. rFn(t)->[rN, rB]; colFn(t, angle)->rgb
  function tube(geo, pts, rFn, segs, colFn, capEnd = true, refUp = [0, 1, 0]) {
    const base = geo.p.length / 3;
    const n = pts.length;
    const centers = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // N = normalize(cross(T, up)); B = cross(N, T)
      let nx = ty * refUp[2] - tz * refUp[1], ny = tz * refUp[0] - tx * refUp[2], nz = tx * refUp[1] - ty * refUp[0];
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-4) { nx = 1; ny = 0; nz = 0; nl = 1; }
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      const t = i / (n - 1);
      const [rn, rb] = rFn(t);
      centers.push(p);
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        geo.v(p[0] + (nx * c * rn + bx * s * rb), p[1] + (ny * c * rn + by * s * rb), p[2] + (nz * c * rn + bz * s * rb), colFn(t, th));
      }
    }
    const P = geo.p;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % segs;
        const a = base + i * segs + j, b = base + i * segs + j2, c = base + (i + 1) * segs + j2, d = base + (i + 1) * segs + j;
        const cx = (centers[i][0] + centers[i + 1][0]) / 2, cy = (centers[i][1] + centers[i + 1][1]) / 2, cz = (centers[i][2] + centers[i + 1][2]) / 2;
        const mx = (P[a * 3] + P[c * 3]) / 2 - cx, my = (P[a * 3 + 1] + P[c * 3 + 1]) / 2 - cy, mz = (P[a * 3 + 2] + P[c * 3 + 2]) / 2 - cz;
        geo.quad(a, b, c, d, [mx, my, mz]);
      }
    }
    const capAt = (i, sgn) => {
      const p = pts[i];
      const q = pts[i - sgn] || pts[i];
      const ci = geo.v(p[0], p[1], p[2], colFn(i / (n - 1), 0));
      for (let j = 0; j < segs; j++) geo.tri(ci, base + i * segs + j, base + i * segs + ((j + 1) % segs), [p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
    };
    capAt(0, -1);
    if (capEnd) capAt(n - 1, 1);
  }

  // Ellipsoid with main axis along Z. colFn(nx,ny,nz) with unit-sphere coords.
  function ellipsoid(geo, cx, cy, cz, rx, ry, rz, segs, rings, colFn) {
    const base = geo.p.length / 3;
    for (let i = 0; i <= rings; i++) {
      const th = (i / rings) * Math.PI;
      const zc = Math.cos(th), r = Math.sin(th);
      for (let j = 0; j < segs; j++) {
        const ph = (j / segs) * Math.PI * 2;
        const nx = r * Math.cos(ph), ny = r * Math.sin(ph);
        geo.v(cx + rx * nx, cy + ry * ny, cz + rz * zc, colFn(nx, ny, zc));
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % segs;
        const a = base + i * segs + j, b = base + i * segs + j2, c = base + (i + 1) * segs + j2, d = base + (i + 1) * segs + j;
        const th = ((i + 0.5) / rings) * Math.PI, ph = ((j + 0.5) / segs) * Math.PI * 2;
        const dir = [Math.sin(th) * Math.cos(ph) / rx, Math.sin(th) * Math.sin(ph) / ry, Math.cos(th) / rz];
        if (i === 0) geo.tri(a, c, d, dir);
        else if (i === rings - 1) geo.tri(a, b, c, dir);
        else geo.quad(a, b, c, d, dir);
      }
    }
  }

  // Flat double-sided sheet (top & bottom surfaces with independent colours).
  // grid(u,v) -> [x,y,z]; colTop/colBot(u,v)->rgb; nu,nv subdivisions.
  function sheet(geo, nu, nv, grid, colTop, colBot, upDir = [0, 1, 0]) {
    for (const side of [1, -1]) {
      const base = geo.p.length / 3;
      for (let i = 0; i <= nu; i++) {
        for (let j = 0; j <= nv; j++) {
          const u = i / nu, v = j / nv;
          const p = grid(u, v);
          geo.v(p[0], p[1], p[2], side > 0 ? colTop(u, v) : colBot(u, v));
        }
      }
      const dir = [upDir[0] * side, upDir[1] * side, upDir[2] * side];
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const a = base + i * (nv + 1) + j, b = a + 1, c = a + nv + 2, d = a + nv + 1;
          geo.quad(a, b, c, d, dir);
        }
      }
    }
  }

  Object.assign(FS, {
    clamp, lerp, smoothstep, mix3, mul3, expDecay, hash2, perlin, fbm, ridged, rng,
    Geo, interpKeys, loft, tube, ellipsoid, sheet,
  });
})(window.FS);
