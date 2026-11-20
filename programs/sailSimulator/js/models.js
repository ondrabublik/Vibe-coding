import * as THREE from 'three';
import { DEG, clamp } from './physics.js';

// Lokální souřadnice modelu: x = levobok (+), y = výška nad hladinou, z = vpřed.

// ---------- trup ----------
function hullParams(spec) {
  if (spec.id === 'skiff') return { transom: 0.82, n: 3.4, sheer: 0.15, stern: 0.25 };
  if (spec.id === 'cruiser') return { transom: 0.72, n: 2.4, sheer: 0.22, stern: 0.15 };
  return { transom: 0.7, n: 2.3, sheer: 0.2, stern: 0.12 };
}

function hullSection(spec, s, P) {
  const B2 = spec.B / 2;
  let hb;
  if (s < 0.55) hb = B2 * (P.transom + (1 - P.transom) * Math.pow(Math.sin((s / 0.55) * Math.PI / 2), 0.6));
  else { const q = (s - 0.55) / 0.45; hb = B2 * Math.pow(Math.max(0, 1 - q * q), 0.72); }
  let d = spec.draftHull * (s < 0.55 ? P.stern + (1 - P.stern) * Math.sin((s / 0.55) * Math.PI / 2) : 1 - 0.35 * ((s - 0.55) / 0.45));
  if (s > 0.8) d -= Math.pow((s - 0.8) / 0.2, 2) * (spec.draftHull * 0.65 + spec.deck * 0.25);
  const sheer = spec.deck * (1 + P.sheer * Math.pow(Math.max(0, s - 0.35) / 0.65, 2) * 1.6);
  return { hb, d, sheer };
}

function buildHull(spec) {
  const P = hullParams(spec);
  const NS = 44, K = 10;
  const cTop = new THREE.Color(spec.color), cStripe = new THREE.Color(spec.stripe);
  const cBottom = spec.id === 'skiff' ? new THREE.Color(0xe8e8e8) : new THREE.Color(0x7a1d1d);
  const cBoot = new THREE.Color(spec.stripe);
  const hasBoot = spec.id !== 'skiff';
  const stripeH = spec.deck * 0.12;
  // půlprofil pravoboku (x > 0) od palubní hrany dolů ke kýlu: [x, y, barva];
  // barevné přechody mají dvojice blízkých bodů, aby pruhy byly ostré
  const halfPts = (sec) => {
    const flare = (y) => sec.hb * (1 + 0.02 * clamp(y / sec.sheer, 0, 1));
    const P2 = (y, c) => [flare(y), y, c];
    const lift = Math.max(0, -sec.d); // u přídě se kýlová linie zvedá nad hladinu
    const pts = [P2(sec.sheer, cStripe), P2(sec.sheer - stripeH, cStripe), P2(sec.sheer - stripeH - 0.01, cTop), P2(sec.sheer * 0.5, cTop)];
    if (hasBoot) pts.push(P2(lift + 0.08, cTop), P2(lift + 0.07, cBoot), P2(lift + 0.005, cBoot));
    else pts.push(P2(lift + 0.01, cTop));
    for (let j = 0; j <= K; j++) {
      const a = (j / K) * Math.PI / 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pts.push([sec.hb * Math.pow(c, 2 / P.n), Math.min(lift - 0.005 - 0.0001 * j, -sec.d * Math.pow(sn, 2 / P.n)), cBottom]);
    }
    return pts;
  };
  const NP = halfPts(hullSection(spec, 0.5, P)).length;
  const M = NP * 2 - 1;
  const pos = [], col = [], idx = [];
  const sections = [];
  let sternProfile = null;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const sec = hullSection(spec, s, P);
    sections.push(sec);
    const z = -spec.L / 2 + s * spec.L;
    const hp = halfPts(sec);
    const full = [...hp, ...hp.slice(0, -1).reverse().map(([x, y, c]) => [-x, y, c])];
    if (i === 0) sternProfile = full;
    for (const [x, y, c] of full) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
  }
  // pořadí vrcholů tak, aby normály mířily ven z trupu
  for (let i = 0; i < NS; i++) for (let j = 0; j < M - 1; j++) {
    const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // záď (zrcadlo) – vlastní vrcholy, aby se nesdílely normály s boky
  const base = pos.length / 3;
  const s0 = sections[0];
  pos.push(0, s0.sheer * 0.6, -spec.L / 2); col.push(cTop.r, cTop.g, cTop.b);
  for (const [x, y] of sternProfile) { pos.push(x, y, -spec.L / 2); col.push(cTop.r, cTop.g, cTop.b); }
  for (let j = 0; j < M - 1; j++) idx.push(base, base + 1 + j, base + 2 + j);
  idx.push(base, base + M, base + 1); // uzavření horní hrany mezi rohy u paluby
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const hull = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }));
  hull.castShadow = true; hull.receiveShadow = true;

  // paluba
  const dp = [], du = [], di = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, sec = sections[i], z = -spec.L / 2 + s * spec.L;
    dp.push(sec.hb * 1.02, sec.sheer, z, -sec.hb * 1.02, sec.sheer, z);
    du.push(sec.hb * 1.02, z, -sec.hb * 1.02, z); // UV v metrech
    if (i < NS) { const a = i * 2; di.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // normála nahoru
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2));
  dg.setIndex(di); dg.computeVertexNormals();
  const deckTex = deckTexture(spec.id === 'skiff' ? 'nonslip' : 'teak');
  const deck = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: spec.id === 'skiff' ? spec.deckColor : 0xffffff, map: deckTex, roughness: 0.85 }));
  deck.receiveShadow = true; deck.castShadow = false;
  return { hull, deck, sections, P };
}

function sheerAt(spec, z) {
  const P = hullParams(spec);
  const s = clamp((z + spec.L / 2) / spec.L, 0, 1);
  return hullSection(spec, s, P);
}

