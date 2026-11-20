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
  const halfPts = (sec) => {
    const pts = [[sec.hb * 1.02, sec.sheer], [sec.hb, sec.sheer * 0.45]];
    for (let j = 0; j <= K; j++) {
      const a = (j / K) * Math.PI / 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pts.push([sec.hb * Math.pow(c, 2 / P.n), Math.min(sec.sheer * 0.45, -sec.d * Math.pow(sn, 2 / P.n) + 0.0001 * j) * (j === 0 ? 0 : 1) + (j === 0 ? 0 : 0)]);
    }
    return pts;
  };
  const M = (K + 3) * 2 - 1;
  const pos = [], col = [], idx = [];
  const cTop = new THREE.Color(spec.color), cStripe = new THREE.Color(spec.stripe);
  const cBottom = spec.id === 'skiff' ? new THREE.Color(0xe8e8e8) : new THREE.Color(0x7a1d1d);
  const cBoot = new THREE.Color(spec.stripe);
  const sections = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const sec = hullSection(spec, s, P);
    sections.push(sec);
    const z = -spec.L / 2 + s * spec.L;
    const hp = halfPts(sec);
    const full = [...hp.map(([x, y]) => [x, y]), ...hp.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
    for (const [x, y] of full) {
      pos.push(x, y, z);
      let c = cTop;
      if (y < -0.005) c = cBottom; else if (y < 0.06 && spec.id !== 'skiff') c = cBoot;
      else if (y > sec.sheer - spec.deck * 0.12) c = cStripe;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < M - 1; j++) {
    const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // záď (zrcadlo)
  const base = pos.length / 3;
  const s0 = sections[0];
  pos.push(0, s0.sheer * 0.6, -spec.L / 2); col.push(cTop.r, cTop.g, cTop.b);
  for (let j = 0; j < M - 1; j++) idx.push(base, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const hull = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide }));
  hull.castShadow = true; hull.receiveShadow = true;

  // paluba
  const dp = [], di = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, sec = sections[i], z = -spec.L / 2 + s * spec.L;
    dp.push(sec.hb * 1.02, sec.sheer, z, -sec.hb * 1.02, sec.sheer, z);
    if (i < NS) { const a = i * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setIndex(di); dg.computeVertexNormals();
  const deck = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: spec.deckColor, roughness: 0.85, side: THREE.DoubleSide }));
  deck.receiveShadow = true; deck.castShadow = false;
  return { hull, deck, sections, P };
}

function sheerAt(spec, z) {
  const P = hullParams(spec);
  const s = clamp((z + spec.L / 2) / spec.L, 0, 1);
  return hullSection(spec, s, P);
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
function makePerson(jacket) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.7 });
  const jm = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.6 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.62, 4, 8), pants);
  legs.position.y = 0.45;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.45, 4, 10), jm);
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.position.y = 1.55;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cap.position.y = 1.57;
  for (const m of [legs, torso, head, cap]) { m.castShadow = true; g.add(m); }
  return g;
}

