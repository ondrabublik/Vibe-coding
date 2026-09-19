import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, ridged, smoothstep, lerp, clamp, mulberry32, makeCanvas, cloudTexture } from './util.js';
import { buildJet } from './aircraftModel.js';

// World: 40 × 40 km island, airbase in the middle, runway along the Z axis
// (−Z = north). Heights are sampled on a grid and interpolated exactly like
// the rendered triangles, so physics and graphics always agree.
export const BASE_H = 60;
export const PAVE = 0.25; // paved surfaces sit slightly above the grass
const SIZE = 40000, N = 256, CELL = SIZE / N, HALF = SIZE / 2;

export const RUNWAY = { halfW: 22.5, halfL: 1500 };
const PAVED = [
  { x0: -22.5, x1: 22.5, z0: -1500, z1: 1500, kind: 'runway' },
  { x0: 150, x1: 170, z0: -1345, z1: 1345, kind: 'taxi', alongZ: true },
  { x0: 22.5, x1: 150, z0: 1320, z1: 1340, kind: 'taxi' },
  { x0: 22.5, x1: 150, z0: -1340, z1: -1320, kind: 'taxi' },
  { x0: 22.5, x1: 150, z0: -10, z1: 10, kind: 'taxi' },
  { x0: 170, x1: 420, z0: -260, z1: 260, kind: 'apron' },
];
const FLAT = { hx: 900, hz: 2400, blend: 1800 };

function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  const coast = 14500 + fbm(x * 0.00011 + 3.1, z * 0.00011 - 7.3, 4) * 6000;
  const land = 1 - smoothstep(coast - 3000, coast + 1200, r);
  let h = -120 + land * (175 + fbm(x / 2600, z / 2600, 5) * 120);
  // keep the approach corridors along the runway axis free of mountains
  const az = Math.abs(z), corr = az < 9000 ? Math.abs(x) : Math.hypot(x, az - 9000);
  const mask = smoothstep(2500, 8000, r) * smoothstep(1200, 4500, corr) * land;
  const m = ridged(x / 6500 + 11.3, z / 6500 - 4.1, 5);
  h += Math.pow(m, 2.2) * 2200 * mask;
  // flatten the airbase
  const dx = Math.max(0, Math.abs(x) - FLAT.hx), dz = Math.max(0, Math.abs(z) - FLAT.hz);
  const t = smoothstep(0, FLAT.blend, Math.hypot(dx, dz));
  return lerp(BASE_H, h, t);
}

const forestDensity = (x, z) => fbm(x / 1800 + 40, z / 1800 + 40, 3);

export class Terrain {
  constructor() {
    const n1 = N + 1;
    this.h = new Float32Array(n1 * n1);
    for (let j = 0; j < n1; j++)
      for (let i = 0; i < n1; i++) this.h[j * n1 + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
  }

  heightAt(x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= N || gz >= N) return -120;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j, n1 = N + 1, h = this.h;
    const a = h[j * n1 + i], b = h[j * n1 + i + 1], c = h[(j + 1) * n1 + i], d = h[(j + 1) * n1 + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  isPaved(x, z) {
    for (const r of PAVED) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
    return false;
  }

  isRunway(x, z) {
    return Math.abs(x) <= RUNWAY.halfW && Math.abs(z) <= RUNWAY.halfL;
  }

  inAirbase(x, z) {
    return Math.abs(x) < FLAT.hx && Math.abs(z) < FLAT.hz;
  }

  /** Solid ground (may be below sea level). */
  groundAt(x, z) {
    return this.heightAt(x, z) + (this.isPaved(x, z) ? PAVE : 0);
  }

  /** What an aircraft would hit: ground or the sea surface. */
  surfaceAt(x, z) {
    return Math.max(this.groundAt(x, z), 0);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 25;
    return out
      .set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e))
      .normalize();
  }
}