// ---------- pomocné tvary a textury detailů ----------
// paluba: teakové palubky (keelboaty) nebo světlý protiskluzový povrch (skif); UV v metrech
function deckTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  let rnd = 12345; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const t = new THREE.CanvasTexture(c);
  if (kind === 'teak') {
    // 8 palubek po 0,12 m na šířku, 4 m na délku (s posunutými spoji)
    const pw = 512 / 8;
    for (let p = 0; p < 8; p++) {
      const joint = Math.floor(r() * 512);
      for (const [y0, y1] of [[0, joint], [joint, 512]]) {
        const l = 52 + r() * 14;
        g.fillStyle = `hsl(${28 + r() * 6}, ${42 + r() * 10}%, ${l}%)`;
        g.fillRect(p * pw, y0, pw, y1 - y0);
        g.strokeStyle = 'rgba(70,40,15,0.18)'; g.lineWidth = 1;
        for (let k = 0; k < 9; k++) { const x = p * pw + 4 + r() * (pw - 8); g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + 3, y0 + 120, x - 3, y1 - 120, x + (r() - 0.5) * 4, y1); g.stroke(); }
        g.fillStyle = '#2a2420'; g.fillRect(p * pw, y1 - 2, pw, 4); // příčný spoj
      }
      g.fillStyle = '#231e1a'; g.fillRect(p * pw, 0, 4, 512); // tmelená spára
    }
    t.repeat.set(1 / 0.96, 1 / 4);
  } else {
    g.fillStyle = '#e9ecef'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
    t.repeat.set(1 / 0.6, 1 / 0.6);
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// jméno lodi na zrcadle zádi
function nameTexture(name, port, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.fillStyle = color;
  g.font = 'italic bold 84px Georgia, serif'; g.fillText(name, 256, 88);
  g.font = 'bold 30px Arial'; g.fillText(port, 256, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _up = new THREE.Vector3(0, 1, 0);
// válcová tyč mezi dvěma body
function rod(a, b, r, mat, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, B.clone().sub(A).normalize());
  return m;
}
// ohýbaná trubka přes body (koše, lemování)
function tube(points, r, mat, seg = 40, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), mat);
}

// těleso z čtyřúhelníkových stěn; vinutí se otočí podle středu tělesa, aby normály mířily ven
function solidFromQuads(quads) {
  const pos = [];
  const ctr = new THREE.Vector3(); let n = 0;
  for (const q of quads) for (const p of q) { ctr.x += p[0]; ctr.y += p[1]; ctr.z += p[2]; n++; }
  ctr.multiplyScalar(1 / n);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), M = new THREE.Vector3();
  for (const q of quads) {
    A.set(...q[0]); B.set(...q[1]); C.set(...q[2]);
    N.subVectors(B, A).cross(C.clone().sub(A));
    M.set(0, 0, 0); for (const p of q) M.add(new THREE.Vector3(...p)); M.multiplyScalar(1 / q.length).sub(ctr);
    const qq = N.dot(M) < 0 ? [...q].reverse() : q;
    pos.push(...qq[0], ...qq[1], ...qq[2], ...qq[0], ...qq[2], ...qq[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
// bod uvnitř čtyřúhelníku (bilineárně) posunutý o `off` po normále stěny ven
function quadPoint(q, u, v, nrm, off) {
  const p = lerp3(lerp3(q[0], q[1], u), lerp3(q[3], q[2], u), v);
  return [p[0] + nrm[0] * off, p[1] + nrm[1] * off, p[2] + nrm[2] * off];
}

// navíjecí vrátek (winch)
function makeWinch(s, alu, dark) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.11 * s, 0.03 * s, 14), dark);
  base.position.y = 0.015 * s;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * s, 0.09 * s, 0.13 * s, 14), alu);
  drum.position.y = 0.095 * s;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.07 * s, 0.035 * s, 14), dark);
  top.position.y = 0.175 * s;
  g.add(base, drum, top);
  return g;
}

// ---------- textury plachet ----------
function sailTexture(kind, color, number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const col = new THREE.Color(color);
  g.fillStyle = '#' + col.getHexString();
  g.fillRect(0, 0, 256, 512);
  if (kind === 'spin') {
    const cols = ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 'rgba(20,30,60,0.55)'];
    for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 3]; g.fillRect(0, i * 57, 256, 28); }
  } else {
    g.strokeStyle = 'rgba(120,110,90,0.35)'; g.lineWidth = 2;
    for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 42); g.lineTo(256, i * 42 + (kind === 'jib' ? -30 : 0)); g.stroke(); }
    if (kind === 'main') {
      g.strokeStyle = 'rgba(80,80,80,0.5)'; g.lineWidth = 5;
      for (let i = 1; i < 5; i++) { const y = i * 100; g.beginPath(); g.moveTo(256, y); g.lineTo(150, y); g.stroke(); }
      g.fillStyle = 'rgba(200,30,40,0.85)';
      g.font = 'bold 54px Arial'; g.textAlign = 'center';
      g.fillText('CZE', 128, 180); g.fillText(number, 128, 240);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 6, 512); // lem
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- plachta jako deformovatelná síť ----------
class SailMesh {
  constructor(rows, cols, mat) {
    this.rows = rows; this.cols = cols;
    const n = (rows + 1) * (cols + 1);
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const k = i * (cols + 1) + j;
      uv[k * 2] = j / cols; uv[k * 2 + 1] = i / rows;
      if (i < rows && j < cols) { const a = k, b = k + 1, c = k + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  // rowFn(f) -> {L:[x,y,z], E:[x,y,z]} ; camber kladný = vyboulení ve směru `side` (+x = levobok)
  update(rowFn, camber, side, flap, t, shoulder = 0) {
    const pos = this.mesh.geometry.attributes.position.array;
    const { rows, cols } = this;
    for (let i = 0; i <= rows; i++) {
      const f = i / rows;
      const { L, E } = rowFn(f);
      const cx = E[0] - L[0], cz = E[2] - L[2];
      const chord = Math.hypot(cx, cz) || 1e-3;
      // horizontální kolmice k tětivě
      let nx = -cz / chord, nz = cx / chord;
      if (nx * side < 0) { nx = -nx; nz = -nz; }
      for (let j = 0; j <= cols; j++) {
        const tt = j / cols;
        const k = (i * (cols + 1) + j) * 3;
        const prof = 4.6 * tt * Math.pow(1 - tt, 1.25);
        let off = camber * chord * prof * (1 - 0.3 * f * f) * (1 + shoulder * Math.sin(Math.PI * f));
        if (flap > 0) off += flap * chord * 0.08 * Math.sin(tt * 9 - t * 22 + f * 4) * tt * (0.4 + f);
        pos[k] = L[0] + cx * tt + nx * off;
        pos[k + 1] = L[1] + (E[1] - L[1]) * tt;
        pos[k + 2] = L[2] + cz * tt + nz * off;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

// ---------- posádka ----------
// Postava s klouby. Počátek: chodidla (pózy stand/trapeze/helm) nebo pánev (sedací pózy).
// Dopředu = +z, hlava = +y.
const personGeo = {
  thigh: new THREE.CapsuleGeometry(0.075, 0.32, 4, 8).translate(0, -0.235, 0),
  shin: new THREE.CapsuleGeometry(0.06, 0.34, 4, 8).translate(0, -0.23, 0),
  shoe: new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.45, 0.06),
  pelvis: new THREE.CapsuleGeometry(0.11, 0.12, 4, 8).rotateZ(Math.PI / 2),
  torso: new THREE.CapsuleGeometry(0.15, 0.3, 4, 10).translate(0, 0.27, 0),
  vest: new THREE.CapsuleGeometry(0.175, 0.2, 4, 12).scale(1, 1, 0.82).translate(0, 0.3, 0),
  upperArm: new THREE.CapsuleGeometry(0.05, 0.22, 4, 6).translate(0, -0.15, 0),
  foreArm: new THREE.CapsuleGeometry(0.045, 0.2, 4, 6).translate(0, -0.14, 0),
  hand: new THREE.SphereGeometry(0.05, 8, 6).translate(0, -0.3, 0),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8).translate(0, 0.04, 0),
  head: new THREE.SphereGeometry(0.105, 14, 10).scale(0.95, 1.1, 1).translate(0, 0.17, 0),
  cap: new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.19, 0),
  visor: new THREE.BoxGeometry(0.17, 0.012, 0.1).translate(0, 0.195, 0.12),
  shades: new THREE.BoxGeometry(0.16, 0.035, 0.02).translate(0, 0.18, 0.1),
};
const personMats = {
  skin: new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.7 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.85 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.85 }),
  shoe: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }),
  shades: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, metalness: 0.6 }),
};

