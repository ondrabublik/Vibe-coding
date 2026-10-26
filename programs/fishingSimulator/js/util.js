'use strict';
// Sdílené pomocné funkce: matematika, šum, plátna, geometrie.
window.FS = window.FS || {};
(function (FS) {
  const U = {};
  FS.U = U;

  U.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // deterministický generátor pro stavbu světa
  let seeded = U.mulberry32(20240917);
  U.reseed = (s) => { seeded = U.mulberry32(s); };
  U.rand = () => seeded();
  U.rr = (a, b) => a + (b - a) * seeded();
  U.ri = (a, b) => Math.floor(a + (b - a + 1) * seeded());
  U.pick = (arr) => arr[Math.floor(seeded() * arr.length)];
  // nedeterministický pro hru
  U.grr = (a, b) => a + (b - a) * Math.random();
  U.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  U.angleDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  // ---------- Perlinův šum ----------
  const perm = new Uint8Array(512);
  (function () {
    const r = U.mulberry32(777);
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  U.noise2 = function (x, y) {
    const fx = Math.floor(x), fy = Math.floor(y);
    const X = fx & 255, Y = fy & 255;
    const xf = x - fx, yf = y - fy;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const x1 = U.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = U.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return U.lerp(x1, x2, v) * 0.75;
  };
  U.fbm2 = function (x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * U.noise2(x * f, y * f);
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  };
  // periodický šum (dlaždicové textury)
  U.pnoise2 = function (x, y, px, py) {
    const fx = Math.floor(x), fy = Math.floor(y);
    const xf = x - fx, yf = y - fy;
    const X0 = ((fx % px) + px) % px, X1 = (X0 + 1) % px;
    const Y0 = ((fy % py) + py) % py, Y1 = (Y0 + 1) % py;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X0] + Y0], ab = perm[perm[X0] + Y1];
    const ba = perm[perm[X1] + Y0], bb = perm[perm[X1] + Y1];
    const x1 = U.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = U.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return U.lerp(x1, x2, v) * 0.75;
  };
  U.pfbm2 = function (x, y, period, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * U.pnoise2(x * f, y * f, period * f, period * f);
      n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  };

  // ---------- barvy ----------
  U.s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  U.col = (r, g, b) => new THREE.Color(U.s2l(r), U.s2l(g), U.s2l(b));
  U.rgbStr = (c, a) => {
    const r = Math.round(U.clamp(c[0], 0, 1) * 255), g = Math.round(U.clamp(c[1], 0, 1) * 255), b = Math.round(U.clamp(c[2], 0, 1) * 255);
    return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  };
  U.mix3 = (a, b, t) => [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)];

  // ---------- plátna ----------
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c, g: c.getContext('2d') };
  };
  U.tex = function (canvas, opt = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (opt.srgb !== false) t.encoding = THREE.sRGBEncoding;
    if (opt.repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = opt.aniso || 8;
    t.needsUpdate = true;
    return t;
  };
  // výškové pole -> normálová mapa (plátno)
  U.heightToNormal = function (hf, w, h, strength) {
    const { c, g } = U.canvas(w, h);
    const img = g.createImageData(w, h);
    const d = img.data;
    const at = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const i = (y * w + x) * 4;
        d[i] = (-dx / len * 0.5 + 0.5) * 255;
        d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
        d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  U.heightToCanvas = function (hf, w, h) {
    const { c, g } = U.canvas(w, h);
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = U.clamp(hf[i], 0, 1) * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  };

  // ---------- křivky ----------
  // 1D křivka z kontrolních bodů [[t,v],...] (Catmull-Rom)
  U.curve1D = function (pts) {
    return function (t) {
      if (t <= pts[0][0]) return pts[0][1];
      const n = pts.length;
      if (t >= pts[n - 1][0]) return pts[n - 1][1];
      let i = 0;
      while (i < n - 2 && t > pts[i + 1][0]) i++;
      const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(n - 1, i + 2)][1];
      const s = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      const s2 = s * s, s3 = s2 * s;
      const v = 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
      return Math.max(0, v);
    };
  };
  // uzavřený Catmull-Rom pro 2D body [x,z]
  U.catmullClosed = function (pts, segs) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let k = 0; k < segs; k++) {
        const s = k / segs, s2 = s * s, s3 = s2 * s;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    return out;
  };
  U.catmullOpen = function (pts, segs) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let k = 0; k < segs; k++) {
        const s = k / segs, s2 = s * s, s3 = s2 * s;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[n - 1].slice());
    return out;
  };
  U.pointInPoly = function (x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  };
  U.distToPolyline = function (x, z, pts, closed) {
    let best = 1e9, bestI = 0, bestS = 0;
    const n = pts.length;
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1e-9;
      let s = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const px = a[0] + dx * s - x, pz = a[1] + dz * s - z;
      const d = px * px + pz * pz;
      if (d < best) { best = d; bestI = i; bestS = s; }
    }
    return { d: Math.sqrt(best), i: bestI, s: bestS };
  };

  // ---------- geometrie ----------
  U.mergeGeometries = function (geos) {
    const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const names = ['position', 'normal', 'uv', 'color'].filter((n) => parts.every((p) => p.attributes[n]));
    const out = new THREE.BufferGeometry();
    for (const n of names) {
      const size = parts[0].attributes[n].itemSize;
      let total = 0;
      for (const p of parts) total += p.attributes[n].count * size;
      const arr = new Float32Array(total);
      let off = 0;
      for (const p of parts) { arr.set(p.attributes[n].array, off); off += p.attributes[n].count * size; }
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    return out;
  };
  U.setColor = function (geo, color) {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  // Trubice s proměnným poloměrem; lze aktualizovat každý snímek.
  class Tube {
    constructor(nPts, radial, opts = {}) {
      this.n = nPts; this.r = radial;
      const vc = nPts * (radial + 1) + (opts.capEnd ? 1 : 0);
      this.geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(vc * 3);
      this.nor = new Float32Array(vc * 3);
      const uv = new Float32Array(vc * 2);
      const idx = [];
      for (let i = 0; i < nPts; i++) {
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          uv[k * 2] = j / radial; uv[k * 2 + 1] = i / (nPts - 1);
          if (i < nPts - 1 && j < radial) {
            const a = k, b = k + radial + 1, c = k + 1, d = k + radial + 2;
            idx.push(a, b, c, c, b, d);
          }
        }
      }
      this.capEnd = !!opts.capEnd;
      if (this.capEnd) {
        const tipI = nPts * (radial + 1);
        uv[tipI * 2] = 0.5; uv[tipI * 2 + 1] = 1;
        const base = (nPts - 1) * (radial + 1);
        for (let j = 0; j < radial; j++) idx.push(base + j, tipI, base + j + 1);
      }
      this.geo.setIndex(idx);
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
      this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      this._t = new THREE.Vector3(); this._n = new THREE.Vector3(); this._b = new THREE.Vector3();
      this._prevT = new THREE.Vector3();
    }
    // points: Vector3[], radii: number[] nebo funkce(s)
    update(points, radii) {
      const n = this.n, R = this.r;
      const T = this._t, N = this._n, B = this._b;
      for (let i = 0; i < n; i++) {
        const p = points[i];
        const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
        T.subVectors(b, a).normalize();
        if (i === 0) {
          const up = Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          N.crossVectors(T, up).normalize();
        } else {
          // paralelní transport
          const axis = new THREE.Vector3().crossVectors(this._prevT, T);
          const s = axis.length();
          if (s > 1e-6) {
            axis.divideScalar(s);
            const ang = Math.acos(U.clamp(this._prevT.dot(T), -1, 1));
            N.applyAxisAngle(axis, ang);
          }
        }
        this._prevT.copy(T);
        B.crossVectors(T, N).normalize();
        const rad = typeof radii === 'function' ? radii(i / (n - 1)) : radii[i];
        for (let j = 0; j <= R; j++) {
          const ang = (j / R) * Math.PI * 2;
          const cx = Math.cos(ang), sx = Math.sin(ang);
          const nx = N.x * cx + B.x * sx, ny = N.y * cx + B.y * sx, nz = N.z * cx + B.z * sx;
          const k = (i * (R + 1) + j) * 3;
          this.pos[k] = p.x + nx * rad; this.pos[k + 1] = p.y + ny * rad; this.pos[k + 2] = p.z + nz * rad;
          this.nor[k] = nx; this.nor[k + 1] = ny; this.nor[k + 2] = nz;
        }
      }
      if (this.capEnd) {
        const k = n * (R + 1) * 3, p = points[n - 1];
        this.pos[k] = p.x + T.x * 0.0005; this.pos[k + 1] = p.y + T.y * 0.0005; this.pos[k + 2] = p.z + T.z * 0.0005;
        this.nor[k] = T.x; this.nor[k + 1] = T.y; this.nor[k + 2] = T.z;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.normal.needsUpdate = true;
      this.geo.computeBoundingSphere();
    }
  }
  U.Tube = Tube;
  U.tube = function (points, radii, radial = 6, opts) {
    const t = new Tube(points.length, radial, opts);
    t.update(points, radii);
    return t.geo;
  };

  U.fmtMoney = (v) => Math.round(v).toLocaleString('cs-CZ') + ' Kč';
  U.fmtKg = (w) => (w < 1 ? Math.round(w * 1000) + ' g' : w.toFixed(2).replace('.', ',') + ' kg');
  U.fmt1 = (v) => v.toFixed(1).replace('.', ',');
})(window.FS);