// ---------------------------------------------------------------------------
// Terrain mesh
// ---------------------------------------------------------------------------
function detailTexture() {
  const s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const rng = mulberry32(3);
  for (let i = 0; i < s * s; i++) {
    const x = i % s, y = (i / s) | 0;
    const v = 200 + 30 * Math.sin(x * 0.3 + Math.sin(y * 0.21) * 2) * 0.3 + rng() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = clamp(v, 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function terrainMesh(terrain, anisotropy) {
  const n1 = N + 1, cnt = n1 * n1;
  const pos = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2);
  const color = new THREE.Color(), tmp = new THREE.Color();
  const H = terrain.h;
  const hAt = (i, j) => H[clamp(j, 0, N) * n1 + clamp(i, 0, N)];
  for (let j = 0; j < n1; j++) {
    for (let i = 0; i < n1; i++) {
      const k = j * n1 + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      uv[k * 2] = (i / N) * (SIZE / 90);
      uv[k * 2 + 1] = (j / N) * (SIZE / 90);

      const steep = Math.hypot(hAt(i + 1, j) - hAt(i - 1, j), hAt(i, j + 1) - hAt(i, j - 1)) / (2 * CELL);
      const n = fbm(x / 900, z / 900, 3);
      if (h < 4) color.setRGB(0.78, 0.72, 0.52, THREE.SRGBColorSpace);
      else {
        color.setRGB(lerp(0.33, 0.47, n + 0.5), lerp(0.47, 0.56, n + 0.5), lerp(0.2, 0.25, n + 0.5), THREE.SRGBColorSpace);
        if (forestDensity(x, z) > 0.05 && h < 1100) color.lerp(tmp.setRGB(0.2, 0.32, 0.14, THREE.SRGBColorSpace), 0.55);
        if (h < 14) color.lerp(tmp.setRGB(0.72, 0.68, 0.5, THREE.SRGBColorSpace), 1 - (h - 4) / 10);
        const rock = clamp(smoothstep(0.32, 0.65, steep) + smoothstep(650, 1150, h) * 0.7, 0, 1);
        color.lerp(tmp.setRGB(0.47, 0.44, 0.4, THREE.SRGBColorSpace), rock);
        const snow = smoothstep(1250, 1550, h + n * 150) * (1 - smoothstep(0.55, 0.95, steep));
        color.lerp(tmp.setRGB(0.93, 0.95, 0.98, THREE.SRGBColorSpace), snow);
        if (terrain.inAirbase(x, z)) color.setRGB(0.4, 0.53, 0.25, THREE.SRGBColorSpace);
      }
      col[k * 3] = color.r;
      col[k * 3 + 1] = color.g;
      col[k * 3 + 2] = color.b;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let p = 0;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const map = detailTexture();
  map.anisotropy = anisotropy;
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Airbase
// ---------------------------------------------------------------------------
function asphalt(g, w, h, base = '#3a3c3f') {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const rng = mulberry32(w * 7 + h);
  for (let i = 0; i < (w * h) / 14; i++) {
    const v = rng() < 0.5 ? 30 : 90;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.12 + rng() * 0.18})`;
    g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

function runwayEndTexture(num) {
  const W = 256, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d');
  asphalt(g, W, H);
  const px = W / 45, py = H / 400; // pixels per metre across / along
  const yAt = (d) => H - d * py; // d = metres from the runway end
  // tyre marks in the touchdown zone
  const rng = mulberry32(num.charCodeAt(0));
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(15,15,15,${0.15 + rng() * 0.2})`;
    const x = W / 2 + (rng() - 0.5) * 16 * px;
    const d = 140 + rng() * 250;
    g.fillRect(x, yAt(d), 0.35 * px, (8 + rng() * 40) * py);
  }
  g.fillStyle = '#ececec';
  g.fillRect(px * 1, 0, px * 0.9, H); // edge lines
  g.fillRect(W - px * 1.9, 0, px * 0.9, H);
  g.fillRect(px, yAt(1.5), W - 2 * px, 1.2 * py); // threshold bar
  for (let k = 0; k < 8; k++) {
    const x = 3 + k * 2.3;
    g.fillRect(x * px, yAt(36), 1.7 * px, 30 * py);
    g.fillRect(W - (x + 1.7) * px, yAt(36), 1.7 * px, 30 * py);
  }
  // designator – squashed along the runway so it looks right once stretched
  g.save();
  g.translate(W / 2, yAt(48));
  g.scale(1, py / px);
  g.font = 'bold 120px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText(num, 0, 0);
  g.restore();
  // touchdown zone and aiming point
  for (const d of [150, 450 - 50]) {
    if (d > 380) continue;
    for (let k = 0; k < 3; k++) {
      g.fillRect(W / 2 - (6 + k * 2.6) * px - 1.6 * px, yAt(d + 22), 1.6 * px, 22 * py);
      g.fillRect(W / 2 + (6 + k * 2.6) * px, yAt(d + 22), 1.6 * px, 22 * py);
    }
  }
  g.fillRect(W / 2 - 14 * px, yAt(345), 6 * px, 45 * py);
  g.fillRect(W / 2 + 8 * px, yAt(345), 6 * px, 45 * py);
  // centre line
  for (let d = 70; d < 400; d += 50) g.fillRect(W / 2 - 0.45 * px, yAt(d + 30), 0.9 * px, 30 * py);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function runwayMidTexture() {
  const W = 128, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  asphalt(g, W, H);
  const px = W / 45, py = H / 60;
  g.fillStyle = '#ececec';
  g.fillRect(px * 1, 0, Math.max(2, px * 0.9), H);
  g.fillRect(W - px * 1.9, 0, Math.max(2, px * 0.9), H);
  g.fillRect(W / 2 - 1.2, 0, 2.4, 30 * py);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function taxiTexture() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  asphalt(g, 64, 64, '#45474a');
  g.fillStyle = '#e3b520';
  g.fillRect(30, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function concreteTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  asphalt(g, 128, 128, '#8d8f8f');
  g.strokeStyle = 'rgba(40,40,40,0.5)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function flatPlane(w, d, mat, x, y, z, rotY = 0) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.receiveShadow = true;
  return m;
}

function buildAirbase(scene, anisotropy) {
  const y = BASE_H + PAVE;
  const group = new THREE.Group();
  const texMat = (t, rx = 1, ry = 1) => {
    t.anisotropy = anisotropy;
    t.repeat.set(rx, ry);
    t.needsUpdate = true; // clones start without an uploaded image
    return new THREE.MeshLambertMaterial({ map: t });
  };
  // runway: two marked ends + repeating middle
  group.add(flatPlane(45, 400, texMat(runwayEndTexture('36')), 0, y, 1300));
  group.add(flatPlane(45, 400, texMat(runwayEndTexture('18')), 0, y, -1300, Math.PI));
  group.add(flatPlane(45, 2200, texMat(runwayMidTexture(), 1, 2200 / 60), 0, y, 0));
  const taxi = taxiTexture();
  for (const r of PAVED) {
    if (r.kind === 'runway') continue;
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (r.kind === 'apron') group.add(flatPlane(w, d, texMat(concreteTexture(), w / 12, d / 12), cx, y - 0.02, cz));
    else if (r.alongZ) group.add(flatPlane(w, d, texMat(taxi.clone(), 1, d / 20), cx, y - 0.01, cz));
    else group.add(flatPlane(d, w, texMat(taxi.clone(), 1, w / 20), cx, y - 0.01, cz, Math.PI / 2));
  }

  // runway edge lights
  const lightGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
  const edge = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), 2 * 51);
  const thr = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x40ff60 }), 2 * 12);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let z = -1500; z <= 1500; z += 60) {
    edge.setMatrixAt(k++, m4.makeTranslation(-25, y + 0.25, z));
    edge.setMatrixAt(k++, m4.makeTranslation(25, y + 0.25, z));
  }
  k = 0;
  for (let i = 0; i < 12; i++) {
    const x = -22 + i * 4;
    thr.setMatrixAt(k++, m4.makeTranslation(x, y + 0.25, 1503));
    thr.setMatrixAt(k++, m4.makeTranslation(x, y + 0.25, -1503));
  }
  group.add(edge, thr);

  // hangars
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.4, roughness: 0.6 });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a5057 });
  for (const hz of [-195, -65, 65, 195]) {
    const g = new THREE.CylinderGeometry(24, 24, 50, 20, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, hangarMat);
    m.position.set(470, BASE_H, hz);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    for (const side of [-1, 1]) {
      const dg = new THREE.CircleGeometry(24, 20, 0, Math.PI);
      dg.rotateY(side < 0 ? -Math.PI / 2 : Math.PI / 2);
      const d = new THREE.Mesh(dg, doorMat);
      d.position.set(470 + side * 25, BASE_H, hz);
      group.add(d);
    }
  }
  // control tower
  const concrete = new THREE.MeshLambertMaterial({ color: 0xc9c4b8 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 24, 8), concrete);
  tower.position.set(250, BASE_H + 12, 330);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(13, 5, 13),
    new THREE.MeshStandardMaterial({ color: 0x223a4e, metalness: 0.8, roughness: 0.15 })
  );
  cab.position.set(250, BASE_H + 26.5, 330);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.8, 14.5), concrete);
  roof.position.set(250, BASE_H + 29.4, 330);
  const building = new THREE.Mesh(new THREE.BoxGeometry(60, 9, 22), concrete);
  building.position.set(290, BASE_H + 4.5, 345);
  for (const m of [tower, cab, roof, building]) {
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // fuel tanks and radar dome
  const tankMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e0 });
  for (const [tx, tz] of [[540, 330], [540, 370], [580, 350]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 11, 20), tankMat);
    t.position.set(tx, BASE_H + 5.5, tz);
    t.castShadow = true;
    group.add(t);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12), tankMat);
  dome.position.set(-320, BASE_H + 14, 700);
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 8, 12), concrete);
  domeBase.position.set(-320, BASE_H + 4, 700);
  group.add(dome, domeBase);
  // windsock
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(60, BASE_H + 4, 1250);
  const sockG = new THREE.CylinderGeometry(0.9, 0.4, 5, 10, 1, true);
  sockG.rotateZ(Math.PI / 2);
  const sock = new THREE.Mesh(sockG, new THREE.MeshLambertMaterial({ color: 0xff6a00, side: THREE.DoubleSide }));
  sock.position.set(62.5, BASE_H + 7.6, 1250);
  group.add(pole, sock);
  // parked jets
  for (const pz of [-150, -60, 30]) {
    const jet = buildJet({ color: 0x9aa3ab, marking: 'cz' });
    jet.group.position.set(330, y + 2.0, pz);
    jet.group.rotation.y = Math.PI / 2;
    jet.parts.flame.visible = false;
    group.add(jet.group);
  }
  group.traverse((o) => {
    if (o.isMesh && o.parent === group && !o.castShadow) o.receiveShadow = true;
  });
  scene.add(group);
}