function makePerson(jacket, capColor = 0xffffff) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const vestMat = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.55 });
  const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.6 });
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
  const P = personMats;

  const pelvis = new THREE.Group(); pelvis.position.y = 0.92; body.add(pelvis);
  mesh(personGeo.pelvis, P.pants, pelvis);
  const hips = [], knees = [], shoulders = [], elbows = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.x = s * 0.1; pelvis.add(hip);
    mesh(personGeo.thigh, P.pants, hip);
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    mesh(personGeo.shin, P.pants, knee);
    mesh(personGeo.shoe, P.shoe, knee);
    hips.push(hip); knees.push(knee);
  }
  const spine = new THREE.Group(); spine.position.y = 0.04; pelvis.add(spine);
  mesh(personGeo.torso, P.shirt, spine);
  mesh(personGeo.vest, vestMat, spine);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.21, 0.5, 0); spine.add(sh);
    mesh(personGeo.upperArm, P.shirt, sh);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    mesh(personGeo.foreArm, P.skin, el);
    mesh(personGeo.hand, P.skin, el);
    shoulders.push(sh); elbows.push(el);
  }
  const neck = new THREE.Group(); neck.position.y = 0.6; spine.add(neck);
  mesh(personGeo.neck, P.skin, neck);
  mesh(personGeo.head, P.skin, neck);
  mesh(personGeo.cap, capMat, neck);
  mesh(personGeo.visor, capMat, neck);
  mesh(personGeo.shades, P.shades, neck);

  const rig = { body, hips, knees, spine, shoulders, elbows, neck, pose: '' };
  root.userData.rig = rig;
  return root;
}

// pózy: 'stand', 'helm' (ruce na kole), 'trapeze', 'sit' (lean > 0 = záklon), 'rail' (nohy přes bok)
function setPose(person, pose, lean = 0) {
  const r = person.userData.rig;
  const key = pose + (lean * 20 | 0);
  if (r.pose === key) return;
  r.pose = key;
  const [hL, hR] = r.hips, [kL, kR] = r.knees, [sL, sR] = r.shoulders, [eL, eR] = r.elbows;
  for (const g of [hL, hR, kL, kR, sL, sR, eL, eR, r.spine, r.neck]) g.rotation.set(0, 0, 0);
  r.body.position.y = 0;
  if (pose === 'stand' || pose === 'helm' || pose === 'trapeze') {
    hL.rotation.z = -0.06; hR.rotation.z = 0.06;
    if (pose === 'helm') { sL.rotation.x = sR.rotation.x = -1.05; eL.rotation.x = eR.rotation.x = -0.5; sL.rotation.z = 0.25; sR.rotation.z = -0.25; }
    else if (pose === 'trapeze') {
      sR.rotation.x = -2.7; sR.rotation.z = -0.15; eR.rotation.x = -0.2;   // ruka na madle trapézu
      sL.rotation.x = -0.9; eL.rotation.x = -0.9;                          // druhá drží otěž
      r.neck.rotation.x = 0.25;
    } else { sL.rotation.z = -0.12; sR.rotation.z = 0.12; eL.rotation.x = eR.rotation.x = -0.25; }
    return;
  }
  // sedací pózy: počátek v pánvi
  r.body.position.y = -0.92;
  if (pose === 'rail') {
    hL.rotation.x = hR.rotation.x = -1.25; kL.rotation.x = kR.rotation.x = 1.45;
    r.spine.rotation.x = 0.1 + lean;
    sL.rotation.x = sR.rotation.x = -0.35; sL.rotation.z = 0.35; sR.rotation.z = -0.35; eL.rotation.x = eR.rotation.x = -0.5;
    return;
  }
  // 'hike': nohy natažené pod popruhy (skif), 'sit': kolena pokrčená
  hL.rotation.x = hR.rotation.x = pose === 'hike' ? -1.35 : -1.5;
  kL.rotation.x = kR.rotation.x = pose === 'hike' ? 0.45 : 1.45;
  hL.rotation.y = 0.12; hR.rotation.y = -0.12;
  r.spine.rotation.x = -lean;
  r.neck.rotation.x = lean * 0.6;
  // ruce dopředu-dolů (drží otěž/pinnu) nezávisle na záklonu trupu
  sL.rotation.x = sR.rotation.x = -0.55 + lean * 0.9; eL.rotation.x = eR.rotation.x = -0.8;
}