// ---------- kompletní model ----------
export function createBoatModel(spec) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.order = 'YXZ';
  root.add(tilt);

  const { hull, deck } = buildHull(spec);
  tilt.add(hull, deck);

  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.3 });
  const mastMat = spec.id === 'skiff' ? carbon : alu;

  // kabina a kokpit pro kýlové lodě
  if (spec.id !== 'skiff') {
    const cabinL = spec.L * 0.32, cabinW = spec.B * 0.55, cabinH = spec.id === 'ocean' ? 0.6 : 0.45;
    const cz = spec.mast.x - cabinL * 0.35;
    const sec = sheerAt(spec, cz);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), new THREE.MeshStandardMaterial({ color: spec.color === 0x1d3557 ? 0xf2f2f2 : 0xf7f7f7, roughness: 0.4 }));
    cabin.position.set(0, sec.sheer + cabinH / 2, cz);
    cabin.castShadow = true; cabin.receiveShadow = true;
    tilt.add(cabin);
    const win = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.02, cabinH * 0.3, cabinL * 0.6), new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.1, metalness: 0.6 }));
    win.position.copy(cabin.position); win.position.y += 0.02;
    tilt.add(win);
    const cockpitL = spec.L * 0.26;
    const cz2 = cz - cabinL / 2 - cockpitL / 2;
    const sec2 = sheerAt(spec, cz2);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(spec.B * 0.55, 0.02, cockpitL), new THREE.MeshStandardMaterial({ color: 0x8a6c4a, roughness: 0.9 }));
    cockpit.position.set(0, sec2.sheer + 0.01, cz2);
    cockpit.receiveShadow = true;
    tilt.add(cockpit);
    // zábradlí (relingy)
    const railPts = [];
    for (let i = 0; i <= 20; i++) {
      const z = -spec.L * 0.46 + (i / 20) * spec.L * 0.88;
      const s = sheerAt(spec, z);
      railPts.push(new THREE.Vector3(s.hb * 0.97, s.sheer + 0.6, z));
    }
    const railMat = new THREE.LineBasicMaterial({ color: 0xbfc5cc });
    for (const sgn of [1, -1]) {
      const pts = railPts.map((p) => new THREE.Vector3(p.x * sgn, p.y, p.z));
      tilt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), railMat));
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
  tilt.add(boomPivot);

  // kýl / meč
  const K = spec.keel;
  const keelMat = new THREE.MeshStandardMaterial({ color: spec.id === 'skiff' ? 0x30343a : 0x2a2a2a, roughness: 0.6 });
  const keelGroup = new THREE.Group();
  const hullAtKeel = sheerAt(spec, K.x);
  const shp = new THREE.Shape();
  const sweep = spec.id === 'skiff' ? 0 : K.chord * 0.35;
  shp.moveTo(K.chord / 2, 0); shp.lineTo(-K.chord / 2, 0); shp.lineTo(-K.chord / 2 * 0.7 - sweep, -K.span); shp.lineTo(K.chord / 2 * 0.6 - sweep, -K.span); shp.closePath();
  const kg = new THREE.ExtrudeGeometry(shp, { depth: K.chord * 0.12, bevelEnabled: false });
  kg.translate(0, 0, -K.chord * 0.06);
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
  const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.04, bevelEnabled: false }); rg.translate(0, 0, -0.02);
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
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 8), dark);
    ped.position.set(0, ws.sheer + 0.35, wz + 0.15);
    tilt.add(wheel, ped);
  }

  // lanoví
  const rig = [];
  const jib = spec.sails.find((s) => s.kind === 'jib');
  const add = (a, b) => rig.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
  add([0, jib.tack[1], jib.tack[0]], [0, jib.head[1], jib.head[0]]); // předstěh
  const hounds = jib.head[1];
  const chain = sheerAt(spec, spec.mast.x - 0.25);
  for (const sg of [1, -1]) {
    add([sg * chain.hb * 0.95, chain.sheer, spec.mast.x - 0.25], [0, hounds, spec.mast.x]);
    if (spec.id !== 'skiff') add([sg * chain.hb * 0.95, chain.sheer, spec.mast.x - 0.25], [0, spec.mast.top - 0.3, spec.mast.x]);
    // salingy
    add([0, hounds * 0.55, spec.mast.x], [sg * chain.hb * 0.7, hounds * 0.55, spec.mast.x - 0.15]);
  }
  if (spec.id !== 'skiff') { const st = sheerAt(spec, -spec.L / 2 + 0.2); add([0, st.sheer, -spec.L / 2 + 0.2], [0, spec.mast.top, spec.mast.x]); }
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
    const p = makePerson(jackets[i]);
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
        pushLine([bx * 0.95, h0 - 0.05, bz * 0.98 + 0.02 * mastX], [0, sheetBase.sheer + 0.05, mastX - s.foot * 0.95]);
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
      if (spec.id === 'skiff') {
        const z = i === 0 ? -1.05 : 0.05;
        const sec = sheerAt(spec, z);
        const half = sec.hb;
        p.position.set(0, sec.sheer, z);
        p.rotation.set(0, 0, 0);
        if (b.capsized) { p.position.set(0, 0.1, z); p.rotation.z = 0; p.visible = true; return; }
        if (arm > half * 0.95) {
          const ang = Math.asin(clamp((arm - half * 0.7) / 1.0, 0, 1));
          p.position.x = side * half;
          p.rotation.z = -side * ang;
          if (i === 1) { // trapézové lanko
            const hipY = sec.sheer + Math.cos(ang) * 1.0, hipX = side * (half + Math.sin(ang) * 1.0);
            tp.set([hipX, hipY, z, 0, 5.5 * spec.L / 4.5, mastX], 0);
          }
          if (i === 0) {
            const hipY = sec.sheer + Math.cos(ang) * 1.0, hipX = side * (half + Math.sin(ang) * 1.0);
            tp.set([hipX, hipY, z, 0, 5.4 * spec.L / 4.5, mastX], 6);
          }
        } else {
          p.position.x = side * Math.min(arm * 1.1, half - 0.05);
          p.position.y = sec.sheer - 0.35;
          p.rotation.z = -side * clamp(arm / half, 0, 1) * 0.5;
        }
      } else {
        const n = crew.length;
        const zHelm = spec.rudder.x + (spec.steering === 'wheel' ? 0.75 : 1.4);
        if (i === 0) {
          const sec = sheerAt(spec, zHelm);
          p.position.set(spec.steering === 'wheel' ? 0 : side * sec.hb * 0.6, sec.sheer + (spec.steering === 'wheel' ? 0 : -0.3), zHelm - (spec.steering === 'wheel' ? 0.6 : 0));
          p.rotation.set(0, spec.steering === 'wheel' ? 0 : -side * 0.6, 0);
          return;
        }
        const hiking = arm > spec.sitArm * 0.9;
        const z = hiking ? spec.mast.x - 0.6 - (i - 1) * (spec.L * 0.45 / n) : zHelm + 1.0 + (i - 1) * 0.8;
        const sec = sheerAt(spec, z);
        p.rotation.set(0, 0, 0);
        if (hiking) { p.position.set(side * (sec.hb + 0.12), sec.sheer - 0.62, z); p.rotation.z = -side * 0.5; }
        else { p.position.set(((i % 2) ? 1 : -1) * sec.hb * 0.45, sec.sheer - 0.35, z); }
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