// ---------------------------------------------------------------------------
// Vegetation, villages, clouds, sky, water
// ---------------------------------------------------------------------------
function coloredGeo(geo, hex) {
  if (geo.index) geo = geo.toNonIndexed();
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function buildTrees(scene, terrain) {
  const trunk = () => coloredGeo(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 5).translate(0, 0.15, 0), 0x5a4030);
  const conifer = mergeGeometries([trunk(), coloredGeo(new THREE.ConeGeometry(0.28, 0.8, 7).translate(0, 0.6, 0), 0xffffff)]);
  const leafy = mergeGeometries([
    trunk(),
    coloredGeo(new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.58, 0), 0xffffff),
  ]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const COUNT = 5000;
  const meshes = [new THREE.InstancedMesh(conifer, mat, COUNT), new THREE.InstancedMesh(leafy, mat, COUNT)];
  const counts = [0, 0];
  const rng = mulberry32(11);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color(), nrm = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let tries = 0; tries < 90000 && counts[0] + counts[1] < COUNT * 2 - 2; tries++) {
    const x = (rng() - 0.5) * 32000, z = (rng() - 0.5) * 32000;
    if (Math.abs(x) < 1150 && Math.abs(z) < 2700) continue;
    const f = forestDensity(x, z);
    if (f < 0.05 && rng() > 0.03) continue;
    const h = terrain.heightAt(x, z);
    if (h < 10 || h > 1150) continue;
    if (terrain.normalAt(x, z, nrm).y < 0.8) continue;
    const type = h > 500 || rng() < 0.55 ? 0 : 1;
    if (counts[type] >= COUNT) continue;
    const H = 9 + rng() * 12;
    p.set(x, h - 0.5, z);
    q.setFromAxisAngle(up, rng() * 6.28);
    s.set(H * (0.8 + rng() * 0.4), H, H * (0.8 + rng() * 0.4));
    m4.compose(p, q, s);
    meshes[type].setMatrixAt(counts[type], m4);
    if (type === 0) col.setRGB(0.12 + rng() * 0.06, 0.26 + rng() * 0.08, 0.12 + rng() * 0.04, THREE.SRGBColorSpace);
    else col.setRGB(0.22 + rng() * 0.12, 0.36 + rng() * 0.12, 0.13 + rng() * 0.05, THREE.SRGBColorSpace);
    meshes[type].setColorAt(counts[type], col);
    counts[type]++;
  }
  meshes.forEach((m, i) => {
    m.count = counts[i];
    m.castShadow = false; // shadows only matter around the airbase, where there are no trees
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
  });
}