// ---------- kompletní model ----------
export function createBoatModel(spec) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.order = 'YXZ';
  root.add(tilt);

  const { hull, deck, sections } = buildHull(spec);
  tilt.add(hull, deck);

  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe3e7ec, roughness: 0.2, metalness: 0.9 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.3 });
  const gel = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d141c, roughness: 0.05, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4f2c, roughness: 0.6 });
  const mastMat = spec.id === 'skiff' ? carbon : alu;
  const add = (...o) => { for (const m of o) tilt.add(m); return o[0]; };
  // čtyřúhelníky natočené podle zadané normály (okna, dveře)
  const facingQuads = (list, mat) => {
    const pos = [];
    for (const { q, n } of list) {
      const A = new THREE.Vector3(...q[0]), N = new THREE.Vector3(...q[1]).sub(A).cross(new THREE.Vector3(...q[2]).sub(A));
      const qq = N.dot(new THREE.Vector3(...n)) < 0 ? [...q].reverse() : q;
      pos.push(...qq[0], ...qq[1], ...qq[2], ...qq[0], ...qq[2], ...qq[3]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };

  // lemování boku (rubrail) podél hrany paluby
  {
    const r = spec.id === 'skiff' ? 0.016 : spec.id === 'cruiser' ? 0.03 : 0.04;
    const mat = spec.id === 'ocean' ? wood : dark;
    for (const sg of [1, -1]) {
      const pts = [];
      for (let i = 1; i < sections.length - 1; i++) {
        const z = -spec.L / 2 + (i / (sections.length - 1)) * spec.L, sc = sections[i];
        pts.push([sg * (sc.hb * 1.02 + r * 0.5), sc.sheer - r * 0.6, z]);
      }
      add(tube(pts, r, mat, 80, 6));
    }
  }

  // jméno lodi na zrcadle zádi
  {
    const s0 = sections[0];
    const names = { skiff: 'Blesk', cruiser: 'Vltava', ocean: 'Albatros' };
    const w = s0.hb * 1.2, h = w * 160 / 512;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: nameTexture(names[spec.id] || '', 'PRAHA', '#' + new THREE.Color(spec.stripe).getHexString()),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.4,
    }));
    m.position.set(0, s0.sheer * 0.58, -spec.L / 2 - 0.004);
    m.rotation.y = Math.PI;
    add(m);
  }

  // okénka v boku trupu
  if (spec.id !== 'skiff') {
    const ports = spec.id === 'ocean' ? [-1.6, -0.3, 1.0, 2.2] : [-0.55, 0.45];
    const geo = new THREE.CircleGeometry(spec.id === 'ocean' ? 0.08 : 0.065, 18).scale(spec.id === 'ocean' ? 2.2 : 3, 1, 1);
    for (const z of ports) {
      const sc = sheerAt(spec, z), y = sc.sheer * 0.66;
      for (const sg of [1, -1]) {
        const p = new THREE.Mesh(geo, glass);
        p.position.set(sg * (sc.hb * (1 + 0.02 * y / sc.sheer) + 0.004), y, z);
        p.rotation.y = sg * Math.PI / 2;
        add(p);
      }
    }
  }

  // kajuta (zkosená nástavba), kokpit, kování a zábradlí pro kýlové lodě
  let cockpit = null;
  if (spec.id !== 'skiff') {
    const big = spec.id === 'ocean';
    const cabinL = spec.L * 0.32, cabinW = spec.B * 0.55, cabinH = big ? 0.65 : 0.5;
    const cz = spec.mast.x - cabinL * 0.35;
    const zb = cz - cabinL / 2, zf = cz + cabinL / 2;
    const yb = sheerAt(spec, zb).sheer - 0.03, yf = sheerAt(spec, zf).sheer - 0.03;
    const x0 = cabinW / 2, x0f = x0 * 0.78, x1 = x0 * 0.84, x1f = x0f * 0.84;
    const zt = zb + 0.03, zf2 = zf - cabinH * 1.4;
    const ytb = yb + 0.03 + cabinH, ytf = Math.max(ytb, yf + 0.03 + cabinH * 0.85);
    const B0 = [x0, yb, zb], B1 = [-x0, yb, zb], B2 = [-x0f, yf, zf], B3 = [x0f, yf, zf];
    const T0 = [x1, ytb, zt], T1 = [-x1, ytb, zt], T2 = [-x1f, ytf, zf2], T3 = [x1f, ytf, zf2];
    const cabin = new THREE.Mesh(solidFromQuads([[T0, T1, T2, T3], [B0, B1, T1, T0], [B3, B2, T2, T3], [B0, T0, T3, B3], [B1, B2, T2, T1]]), gel);
    cabin.castShadow = true; cabin.receiveShadow = true;
    add(cabin);
    // okna: boční (dvě na každé straně) a přední
    const wins = [];
    const sideN = (sg) => new THREE.Vector3(sg * cabinH, x0 - x1, 0).normalize().toArray();
    for (const [sg, q] of [[1, [B0, B3, T3, T0]], [-1, [B1, B2, T2, T1]]]) {
      const n = sideN(sg);
      for (const [u0, u1] of [[0.12, 0.45], [0.5, 0.78]]) {
        wins.push({ q: [quadPoint(q, u0, 0.38, n, 0.006), quadPoint(q, u1, 0.38, n, 0.006), quadPoint(q, u1 - 0.03, 0.8, n, 0.006), quadPoint(q, u0 + 0.03, 0.8, n, 0.006)], n });
      }
    }
    const fN = new THREE.Vector3(0, zf - zf2, cabinH).normalize().toArray();
    const fq = [B2, B3, T3, T2];
    for (const [u0, u1] of [[0.14, 0.46], [0.54, 0.86]]) wins.push({ q: [quadPoint(fq, u0, 0.3, fN, 0.006), quadPoint(fq, u1, 0.3, fN, 0.006), quadPoint(fq, u1, 0.82, fN, 0.006), quadPoint(fq, u0, 0.82, fN, 0.006)], n: fN });
    add(facingQuads(wins, glass));
    // vstup do kajuty (dřevěné dveře) na zadní stěně
    const bq = [B1, B0, T0, T1], bn = [0, 0, -1];
    add(facingQuads([{ q: [quadPoint(bq, 0.36, 0.06, bn, 0.006), quadPoint(bq, 0.64, 0.06, bn, 0.006), quadPoint(bq, 0.64, 0.97, bn, 0.006), quadPoint(bq, 0.36, 0.97, bn, 0.006)], n: bn }], wood));
    // poklopy a madla na střeše
    const roofY = (z) => ytb + (ytf - ytb) * clamp((z - zt) / (zf2 - zt), 0, 1);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.32, 0.07, 0.7), gel);
    slide.position.set(0, roofY(zt + 0.4) + 0.035, zt + 0.4);
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.36, 0.06, 0.55), glass);
    hatch.position.set(0, roofY(zf2 - 0.45) + 0.03, zf2 - 0.45);
    add(slide, hatch);
    for (const sg of [1, -1]) {
      const za = zt + 0.25, zc = zf2 - 0.25, x = sg * x1 * 0.72;
      add(rod([x, roofY(za) + 0.07, za], [x, roofY(zc) + 0.07, zc], 0.016, wood, 6));
      for (const z of [za, (za + zc) / 2, zc]) add(rod([x, roofY(z), z], [x, roofY(z) + 0.07, z], 0.012, wood, 5));
    }

    // kokpit: podlaha, lavice s teakovým sedákem, obruby, winche
    const cockpitL = spec.L * 0.26;
    const cz2 = zb - cockpitL / 2;
    const cSheer = sheerAt(spec, cz2).sheer;
    const cockW = cabinW;
    const benchW = 0.42, benchH = 0.38;
    const benchX = cockW / 2 - benchW / 2;
    const teak = deck.material.map.clone();
    teak.repeat.set(cockW / 0.96, cockpitL / 4); teak.needsUpdate = true;
    const teakMat = new THREE.MeshStandardMaterial({ map: teak, roughness: 0.85 });
    const sole = new THREE.Mesh(new THREE.BoxGeometry(cockW, 0.03, cockpitL), teakMat);
    sole.position.set(0, cSheer + 0.015, cz2); sole.receiveShadow = true;
    add(sole);
    for (const sg of [1, -1]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(benchW, benchH, cockpitL * 0.94), gel);
      bench.position.set(sg * benchX, cSheer + benchH / 2, cz2); bench.receiveShadow = true;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(benchW, 0.03, cockpitL * 0.94), teakMat);
      seat.position.set(sg * benchX, cSheer + benchH + 0.015, cz2); seat.receiveShadow = true;
      const coam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, cockpitL), gel);
      coam.position.set(sg * (cockW / 2 + 0.03), cSheer + 0.275, cz2); coam.castShadow = true; coam.receiveShadow = true;
      add(bench, seat, coam);
      const ws = big ? 1.4 : 1;
      const w1 = makeWinch(ws, steel, dark); w1.position.set(sg * (cockW / 2 + 0.03), cSheer + 0.55, cz2 + cockpitL * 0.32); add(w1);
      if (big) { const w2 = makeWinch(1.1, steel, dark); w2.position.set(sg * (cockW / 2 + 0.03), cSheer + 0.55, cz2 - cockpitL * 0.05); add(w2); }
      const w3 = makeWinch(ws * 0.8, steel, dark); w3.position.set(sg * x1 * 0.45, ytb, zt + 0.25); add(w3);
    }
    // kolejnice hlavní otěže (traveller) přes kokpit
    const travZ = spec.mast.x - spec.sails.find((s) => s.kind === 'main').foot * 0.95;
    add(rod([-cockW / 2, cSheer + benchH + 0.05, travZ], [cockW / 2, cSheer + benchH + 0.05, travZ], 0.022, steel, 8));
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.08), dark); car.position.set(0, cSheer + benchH + 0.08, travZ); add(car);
    cockpit = { benchX, seatY: cSheer + benchH + 0.03, soleY: cSheer + 0.03, front: zb, back: zb - cockpitL, travY: benchH + 0.05 };

    // sloupky zábradlí, lanka, koš na přídi a na zádi
    const zP = spec.L * 0.36, zQ = -spec.L * 0.42, hTop = big ? 0.68 : 0.6;
    const at = (z, f = 0.95) => { const s = sheerAt(spec, z); return { x: s.hb * f, y: s.sheer }; };
    const wires = [];
    for (const sg of [1, -1]) {
      const nPost = Math.max(3, Math.round((zP - zQ) / 1.8));
      const posts = [];
      for (let i = 1; i < nPost; i++) {
        const z = zQ + (i / nPost) * (zP - zQ), a = at(z);
        add(rod([sg * a.x, a.y, z], [sg * a.x, a.y + hTop, z], 0.014, steel, 6));
        posts.push([sg * a.x, a.y, z]);
      }
      const pA = at(zQ), pB = at(zP);
      for (const hh of [hTop, hTop * 0.52]) {
        const line = [[sg * pA.x, pA.y + hh, zQ], ...posts.map((p) => [p[0], p[1] + hh, p[2]]), [sg * pB.x, pB.y + hh, zP]];
        for (let i = 0; i < line.length - 1; i++) wires.push(new THREE.Vector3(...line[i]), new THREE.Vector3(...line[i + 1]));
      }
    }
    add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), new THREE.LineBasicMaterial({ color: 0xc7ccd2 })));
    {
      const p = at(zP), zT = spec.L / 2 - 0.3, t = at(zT, 0.5), y = p.y + hTop, zm = (zP + zT) / 2, m = at(zm, 0.8);
      add(tube([[p.x, y, zP], [m.x, y + 0.02, zm], [0, y + 0.04, zT], [-m.x, y + 0.02, zm], [-p.x, y, zP]], 0.02, steel, 30));
      for (const [x, z, yy] of [[p.x, zP, p.y], [-p.x, zP, p.y], [m.x, zm, m.y], [-m.x, zm, m.y], [0, zT, t.y]]) add(rod([x, yy, z], [x, (z === zT ? y + 0.04 : z === zm ? y + 0.02 : y), z], 0.016, steel, 6));
    }
    {
      const q = at(zQ), zS = -spec.L / 2 + 0.12, s = at(zS, 0.9), y = q.y + hTop;
      add(tube([[q.x, y, zQ], [s.x, y, zS + 0.15], [s.x * 0.5, y, zS], [-s.x * 0.5, y, zS], [-s.x, y, zS + 0.15], [-q.x, y, zQ]], 0.02, steel, 36));
      for (const [x, z] of [[q.x, zQ], [-q.x, zQ], [s.x, zS + 0.15], [-s.x, zS + 0.15]]) add(rod([x, at(z).y, z], [x, y, z], 0.016, steel, 6));
    }
    // vazáky na přídi a zádi
    for (const [z, sg] of [[spec.L * 0.42, 1], [spec.L * 0.42, -1], [-spec.L * 0.46, 1], [-spec.L * 0.46, -1]]) {
      const a = at(z, 0.8);
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, big ? 0.3 : 0.22), steel);
      cl.position.set(sg * a.x, a.y + 0.03, z); add(cl);
    }
  } else {
    // skif: kolejnice otěže přes loď a popruhy na nohy
    const travZ = spec.mast.x - spec.sails.find((s) => s.kind === 'main').foot * 0.95;
    const t = sheerAt(spec, travZ);
    add(rod([-t.hb * 0.8, t.sheer + 0.04, travZ], [t.hb * 0.8, t.sheer + 0.04, travZ], 0.012, steel, 6));
    const strap = new THREE.MeshStandardMaterial({ color: 0x1f4fa0, roughness: 0.8 });
    for (const sg of [1, -1]) {
      const s = sheerAt(spec, -0.5);
      add(rod([sg * s.hb * 0.25, s.sheer + 0.02, -1.6], [sg * s.hb * 0.25, s.sheer + 0.02, 0.4], 0.018, strap, 4));
    }
  }

  // stěžeň
  const sx = sheerAt(spec, spec.mast.x);
  const mastLen = spec.mast.top - sx.sheer;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 0.7, spec.mast.r, mastLen, 10), mastMat);
  mast.position.set(0, sx.sheer + mastLen / 2, spec.mast.x);
  mast.castShadow = true;
  tilt.add(mast);

  // čeleň (bowsprit)
  const bowSec = sheerAt(spec, spec.L / 2 - 0.05);
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 0.45, spec.mast.r * 0.5, spec.bowsprit + 0.6, 8), carbon);
  bs.rotation.x = Math.PI / 2;
  bs.position.set(0, bowSec.sheer + 0.02, spec.L / 2 + spec.bowsprit / 2 - 0.3);
  tilt.add(bs);

  // ráhno
  const main = spec.sails.find((s) => s.kind === 'main');
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, main.tack[1] - 0.05, main.tack[0]);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 0.7, spec.mast.r * 0.7, main.foot, 8), mastMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.z = -main.foot / 2;
  boom.castShadow = true;
  boomPivot.add(boom);
  {
    const sxm = sheerAt(spec, spec.mast.x);
    const baseY = sxm.sheer + (spec.id === 'skiff' ? 0.15 : 0.25) - boomPivot.position.y;
    boomPivot.add(rod([0, -spec.mast.r * 0.6, -main.foot * 0.3], [0, baseY, -spec.mast.r * 1.3], spec.mast.r * 0.22, dark, 6));
    const goose = new THREE.Mesh(new THREE.BoxGeometry(spec.mast.r * 1.6, spec.mast.r * 1.6, spec.mast.r * 2.2), dark);
    goose.position.z = -spec.mast.r * 1.1; boomPivot.add(goose);
    const endCap = new THREE.Mesh(new THREE.BoxGeometry(spec.mast.r * 1.5, spec.mast.r * 2.2, spec.mast.r * 2), dark);
    endCap.position.z = -main.foot; boomPivot.add(endCap);
  }
  tilt.add(boomPivot);

  // kýl / meč
  const K = spec.keel;
  const keelMat = new THREE.MeshStandardMaterial({ color: spec.id === 'skiff' ? 0x30343a : 0x2a2a2a, roughness: 0.6 });
  const keelGroup = new THREE.Group();
  const hullAtKeel = sheerAt(spec, K.x);
  const shp = new THREE.Shape();
  const sweep = spec.id === 'skiff' ? 0 : K.chord * 0.35;
  shp.moveTo(K.chord / 2, 0); shp.lineTo(-K.chord / 2, 0); shp.lineTo(-K.chord / 2 * 0.7 - sweep, -K.span); shp.lineTo(K.chord / 2 * 0.6 - sweep, -K.span); shp.closePath();
  const kg = new THREE.ExtrudeGeometry(shp, { depth: K.chord * 0.03, bevelEnabled: true, bevelThickness: K.chord * 0.045, bevelSize: K.chord * 0.03, bevelSegments: 3, curveSegments: 4 });
  kg.translate(0, 0, -K.chord * 0.015);
  const keel = new THREE.Mesh(kg, keelMat);
  keel.rotation.y = Math.PI / 2;
  keelGroup.add(keel);
  if (K.type === 'bulb') {
    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(K.chord * 0.22, K.chord * 1.4, 6, 12), keelMat);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(0, -K.span, -sweep * 0.8);
    keelGroup.add(bulb);
  }
  keelGroup.position.set(0, -hullAtKeel.d + 0.05, K.x);
  tilt.add(keelGroup);

  // kormidlo
  const R = spec.rudder;
  const rudderPivot = new THREE.Group();
  const rs = new THREE.Shape();
  rs.moveTo(0.05, 0.2); rs.lineTo(-R.chord, 0.2); rs.lineTo(-R.chord * 0.85, -R.span); rs.lineTo(0.02, -R.span * 0.95); rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.012, bevelEnabled: true, bevelThickness: R.chord * 0.05, bevelSize: R.chord * 0.03, bevelSegments: 3 }); rg.translate(0, 0, -0.006);
  const rudderBlade = new THREE.Mesh(rg, keelMat);
  rudderBlade.rotation.y = Math.PI / 2;
  rudderPivot.add(rudderBlade);
  const rSec = sheerAt(spec, R.x);
  const rudderBaseY = spec.id === 'skiff' ? 0.1 : -rSec.d * 0.6;
  rudderPivot.position.set(0, rudderBaseY, R.x + (spec.id === 'skiff' ? -0.05 : 0));
  tilt.add(rudderPivot);
  let tiller = null, wheel = null;
  if (spec.steering === 'tiller') {
    const tl = spec.id === 'skiff' ? 1.2 : 1.5;
    tiller = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, tl), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }));
    stick.position.z = tl / 2;
    stick.castShadow = true;
    tiller.add(stick);
    tiller.position.set(0, rSec.sheer + 0.18, R.x + 0.02);
    tiller.rotation.x = -0.12;
    tilt.add(tiller);
  } else {
    wheel = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 32), alu);
    wheel.add(ring);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), alu);
      sp.rotation.z = (i * Math.PI) / 6;
      wheel.add(sp);
    }
    const wz = R.x + 1.3;
    const ws = sheerAt(spec, wz);
    wheel.position.set(0, ws.sheer + 0.75, wz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), dark);
    hub.rotation.x = Math.PI / 2; wheel.add(hub);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.78, 10), dark);
    ped.position.set(0, ws.sheer + 0.39, wz + 0.15);
    const compass = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    compass.position.set(0, ws.sheer + 0.79, wz + 0.15);
    tilt.add(wheel, ped, compass);
  }

  // lanoví
  const rig = [];
  const jib = spec.sails.find((s) => s.kind === 'jib');
  const addRig = (a, b) => rig.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
  addRig([0, jib.tack[1], jib.tack[0]], [0, jib.head[1], jib.head[0]]); // předstěh
  const hounds = jib.head[1];
  const chain = sheerAt(spec, spec.mast.x - 0.25);
  for (const sg of [1, -1]) {
    addRig([sg * chain.hb * 0.95, chain.sheer, spec.mast.x - 0.25], [0, hounds, spec.mast.x]);
    if (spec.id !== 'skiff') addRig([sg * chain.hb * 0.95, chain.sheer, spec.mast.x - 0.25], [0, spec.mast.top - 0.3, spec.mast.x]);
    // salingy
    tilt.add(rod([0, hounds * 0.55, spec.mast.x], [sg * chain.hb * 0.7, hounds * 0.55, spec.mast.x - 0.15], spec.mast.r * 0.25, mastMat, 6));
  }
  if (spec.id !== 'skiff') { const st = sheerAt(spec, -spec.L / 2 + 0.2); addRig([0, st.sheer, -spec.L / 2 + 0.2], [0, spec.mast.top, spec.mast.x]); }
  // patka stěžně a vrchol
  { const mb = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 1.6, spec.mast.r * 1.9, 0.08, 10), dark); mb.position.set(0, sx.sheer + 0.04, spec.mast.x); tilt.add(mb);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(spec.mast.r * 1.6, spec.mast.r * 1.5, spec.mast.r * 4), dark); mh.position.set(0, spec.mast.top, spec.mast.x - spec.mast.r); tilt.add(mh); }
  const rigLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rig), new THREE.LineBasicMaterial({ color: 0x2a2d33 }));
  tilt.add(rigLines);

  // otěže (dynamické)
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const sheetLines = new THREE.LineSegments(sheetGeo, new THREE.LineBasicMaterial({ color: 0x334455 }));
  sheetLines.frustumCulled = false;
  tilt.add(sheetLines);

  // plachty
  const number = { skiff: '47', cruiser: '212', ocean: '7' }[spec.id];
  const sails = {};
  for (const s of spec.sails) {
    const tex = sailTexture(s.kind, s.color, number);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.16, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    const sm = new SailMesh(s.kind === 'spin' ? 14 : 12, s.kind === 'spin' ? 12 : 9, mat);
    tilt.add(sm.mesh);
    sails[s.key] = sm;
  }

  // posádka
  const jackets = [0xff5a1f, 0xffd000, 0xff2b5e, 0x1fa2ff, 0xff7b00, 0xe8f000, 0xff5a1f, 0x00c2a8];
  const crew = [];
  for (let i = 0; i < spec.crewN; i++) {
    const caps = spec.id === 'skiff' ? [0x15181d, 0x15181d] : [0xffffff, 0x1d2b44, 0xf2f2f2, 0xc8102e, 0xffffff, 0x1d2b44];
    const p = makePerson(jackets[i], caps[i % caps.length]);
    tilt.add(p);
    crew.push(p);
  }
  const trapGeo = new THREE.BufferGeometry();
  trapGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
  const trapLines = new THREE.LineSegments(trapGeo, new THREE.LineBasicMaterial({ color: 0x111111 }));
  trapLines.frustumCulled = false;
  tilt.add(trapLines);

  root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow || false; });

  // ---------- aktualizace ----------
  const mastX = spec.mast.x;
  function update(b, t) {
    // ráhno
    const dMain = b.ang.main;
    boomPivot.rotation.y = -dMain;
    rudderPivot.rotation.y = -b.rudder * spec.rudder.max * DEG;
    if (tiller) tiller.rotation.y = -b.rudder * spec.rudder.max * DEG;
    if (wheel) wheel.rotation.z = b.rudder * 4.5;
    keelGroup.visible = true;
    if (K.retract) keelGroup.position.y = -hullAtKeel.d + 0.05 + (1 - b.board) * K.span * 0.8;

    const twistBase = 6 * DEG;
    const sheetPts = sheetGeo.attributes.position.array;
    let sp = 0;
    const pushLine = (a, c) => { sheetPts.set(a, sp); sheetPts.set(c, sp + 3); sp += 6; };

    for (const s of spec.sails) {
      const sm = sails[s.key];
      const info = b.sailInfo[s.key] || { a: 0, flap: 0 };
      const active = s.kind === 'spin' ? b.spinUp : s.kind === 'jib' ? !(b.spinUp && spec.spinReplacesJib) : true;
      sm.mesh.visible = active && !(s.kind === 'main' && false);
      if (!active) continue;
      const d = b.ang[s.key];
      const side = Math.sign(d) || 1;
      const sheet = b.sheets[s.ctrl];
      const twist = twistBase + sheet * 14 * DEG;
      const flap = info.flap || 0;
      const camberBase = s.kind === 'spin' ? 0.2 : s.kind === 'jib' ? 0.11 : 0.1;
      const camber = camberBase * (1 - flap * 0.85) * (info.rev ? -0.6 : 1);
      if (s.kind === 'main') {
        const rf = [1, 0.72, 0.5][b.reef] ?? 1;
        const h0 = s.tack[1], h1 = h0 + (s.head[1] - h0) * (0.62 + 0.38 * rf);
        sm.update((f) => {
          const h = h0 + (h1 - h0) * f;
          const ch = s.foot * ((1 - f) + s.roach * Math.sin(Math.PI * f) * 0.9) + 0.05 * s.foot * f;
          const a = d + side * twist * f * f;
          return { L: [0, h, mastX - spec.mast.r * 1.2], E: [Math.sin(a) * ch, h - 0.05 * f, mastX - spec.mast.r - Math.cos(a) * ch] };
        }, camber, side, flap, t);
        const bx = Math.sin(d) * s.foot, bz = mastX - Math.cos(d) * s.foot;
        const sheetBase = sheerAt(spec, mastX - s.foot * 0.95);
        pushLine([bx * 0.95, h0 - 0.05, bz * 0.98 + 0.02 * mastX], [0, sheetBase.sheer + (cockpit ? cockpit.travY + 0.06 : 0.07), mastX - s.foot * 0.95]);
      } else {
        const tack = [0, s.tack[1], s.tack[0]];
        const head = [0, s.head[1], s.head[0]];
        const footLen = s.foot;
        const clew = [Math.sin(d) * footLen, s.tack[1] + (s.kind === 'spin' ? 1.2 : 0.35) * (spec.L / 9), s.tack[0] - Math.cos(d) * footLen];
        const shoulder = s.kind === 'spin' ? 0.45 : 0;
        sm.update((f) => {
          const L = [tack[0] + (head[0] - tack[0]) * f, tack[1] + (head[1] - tack[1]) * f, tack[2] + (head[2] - tack[2]) * f];
          let E = [clew[0] + (head[0] - clew[0]) * f, clew[1] + (head[1] - clew[1]) * f, clew[2] + (head[2] - clew[2]) * f];
          // twist + rameno spinakru
          const ex = E[0] - L[0], ez = E[2] - L[2];
          const a = side * twist * f * 0.8;
          const ca = Math.cos(a), sa = Math.sin(a);
          let rx = ex * ca + ez * sa, rz = -ex * sa + ez * ca;
          const grow = 1 + (s.kind === 'spin' ? 0.35 * Math.sin(Math.PI * Math.min(1, f * 1.1)) : 0);
          E = [L[0] + rx * grow, E[1], L[2] + rz * grow];
          return { L, E };
        }, camber, side, flap, t, shoulder);
        const sb = sheerAt(spec, clew[2] - footLen * 0.25);
        pushLine(clew, [side * sb.hb * 0.95, sb.sheer + 0.05, clew[2] - footLen * 0.25]);
      }
    }
    while (sp < sheetPts.length) sheetPts[sp++] = 0;
    sheetGeo.attributes.position.needsUpdate = true;

    // posádka
    const tp = trapGeo.attributes.position.array; tp.fill(0);
    const side = Math.sign(b.crewY) || 1;
    const arm = Math.abs(b.crewY);
    crew.forEach((p, i) => {
      p.rotation.set(0, 0, 0);
      if (spec.id === 'skiff') {
        const z = i === 0 ? -1.05 : 0.05;
        const sec = sheerAt(spec, z);
        const half = sec.hb;
        if (b.capsized) { setPose(p, 'stand'); p.position.set(0, 0.1, z); return; }
        if (arm > half * 0.95) {
          // na trapézu: chodidla na hraně boku, tělo vyložené ven
          const ang = Math.asin(clamp((arm - half * 0.7) / 1.0, 0, 0.966)); // max ~75°
          setPose(p, 'trapeze');
          p.position.set(side * half, sec.sheer, z);
          p.rotation.z = -side * ang;
          const hipY = sec.sheer + Math.cos(ang) * 0.92, hipX = side * (half + Math.sin(ang) * 0.92);
          tp.set([hipX, hipY, z, 0, (i === 1 ? 5.5 : 5.4) * spec.L / 4.5, mastX], i === 1 ? 0 : 6);
        } else {
          // sedí na boční palubě čelem dovnitř, záklon podle vyvažování
          const lean = clamp(arm / half, 0, 1) * 0.9;
          setPose(p, 'hike', lean);
          p.position.set(side * clamp(arm * 1.1, 0.25, half - 0.08), sec.sheer + 0.08, z);
          p.rotation.y = -side * Math.PI / 2;
        }
      } else {
        const zHelm = spec.rudder.x + (spec.steering === 'wheel' ? 0.75 : 1.4);
        if (i === 0) {
          if (spec.steering === 'wheel') {
            const wz = spec.rudder.x + 1.3;
            setPose(p, 'helm');
            p.position.set(0, cockpit ? cockpit.soleY : sheerAt(spec, wz).sheer, wz - 0.6);
          } else {
            setPose(p, 'sit', 0.15);
            p.position.set(side * cockpit.benchX, cockpit.seatY + 0.1, zHelm);
            p.rotation.y = -side * 1.15;
          }
          return;
        }
        const hiking = arm > spec.sitArm * 0.9;
        if (hiking) {
          // na hraně boku, nohy přes palubu ven
          const z = spec.mast.x - 0.6 - (i - 1) * (spec.L * 0.45 / crew.length);
          const sec = sheerAt(spec, z);
          setPose(p, 'rail', 0.05);
          p.position.set(side * sec.hb * 0.97, sec.sheer + 0.12, z);
          p.rotation.y = side * Math.PI / 2;
        } else {
          // sedí na lavicích v kokpitu čelem dovnitř
          const row = (i - 1) >> 1, sg = (i - 1) % 2 ? -1 : 1;
          const z = Math.max(cockpit.back + 0.5, cockpit.front - 0.45 - row * 0.75);
          setPose(p, 'sit', 0.1);
          p.position.set(sg * cockpit.benchX, cockpit.seatY + 0.1, z);
          p.rotation.y = -sg * Math.PI / 2;
        }
      }
    });
    trapGeo.attributes.position.needsUpdate = true;
  }

  return { root, tilt, update, sails };
}

