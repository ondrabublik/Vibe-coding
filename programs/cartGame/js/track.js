import * as THREE from 'three';
import { MAP } from './mapData.js';
import { groundHeight, GeoBuilder, rng, distSeg, textTexture, wrapAngle, lambert } from './util.js';

export const HALF_W = 5.5;      // half width of the driving surface
export const WALL = 8.0;        // fence / hedge line (lateral offset)
export const KART_R = 0.9;
export const LAT_LIMIT = WALL - KART_R - 0.15;

// Control polygon of the circuit (x = east, z = south), following real streets.
// Order is the racing direction (clockwise on the map).
const CIRCUIT = [
  { p: [-8, -16], street: 'Tichá', surface: 'paving' },         // B: junction in Tichá
  { p: [40, -41], street: 'Chlumčanská', surface: 'asphalt' },  // C
  { p: [63, 1], street: 'Chlumčanská', surface: 'asphalt' },    // D
  { p: [98, 89], street: 'U Lomy', surface: 'asphalt' },        // E
  { p: [-24, 142], street: 'Oty Kovala', surface: 'asphalt' },  // F
  { p: [-85, 23], street: 'Tichá', surface: 'paving' },         // G: pedestrian part of Tichá
];
// Segment i goes from CIRCUIT[i] to CIRCUIT[i+1]; street/surface describe that segment.
const MAX_R = 20;
const STEP = 0.5;

export class Track {
  constructor() {
    this.buildPath();
    // Start line: on the pedestrian part of Tichá (segment G -> B), 28 m before the junction
    this.startS = this.segEndS[5] - 28;
    this.startIdx = this.idxAt(this.startS);
  }

