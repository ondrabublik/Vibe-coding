import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundelTexture, makeCanvas } from './util.js';

// Local frame of every aircraft: nose = −Z, up = +Y, right wing = +X.
// Origin is roughly the centre of gravity; wheels touch the ground at y = −2.

const roundels = {};
const getRoundel = (k) => roundels[k] || (roundels[k] = roundelTexture(k));

/** Flat planform in the XZ plane (pts are [x, z]), top face at y = +t/2. */
function planform(pts, thick, mat) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y → z, extrusion → −y
  g.translate(0, thick / 2, 0);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Vertical planform (pts are [z, y]), centred on x = 0. */
function finform(pts, thick, mat) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x → z, extrusion → −x
  g.translate(thick / 2, 0, 0);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

const mirror = (pts) => pts.map(([a, b]) => [-a, b]);

let missileParts = null;
function missileGeometry() {
  if (missileParts) return missileParts;
  const body = [new THREE.CylinderGeometry(0.065, 0.065, 2.7, 10).rotateX(Math.PI / 2)];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const place = (g, r, z) => g.rotateZ(a - Math.PI / 2).translate(Math.cos(a) * r, Math.sin(a) * r, z);
    body.push(place(new THREE.BoxGeometry(0.015, 0.34, 0.32), 0.17, 1.15));
    body.push(place(new THREE.BoxGeometry(0.015, 0.22, 0.16), 0.12, -1.0));
  }
  const clean = (g) => {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    return g;
  };
  missileParts = {
    body: mergeGeometries(body.map(clean)),
    nose: new THREE.ConeGeometry(0.065, 0.3, 10).rotateX(-Math.PI / 2).translate(0, 0, -1.5),
    white: new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.5, metalness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 }),
  };
  return missileParts;
}

export function buildMissileMesh() {
  const p = missileGeometry();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(p.body, p.white), new THREE.Mesh(p.nose, p.dark));
  return g;
}

