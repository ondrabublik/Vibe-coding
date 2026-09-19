import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const G = 9.81;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Value noise
// ---------------------------------------------------------------------------
function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Smooth 2D value noise in [-1, 1]. */
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x, y, oct = 5) {
  let s = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x, y);
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
  }
  return s / norm;
}

/** Ridged multifractal in [0, 1] – sharp mountain crests. */
export function ridged(x, y, oct = 5) {
  let s = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x, y));
    s += amp * n * n;
    norm += amp;
    amp *= 0.5;
    x = x * 2.1 + 5.3;
    y = y * 2.1 + 1.7;
  }
  return s / norm;
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** White radial blob with soft alpha falloff – used by particles and flares. */
export function softTexture(size = 64) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function cloudTexture() {
  const size = 256;
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const rng = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const r = size * (0.12 + rng() * 0.16);
    const a = rng() * Math.PI * 2, d = rng() * size * 0.22;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d * 0.6;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const shade = 235 + Math.floor(rng() * 20);
    grd.addColorStop(0, `rgba(${shade},${shade},${shade + 2},0.55)`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Circle roundel for the aircraft (cz = Czech tricolour sectors, red = enemy star). */
export function roundelTexture(kind) {
  const s = 128, c = makeCanvas(s, s), g = c.getContext('2d');
  const r = s / 2 - 4;
  g.translate(s / 2, s / 2);
  if (kind === 'cz') {
    const cols = ['#ffffff', '#d7141a', '#11457e'];
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, r, -Math.PI / 2 + (i * 2 * Math.PI) / 3 - Math.PI / 3, -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / 3 - Math.PI / 3);
      g.closePath();
      g.fillStyle = cols[i];
      g.fill();
    }
  } else {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = '#f2f2f2';
    g.fill();
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.38 : r * 0.92;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#c21414';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#222';
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