  buildPath() {
    const n = CIRCUIT.length;
    const P = CIRCUIT.map((c) => c.p);
    const dirs = [], lens = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      dirs.push([dx / l, dz / l]); lens.push(l);
    }
    // corner fillets
    const corners = [];
    for (let i = 0; i < n; i++) {
      const d1 = dirs[(i - 1 + n) % n], d2 = dirs[i];
      const a1 = Math.atan2(d1[0], d1[1]), a2 = Math.atan2(d2[0], d2[1]);
      const delta = wrapAngle(a2 - a1);
      const half = Math.abs(delta) / 2;
      let R = MAX_R, t = 0;
      if (half > 0.01) {
        R = Math.min(MAX_R, (Math.min(lens[(i - 1 + n) % n], lens[i]) * 0.5) / Math.tan(half));
        t = R * Math.tan(half);
      }
      corners.push({ a1, delta, R, t });
    }
    // walk the path
    const pts = []; // {x,z,seg}
    this.segEndS = [];
    for (let i = 0; i < n; i++) {
      const c = corners[i];
      const p = P[i];
      // arc around corner i (belongs half to previous seg, half to this seg)
      if (c.t > 0) {
        let x = p[0] - dirs[(i - 1 + n) % n][0] * c.t;
        let z = p[1] - dirs[(i - 1 + n) % n][1] * c.t;
        const arcLen = c.R * Math.abs(c.delta);
        const k = Math.max(2, Math.ceil(arcLen / 0.25));
        const dd = c.delta / k;
        let a = c.a1;
        for (let s = 0; s < k; s++) {
          pts.push({ x, z, seg: s < k / 2 ? (i - 1 + n) % n : i });
          const chord = 2 * c.R * Math.sin(Math.abs(dd) / 2);
          x += Math.sin(a + dd / 2) * chord;
          z += Math.cos(a + dd / 2) * chord;
          a += dd;
        }
      }
      // straight part of segment i
      const next = corners[(i + 1) % n];
      const sx = p[0] + dirs[i][0] * c.t, sz = p[1] + dirs[i][1] * c.t;
      const L = lens[i] - c.t - next.t;
      const k = Math.max(1, Math.ceil(L / 0.25));
      for (let s = 0; s < k; s++) {
        pts.push({ x: sx + dirs[i][0] * (L * s) / k, z: sz + dirs[i][1] * (L * s) / k, seg: i });
      }
    }
    // cumulative length of fine polyline
    const cum = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = cum[pts.length];
    // resample uniformly
    const N = Math.round(this.length / STEP);
    this.N = N;
    this.step = this.length / N;
    this.x = new Float32Array(N); this.z = new Float32Array(N); this.y = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    this.seg = new Uint8Array(N); this.curv = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      while (cum[j + 1] < s) j++;
      const a = pts[j], b = pts[(j + 1) % pts.length];
      const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.x[i] = a.x + (b.x - a.x) * t;
      this.z[i] = a.z + (b.z - a.z) * t;
      this.seg[i] = a.seg;
    }
    // segment end positions (arc-length), useful for placing things
    const segEnd = new Array(n).fill(0);
    for (let i = 0; i < N; i++) segEnd[this.seg[i]] = i * this.step;
    this.segEndS = segEnd;
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz);
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.y[i] = groundHeight(this.x[i], this.z[i]);
    }
    // smooth heights a bit along the path so the surface is not bumpy
    for (let pass = 0; pass < 3; pass++) {
      const y2 = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = -6; k <= 6; k++) s += this.y[(i + k + N) % N];
        y2[i] = s / 13;
      }
      this.y = y2;
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 4 + N) % N, b = (i + 4) % N;
      const ha = Math.atan2(this.tx[a], this.tz[a]), hb = Math.atan2(this.tx[b], this.tz[b]);
      this.curv[i] = Math.abs(wrapAngle(hb - ha)) / (8 * this.step);
    }
    this.circuit = CIRCUIT;
  }

  idxAt(s) {
    s = ((s % this.length) + this.length) % this.length;
    return Math.floor(s / this.step) % this.N;
  }
  // right-hand normal at index i: (-tz, tx)
  nx(i) { return -this.tz[i]; }
  nz(i) { return this.tx[i]; }

  // find nearest sample index, searching around a hint
  nearest(x, z, hint = -1, range = 60) {
    let best = -1, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < this.N; i += 2) {
        const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      hint = best; range = 4;
    }
    for (let k = -range; k <= range; k++) {
      const i = (hint + k + this.N) % this.N;
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  lateral(x, z, i) {
    return (x - this.x[i]) * this.nx(i) + (z - this.z[i]) * this.nz(i);
  }
  along(x, z, i) {
    return (x - this.x[i]) * this.tx[i] + (z - this.z[i]) * this.tz[i];
  }
  sOf(x, z, i) { return i * this.step + this.along(x, z, i); }
  // world position at arc-length s and lateral offset
  pos(s, lat, out = new THREE.Vector3()) {
    const i = this.idxAt(s);
    const f = (((s % this.length) + this.length) % this.length) / this.step - i;
    const j = (i + 1) % this.N;
    const x = this.x[i] + (this.x[j] - this.x[i]) * f;
    const z = this.z[i] + (this.z[j] - this.z[i]) * f;
    const y = this.y[i] + (this.y[j] - this.y[i]) * f;
    return out.set(x + this.nx(i) * lat, y, z + this.nz(i) * lat);
  }
  heading(i) { return Math.atan2(this.tx[i], this.tz[i]); }
  street(i) { return CIRCUIT[this.seg[i]].street; }
  surface(i) { return CIRCUIT[this.seg[i]].surface; }
  // surface height at a point near the track
  surfaceY(x, z, i) {
    const lat = Math.abs(this.lateral(x, z, i));
    return this.y[i] + 0.1 + (lat > HALF_W + 0.2 ? 0.12 : 0);
  }
  distanceTo(x, z) {
    let bd = Infinity;
    for (let i = 0; i < this.N; i += 4) {
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d < bd) bd = d;
    }
    return Math.sqrt(bd);
  }
}

