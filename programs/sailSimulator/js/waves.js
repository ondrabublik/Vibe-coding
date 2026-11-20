// Vlny (Gerstner) a pole větru s poryvy – stejné vzorce na CPU i v GLSL
import { G, DEG, wrap } from './physics.js';

export const NWAVES = 8;

export class WaveField {
  constructor() {
    this.waves = [];
    this.uA = new Float32Array(NWAVES * 4); // dirx, dirz, amp, k
    this.uB = new Float32Array(NWAVES * 4); // omega, phase, qa, 0
  }

  setup(Hs, windFrom, chop) {
    const theta0 = windFrom + Math.PI; // vlny postupují po větru
    const lp = Math.max(7, Hs * 22);
    const lens = [1.0, 0.72, 1.35, 0.52, 0.4, 0.29, 0.21, 0.62];
    const offs = [0, 17, -13, -29, 34, -41, 52, 7];
    const wts = [0.55, 0.42, 0.33, 0.28, 0.22, 0.16, 0.12, 0.3];
    const sw = wts.reduce((a, b) => a + b, 0);
    this.waves = [];
    for (let i = 0; i < NWAVES; i++) {
      const L = lp * lens[i];
      const k = (2 * Math.PI) / L;
      const th = theta0 + offs[i] * DEG;
      const amp = (Hs * 0.62 * wts[i]) / sw;
      const qa = Math.min(amp * (0.6 + 0.5 * chop), 0.75 / (k * NWAVES));
      const w = { dx: Math.sin(th), dz: Math.cos(th), amp, k, omega: Math.sqrt(G * k), phase: i * 1.7 + 0.3, qa };
      this.waves.push(w);
      this.uA.set([w.dx, w.dz, w.amp, w.k], i * 4);
      this.uB.set([w.omega, w.phase, w.qa, 0], i * 4);
    }
  }

  // posun bodu p0 (nedeformovaná mřížka)
  _disp(x, z, t, out) {
    let dx = 0, dy = 0, dz = 0;
    for (const w of this.waves) {
      const th = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
      const c = Math.cos(th);
      dx += w.qa * w.dx * c; dz += w.qa * w.dz * c; dy += w.amp * Math.sin(th);
    }
    out.x = dx; out.y = dy; out.z = dz;
    return out;
  }

  // výška hladiny ve světovém bodě (x,z)
  height(x, z, t) {
    const o = { x: 0, y: 0, z: 0 };
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) { this._disp(px, pz, t, o); px = x - o.x; pz = z - o.z; }
    this._disp(px, pz, t, o);
    return o.y;
  }

  slope(x, z, t) {
    const e = 1.2;
    const h0 = this.height(x, z, t);
    return { sx: (this.height(x + e, z, t) - h0) / e, sz: (this.height(x, z + e, t) - h0) / e, h: h0 };
  }
}

// ---------- vítr ----------
export class WindField {
  constructor() { this.base = 10; this.from = 0; this.gust = 0.2; this.shift = 5; this.driftX = 0; this.driftZ = 0; }
  setup(twsMs, from, gust, shiftDeg) {
    this.base = twsMs; this.from = from; this.gust = gust; this.shift = shiftDeg * DEG;
    // poryvy se posouvají po větru
    this.driftX = -Math.sin(from) * twsMs * 0.8;
    this.driftZ = -Math.cos(from) * twsMs * 0.8;
  }
  gustValue(x, z, t) {
    const X = x - this.driftX * t, Z = z - this.driftZ * t;
    return 0.55 * Math.sin(0.0105 * X + 1.3) * Math.sin(0.0127 * Z + 0.7)
      + 0.3 * Math.sin(0.021 * X - 0.016 * Z + 2.1 + 0.05 * t)
      + 0.25 * Math.sin(0.017 * Z + 0.029 * X + 4.0);
  }
  dirAt(x, z, t) {
    const g = this.gustValue(x, z, t);
    return wrap(this.from + this.shift * (0.6 * Math.sin(t * 2 * Math.PI / 90) + 0.4 * Math.sin(t * 2 * Math.PI / 37 + 1)) + this.shift * 0.3 * g);
  }
  at(x, z, t) {
    const g = this.gustValue(x, z, t);
    return { spd: Math.max(0.15 * this.base, this.base * (1 + this.gust * g * 0.9)), from: this.dirAt(x, z, t), g };
  }
}

export const GLSL_WAVES = /* glsl */`
uniform vec4 uWA[${NWAVES}];
uniform vec4 uWB[${NWAVES}];
vec3 gerstnerDisp(vec2 p, float t){
  vec3 d = vec3(0.0);
  for(int i=0;i<${NWAVES};i++){
    vec4 a=uWA[i]; vec4 b=uWB[i];
    float th = a.w*dot(a.xy,p) - b.x*t + b.y;
    float c = cos(th);
    d.x += b.z*a.x*c; d.z += b.z*a.y*c; d.y += a.z*sin(th);
  }
  return d;
}
vec3 gerstnerNormal(vec2 p, float t, float fade, out float crest){
  vec3 n = vec3(0.0,1.0,0.0);
  crest = 0.0;
  for(int i=0;i<${NWAVES};i++){
    vec4 a=uWA[i]; vec4 b=uWB[i];
    float th = a.w*dot(a.xy,p) - b.x*t + b.y;
    float c = cos(th), s = sin(th);
    n.x -= a.x*a.w*a.z*c*fade;
    n.z -= a.y*a.w*a.z*c*fade;
    n.y -= a.w*b.z*s*fade;
    crest += a.w*b.z*s;
  }
  return normalize(n);
}
`;

export const GLSL_GUST = /* glsl */`
uniform vec2 uGustDrift;
float gustValue(vec2 p, float t){
  vec2 q = p - uGustDrift*t;
  return 0.55*sin(0.0105*q.x+1.3)*sin(0.0127*q.y+0.7)
       + 0.3*sin(0.021*q.x-0.016*q.y+2.1+0.05*t)
       + 0.25*sin(0.017*q.y+0.029*q.x+4.0);
}
`;