// ---------- bóje ----------
export function createBuoy(color = 0xff7a00, label = '') {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 16), m);
  body.position.y = 0.6;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.3, 16), m);
  top.position.y = 2.35;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  pole.position.y = 4.2;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.2 }));
  flag.position.set(0.6, 5.2, 0);
  for (const o of [body, top, pole, flag]) { o.castShadow = true; g.add(o); }
  g.userData.flag = flag;
  return g;
}

// ---------- ostrovy v dálce ----------
export function createIsland(radius, height, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const geo = new THREE.ConeGeometry(radius, height, 48, 8, true);
  const pos = geo.attributes.position;
  const cols = [];
  const sand = new THREE.Color(0xd8c38f), green = new THREE.Color(0x3f6b35), rock = new THREE.Color(0x6b6b63);
  const offs = Array.from({ length: 6 }, () => rnd() * 6.28);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const n = 1 + 0.18 * Math.sin(a * 3 + offs[0]) + 0.1 * Math.sin(a * 7 + offs[1]) + 0.05 * Math.sin(a * 13 + offs[2]);
    const hf = (y + height / 2) / height;
    const yy = y + height / 2;
    pos.setXYZ(i, x * n, yy * (0.85 + 0.25 * Math.sin(a * 2 + offs[3])) - 3, z * n);
    const c = hf < 0.08 ? sand : hf > 0.75 ? rock : green;
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
}
