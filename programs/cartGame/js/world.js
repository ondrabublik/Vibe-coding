import * as THREE from 'three';
import { MAP } from './mapData.js';
import { groundHeight, GeoBuilder, rng, polyArea, pointInPoly, distSeg, SpatialGrid, lambert } from './util.js';
import { WALL } from './track.js';

const WORLD = 1000;       // terrain size (m)
const DATA_R = 420;       // radius of the area with real OSM data

// Final terrain height: the real DEM, levelled into the circuit corridor.
let H = groundHeight;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
function trackDistanceField(track) {
  // returns function (x,z) -> {d, y} using a coarse grid of nearby track samples
  const grid = new SpatialGrid(16);
  for (let i = 0; i < track.N; i += 2) grid.insertBox(track.x[i] - 20, track.z[i] - 20, track.x[i] + 20, track.z[i] + 20, i);
  return (x, z) => {
    let bd = Infinity, bi = -1;
    for (const i of grid.query(x, z)) {
      const d = (track.x[i] - x) ** 2 + (track.z[i] - z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi < 0 ? null : { d: Math.sqrt(bd), y: track.y[bi] };
  };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function buildGroundCanvas(R) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const k = S / WORLD;
  const P = (p) => [(p[0] + WORLD / 2) * k, (p[1] + WORLD / 2) * k];

  // base: lawns/gardens
  x.fillStyle = '#6d9a45';
  x.fillRect(0, 0, S, S);
  // fields outside the town (patchwork typical for Plzeň region)
  const fieldCols = ['#b9a45c', '#8c7a4a', '#9fb356', '#c9b86a', '#7f9a44', '#a88e5a'];
  for (let i = 0; i < 60; i++) {
    const a = R() * Math.PI * 2, r = DATA_R + 30 + R() * 120;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    x.save();
    x.translate(...P([cx, cz]));
    x.rotate(R() * Math.PI);
    x.fillStyle = fieldCols[Math.floor(R() * fieldCols.length)];
    const w = (60 + R() * 120) * k, h = (40 + R() * 90) * k;
    x.fillRect(-w / 2, -h / 2, w, h);
    // furrows
    x.strokeStyle = 'rgba(0,0,0,0.06)';
    x.lineWidth = 2;
    for (let yy = -h / 2; yy < h / 2; yy += 8) { x.beginPath(); x.moveTo(-w / 2, yy); x.lineTo(w / 2, yy); x.stroke(); }
    x.restore();
  }
  // lawn variation blotches
  for (let i = 0; i < 3000; i++) {
    const px = R() * S, py = R() * S, r = 4 + R() * 30;
    x.fillStyle = `rgba(${R() < 0.5 ? '40,70,20' : '150,180,90'},${0.05 + R() * 0.08})`;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  const fillPoly = (pts, col) => {
    x.fillStyle = col;
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p))));
    x.closePath(); x.fill();
  };
  const areaCol = {
    grass: '#79a84e', meadow: '#8fae55', farmland: '#a9965c', wood: '#3f6a2e', pitch: '#4f9a45',
    playground: '#b8a57e', parking: '#7c7d7f', cemetery: '#6c8a55', swimming_pool: '#5fb3d9', garages: '#8a8a88',
    industrial: '#9a948a', railway: '#8b8378', sports_centre: '#6fa04e', scrub: '#5d7f3a', hospital: null, residential: null,
  };
  // bigger areas first
  const areas = [...MAP.areas].sort((a, b) => Math.abs(polyArea(b.p)) - Math.abs(polyArea(a.p)));
  for (const a of areas) {
    const col = areaCol[a.t];
    if (col) fillPoly(a.p, col);
    if (a.t === 'pitch') {
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 3;
      x.beginPath(); a.p.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p)))); x.closePath(); x.stroke();
    }
  }
  // footways, paths, water
  x.lineCap = 'round'; x.lineJoin = 'round';
  const line = (pts, w, col) => {
    x.strokeStyle = col; x.lineWidth = w * k;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p)))); x.stroke();
  };
  for (const w of MAP.water) line(w.p, 3, '#4f86a8');
  for (const r of MAP.roads) {
    if (r.t === 'footway' || r.t === 'cycleway') line(r.p, 2, '#b9b6ae');
    else if (r.t === 'path' || r.t === 'track') line(r.p, 1.8, '#a89c7c');
  }
  // soft shadow-ish darkening under road ribbons (curb edges)
  for (const r of MAP.roads) {
    if (['residential', 'living_street', 'tertiary', 'service', 'pedestrian'].includes(r.t)) line(r.p, roadWidth(r.t) + 1.6, '#9d9b95');
  }
  return c;
}

