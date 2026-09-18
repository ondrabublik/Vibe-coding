import * as THREE from 'three';
import { MAP } from './mapData.js';

// ---------------------------------------------------------------------------
// Terrain height (real DEM samples, bicubic interpolation)
// ---------------------------------------------------------------------------
const EL = MAP.elev;
const EN = EL.n;
const ECELL = EL.size / (EN - 1);
const EHALF = EL.size / 2;
export const HEIGHT_SCALE = 1.25; // slight exaggeration so the slope toward the river is noticeable

function eh(i, j) {
  i = Math.max(0, Math.min(EN - 1, i));
  j = Math.max(0, Math.min(EN - 1, j));
  return EL.h[j * EN + i];
}
function cr(p0, p1, p2, p3, t) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
function heightRaw(x, z) {
  // grid rows go from south (j=0) to north; world z points south
  const gx = (Math.max(-EHALF, Math.min(EHALF, x)) + EHALF) / ECELL;
  const gy = (Math.max(-EHALF, Math.min(EHALF, -z)) + EHALF) / ECELL;
  const i = Math.floor(gx), j = Math.floor(gy);
  const tx = gx - i, ty = gy - j;
  const rows = [];
  for (let k = -1; k <= 2; k++) {
    rows.push(cr(eh(i - 1, j + k), eh(i, j + k), eh(i + 1, j + k), eh(i + 2, j + k), tx));
  }
  return cr(rows[0], rows[1], rows[2], rows[3], ty);
}
const H0 = heightRaw(0, 0);
export function groundHeight(x, z) {
  return (heightRaw(x, z) - H0) * HEIGHT_SCALE;
}

// ---------------------------------------------------------------------------
// Random / geometry helpers
// ---------------------------------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

export function distPolyline(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, distSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Simple uniform grid for fast "is this spot free" queries.
export class SpatialGrid {
  constructor(cell = 20) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 100000 + j; }
  insertBox(minX, minZ, maxX, maxZ, item) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = this.key(i, j);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(item);
      }
  }
  query(x, z) {
    return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || [];
  }
}

// Cheap diffuse material for the static world (Lambert is much lighter than PBR on integrated GPUs)
export function lambert(opts = {}) {
  const o = { ...opts };
  delete o.roughness; delete o.metalness;
  return new THREE.MeshLambertMaterial(o);
}

// ---------------------------------------------------------------------------
// Geometry builder (merged buffers, one per material)
// ---------------------------------------------------------------------------
export class GeoBuilder {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; }
  vert(x, y, z, u, v, c) {
    this.pos.push(x, y, z); this.uv.push(u, v);
    this.col.push(c ? c.r : 1, c ? c.g : 1, c ? c.b : 1);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  // triangle forced to face upward
  triUp(a, b, c) {
    const P = this.pos;
    const ux = P[b * 3] - P[a * 3], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vz = P[c * 3 + 2] - P[a * 3 + 2];
    // y component of (b-a) x (c-a)
    const ny = uz * vx - ux * vz;
    if (ny >= 0) this.tri(a, b, c); else this.tri(a, c, b);
  }
  get empty() { return this.idx.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Procedural canvas textures
// ---------------------------------------------------------------------------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(ctx, w, h, n, alpha, light = 255, dark = 0, size = 1, r = Math.random) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? light : dark;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    ctx.fillRect(r() * w, r() * h, size, size);
  }
}