export function buildJet(opts = {}) {
  const { color = 0x9aa3ab, marking = 'cz', twin = false } = opts;
  const root = new THREE.Group();
  const M = {
    skin: new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2f34, metalness: 0.5, roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5a5d61, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x2a3c50, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.55,
    }),
    tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    strut: new THREE.MeshStandardMaterial({ color: 0xcfd2d4, metalness: 0.6, roughness: 0.4 }),
  };
  const parts = { missiles: [], ailerons: [], stabs: [], rudders: [] };
  const add = (m, parent = root) => {
    parent.add(m);
    return m;
  };

  // fuselage (lathe around the long axis)
  const prof = [
    [0.0, -7.0], [0.5, -7.0], [0.62, -6.2], [0.86, -4.8], [0.96, -2.4], [0.98, 0.6], [0.92, 2.6],
    [0.76, 4.4], [0.54, 5.8], [0.3, 7.0], [0.1, 7.9], [0.0, 8.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fg = new THREE.LatheGeometry(prof, 20);
  fg.rotateX(-Math.PI / 2);
  fg.scale(1, 0.86, 1);
  add(new THREE.Mesh(fg, M.skin));
  const radome = new THREE.Mesh(
    new THREE.LatheGeometry([[0.31, 7.0], [0.1, 7.9], [0.0, 8.31]].map(([r, y]) => new THREE.Vector2(r, y)), 20)
      .rotateX(-Math.PI / 2)
      .scale(1, 0.86, 1),
    M.dark
  );
  add(radome);

  // canopy, pilot, spine, intake
  const canopy = add(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), M.glass));
  canopy.scale.set(0.5, 0.52, 1.9);
  canopy.position.set(0, 0.78, -3.5);
  parts.canopy = canopy;
  const helmet = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M.dark));
  helmet.position.set(0, 1.02, -3.25);
  parts.pilot = helmet;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 7.2), M.skin)).position.set(0, 0.6, 1.9);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 4.2), M.skin)).position.set(0, -0.78, -0.4);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.56, 0.1), M.dark)).position.set(0, -0.78, -2.52);

  // wings with LERX
  const wingR = [[0.6, -4.4], [1.3, -1.6], [5.0, 1.9], [5.0, 3.0], [0.6, 3.6]];
  for (const pts of [wingR, mirror(wingR)]) add(planform(pts, 0.16, M.skin)).position.y = -0.05;
  for (const side of [-1, 1]) {
    const piv = add(new THREE.Group());
    piv.position.set(3.7 * side, -0.05, 3.18);
    piv.rotation.y = side * 0.136;
    const ail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.42), M.skin);
    ail.position.z = 0.2;
    piv.add(ail);
    parts.ailerons.push(piv);
  }

  // all-moving horizontal stabilisers
  const stabR = [[0.5, -1.4], [3.4, 0.4], [3.4, 1.3], [0.5, 1.4]];
  for (const pts of [stabR, mirror(stabR)]) {
    const piv = add(new THREE.Group());
    piv.position.set(0, -0.1, 6.1);
    piv.add(planform(pts, 0.1, M.skin));
    parts.stabs.push(piv);
  }

  // vertical tail(s)
  const finPts = [[3.2, 0.0], [6.1, 3.7], [7.2, 3.7], [7.5, 0.0]];
  const fins = twin ? [[-1.0, 0.28], [1.0, -0.28]] : [[0, 0]];
  for (const [fx, tilt] of fins) {
    const fin = add(new THREE.Group());
    fin.position.set(fx, 0.62, twin ? 0.3 : 0);
    fin.rotation.z = tilt;
    fin.add(finform(twin ? finPts.map(([z, y]) => [z, y * 0.8]) : finPts, 0.15, M.skin));
    const rpiv = new THREE.Group();
    rpiv.position.set(0, 0, 7.35);
    const rud = new THREE.Mesh(new THREE.BoxGeometry(0.09, twin ? 2.2 : 2.8, 0.5), M.skin);
    rud.position.set(0, twin ? 1.6 : 1.8, 0.22);
    rpiv.add(rud);
    fin.add(rpiv);
    parts.rudders.push(rpiv);
    // marking on the fin
    const decal = new THREE.MeshBasicMaterial({ map: getRoundel(marking), transparent: true });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), decal);
      p.position.set(s * 0.085, twin ? 1.7 : 1.9, 6.2);
      p.rotation.y = (s * Math.PI) / 2;
      fin.add(p);
    }
  }
  const wingDecal = new THREE.MeshBasicMaterial({ map: getRoundel(marking), transparent: true });
  for (const s of [-1, 1]) {
    const p = add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), wingDecal));
    p.position.set(s * 3.4, 0.045, 2.2);
  }

  // engine nozzle, glow and afterburner flame
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.3, 18, 1, true).rotateX(Math.PI / 2), M.metal)).position.z = 7.4;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x331100 });
  const glow = add(new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), glowMat));
  glow.position.z = 7.0;
  parts.nozzleGlow = glowMat;
  const flame = add(new THREE.Group());
  flame.position.z = 8.0;
  const coneGeo = (r) => new THREE.ConeGeometry(r, 1, 16, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff7a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x9fc4ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(coneGeo(0.48), outerMat);
  const inner = new THREE.Mesh(coneGeo(0.3), innerMat);
  flame.add(outer, inner);
  parts.flame = flame;
  parts.flameOuter = outer;
  parts.flameInner = inner;

  // landing gear
  const wheel = (r, w) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), M.tire);
  const nose = add(new THREE.Group());
  nose.position.set(0, -0.7, -4.6);
  const ns = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), M.strut);
  ns.position.y = -0.5;
  const nw = wheel(0.3, 0.2);
  nw.position.y = -1.0;
  nose.add(ns, nw);
  parts.gearNose = nose;
  parts.gearMain = [];
  for (const s of [-1, 1]) {
    const g = add(new THREE.Group());
    g.position.set(1.2 * s, -0.7, 0.9);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.85, 8), M.strut);
    st.position.y = -0.42;
    const w = wheel(0.45, 0.3);
    w.position.y = -0.85;
    g.add(st, w);
    g.userData.side = s;
    parts.gearMain.push(g);
  }

  // missiles on wingtip rails and under-wing pylons (firing order: outer → inner)
  const slots = [[-5.1, -0.02, 2.0], [5.1, -0.02, 2.0], [-3.6, -0.55, 1.6], [3.6, -0.55, 1.6], [-2.35, -0.55, 1.2], [2.35, -0.55, 1.2]];
  slots.forEach(([x, y, z], i) => {
    if (i >= 2) add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 1.3), M.skin)).position.set(x, -0.3, z + 0.2);
    const m = add(buildMissileMesh());
    m.position.set(x, y, z);
    parts.missiles.push(m);
  });

  // navigation lights
  const navL = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })));
  navL.position.set(-5.05, 0.05, 2.9);
  const navR = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20ff40 })));
  navR.position.set(5.05, 0.05, 2.9);
  const strobe = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  strobe.position.set(twin ? 0 : 0, twin ? 0.9 : 4.4, 7.4);
  parts.strobe = strobe;

  parts.muzzle = new THREE.Vector3(-0.75, 0.45, -4.4);
  const noShadow = new Set([canopy, outer, inner, navL, navR, strobe, glow]);
  root.traverse((o) => {
    if (o.isMesh && !noShadow.has(o) && !(o.material && o.material.transparent)) o.castShadow = true;
  });
  return { group: root, parts, eye: new THREE.Vector3(0, 1.03, -3.3) };
}