export function roadWidth(t) {
  return { tertiary: 7.5, residential: 6, living_street: 5.5, pedestrian: 4.5, service: 3.5 }[t] || 3;
}

function buildTerrain(track, T, scene, R) {
  const seg = 180;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const x = -WORLD / 2 + (WORLD * i) / seg, z = -WORLD / 2 + (WORLD * j) / seg;
      const y = H(x, z);
      pos.push(x, y, z);
      uv.push(i / seg, 1 - j / seg);
    }
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const canvas = buildGroundCanvas(R);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = T.detail.anisotropy;
  const mat = lambert({ map, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: T.detail };
    sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       diffuseColor.rgb *= texture2D(detailMap, vMapUv * 260.0).rgb * 1.62;`
    );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // outer ground skirt to the horizon
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(WORLD / 2 - 5, 4000, 64, 1),
    lambert({ color: 0x7f9a4c, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -2;
  scene.add(outer);
  return { canvas };
}

// ---------------------------------------------------------------------------
// Streets outside the circuit (ribbons draped on the terrain)
// ---------------------------------------------------------------------------
function buildRoads(track, T, scene) {
  const asphalt = new GeoBuilder(), paving = new GeoBuilder();
  const Y = 0.06;
  for (const r of MAP.roads) {
    if (!['residential', 'living_street', 'tertiary', 'service', 'pedestrian'].includes(r.t)) continue;
    const g = r.t === 'living_street' || r.t === 'pedestrian' ? paving : asphalt;
    const hw = roadWidth(r.t) / 2;
    const closed = r.p.length > 3 && r.p[0][0] === r.p[r.p.length - 1][0] && r.p[0][1] === r.p[r.p.length - 1][1];
    // densify
    const pts = [];
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    pts.push(r.p[r.p.length - 1]);
    let s = 0;
    let prevL = -1, prevR = -1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const nx = -dz, nz = dx;
      const lx = pts[i][0] - nx * hw, lz = pts[i][1] - nz * hw, rx = pts[i][0] + nx * hw, rz = pts[i][1] + nz * hw;
      const vl = g.vert(lx, H(lx, lz) + Y, lz, -hw / 4, s / 4);
      const vr = g.vert(rx, H(rx, rz) + Y, rz, hw / 4, s / 4);
      // skip pieces that lie under the circuit
      if (prevL >= 0 && track.distanceTo(pts[i][0], pts[i][1]) > WALL - 0.5) {
        g.triUp(prevL, prevR, vr); g.triUp(prevL, vr, vl);
      }
      prevL = vl; prevR = vr;
    }
    // junction caps at the ends
    for (const e of [r.p[0], r.p[r.p.length - 1]]) {
      if (track.distanceTo(e[0], e[1]) < WALL + 2) continue;
      const c = g.vert(e[0], H(e[0], e[1]) + Y, e[1], e[0] / 4, e[1] / 4);
      const ring = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const x = e[0] + Math.cos(a) * hw, z = e[1] + Math.sin(a) * hw;
        ring.push(g.vert(x, H(x, z) + Y, z, x / 4, z / 4));
      }
      for (let k = 0; k < 10; k++) g.triUp(c, ring[k], ring[(k + 1) % 10]);
    }
    // plazas (closed living streets, e.g. the two small squares of Tichá): fill interior
    if (closed) {
      const poly = r.p.slice(0, -1);
      const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const base = poly.map((p) => g.vert(p[0], H(p[0], p[1]) + Y, p[1], p[0] / 4, p[1] / 4));
      for (const t of tris) g.triUp(base[t[0]], base[t[1]], base[t[2]]);
    }
  }
  const opts = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95 };
  const m1 = new THREE.Mesh(asphalt.build(), lambert({ map: T.asphalt, ...opts }));
  const m2 = new THREE.Mesh(paving.build(), lambert({ map: T.paving, ...opts }));
  m1.receiveShadow = m2.receiveShadow = true;
  scene.add(m1, m2);
}

// ---------------------------------------------------------------------------
// Buildings from OSM footprints, styled after the street-level imagery:
//  - Tichá: new detached houses — white/grey cubes, flat roofs, large dark windows
//  - older streets (Chlumčanská, Oty Kovala…): 1–2 storey houses with hipped
//    red tile roofs, beige plaster, brick plinth
// ---------------------------------------------------------------------------
const OLD_COLS = ['#e8dcc0', '#dcd3bf', '#efe0a2', '#e6cba8', '#d4d6d0', '#f0ece2', '#dcc0a0', '#e9d8b0', '#c9c4b5'];
const NEW_COLS = ['#f5f5f3', '#ecebe8', '#dededc', '#c3c7ca', '#f2efe8', '#b9bcbf'];
const ROOF_COLS = ['#a8472e', '#94402b', '#7b3a2a', '#b35a3a', '#5a4a44', '#4a4d52', '#8a3b2b'];

function orientCW(p) {
  // make edges' right-hand normal point outward (see GeoBuilder winding)
  return polyArea(p) > 0 ? [...p].reverse() : p;
}

// Spatial tiles so that frustum culling (incl. the shadow pass) can skip far geometry
const TILE = 260;
const tileKey = (x, z) => Math.floor((x + 1000) / TILE) * 1000 + Math.floor((z + 1000) / TILE);

function buildBuildings(track, T, scene, R) {
  const tiles = new Map();
  const tileBuilders = (x, z) => {
    const k = tileKey(x, z);
    if (!tiles.has(k)) tiles.set(k, {
      modern: new GeoBuilder(), old: new GeoBuilder(), plain: new GeoBuilder(),
      roof: new GeoBuilder(), flat: new GeoBuilder(), brick: new GeoBuilder(),
    });
    return tiles.get(k);
  };
  const footprints = [];
  const col = new THREE.Color();
  for (const b of MAP.buildings) {
    if (b.p.length < 3) continue;
    let p = orientCW(b.p);
    // keep the circuit corridor clear
    let near = Infinity;
    for (const q of p) near = Math.min(near, track.distanceTo(q[0], q[1]));
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
    near = Math.min(near, track.distanceTo(cx, cz));
    if (near < WALL + 0.6) continue;
    const B = tileBuilders(cx, cz);
    const area = Math.abs(polyArea(p));
    const small = area < 30;
    const t = b.t;
    let style;
    const nearTicha = Math.hypot(cx - 0, cz - 0) < 75;
    if (t === 'garage' || t === 'garages' || t === 'shed' || t === 'transformer_tower' || small) style = 'garage';
    else if (t === 'industrial' || t === 'warehouse' || t === 'barn') style = 'shed';
    else if (b.y >= 1995 || (b.y === 0 && nearTicha && area < 260)) style = 'modern';
    else style = 'old';

    let levels = Math.max(1, Math.min(10, b.l || 1));
    let wallH;
    if (style === 'garage') wallH = 2.6;
    else if (style === 'shed') wallH = 5;
    else wallH = levels * 3 + 0.4;

    let gmin = Infinity, gmax = -Infinity;
    for (const q of p) { const h = H(q[0], q[1]); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
    const base = gmin - 0.6, ref = gmax + 0.3, top = ref + wallH;
    footprints.push({ p, minX: Math.min(...p.map((q) => q[0])), maxX: Math.max(...p.map((q) => q[0])), minZ: Math.min(...p.map((q) => q[1])), maxZ: Math.max(...p.map((q) => q[1])) });

    const wb = style === 'modern' ? B.modern : style === 'old' ? B.old : B.plain;
    const palette = style === 'modern' ? NEW_COLS : style === 'old' || style === 'shed' ? OLD_COLS : ['#c9c7c2', '#b8b6b0', '#d6d2c8', '#a9a7a2'];
    col.set(palette[Math.floor(R() * palette.length)]);
    const cellW = 3.2;
    let per = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.05) continue;
      const u0 = per / cellW, u1 = (per + len) / cellW;
      const v0 = (base - ref) / 3, v1 = (top - ref) / 3;
      const k0 = wb.vert(a[0], base, a[1], u0, v0, col), k1 = wb.vert(c[0], base, c[1], u1, v0, col);
      const k2 = wb.vert(c[0], top, c[1], u1, v1, col), k3 = wb.vert(a[0], top, a[1], u0, v1, col);
      wb.quad(k0, k1, k2, k3);
      per += len;
      if (style === 'old') {
        // brick plinth, slightly proud of the wall
        const o = 0.06;
        const dx = (c[0] - a[0]) / len, dz = (c[1] - a[1]) / len;
        const nx = -dz * o, nz = dx * o;
        const pb = ref + 0.5;
        const b0 = B.brick.vert(a[0] + nx, base, a[1] + nz, (per - len) / 2, 0), b1 = B.brick.vert(c[0] + nx, base, c[1] + nz, per / 2, 0);
        const b2 = B.brick.vert(c[0] + nx, pb, c[1] + nz, per / 2, (pb - base) / 1), b3 = B.brick.vert(a[0] + nx, pb, a[1] + nz, (per - len) / 2, (pb - base) / 1);
        B.brick.quad(b0, b1, b2, b3);
      }
    }

    // roof
    const flatRoof = () => {
      const contour = p.map((q) => new THREE.Vector2(q[0], q[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const rc = new THREE.Color(style === 'modern' ? '#8a8d90' : '#6d6a66');
      const y = style === 'modern' ? top - 0.25 : top;
      const vs = p.map((q) => B.flat.vert(q[0], y, q[1], q[0] / 3, q[1] / 3, rc));
      for (const t3 of tris) B.flat.triUp(vs[t3[0]], vs[t3[1]], vs[t3[2]]);
    };
    if (style === 'modern' || style === 'garage' || style === 'shed' && area > 400) {
      flatRoof();
      continue;
    }
    // oriented bounding box along the longest edge
    let best = 0, ax = 1, az = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > best) { best = l; ax = (c[0] - a[0]) / l; az = (c[1] - a[1]) / l; }
    }
    let bx = -az, bz = ax;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const q of p) {
      const u = q[0] * ax + q[1] * az, v = q[0] * bx + q[1] * bz;
      amin = Math.min(amin, u); amax = Math.max(amax, u); bmin = Math.min(bmin, v); bmax = Math.max(bmax, v);
    }
    const obbArea = (amax - amin) * (bmax - bmin);
    if (area / obbArea < 0.72 || (bmax - bmin) > 16) { flatRoof(); continue; }
    if (amax - amin < bmax - bmin) {
      // swap axes so "a" is the long one
      [ax, az, bx, bz] = [bx, bz, -ax, -az];
      [amin, amax, bmin, bmax] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const q of p) {
        const u = q[0] * ax + q[1] * az, v = q[0] * bx + q[1] * bz;
        amin = Math.min(amin, u); amax = Math.max(amax, u); bmin = Math.min(bmin, v); bmax = Math.max(bmax, v);
      }
    }
    const ov = 0.45;
    amin -= ov; amax += ov; bmin -= ov; bmax += ov;
    const W = bmax - bmin, L = amax - amin;
    const rh = (W / 2) * 0.78;
    const W2 = (u, v) => [u * ax + v * bx, u * az + v * bz];
    const rc = new THREE.Color(ROOF_COLS[Math.floor(R() * ROOF_COLS.length)]);
    const bm = (bmin + bmax) / 2;
    const hipped = R() < 0.65;
    const inset = hipped ? Math.min(W / 2, L / 2) : 0;
    const e = top - 0.15;
    const c1 = W2(amin, bmin), c2 = W2(amax, bmin), c3 = W2(amax, bmax), c4 = W2(amin, bmax);
    const r1 = W2(amin + inset, bm), r2 = W2(amax - inset, bm);
    const RB = B.roof;
    const v = (q, y, u, vv) => RB.vert(q[0], y, q[1], u, vv, rc);
    const slope = Math.hypot(W / 2, rh);
    // long sides
    {
      const a = v(c1, e, 0, 0), b2 = v(c2, e, L / 2, 0), c = v(r2, e + rh, (L - inset) / 2, slope / 1.5), d = v(r1, e + rh, inset / 2, slope / 1.5);
      RB.triUp(a, b2, c); RB.triUp(a, c, d);
      const a2 = v(c3, e, 0, 0), b3 = v(c4, e, L / 2, 0), c5 = v(r1, e + rh, (L - inset) / 2, slope / 1.5), d2 = v(r2, e + rh, inset / 2, slope / 1.5);
      RB.triUp(a2, b3, c5); RB.triUp(a2, c5, d2);
    }
    if (hipped) {
      RB.triUp(v(c2, e, 0, 0), v(c3, e, W / 2, 0), v(r2, e + rh, W / 4, slope / 1.5));
      RB.triUp(v(c4, e, 0, 0), v(c1, e, W / 2, 0), v(r1, e + rh, W / 4, slope / 1.5));
    } else {
      // gable walls
      const g1 = W2(amin + ov, bmin + ov), g2 = W2(amin + ov, bmax - ov), gt = W2(amin + ov, bm);
      const g3 = W2(amax - ov, bmin + ov), g4 = W2(amax - ov, bmax - ov), gt2 = W2(amax - ov, bm);
      const PL = B.plain;
      for (const [x1, x2, xt] of [[g1, g2, gt], [g3, g4, gt2]]) {
        const i1 = PL.vert(x1[0], e, x1[1], 0, 0, col), i2 = PL.vert(x2[0], e, x2[1], 1, 0, col), i3 = PL.vert(xt[0], e + rh - 0.3, xt[1], 0.5, 1, col);
        PL.tri(i1, i2, i3);
      }
    }
    // chimney
    if (R() < 0.7) {
      const q = W2(amin + L * (0.3 + R() * 0.4), bm + (R() - 0.5) * W * 0.3);
      const cc = new THREE.Color('#9a6450');
      const s = 0.3, y0 = e + rh * 0.4, y1 = e + rh + 0.9;
      const PL = B.plain;
      const pts = [[q[0] - s, q[1] - s], [q[0] + s, q[1] - s], [q[0] + s, q[1] + s], [q[0] - s, q[1] + s]];
      for (let i = 0; i < 4; i++) {
        const a = pts[i], c = pts[(i + 1) % 4];
        PL.quad(PL.vert(a[0], y0, a[1], 0, 0, cc), PL.vert(c[0], y0, c[1], 0, 0, cc), PL.vert(c[0], y1, c[1], 0, 0, cc), PL.vert(a[0], y1, a[1], 0, 0, cc));
      }
    }
  }
  const mats = {
    modern: lambert({ map: T.facadeModern, vertexColors: true, roughness: 0.85 }),
    old: lambert({ map: T.facadeOld, vertexColors: true, roughness: 0.9 }),
    plain: lambert({ map: T.plaster, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    roof: lambert({ map: T.roof, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    flat: lambert({ vertexColors: true, roughness: 0.95 }),
    brick: lambert({ map: T.brick, roughness: 0.95 }),
  };
  for (const B of tiles.values()) {
    for (const k in B) {
      if (B[k].empty) continue;
      const m = new THREE.Mesh(B[k].build(), mats[k]);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
  }
  return footprints;
}

// ---------------------------------------------------------------------------
// Vegetation
// ---------------------------------------------------------------------------
function buildTrees(track, scene, R, footprints) {
  const grid = new SpatialGrid(20);
  for (const f of footprints) grid.insertBox(f.minX - 2, f.minZ - 2, f.maxX + 2, f.maxZ + 2, f);
  const roads = MAP.roads.filter((r) => ['residential', 'living_street', 'tertiary', 'service', 'pedestrian'].includes(r.t));
  const roadGrid = new SpatialGrid(25);
  for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) {
    const a = r.p[i], b = r.p[i + 1];
    roadGrid.insertBox(Math.min(a[0], b[0]) - 6, Math.min(a[1], b[1]) - 6, Math.max(a[0], b[0]) + 6, Math.max(a[1], b[1]) + 6, [a, b, roadWidth(r.t) / 2]);
  }
  const free = (x, z, margin) => {
    for (const f of grid.query(x, z)) {
      if (x > f.minX - margin && x < f.maxX + margin && z > f.minZ - margin && z < f.maxZ + margin && pointInPoly(x, z, f.p)) return false;
      if (x > f.minX - margin && x < f.maxX + margin && z > f.minZ - margin && z < f.maxZ + margin) {
        // near a building: check distance to edges
        for (let i = 0; i < f.p.length; i++) {
          const a = f.p[i], b = f.p[(i + 1) % f.p.length];
          if (distSeg(x, z, a[0], a[1], b[0], b[1]) < margin) return false;
        }
      }
    }
    for (const [a, b, hw] of roadGrid.query(x, z)) if (distSeg(x, z, a[0], a[1], b[0], b[1]) < hw + 1.5) return false;
    return true;
  };
  const woods = MAP.areas.filter((a) => a.t === 'wood' || a.t === 'scrub');
  const deciduous = [], conifers = [];
  // gardens
  let tries = 0;
  while (deciduous.length + conifers.length < 1100 && tries++ < 20000) {
    const x = (R() * 2 - 1) * DATA_R, z = (R() * 2 - 1) * DATA_R;
    if (track.distanceTo(x, z) < WALL + 2.5) continue;
    if (!free(x, z, 2.2)) continue;
    const inWood = woods.some((w) => pointInPoly(x, z, w.p));
    const t = { x, z, y: H(x, z), s: 0.7 + R() * 0.7 };
    if (inWood || R() < 0.3) conifers.push(t); else deciduous.push(t);
  }
  // woods (dense)
  for (const w of woods) {
    const xs = w.p.map((q) => q[0]), zs = w.p.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const n = Math.min(400, Math.abs(polyArea(w.p)) / 40);
    for (let i = 0; i < n * 2; i++) {
      const x = minX + R() * (maxX - minX), z = minZ + R() * (maxZ - minZ);
      if (!pointInPoly(x, z, w.p) || track.distanceTo(x, z) < WALL + 3) continue;
      (R() < 0.6 ? conifers : deciduous).push({ x, z, y: H(x, z), s: 0.9 + R() * 0.6 });
    }
  }
  // horizon forest belt (never casts shadows, it is far away)
  const belt = [];
  for (let i = 0; i < 1000; i++) {
    const a = R() * Math.PI * 2, r = 470 + R() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    belt.push({ x, z, y: H(x, z), s: 1.3 + R() * 0.9, belt: true });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const byTile = (list) => {
    const map = new Map();
    for (const t of list) {
      const k = t.belt ? 'belt' + Math.floor(Math.atan2(t.z, t.x) * 3) : tileKey(t.x, t.z);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return map.values();
  };
  const trunkD = new THREE.CylinderGeometry(0.18, 0.25, 3, 6); trunkD.translate(0, 1.5, 0);
  const crownD = new THREE.IcosahedronGeometry(2.4, 1); crownD.translate(0, 4.6, 0);
  const coneC = new THREE.ConeGeometry(1.7, 6.5, 8); coneC.translate(0, 4, 0);
  const trunkC = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5); trunkC.translate(0, 0.6, 0);
  const matTrunkD = lambert({ color: 0x5a4330 }), matCrownD = lambert({ color: 0xffffff, flatShading: true });
  const matConeC = lambert({ color: 0xffffff, flatShading: true }), matTrunkC = lambert({ color: 0x4a3626 });
  const addSet = (list, trunkGeo, crownGeo, trunkMat, crownMat, colorFn, yScale) => {
    for (const set of byTile(list)) {
      const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, set.length);
      const cm = new THREE.InstancedMesh(crownGeo, crownMat, set.length);
      set.forEach((t, k) => {
        q.setFromAxisAngle(up, R() * 6.28);
        m.compose(v.set(t.x, t.y, t.z), q, sc.set(t.s, t.s * yScale(), t.s));
        tm.setMatrixAt(k, m); cm.setMatrixAt(k, m);
        cm.setColorAt(k, colorFn());
      });
      tm.computeBoundingSphere(); cm.computeBoundingSphere();
      const shadows = !set[0].belt;
      tm.castShadow = cm.castShadow = shadows;
      scene.add(tm, cm);
    }
  };
  addSet(deciduous, trunkD, crownD, matTrunkD, matCrownD, () => c.setHSL(0.22 + R() * 0.08, 0.45 + R() * 0.15, 0.26 + R() * 0.1), () => 0.9 + R() * 0.3);
  addSet([...conifers, ...belt], trunkC, coneC, matTrunkC, matConeC, () => c.setHSL(0.3 + R() * 0.06, 0.4, 0.17 + R() * 0.08), () => 0.8 + R() * 0.5);
}

// ---------------------------------------------------------------------------
// Sky, distant hills, clouds
// ---------------------------------------------------------------------------
function buildSky(scene, T, R) {
  const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f82d8) }, bottom: { value: new THREE.Color(0xcfe3f5) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // rolling hills ring (Plzeň basin horizon)
  const seg = 128, pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const h = 25 + 18 * Math.sin(a * 3 + 1) + 12 * Math.sin(a * 7 + 2) + 8 * Math.sin(a * 13) + 20 * Math.max(0, Math.sin(a - 0.6));
    for (const [r, y] of [[700, -3], [1100, h], [1600, h * 1.6 + 20]]) pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, b = a + 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setIndex(idx); hg.computeVertexNormals();
  const hills = new THREE.Mesh(hg, lambert({ color: 0x55773f, roughness: 1, side: THREE.DoubleSide, flatShading: true }));
  scene.add(hills);

  const cloudMat = new THREE.SpriteMaterial({ map: T.cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = R() * Math.PI * 2, r = 600 + R() * 1400;
    s.position.set(Math.cos(a) * r, 180 + R() * 220, Math.sin(a) * r);
    const w = 260 + R() * 320;
    s.scale.set(w, w / 2, 1);
    scene.add(s);
  }
}

// Parked cars on the side streets (decor)
function buildParkedCars(track, scene, R) {
  const colors = [0xf1f1f1, 0x2b2b2b, 0x9aa3ad, 0x8b1a1a, 0x1c3f7a, 0xc0c0c0];
  const bodyGeo = new THREE.BoxGeometry(1.8, 0.8, 4.2); bodyGeo.translate(0, 0.65, 0);
  const cabGeo = new THREE.BoxGeometry(1.6, 0.6, 2.2); cabGeo.translate(0, 1.35, -0.2);
  const glass = lambert({ color: 0x223344, roughness: 0.2, metalness: 0.5 });
  const roads = MAP.roads.filter((r) => r.t === 'residential' || r.t === 'living_street');
  for (let n = 0; n < 34; n++) {
    const r = roads[Math.floor(R() * roads.length)];
    const i = Math.floor(R() * (r.p.length - 1));
    const a = r.p[i], b = r.p[i + 1];
    const t = R();
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz); if (l < 8) continue;
    dx /= l; dz /= l;
    const side = R() < 0.5 ? -1 : 1;
    const x = a[0] + (b[0] - a[0]) * t - dz * side * 2.3, z = a[1] + (b[1] - a[1]) * t + dx * side * 2.3;
    if (Math.abs(x) > DATA_R || Math.abs(z) > DATA_R || track.distanceTo(x, z) < WALL + 4) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, lambert({ color: colors[Math.floor(R() * colors.length)], metalness: 0.4, roughness: 0.4 }));
    const cab = new THREE.Mesh(cabGeo, glass);
    body.castShadow = true; cab.castShadow = true;
    g.add(body, cab);
    g.position.set(x, H(x, z) + 0.05, z);
    g.rotation.y = Math.atan2(dx, dz);
    scene.add(g);
  }
}

export function buildWorld(track, T, scene) {
  const R = rng(2024);
  const dist = trackDistanceField(track);
  H = (x, z) => {
    const y = groundHeight(x, z);
    const t = dist(x, z);
    if (!t) return y;
    return t.y + (y - t.y) * smoothstep(WALL + 1.5, WALL + 9, t.d) - (t.d < WALL + 1.5 ? 0.15 : 0);
  };
  const terrain = buildTerrain(track, T, scene, R);
  buildRoads(track, T, scene);
  const footprints = buildBuildings(track, T, scene, R);
  buildTrees(track, scene, R, footprints);
  buildSky(scene, T, R);
  buildParkedCars(track, scene, R);
  return { groundCanvas: terrain.canvas, footprints, height: H };
}