export function makeTextures() {
  const R = rng(7);
  const T = {};

  // Asphalt
  {
    const c = canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#5b5d61'; x.fillRect(0, 0, 256, 256);
    noise(x, 256, 256, 9000, 0.35, 255, 0, 1, R);
    noise(x, 256, 256, 500, 0.25, 30, 0, 2, R);
    T.asphalt = tex(c);
  }
  // Zámková dlažba — grey rectangular concrete pavers (as seen in Tichá)
  const paving = (base, seed) => {
    const r = rng(seed);
    const c = canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#6f6f6c'; x.fillRect(0, 0, 256, 256);
    const bw = 32, bh = 16;
    for (let row = 0; row < 256 / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 256 / bw + 1; col++) {
        const g = base + Math.floor((r() - 0.5) * 22);
        x.fillStyle = `rgb(${g},${g},${g - 3})`;
        x.fillRect(col * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    noise(x, 256, 256, 6000, 0.18, 255, 0, 1, r);
    return tex(c);
  };
  T.paving = paving(150, 3);
  T.sidewalk = paving(175, 4);

  // Grass detail (multiplied onto terrain color map)
  {
    const c = canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = 'rgb(158,158,158)'; x.fillRect(0, 0, 256, 256);
    noise(x, 256, 256, 14000, 0.35, 230, 90, 2, R);
    const t = tex(c, true, false);
    T.detail = t;
  }

  // Facade cells: one cell = 3.2 m wide x 3 m tall (one storey)
  const facade = (modern) => {
    const c = canvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    noise(x, 128, 128, 1500, 0.08, 0, 0, 1, R);
    if (modern) {
      x.fillStyle = '#3a3d42'; x.fillRect(18, 34, 92, 62);
      x.fillStyle = '#1d2733'; x.fillRect(22, 38, 84, 54);
      x.fillStyle = 'rgba(160,190,220,0.35)'; x.fillRect(22, 38, 40, 54);
      x.fillStyle = '#3a3d42'; x.fillRect(62, 38, 4, 54);
    } else {
      x.fillStyle = '#f4f4f4'; x.fillRect(38, 30, 52, 62);
      x.fillStyle = '#29313a'; x.fillRect(42, 34, 21, 54); x.fillRect(66, 34, 20, 54);
      x.fillStyle = 'rgba(170,200,230,0.3)'; x.fillRect(42, 34, 10, 54); x.fillRect(66, 34, 9, 54);
      x.fillStyle = '#9a9a9a'; x.fillRect(34, 92, 60, 6);
    }
    return tex(c);
  };
  T.facadeModern = facade(true);
  T.facadeOld = facade(false);
  {
    const c = canvas(64, 64), x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    noise(x, 64, 64, 900, 0.1, 0, 0, 1, R);
    T.plaster = tex(c);
  }
  // Roof tiles
  {
    const c = canvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const g = 200 + Math.floor(R() * 55);
        x.fillStyle = `rgb(${g},${g},${g})`;
        x.fillRect(col * 16 + (row % 2) * 8, row * 16, 15, 14);
      }
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, row * 16 + 13, 128, 3);
    }
    T.roof = tex(c);
  }
  // Brick plinth
  {
    const c = canvas(128, 64), x = c.getContext('2d');
    x.fillStyle = '#7a4a35'; x.fillRect(0, 0, 128, 64);
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 9; col++) {
        const g = Math.floor(R() * 30);
        x.fillStyle = `rgb(${150 + g},${75 + g / 2},${55 + g / 3})`;
        x.fillRect(col * 16 + (row % 2) * 8 + 1, row * 8 + 1, 14, 6);
      }
    T.brick = tex(c);
  }
  // Checkered start line
  {
    const c = canvas(128, 32), x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5';
      x.fillRect(i * 8, j * 8, 8, 8);
    }
    const t = tex(c); t.magFilter = THREE.NearestFilter;
    T.checker = t;
  }
  // Boost pad arrows
  {
    const c = canvas(128, 128), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#ffb300'); g.addColorStop(1, '#ff5a00');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#fff6b0';
    for (let k = 0; k < 2; k++) {
      const y = k * 64;
      x.beginPath(); x.moveTo(20, y + 50); x.lineTo(64, y + 10); x.lineTo(108, y + 50);
      x.lineTo(90, y + 50); x.lineTo(64, y + 28); x.lineTo(38, y + 50); x.closePath(); x.fill();
    }
    T.boost = tex(c);
  }
  // Item box "?"
  {
    const c = canvas(128, 128), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, 'rgba(255,90,200,0.85)'); g.addColorStop(0.5, 'rgba(90,200,255,0.85)'); g.addColorStop(1, 'rgba(255,230,80,0.85)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 10; x.strokeRect(5, 5, 118, 118);
    x.fillStyle = '#fff'; x.font = 'bold 84px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = '#333'; x.lineWidth = 6; x.strokeText('?', 64, 70); x.fillText('?', 64, 70);
    T.itemBox = tex(c, false);
  }
  // Red/white barrier
  {
    const c = canvas(128, 32), x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#f2f2f2' : '#d42020';
      x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 32, 0); x.lineTo(i * 16 + 16, 32); x.fill();
    }
    T.barrier = tex(c);
  }
  // Metal fence (alpha-tested bars)
  {
    const c = canvas(64, 64), x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 6, 64, 4); x.fillRect(0, 50, 64, 4);
    for (let i = 0; i < 64; i += 8) x.fillRect(i + 2, 0, 3, 64);
    T.fence = tex(c);
  }
  // Soft cloud sprite
  {
    const c = canvas(256, 128), x = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const cx = 40 + R() * 176, cy = 50 + R() * 40, r = 18 + R() * 30;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    T.cloud = tex(c, false);
  }
  return T;
}

// Text on a canvas -> texture (banners)
export function textTexture(text, w = 1024, h = 128, bg = '#c8102e', fg = '#ffffff') {
  const c = canvas(w, h), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffd400'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
  let size = Math.floor(h * 0.55);
  const font = () => `italic 900 ${size}px "Segoe UI", Arial, sans-serif`;
  x.font = font();
  while (x.measureText(text).width > w * 0.94 && size > 10) { size -= 2; x.font = font(); }
  x.fillStyle = fg;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
