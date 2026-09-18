import * as THREE from 'three';
import { pick } from '../core/util.js';

// Low-poly scenery built from primitives. Materials are cached and shared.
const cache = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, ...extra }));
  return cache.get(key);
}

function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const TRUNK = 0x5e4028;
const LEAVES = [0x2f5a2a, 0x3b6b2e, 0x2a4f2c, 0x4a7532];

export function pineTree(r) {
  const g = new THREE.Group();
  const h = 3 + r() * 3.5;
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.22, h * 0.4, 5), mat(TRUNK), 0, h * 0.2, 0));
  const c = pick(LEAVES, r);
  for (let i = 0; i < 3; i++) {
    const rad = (1.4 - i * 0.35) * (0.8 + h * 0.06);
    const cone = mesh(new THREE.ConeGeometry(rad, h * 0.45, 7), mat(c), 0, h * 0.38 + i * h * 0.19, 0);
    cone.rotation.y = r() * 3;
    g.add(cone);
  }
  return g;
}

export function oakTree(r) {
  const g = new THREE.Group();
  const h = 2.2 + r() * 1.8;
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6), mat(TRUNK), 0, h / 2, 0));
  const c = pick(LEAVES, r);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.9 + r() * 0.9;
    const blob = mesh(new THREE.IcosahedronGeometry(s, 0), mat(c), (r() - 0.5) * 1.8, h + (r() - 0.2) * 1.2, (r() - 0.5) * 1.4);
    blob.rotation.set(r() * 3, r() * 3, 0);
    g.add(blob);
  }
  return g;
}

export function deadTree(r) {
  const g = new THREE.Group();
  const h = 2.5 + r() * 2;
  const wood = mat(0x4a3b2e);
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.25, h, 5), wood, 0, h / 2, 0));
  for (let i = 0; i < 4; i++) {
    const len = 0.8 + r() * 1.2;
    const b = mesh(new THREE.CylinderGeometry(0.03, 0.08, len, 4), wood, 0, h * (0.5 + r() * 0.45), 0);
    b.rotation.set((r() - 0.5) * 1.5, r() * 6, (r() > 0.5 ? 1 : -1) * (0.6 + r() * 0.6));
    b.translateY(len / 2);
    g.add(b);
  }
  return g;
}

export function rock(r, s = 1) {
  const m = mesh(new THREE.DodecahedronGeometry(s * (0.4 + r() * 0.6), 0), mat(pick([0x7d7a72, 0x8c877c, 0x6e6a62], r)));
  m.scale.y = 0.55 + r() * 0.3;
  m.rotation.set(r() * 3, r() * 3, r() * 3);
  m.position.y = 0.1 * s;
  return m;
}

export function bush(r) {
  const m = mesh(new THREE.IcosahedronGeometry(0.4 + r() * 0.4, 0), mat(pick(LEAVES, r)));
  m.scale.y = 0.6;
  m.position.y = 0.2;
  m.rotation.y = r() * 3;
  return m;
}

export function grassTuft(r) {
  const g = new THREE.Group();
  const c = mat(pick([0x6b8a36, 0x7a9a3c, 0x5b7a2e], r));
  for (let i = 0; i < 3; i++) {
    const blade = mesh(new THREE.ConeGeometry(0.06, 0.4 + r() * 0.3, 3), c, (r() - 0.5) * 0.3, 0.2, (r() - 0.5) * 0.3, false);
    blade.rotation.z = (r() - 0.5) * 0.6;
    g.add(blade);
  }
  return g;
}

export function hut() {
  const g = new THREE.Group();
  const wall = mat(0x7a5a3a), roof = mat(0xb8944a), dark = mat(0x2a1c12);
  g.add(mesh(new THREE.BoxGeometry(3.2, 2, 3), wall, 0, 1, 0));
  const r = mesh(new THREE.ConeGeometry(2.8, 2, 4), roof, 0, 3, 0);
  r.rotation.y = Math.PI / 4;
  g.add(r);
  g.add(mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), dark, 0.3, 0.65, 1.52, false));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), dark, -0.9, 1.2, 1.52, false));
  return g;
}