// ---------------------------------------------------------------------------
// Cockpit interior (child of the player's aircraft, visible in cockpit view)
// ---------------------------------------------------------------------------
export function buildCockpit() {
  const g = new THREE.Group();
  const panel = new THREE.MeshLambertMaterial({ color: 0x3b4148, emissive: 0x0e1012 });
  const black = new THREE.MeshLambertMaterial({ color: 0x1b1e22, emissive: 0x07080a });
  const frame = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.5 });
  const box = (w, h, d, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  // eye is at (0, 1.03, -3.3); instrument panel below the line of sight
  box(1.1, 0.46, 0.05, panel, 0, 0.64, -3.8, -0.2);
  box(1.14, 0.04, 0.3, black, 0, 0.87, -3.9); // glare shield
  box(1.2, 0.5, 0.6, black, 0, 0.3, -3.95); // footwell / tub front
  box(1.15, 0.1, 1.4, black, 0, 0.69, -3.05); // cockpit floor over the fuselage skin
  box(0.05, 0.4, 2.0, panel, -0.6, 0.62, -3.0);
  box(0.05, 0.4, 2.0, panel, 0.6, 0.62, -3.0);
  box(0.22, 0.08, 1.1, panel, -0.47, 0.78, -3.0);
  box(0.22, 0.08, 1.1, panel, 0.47, 0.78, -3.0);
  box(0.12, 0.09, 0.03, black, 0, 0.8, -3.76, -0.2); // up-front control panel

  // multifunction displays (canvas textures, redrawn by the game)
  const mfds = [];
  for (const x of [-0.24, 0.24]) {
    const c = makeCanvas(256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, 0.69, -3.752);
    m.rotation.x = -0.2;
    g.add(m);
    box(0.235, 0.235, 0.02, black, x, 0.69, -3.775, -0.2);
    mfds.push({ canvas: c, ctx: c.getContext('2d'), tex });
  }
  // HUD combiner glass on top of the glare shield
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.15),
    new THREE.MeshBasicMaterial({ color: 0x88ffaa, transparent: true, opacity: 0.06, depthWrite: false })
  );
  glass.position.set(0, 0.965, -3.86);
  glass.rotation.x = -0.3;
  g.add(glass);
  box(0.26, 0.012, 0.02, frame, 0, 0.892, -3.84);

  // canopy frame: front bow, rails and rear hoop
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.02, 6, 30, Math.PI), frame);
  bow.position.set(0, 0.84, -4.15);
  bow.rotation.x = -0.55;
  bow.scale.set(1, 0.85, 1);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 30, Math.PI), frame);
  hoop.position.set(0, 0.84, -2.2);
  hoop.scale.set(1, 0.85, 1);
  g.add(bow, hoop);
  box(0.05, 0.05, 2.0, frame, -0.6, 0.84, -3.15);
  box(0.05, 0.05, 2.0, frame, 0.6, 0.84, -3.15);
  return { group: g, mfds };
}