function buildVillages(scene, terrain) {
  const rng = mulberry32(21);
  const body = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofG = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const MAX = 400;
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial(), MAX);
  const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial(), MAX);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color(), nrm = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const walls = [0xf1ead8, 0xe8d6b0, 0xffffff, 0xd9cdb8, 0xefe2c2];
  const roofCols = [0xa2402a, 0x8e3222, 0x6a4a3a, 0xb5553a];
  let n = 0, villages = 0;
  for (let t = 0; t < 400 && villages < 7; t++) {
    const cx = (rng() - 0.5) * 24000, cz = (rng() - 0.5) * 24000;
    if (Math.hypot(cx, cz) < 3500) continue;
    const h = terrain.heightAt(cx, cz);
    if (h < 15 || h > 400 || terrain.normalAt(cx, cz, nrm).y < 0.97) continue;
    villages++;
    const houses = 35 + Math.floor(rng() * 25);
    for (let i = 0; i < houses && n < MAX; i++) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 320;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const hh = terrain.heightAt(x, z);
      if (hh < 3) continue;
      const w = 8 + rng() * 6, d = 9 + rng() * 7, ht = 5 + rng() * 3;
      q.setFromAxisAngle(up, rng() * 6.28);
      m4.compose(p.set(x, hh - 0.5, z), q, s.set(w, ht, d));
      bodies.setMatrixAt(n, m4);
      bodies.setColorAt(n, col.set(walls[Math.floor(rng() * walls.length)]));
      m4.compose(p.set(x, hh - 0.5 + ht, z), q, s.set(w, 3 + rng() * 2, d));
      roofs.setMatrixAt(n, m4);
      roofs.setColorAt(n, col.set(roofCols[Math.floor(rng() * roofCols.length)]));
      n++;
    }
  }
  for (const m of [bodies, roofs]) {
    m.count = n;
    scene.add(m);
  }
}