export function fence(len = 6) {
  const g = new THREE.Group();
  const w = mat(0x6b4a2b);
  const n = Math.max(2, Math.round(len / 1.5));
  for (let i = 0; i < n; i++) {
    const post = mesh(new THREE.BoxGeometry(0.14, 1.2, 0.14), w, i * 1.5, 0.6, 0);
    post.rotation.z = (Math.sin(i * 7.3) * 0.15);
    g.add(post);
  }
  for (const y of [0.45, 0.9]) g.add(mesh(new THREE.BoxGeometry((n - 1) * 1.5, 0.1, 0.08), w, ((n - 1) * 1.5) / 2, y, 0));
  return g;
}

export function skullPole() {
  const g = new THREE.Group();
  const bone = mat(0xe6dcc0), dark = mat(0x1a1410);
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 5), mat(0x5a4030), 0, 1.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), bone, 0, 2.3, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.24), bone, 0.02, 2.13, 0));
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.08, 0.07), dark, 0.15, 2.33, 0.07, false));
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.08, 0.07), dark, 0.15, 2.33, -0.07, false));
  g.rotation.y = -1.0; // face the camera
  return g;
}

// Returns a group with userData.update(time) for the flickering flames.
export function campfire() {
  const g = new THREE.Group();
  const wood = mat(0x4a3020);
  for (let i = 0; i < 4; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 5), wood, 0, 0.1, 0);
    log.rotation.set(Math.PI / 2, i * 0.8, 0.2);
    g.add(log);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(new THREE.DodecahedronGeometry(0.14, 0), mat(0x6e6a62), Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55));
  }
  const flames = [];
  for (const [c, s] of [[0xff5a00, 0.35], [0xffaa00, 0.25], [0xffee88, 0.14]]) {
    const f = mesh(new THREE.ConeGeometry(s, s * 3, 5), new THREE.MeshBasicMaterial({ color: c }), 0, s * 1.5 + 0.1, 0, false);
    flames.push(f);
    g.add(f);
  }
  const light = new THREE.PointLight(0xff8a30, 6, 9, 1.6);
  light.position.y = 1;
  g.add(light);
  g.userData.update = (t) => {
    flames.forEach((f, i) => {
      f.scale.y = 1 + Math.sin(t * (9 + i * 3) + i) * 0.2;
      f.rotation.y = t * (1 + i);
    });
    light.intensity = 5 + Math.sin(t * 13) * 1.2 + Math.sin(t * 7.3) * 0.8;
  };
  return g;
}

export function ruin(r) {
  const g = new THREE.Group();
  const stone = mat(0x9a9588);
  for (let i = 0; i < 4; i++) {
    const h = 1 + r() * 3;
    const col = mesh(new THREE.CylinderGeometry(0.35, 0.4, h, 7), stone, i * 2.2, h / 2, (r() - 0.5));
    col.rotation.z = (r() - 0.5) * 0.12;
    g.add(col);
  }
  for (let i = 0; i < 5; i++) {
    const b = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), stone, r() * 7, 0.25, 1 + r() * 1.5);
    b.rotation.y = r() * 3;
    g.add(b);
  }
  return g;
}

export function stoneArch() {
  const g = new THREE.Group();
  const stone = mat(0x8a8578);
  g.add(mesh(new THREE.BoxGeometry(1, 4.5, 1), stone, -2.4, 2.25, 0));
  g.add(mesh(new THREE.BoxGeometry(1, 4.5, 1), stone, 2.4, 2.25, 0));
  g.add(mesh(new THREE.BoxGeometry(6, 0.9, 1.2), stone, 0, 4.9, 0));
  const skull = skullPole();
  skull.position.set(0, 3.5, 0);
  g.add(skull);
  return g;
}

export function mountain(r, h) {
  const g = new THREE.Group();
  const m = mesh(new THREE.ConeGeometry(h * 0.9, h, 6), mat(pick([0x6a6f8a, 0x5f6580, 0x747a92], r)), 0, h / 2, 0, false);
  m.rotation.y = r() * 3;
  g.add(m);
  const cap = mesh(new THREE.ConeGeometry(h * 0.9 * 0.28, h * 0.28, 6), mat(0xf2f4f8), 0, h - h * 0.14 + 0.05, 0, false);
  cap.rotation.y = m.rotation.y;
  g.add(cap);
  return g;
}

export function hill(r, s) {
  const m = mesh(new THREE.IcosahedronGeometry(s, 1), mat(pick([0x4f6b30, 0x5b7a36, 0x46612b], r)), 0, -s * 0.35, 0, false);
  m.scale.y = 0.45;
  return m;
}