// ---------------------------------------------------------------------------
// Track meshes
// ---------------------------------------------------------------------------
export function buildTrackMeshes(track, T, scene) {
  const N = track.N;
  const group = new THREE.Group();
  const R = rng(99);

  const matOpts = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
  const surf = { asphalt: new GeoBuilder(), paving: new GeoBuilder() };
  const side = new GeoBuilder();
  const curb = new GeoBuilder();
  const Y0 = 0.1; // surface lift above the terrain mesh
  const every = 2; // use every 2nd sample for meshes (1 m)
  for (let k = 0; k < N; k += every) {
    const i = k, j = (k + every) % N;
    const s0 = i * track.step, s1 = s0 + every * track.step;
    const sf = surf[track.surface(i)];
    const P = (idx, lat, dy) => [track.x[idx] + track.nx(idx) * lat, track.y[idx] + dy, track.z[idx] + track.nz(idx) * lat];
    // main surface
    {
      const a = P(i, -HALF_W, Y0), b = P(i, HALF_W, Y0), c = P(j, HALF_W, Y0), d = P(j, -HALF_W, Y0);
      const u0 = -HALF_W / 4, u1 = HALF_W / 4;
      const va = sf.vert(...a, u0, s0 / 4), vb = sf.vert(...b, u1, s0 / 4);
      const vc = sf.vert(...c, u1, s1 / 4), vd = sf.vert(...d, u0, s1 / 4);
      sf.triUp(va, vb, vc); sf.triUp(va, vc, vd);
    }
    // sidewalks + curbs on both sides
    const corner = track.curv[i] > 0.02;
    for (const sgn of [-1, 1]) {
      const l0 = sgn * HALF_W, l1 = sgn * (HALF_W + 0.35), l2 = sgn * (WALL + 0.6);
      const hTop = Y0 + 0.12;
      // curb face + top
      const stripe = Math.floor(s0 / 2) % 2 === 0;
      const cc = corner ? (stripe ? new THREE.Color(0xd8262a) : new THREE.Color(0xf4f4f4)) : new THREE.Color(0xb9b7b0);
      const f0 = curb.vert(...P(i, l0, Y0), 0, 0, cc), f1 = curb.vert(...P(j, l0, Y0), 0, 0, cc);
      const f2 = curb.vert(...P(j, l0, hTop), 0, 0, cc), f3 = curb.vert(...P(i, l0, hTop), 0, 0, cc);
      const f4 = curb.vert(...P(j, l1, hTop), 0, 0, cc), f5 = curb.vert(...P(i, l1, hTop), 0, 0, cc);
      curb.quad(f0, f1, f2, f3);
      curb.triUp(f3, f2, f4); curb.triUp(f3, f4, f5);
      // sidewalk
      const w0 = side.vert(...P(i, l1, hTop), l1 / 3, s0 / 3), w1 = side.vert(...P(j, l1, hTop), l1 / 3, s1 / 3);
      const w2 = side.vert(...P(j, l2, hTop), l2 / 3, s1 / 3), w3 = side.vert(...P(i, l2, hTop), l2 / 3, s0 / 3);
      side.triUp(w0, w1, w2); side.triUp(w0, w2, w3);
    }
  }
  const asphaltMat = lambert({ map: T.asphalt, roughness: 0.95, ...matOpts });
  const pavingMat = lambert({ map: T.paving, roughness: 0.9, ...matOpts });
  const sideMat = lambert({ map: T.sidewalk, roughness: 0.9, ...matOpts });
  const curbMat = lambert({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  for (const [k, m] of [['asphalt', asphaltMat], ['paving', pavingMat]]) {
    const mesh = new THREE.Mesh(surf[k].build(), m);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const sideMesh = new THREE.Mesh(side.build(), sideMat); sideMesh.receiveShadow = true; group.add(sideMesh);
  const curbMesh = new THREE.Mesh(curb.build(), curbMat); curbMesh.receiveShadow = true; group.add(curbMesh);

  // Painted center dashes on asphalt parts
  {
    const g = new GeoBuilder();
    for (let i = 0; i < N; i += 2) {
      if (track.surface(i) !== 'asphalt') continue;
      const s = i * track.step;
      if (s % 9 > 4) continue;
      const j = (i + 2) % N;
      const y = 0.11;
      const q = (idx, lat) => [track.x[idx] + track.nx(idx) * lat, track.y[idx] + y, track.z[idx] + track.nz(idx) * lat];
      const a = g.vert(...q(i, -0.08), 0, 0), b = g.vert(...q(i, 0.08), 0, 0), c = g.vert(...q(j, 0.08), 0, 0), d = g.vert(...q(j, -0.08), 0, 0);
      g.triUp(a, b, c); g.triUp(a, c, d);
    }
    group.add(new THREE.Mesh(g.build(), lambert({ color: 0xeeeeee, roughness: 0.7, ...matOpts, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })));
  }

  // Start line
  {
    const g = new GeoBuilder();
    const i = track.startIdx, j = (i + 3) % N;
    const q = (idx, lat) => [track.x[idx] + track.nx(idx) * lat, track.y[idx] + 0.12, track.z[idx] + track.nz(idx) * lat];
    const a = g.vert(...q(i, -HALF_W), 0, 0), b = g.vert(...q(i, HALF_W), 1, 0), c = g.vert(...q(j, HALF_W), 1, 1), d = g.vert(...q(j, -HALF_W), 0, 1);
    g.triUp(a, b, c); g.triUp(a, c, d);
    group.add(new THREE.Mesh(g.build(), lambert({ map: T.checker, roughness: 0.6, ...matOpts, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })));
    // arch with banner
    const arch = new THREE.Group();
    const pillarMat = lambert({ color: 0xd9d9d9, roughness: 0.5, metalness: 0.3 });
    for (const sgn of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.2, 0.5), pillarMat);
      p.position.set(sgn * (HALF_W + 1.2), 3.1, 0); p.castShadow = true; arch.add(p);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF_W + 3, 1.3, 0.3), [
      pillarMat, pillarMat, pillarMat, pillarMat,
      lambert({ map: textTexture('DOBŘANY · VELKÁ CENA TICHÉ ULICE', 1536, 128) }),
      lambert({ map: textTexture('DOBŘANY · VELKÁ CENA TICHÉ ULICE', 1536, 128) }),
    ]);
    banner.position.y = 5.8; banner.castShadow = true; arch.add(banner);
    // start lights
    const lights = [];
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), lambert({ color: 0x331111, emissive: 0x000000 }));
      l.position.set((k - 1) * 0.9, 4.75, -0.2);
      arch.add(l); lights.push(l);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.2), lambert({ color: 0x151515 }));
    back.position.set(0, 4.75, 0); arch.add(back);
    arch.position.set(track.x[i], track.y[i], track.z[i]);
    arch.rotation.y = track.heading(i);
    group.add(arch);
    group.userData.startLights = lights;
  }

  // Walls: hedges / fences with gaps where other streets join the circuit
  const crossRoads = MAP.roads.filter((r) => ['residential', 'living_street', 'tertiary', 'service', 'pedestrian', 'footway', 'path'].includes(r.t));
  // a wall point is a gap if a street/footway crosses it (roads running parallel to the circuit don't count)
  const gapAt = (x, z, tx, tz) => {
    for (const r of crossRoads) {
      const w = r.t === 'footway' || r.t === 'path' ? 1.6 : 3.8;
      for (let k = 0; k < r.p.length - 1; k++) {
        const a = r.p[k], b = r.p[k + 1];
        if (distSeg(x, z, a[0], a[1], b[0], b[1]) >= w) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        if (Math.abs((dx * tx + dz * tz) / l) < 0.75) return true;
      }
    }
    return false;
  };
  const hedgeCones = [], boxHedges = [], fencePosts = [], barriers = [], fenceStrips = [];
  const obstacles = [];
  for (const sgn of [-1, 1]) {
    // gather samples every ~1 m
    const samples = [];
    for (let i = 0; i < N; i += 2) {
      const x = track.x[i] + track.nx(i) * sgn * WALL, z = track.z[i] + track.nz(i) * sgn * WALL;
      // skip if this wall point is on the "inside" too close to another part of the track (corners)
      samples.push({ i, x, z, gap: gapAt(x, z, track.tx[i], track.tz[i]) });
    }
    // dilate gaps slightly so openings look like openings
    const gaps = samples.map((s) => s.gap);
    for (let k = 0; k < samples.length; k++) {
      if (gaps[k]) for (let d = -2; d <= 2; d++) samples[(k + d + samples.length) % samples.length].gap2 = true;
    }
    let runStart = -1;
    let style = null;
    for (let k = 0; k < samples.length; k++) {
      const smp = samples[k];
      const st = track.circuit[track.seg[smp.i]].street;
      if (smp.gap2) {
        if (runStart < 0) runStart = k;
        continue;
      }
      if (runStart >= 0) { barriers.push([samples[runStart], samples[k - 1]]); runStart = -1; }
      // choose style per 20 m run
      const block = Math.floor((smp.i * track.step) / 20) + (sgn > 0 ? 1000 : 0);
      if (!style || style.block !== block) {
        const r = rng(block * 31 + 7)();
        let kind;
        if (st === 'Tichá') kind = r < 0.7 ? 'thuja' : 'panel';
        else if (st === 'Chlumčanská') kind = r < 0.6 ? 'metal' : 'hedge';
        else kind = r < 0.4 ? 'hedge' : r < 0.7 ? 'metal' : 'thuja';
        style = { block, kind };
      }
      const y = track.y[smp.i] + 0.1;
      const hd = track.heading(smp.i);
      if (style.kind === 'thuja') {
        hedgeCones.push({ x: smp.x, y, z: smp.z, h: 2.3 + R() * 0.8, r: 0.55 + R() * 0.12 });
      } else if (style.kind === 'hedge') {
        boxHedges.push({ x: smp.x, y, z: smp.z, hd, h: 1.5 });
      } else {
        fenceStrips.push({ x: smp.x, y, z: smp.z, hd, kind: style.kind });
        if (k % 3 === 0) fencePosts.push({ x: smp.x, y, z: smp.z, hd, kind: style.kind });
      }
    }
    if (runStart >= 0) barriers.push([samples[runStart], samples[samples.length - 1]]);
  }

  // thuja (instanced)
  {
    const geo = new THREE.ConeGeometry(1, 1, 7, 1);
    geo.translate(0, 0.5, 0);
    const mat = lambert({ color: 0x2f5a2a, roughness: 1, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, hedgeCones.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    hedgeCones.forEach((h, k) => {
      m.compose(new THREE.Vector3(h.x, h.y, h.z), q, new THREE.Vector3(h.r, h.h, h.r));
      im.setMatrixAt(k, m);
      im.setColorAt(k, c.setHSL(0.3 + R() * 0.04, 0.45, 0.2 + R() * 0.07));
    });
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }
  // box hedges
  {
    const geo = new THREE.BoxGeometry(0.9, 1, 1.05);
    geo.translate(0, 0.5, 0);
    const mat = lambert({ color: 0x3d6b30, roughness: 1 });
    const im = new THREE.InstancedMesh(geo, mat, boxHedges.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    boxHedges.forEach((h, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.hd);
      m.compose(new THREE.Vector3(h.x, h.y, h.z), q, new THREE.Vector3(1, h.h, 1));
      im.setMatrixAt(k, m);
      im.setColorAt(k, c.setHSL(0.27 + R() * 0.03, 0.45, 0.25 + R() * 0.04));
    });
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }
  // fence strips: metal bars (brown) or concrete panels (grey)
  {
    const metal = fenceStrips.filter((f) => f.kind === 'metal');
    const panel = fenceStrips.filter((f) => f.kind === 'panel');
    const mk = (list, geo, mat) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach((f, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.hd + Math.PI / 2);
        m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(k, m);
      });
      im.castShadow = true;
      group.add(im);
    };
    const mg = new THREE.PlaneGeometry(1.05, 1.1); mg.translate(0, 0.95, 0);
    mk(metal, mg, lambert({ map: T.fence, color: 0x6b4a33, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 }));
    const base = new THREE.BoxGeometry(1.05, 0.4, 0.2); base.translate(0, 0.2, 0);
    mk(metal, base, lambert({ color: 0x9a948a, roughness: 0.9 }));
    const pg = new THREE.BoxGeometry(1.05, 1.8, 0.12); pg.translate(0, 0.9, 0);
    mk(panel, pg, lambert({ color: 0x8e9194, roughness: 0.85 }));
  }
  // posts
  {
    const geo = new THREE.BoxGeometry(0.35, 1.6, 0.35); geo.translate(0, 0.8, 0);
    const im = new THREE.InstancedMesh(geo, lambert({ map: T.brick, roughness: 0.9 }), fencePosts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    fencePosts.forEach((f, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.hd);
      m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(1, f.kind === 'panel' ? 1.15 : 1, 1));
      im.setMatrixAt(k, m);
    });
    im.castShadow = true;
    group.add(im);
  }
  // barriers across street mouths (the circuit is closed here)
  {
    const legMat = lambert({ color: 0x333333 });
    for (const [a, b] of barriers) {
      const len = Math.hypot(b.x - a.x, b.z - a.z) + 1.2;
      if (len > 40) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const y = groundHeight(mx, mz);
      const tex = T.barrier.clone(); tex.needsUpdate = true; tex.repeat.set(len / 2, 1);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 0.15), lambert({ map: tex, roughness: 0.6 }));
      bar.position.set(mx, y + 0.95, mz);
      bar.rotation.y = Math.atan2(b.z - a.z, -(b.x - a.x));
      bar.castShadow = true;
      group.add(bar);
      for (const e of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.5), legMat);
        leg.position.set(mx + (b.x - a.x) * e * 0.95, y + 0.47, mz + (b.z - a.z) * e * 0.95);
        leg.rotation.y = bar.rotation.y;
        group.add(leg);
      }
    }
  }

  // Street lamps (grey poles as in Tichá)
  {
    const lamps = [];
    for (let s = 5; s < track.length; s += 26) {
      const i = track.idxAt(s);
      const sgn = Math.floor(s / 26) % 2 ? 1 : -1;
      lamps.push({ x: track.x[i] + track.nx(i) * sgn * (WALL - 0.7), y: track.y[i] + 0.1, z: track.z[i] + track.nz(i) * sgn * (WALL - 0.7), hd: track.heading(i), sgn });
    }
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 6.5, 8); pole.translate(0, 3.25, 0);
    const head = new THREE.BoxGeometry(0.3, 0.14, 0.7); head.translate(0, 6.5, 0);
    const pm = new THREE.InstancedMesh(pole, lambert({ color: 0x8c9094, metalness: 0.6, roughness: 0.4 }), lamps.length);
    const hm = new THREE.InstancedMesh(head, lambert({ color: 0x55585c, emissive: 0x222211 }), lamps.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    lamps.forEach((l, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.hd + Math.PI / 2);
      m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(1, 1, 1));
      pm.setMatrixAt(k, m); hm.setMatrixAt(k, m);
      obstacles.push({ x: l.x, z: l.z, r: 0.25 });
    });
    pm.castShadow = true; hm.castShadow = true;
    group.add(pm, hm);
  }

  // Waste bins on the sidewalk (yellow / blue / black, as seen in the street)
  {
    const binGeo = new THREE.BoxGeometry(0.6, 1.05, 0.7); binGeo.translate(0, 0.52, 0);
    const colors = [0xf2c200, 0x1f5fbf, 0x2a2a2a, 0x2e7d32];
    for (let s = 17; s < track.length; s += 47) {
      const i = track.idxAt(s);
      const sgn = R() < 0.5 ? -1 : 1;
      for (let b = 0; b < 2; b++) {
        const ss = s + b * 0.75;
        const p = track.pos(ss, sgn * (WALL - 0.9));
        const mesh = new THREE.Mesh(binGeo, lambert({ color: colors[Math.floor(R() * colors.length)], roughness: 0.6 }));
        mesh.position.set(p.x, p.y + 0.12, p.z);
        mesh.rotation.y = track.heading(i);
        mesh.castShadow = true;
        group.add(mesh);
        obstacles.push({ x: p.x, z: p.z, r: 0.45 });
      }
    }
  }

  scene.add(group);
  return { group, startLights: group.userData.startLights, obstacles };
}