function buildClouds(scene) {
  const tex = cloudTexture();
  const rng = mulberry32(5);
  const mats = [0.95, 0.85, 0.75].map(
    (o) => new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: o, depthWrite: false, fog: true })
  );
  const group = new THREE.Group();
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, r = 1500 + Math.sqrt(rng()) * 17000;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 1700 + rng() * 1500;
    const puffs = 5 + Math.floor(rng() * 6);
    for (let k = 0; k < puffs; k++) {
      const sp = new THREE.Sprite(mats[Math.floor(rng() * 3)]);
      const s = 350 + rng() * 450;
      sp.scale.set(s * 1.4, s * 0.8, 1);
      sp.position.set(cx + (rng() - 0.5) * 900, cy + (rng() - 0.5) * 140, cz + (rng() - 0.5) * 900);
      group.add(sp);
    }
  }
  scene.add(group);
}

export const SUN_DIR = new THREE.Vector3(-0.45, 0.72, -0.35).normalize(); // direction *towards* the sun
export const HORIZON = new THREE.Color(0xc9dcea);

function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x2f6fbf) },
      horizon: { value: HORIZON.clone() },
      ground: { value: new THREE.Color(0xaec4d4) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50000, 32, 16), mat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(240000, 240000);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    geo,
    new THREE.MeshPhongMaterial({ color: 0x2b5f7e, specular: 0x6688aa, shininess: 80 })
  );
  water.position.y = 0;
  water.receiveShadow = true;
  scene.add(water);
}

export function buildWorld(scene, renderer) {
  const terrain = new Terrain();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  scene.add(terrainMesh(terrain, aniso));
  buildWater(scene);
  buildAirbase(scene, aniso);
  buildTrees(scene, terrain);
  buildVillages(scene, terrain);
  buildClouds(scene);
  const sky = buildSky(scene);
  return { terrain, sky };
}
