export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (t) => clamp(t, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];

// Deterministic PRNG so level decoration is identical on every run.
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

// Cheap 2D hash in [0, 1) – stable for the same coordinates.
export function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
