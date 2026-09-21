'use strict';
// Detailed biplane model (Sopwith Camel-like) generated procedurally: lofted fuselage,
// cambered wings with rounded tips, rotary engine, streamlined struts and moving control surfaces.
(function (BW) {
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion, MB = BABYLON.MeshBuilder;
  const TW = 512, TH = 1024;

  // Colour schemes. Markings: 'roundel' (allied) or 'cross' (enemy).
  BW.SCHEMES = {
    player: { body: '#5f5a36', wingTop: '#5c5a33', under: '#d9d1b0', nose: '#d8b23a', panel: '#9a9c98', marking: 'roundel', band: '#ece6d2' },
    ally: { body: '#5f5a36', wingTop: '#5c5a33', under: '#d9d1b0', nose: '#9aa0a6', panel: '#9a9c98', marking: 'roundel' },
    enemies: [
      { body: '#8e1b17', wingTop: '#8e1b17', under: '#9fb7c9', nose: '#8e1b17', panel: '#8e1b17', marking: 'cross' },
      { body: '#5a3d6e', wingTop: '#4f5d3a', under: '#9fb7c9', nose: '#c9c1a0', panel: '#8f8f88', marking: 'cross' },
      { body: '#b88f2c', wingTop: '#4e5a34', under: '#a8bccb', nose: '#2b2b2b', panel: '#2b2b2b', marking: 'cross' },
      { body: '#2f4d6a', wingTop: '#56603c', under: '#a8bccb', nose: '#b21e1e', panel: '#b21e1e', marking: 'cross' },
      { body: '#1f1f1f', wingTop: '#6a5a3a', under: '#b0b8c0', nose: '#e0e0e0', panel: '#e0e0e0', marking: 'cross' },
    ],
  };

  // Fuselage cross-sections (nose -> tail): half width w, height above/below centre ht/hb,
  // centre height y and superellipse exponent n (2 = ellipse, larger = boxier).
  const FUS = [
    { z: 1.86, w: 0.5, ht: 0.52, hb: 0.52, y: 0.05, n: 2.2 },
    { z: 1.6, w: 0.49, ht: 0.6, hb: 0.51, y: 0.05, n: 2.6 },
    { z: 1.0, w: 0.47, ht: 0.66, hb: 0.5, y: 0.05, n: 3 },
    { z: 0.35, w: 0.46, ht: 0.62, hb: 0.5, y: 0.06, n: 3 },
    { z: -0.1, w: 0.45, ht: 0.53, hb: 0.49, y: 0.07, n: 3 },
    { z: -0.8, w: 0.42, ht: 0.47, hb: 0.46, y: 0.08, n: 3 },
    { z: -1.8, w: 0.32, ht: 0.36, hb: 0.36, y: 0.12, n: 2.8 },
    { z: -2.9, w: 0.19, ht: 0.23, hb: 0.23, y: 0.17, n: 2.6 },
    { z: -3.7, w: 0.09, ht: 0.12, hb: 0.12, y: 0.2, n: 2.4 },
    { z: -4.05, w: 0.012, ht: 0.03, hb: 0.03, y: 0.22, n: 2 },
  ];
  const FZMAX = FUS[0].z, FZMIN = FUS[FUS.length - 1].z;

  // Smooth (Catmull-Rom) interpolation of the section parameters along z.
  function section(z) {
    let k = 0;
    while (k < FUS.length - 2 && z < FUS[k + 1].z) k++;
    const a = FUS[k], b = FUS[k + 1], p0 = FUS[k - 1] || a, p3 = FUS[k + 2] || b;
    const t = BW.clamp((a.z - z) / (a.z - b.z), 0, 1), t2 = t * t, t3 = t2 * t;
    const cr = (key) => 0.5 * (2 * a[key] + (-p0[key] + b[key]) * t + (2 * p0[key] - 5 * a[key] + 4 * b[key] - p3[key]) * t2 +
      (-p0[key] + 3 * a[key] - 3 * b[key] + p3[key]) * t3);
    return { w: Math.max(0.005, cr('w')), ht: Math.max(0.01, cr('ht')), hb: Math.max(0.01, cr('hb')), y: cr('y'), n: cr('n') };
  }
  // Point on a section; t = 0 bottom, pi/2 right side, pi top.
  function sectionPoint(s, t) {
    const sn = Math.sin(t), cs = Math.cos(t), e = 2 / s.n;
    const x = s.w * Math.sign(sn) * Math.pow(Math.abs(sn), e);
    const y = -Math.sign(cs) * Math.pow(Math.abs(cs), e) * (cs > 0 ? s.hb : s.ht);
    return [x, s.y + y];
  }
  function perimeter(z) {
    const s = section(z);
    let p = 0, prev = sectionPoint(s, 0);
    for (let j = 1; j <= 64; j++) {
      const q = sectionPoint(s, (j / 64) * Math.PI * 2);
      p += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
    return p;
  }

  function drawMarking(ctx, cx, cy, rx, ry, type) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / 50, ry / 50);
    if (type === 'roundel') {
      [['#1d3d8f', 50], ['#f2f2f2', 34], ['#b8241c', 17]].forEach(([c, r]) => {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-50, -50, 100, 100);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      // Cross pattée
      ctx.moveTo(-14, -14); ctx.lineTo(-20, -44); ctx.lineTo(20, -44); ctx.lineTo(14, -14);
      ctx.lineTo(44, -20); ctx.lineTo(44, 20); ctx.lineTo(14, 14);
      ctx.lineTo(20, 44); ctx.lineTo(-20, 44); ctx.lineTo(-14, 14);
      ctx.lineTo(-44, 20); ctx.lineTo(-44, -20); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  BW.drawMarking = drawMarking;

  // Texture atlas regions [x0, y0, x1, y1] in canvas pixels (512 x 1024).
  const R = {
    top: [0, 0, 512, 128], bot: [0, 128, 512, 256], rud: [0, 256, 256, 384], pbot: [256, 256, 512, 384],
    ptop: [0, 384, 512, 512], fus: [0, 512, 512, 1024],
  };

  function makeSkin(scene, scheme) {
    const dt = new BABYLON.DynamicTexture('skin', { width: TW, height: TH }, scene, true);
    const ctx = dt.getContext();
    const ribs = (x0, y0, x1, y1) => {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      for (let x = x0 + 8; x < x1; x += 21) ctx.fillRect(x, y0, 3, y1 - y0);
    };
    ctx.fillStyle = scheme.wingTop; ctx.fillRect(0, 0, 512, 128); ctx.fillRect(0, 384, 512, 128);
    ctx.fillStyle = scheme.under; ctx.fillRect(0, 128, 512, 128); ctx.fillRect(256, 256, 256, 128);
    ribs(0, 0, 512, 128); ribs(0, 384, 512, 512); ribs(0, 128, 512, 256); ribs(256, 256, 512, 384);
    // Upper wing top: markings outboard, on the fixed part in front of the ailerons.
    const ux = 3.0 / 8.6, rTop = 0.47;
    drawMarking(ctx, 256 - ux * 512, 0.36 * 128, (rTop / 8.6) * 512, (rTop / 1.45) * 128, scheme.marking);
    drawMarking(ctx, 256 + ux * 512, 0.36 * 128, (rTop / 8.6) * 512, (rTop / 1.45) * 128, scheme.marking);
    if (scheme.band) { ctx.fillStyle = scheme.band; ctx.fillRect(240, 0, 32, 128); }
    // Lower wing underside
    const lx = 3.0 / 8.0, rBot = 0.5;
    drawMarking(ctx, 256 - lx * 512, 192, (rBot / 8.0) * 512, (rBot / 1.35) * 128, scheme.marking);
    drawMarking(ctx, 256 + lx * 512, 192, (rBot / 8.0) * 512, (rBot / 1.35) * 128, scheme.marking);
    // Rudder
    if (scheme.marking === 'roundel') {
      ['#b8241c', '#f2f2f2', '#1d3d8f'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * 85.3, 256, 86, 128); });
    } else {
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 256, 256, 128);
      drawMarking(ctx, 128, 320, 50, 44, 'cross');
    }

    // Fuselage: u around the section (0 = bottom, 0.25 right, 0.5 top), v along the length.
    const fy = (z) => 512 + (1 - (z - FZMIN) / (FZMAX - FZMIN)) * 512;
    ctx.fillStyle = scheme.body; ctx.fillRect(0, 512, 512, 512);
    const under = ctx.createLinearGradient(0, 0, 512, 0);
    under.addColorStop(0, scheme.under); under.addColorStop(0.1, scheme.under); under.addColorStop(0.16, 'rgba(0,0,0,0)');
    under.addColorStop(0.84, 'rgba(0,0,0,0)'); under.addColorStop(0.9, scheme.under); under.addColorStop(1, scheme.under);
    ctx.fillStyle = under; ctx.fillRect(0, 512, 512, 512);
    // Metal panels behind the cowling
    ctx.fillStyle = scheme.panel; ctx.fillRect(0, 512, 512, fy(1.0) - 512);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, fy(1.0) - 1, 512, 2);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(i * 64 + 30, 512, 1.5, fy(1.0) - 512); }
    // Stringers and frames
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (const u of [0.18, 0.3, 0.42, 0.58, 0.7, 0.82]) ctx.fillRect(u * 512, fy(1.0), 2, 1024 - fy(1.0));
    for (let z = 0.6; z > FZMIN; z -= 0.55) ctx.fillRect(0, fy(z), 512, 1.5);
    // Cockpit opening
    const pc = perimeter(-0.35);
    ctx.fillStyle = '#1a1510';
    ctx.beginPath();
    ctx.ellipse(256, fy(-0.3), (0.28 / pc) * 512, (0.4 / (FZMAX - FZMIN)) * 512, 0, 0, Math.PI * 2);
    ctx.fill();
    // Side markings and the player's fuselage band
    const zm = -2.3, pm = perimeter(zm), rm = 0.3;
    for (const u of [0.25, 0.75]) drawMarking(ctx, u * 512, fy(zm), (rm / pm) * 512, (rm / (FZMAX - FZMIN)) * 512, scheme.marking);
    if (scheme.band) { ctx.fillStyle = scheme.band; ctx.fillRect(0, fy(-1.35), 512, (0.28 / (FZMAX - FZMIN)) * 512); }
    dt.update();
    const mat = new BABYLON.StandardMaterial('skinMat', scene);
    mat.diffuseTexture = dt;
    mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    mat.specularPower = 24;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    return mat;
  }

  function mapUV(u, v, rect) {
    return [(rect[0] + u * (rect[2] - rect[0])) / TW, 1 - (rect[3] - v * (rect[3] - rect[1])) / TH];
  }

  function meshFrom(scene, name, pos, idx, uv, smoothSeam) {
    const normals = [];
    BABYLON.VertexData.ComputeNormals(pos, idx, normals);
    if (smoothSeam) smoothSeam(normals);
    const vd = new BABYLON.VertexData();
    vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uv;
    const m = new BABYLON.Mesh(name, scene);
    vd.applyToMesh(m);
    return m;
  }

  function buildFuselage(scene) {
    const rings = 44, seg = 36, pos = [], uv = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const z = FZMAX + ((FZMIN - FZMAX) * i) / rings;
      const s = section(z);
      for (let j = 0; j <= seg; j++) {
        const [x, y] = sectionPoint(s, (j / seg) * Math.PI * 2);
        pos.push(x, y, z);
        uv.push(...mapUV(j / seg, (z - FZMIN) / (FZMAX - FZMIN), R.fus));
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // Average normals across the texture seam so it doesn't show.
    const seam = (n) => {
      for (let i = 0; i <= rings; i++) {
        const a = i * (seg + 1) * 3, b = (i * (seg + 1) + seg) * 3;
        for (let k = 0; k < 3; k++) { const v = (n[a + k] + n[b + k]) / 2; n[a + k] = n[b + k] = v; }
      }
    };
    return meshFrom(scene, 'fuselage', pos, idx, uv, seam);
  }

  // Cambered wing with rounded tips. Returns [top surface, bottom surface].
  function buildWing(scene, o) {
    const half = o.span / 2, tipR = o.tipR || 0, nc = 12;
    const xs = new Set();
    for (let i = 0; i <= 40; i++) xs.add(+(-half + (o.span * (1 - Math.cos((Math.PI * i) / 40))) / 2).toFixed(4));
    (o.breaks || []).forEach((b) => { xs.add(b); xs.add(-b); });
    const stations = Array.from(xs).sort((a, b) => a - b);
    const top = { pos: [], uv: [] }, bot = { pos: [], uv: [] };
    for (const x of stations) {
      const ax = Math.abs(x);
      let cf = 1;
      if (tipR > 0 && ax > half - tipR) { const q = (ax - (half - tipR)) / tipR; cf = Math.sqrt(Math.max(0, 1 - q * q)); }
      const zLE = o.zc + (o.chord / 2) * cf;
      let zTE = o.zc - (o.chord / 2) * cf;
      if (o.teCut) zTE = Math.min(zTE + o.teCut(ax), zLE - 0.02 * cf);
      const y0 = o.y + ax * Math.tan(o.dihedral || 0);
      const lc = zLE - zTE;
      for (let k = 0; k <= nc; k++) {
        const s = (1 - Math.cos((Math.PI * k) / nc)) / 2;
        const z = zLE - lc * s;
        const th = o.thick * lc * 5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
        const cam = (o.camber || 0) * lc * 4 * s * (1 - s);
        const u = (x + half) / o.span, v = (z - (o.zc - o.chord / 2)) / o.chord;
        top.pos.push(x, y0 + cam + th, z); top.uv.push(...mapUV(u, v, o.rectTop));
        bot.pos.push(x, y0 + cam - th * 0.45, z); bot.uv.push(...mapUV(u, v, o.rectBot));
      }
    }
    const idx = [];
    for (let i = 0; i < stations.length - 1; i++) for (let k = 0; k < nc; k++) {
      const a = i * (nc + 1) + k, b = a + nc + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return [meshFrom(scene, 'wingT', top.pos, idx, top.uv), meshFrom(scene, 'wingB', bot.pos, idx.slice(), bot.uv)];
  }

  // Thin flat plate from a convex outline [[z, y], ...] in the x = 0 plane.
  function buildPlate(scene, outline, thick, rect) {
    let zmin = 1e9, zmax = -1e9, ymin = 1e9, ymax = -1e9, cz = 0, cy = 0;
    outline.forEach(([z, y]) => { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); cz += z; cy += y; });
    cz /= outline.length; cy /= outline.length;
    const pos = [], uv = [], idx = [];
    const uvOf = (z, y) => mapUV((zmax - z) / (zmax - zmin), (y - ymin) / (ymax - ymin), rect);
    for (const sx of [-1, 1]) {
      const base = pos.length / 3;
      pos.push(sx * thick, cy, cz); uv.push(...uvOf(cz, cy));
      outline.forEach(([z, y]) => { pos.push(sx * thick * 0.6, y, z); uv.push(...uvOf(z, y)); });
      for (let i = 0; i < outline.length; i++) idx.push(base, base + 1 + i, base + 1 + ((i + 1) % outline.length));
    }
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const a = 1 + i, b = 1 + ((i + 1) % n);
      idx.push(a, b, n + 1 + a, b, n + 1 + b, n + 1 + a);
    }
    return meshFrom(scene, 'plate', pos, idx, uv);
  }

  function makeCowling(scene) {
    const prof = [[0.5, 1.78], [0.545, 1.88], [0.572, 2.05], [0.575, 2.25], [0.56, 2.4], [0.53, 2.47], [0.49, 2.49], [0.45, 2.46]];
    const m = MB.CreateLathe('cowl', { shape: prof.map(([r, z]) => new V3(r, z, 0)), tessellation: 36, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.05;
    return m;
  }

  // Shared material cache per scene.
  BW.getMat = function (scene, hex, opts) {
    opts = opts || {};
    const key = hex + JSON.stringify(opts);
    scene._bwMats = scene._bwMats || {};
    if (scene._bwMats[key]) return scene._bwMats[key];
    const m = new BABYLON.StandardMaterial('m' + hex, scene);
    const c = BW.hex(hex);
    if (opts.emissive) { m.emissiveColor = c; m.diffuseColor = BABYLON.Color3.Black(); m.disableLighting = true; }
    else m.diffuseColor = c;
    m.specularColor = new BABYLON.Color3(opts.spec || 0.05, opts.spec || 0.05, opts.spec || 0.05);
    if (opts.power) m.specularPower = opts.power;
    if (opts.alpha !== undefined) m.alpha = opts.alpha;
    if (opts.twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    scene._bwMats[key] = m;
    return m;
  };

  BW.buildBiplane = function (scene, scheme, name) {
    scene._bwSkins = scene._bwSkins || new Map();
    if (!scene._bwSkins.has(scheme)) scene._bwSkins.set(scheme, makeSkin(scene, scheme));
    const skin = scene._bwSkins.get(scheme);
    const nose = BW.getMat(scene, scheme.nose, { spec: 0.45, power: 48 });
    const metal = BW.getMat(scene, '#2e2e2c', { spec: 0.5, power: 40 });
    const steel = BW.getMat(scene, '#6d6f70', { spec: 0.6, power: 60 });
    const wood = BW.getMat(scene, '#7a5230', { spec: 0.3, power: 30 });
    const tire = BW.getMat(scene, '#1c1c1c', { spec: 0.1 });
    const strut = BW.getMat(scene, '#5a4632', { spec: 0.15 });
    const leather = BW.getMat(scene, '#4a3421', { spec: 0.2 });
    const hub = BW.getMat(scene, scheme.under);
    const glass = BW.getMat(scene, '#cfe3ea', { alpha: 0.25, spec: 0.9, power: 80, twoSided: true });

    const groups = new Map();
    const add = (mesh, mat) => {
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(mesh);
      return mesh;
    };
    const cyl = (len, dTop, dBot, tess, mat, x, y, z, axis) => {
      const m = MB.CreateCylinder('c', { height: len, diameterTop: dTop, diameterBottom: dBot, tessellation: tess }, scene);
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      else if (axis === 'x') m.rotation.z = Math.PI / 2;
      m.position.set(x, y, z);
      return add(m, mat);
    };
    // Streamlined strut between two points (flattened sideways so the chord follows the airflow).
    const strutBetween = (a, b, d, mat, flat) => {
      const dir = b.subtract(a), len = dir.length();
      const m = MB.CreateCylinder('s', { height: len, diameter: d, tessellation: 10 }, scene);
      m.scaling.x = flat || 1;
      m.position = a.add(b).scale(0.5);
      const up = new V3(0, 1, 0), n = dir.normalize();
      const axis = V3.Cross(up, n), ang = Math.acos(BW.clamp(V3.Dot(up, n), -1, 1));
      m.rotationQuaternion = axis.length() > 1e-6 ? Q.RotationAxis(axis.normalize(), ang) : Q.Identity();
      return add(m, mat);
    };

    // Fuselage and cowling
    add(buildFuselage(scene), skin);
    add(makeCowling(scene), nose);
    // Cockpit coaming, windscreen
    const coam = MB.CreateTorus('coam', { diameter: 0.6, thickness: 0.07, tessellation: 28 }, scene);
    coam.scaling.z = 1.4; coam.position.set(0, 0.58, -0.3);
    add(coam, leather);
    const ws = MB.CreatePlane('ws', { width: 0.3, height: 0.16 }, scene);
    ws.position.set(0, 0.8, 0.12); ws.rotation.x = -0.35;
    add(ws, glass);

    // Twin Vickers guns: cooling jacket, muzzle, breech
    for (const sx of [-1, 1]) {
      cyl(0.95, 0.1, 0.1, 12, metal, sx * 0.18, 0.66, 1.42, 'z');
      cyl(0.14, 0.06, 0.07, 10, metal, sx * 0.18, 0.66, 1.96, 'z');
      const br = MB.CreateBox('br', { width: 0.11, height: 0.13, depth: 0.3 }, scene);
      br.position.set(sx * 0.18, 0.66, 0.82);
      add(br, metal);
    }

    // Wings. Upper: flat, centre cut-out and aileron cut-outs. Lower: 5 deg dihedral.
    const AIL = { x0: 2.2, x1: 3.7, c: 0.4 };
    const upperCut = (ax) => {
      let c = 0;
      if (ax < 0.55) c = 0.42 * Math.sqrt(1 - (ax / 0.55) ** 2);
      if (ax > AIL.x0 && ax < AIL.x1) c = AIL.c;
      return c;
    };
    buildWing(scene, {
      span: 8.6, chord: 1.45, zc: 0.75, y: 1.3, thick: 0.08, camber: 0.035, tipR: 0.6,
      teCut: upperCut, breaks: [0.001, AIL.x0 - 0.001, AIL.x0 + 0.001, AIL.x1 - 0.001, AIL.x1 + 0.001],
      rectTop: R.top, rectBot: R.pbot,
    }).forEach((m) => add(m, skin));
    const dih = (5 * Math.PI) / 180;
    buildWing(scene, {
      span: 8.0, chord: 1.35, zc: 0.35, y: -0.42, thick: 0.08, camber: 0.035, tipR: 0.55, dihedral: dih,
      teCut: (ax) => (ax < 0.5 ? 1.35 : 0), breaks: [0.499, 0.501],
      rectTop: R.ptop, rectBot: R.bot,
    }).forEach((m) => add(m, skin));
    // Tailplane (fixed part)
    buildWing(scene, { span: 3.1, chord: 0.55, zc: -3.5, y: 0.22, thick: 0.07, tipR: 0.3, rectTop: R.ptop, rectBot: R.pbot })
      .forEach((m) => add(m, skin));
    // Fin
    add(buildPlate(scene, [[-3.05, 0.34], [-3.4, 0.62], [-3.72, 0.98], [-3.8, 0.98], [-3.8, 0.3]], 0.03, R.ptop), skin);

    // Struts and rigging
    const lowerY = (x) => -0.42 + Math.abs(x) * Math.tan(dih);
    for (const sx of [-1, 1]) {
      for (const [zl, zu] of [[0.85, 1.2], [-0.05, 0.3]]) {
        strutBetween(new V3(sx * 2.95, lowerY(2.95), zl), new V3(sx * 2.95, 1.3, zu), 0.09, strut, 0.4);
        strutBetween(new V3(sx * 0.3, 0.64, zl + 0.3), new V3(sx * 0.42, 1.3, zu + 0.25), 0.06, steel, 0.5);
      }
      strutBetween(new V3(sx * 0.45, -0.36, 0.45), new V3(sx * 2.9, 1.28, 0.7), 0.018, steel);
      strutBetween(new V3(sx * 0.45, -0.34, 0.25), new V3(sx * 2.9, 1.28, 0.5), 0.018, steel);
      strutBetween(new V3(sx * 0.45, 1.28, 0.7), new V3(sx * 2.9, lowerY(2.9), 0.4), 0.018, steel);
      // Tail bracing
      strutBetween(new V3(sx * 0.05, 0.95, -3.76), new V3(sx * 1.0, 0.24, -3.55), 0.015, steel);
    }
    // Landing gear: streamlined V-struts, spreader bar, covered wheels
    for (const sx of [-1, 1]) {
      strutBetween(new V3(sx * 0.33, -0.43, 1.5), new V3(sx * 0.8, -1.12, 1.2), 0.08, strut, 0.45);
      strutBetween(new V3(sx * 0.33, -0.43, 0.6), new V3(sx * 0.8, -1.12, 1.2), 0.08, strut, 0.45);
      const t = MB.CreateTorus('tire', { diameter: 0.57, thickness: 0.13, tessellation: 28 }, scene);
      t.rotation.z = Math.PI / 2; t.position.set(sx * 0.95, -1.12, 1.2);
      add(t, tire);
      cyl(0.1, 0.5, 0.5, 24, hub, sx * 0.95, -1.12, 1.2, 'x');
    }
    cyl(1.9, 0.06, 0.06, 8, steel, 0, -1.12, 1.2, 'x');

    const root = new BABYLON.TransformNode(name || 'plane', scene);
    root.rotationQuaternion = Q.Identity();
    const meshes = [];
    const finish = (list, mat, parent, nm) => {
      const merged = list.length === 1 ? list[0] : BABYLON.Mesh.MergeMeshes(list, true, true);
      merged.name = nm || 'part';
      merged.material = mat;
      merged.parent = parent;
      merged.isPickable = false;
      meshes.push(merged);
      return merged;
    };
    let body = null;
    for (const [mat, list] of groups) {
      const m = finish(list, mat, root);
      if (mat === skin) body = m;
    }

    // Moving control surfaces on hinge pivots
    const pivot = (x, y, z) => {
      const n = new BABYLON.TransformNode('pivot', scene);
      n.parent = root; n.position.set(x, y, z);
      return n;
    };
    const elev = pivot(0, 0.22, -3.775);
    finish(buildWing(scene, { span: 3.0, chord: 0.42, zc: -0.21, y: 0, thick: 0.06, tipR: 0.55, rectTop: R.ptop, rectBot: R.pbot }), skin, elev, 'elevator');
    const rud = pivot(0, 0.25, -3.8);
    const rOut = [];
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI; rOut.push([-0.55 * Math.sin(a), 0.51 + 0.49 * Math.cos(a)]); }
    finish([buildPlate(scene, rOut, 0.03, R.rud)], skin, rud, 'rudder');
    const ailZ = 0.75 - 1.45 / 2 + AIL.c;
    const ailerons = [-1, 1].map((sx) => {
      const pv = pivot(sx * (AIL.x0 + AIL.x1) / 2, 1.3, ailZ);
      finish(buildWing(scene, { span: AIL.x1 - AIL.x0 - 0.02, chord: AIL.c, zc: -AIL.c / 2, y: 0, thick: 0.05, camber: 0.02, rectTop: R.ptop, rectBot: R.pbot }), skin, pv, 'aileron');
      return pv;
    });

    // Pilot
    const pilot = new BABYLON.TransformNode('pilot', scene);
    pilot.parent = root;
    const bust = BW.buildPilotBust(scene, pilot);
    meshes.push(...bust.meshes);

    // Rotary engine + propeller (the whole engine spins with the prop, as on the real Clerget)
    const prop = new BABYLON.TransformNode('prop', scene);
    prop.parent = root;
    prop.position.set(0, 0.05, 2.62);
    const cyls = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const c = MB.CreateCylinder('ec', { height: 0.26, diameterTop: 0.09, diameterBottom: 0.13, tessellation: 10 }, scene);
      c.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.25);
      c.rotation.z = a - Math.PI / 2;
      cyls.push(c);
    }
    const crank = MB.CreateCylinder('crank', { height: 0.2, diameter: 0.34, tessellation: 18 }, scene);
    crank.rotation.x = Math.PI / 2; crank.position.z = -0.24;
    cyls.push(crank);
    finish(cyls, steel, prop, 'engine');
    const bladeParts = [];
    for (const sy of [-1, 1]) {
      const b = MB.CreateSphere('bl', { diameter: 1, segments: 14 }, scene);
      b.scaling.set(0.19, 1.3, 0.07);
      b.position.set(0, sy * 0.64, 0);
      b.rotation.y = sy * 0.28;
      bladeParts.push(b);
    }
    const hubM = MB.CreateCylinder('hub', { height: 0.14, diameter: 0.2, tessellation: 16 }, scene);
    hubM.rotation.x = Math.PI / 2;
    bladeParts.push(hubM);
    const blade = finish(bladeParts, wood, prop, 'blade');
    const engineFace = MB.CreateDisc('eface', { radius: 0.46, tessellation: 32, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    engineFace.material = BW.getMat(scene, '#141414');
    engineFace.parent = root; engineFace.position.set(0, 0.05, 2.2);
    const disc = MB.CreateDisc('disc', { radius: 1.3, tessellation: 36, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    disc.material = BW.getMat(scene, '#3a2c1e', { alpha: 0.16 });
    disc.parent = root; disc.position.set(0, 0.05, 2.64);

    const flashes = BW.MUZZLES.map((m) => {
      const f = MB.CreateSphere('flash', { diameter: 0.45, segments: 6 }, scene);
      f.scaling.z = 2.2;
      f.material = BW.getMat(scene, '#ffd36b', { emissive: true });
      f.parent = root;
      f.position.set(m.x, m.y, m.z + 0.35);
      f.setEnabled(false);
      f.isPickable = false;
      return f;
    });

    return {
      root, meshes, prop, blade, disc, flashes, body, pilot, head: pilot, pilotHead: bust.head, scarf: bust.scarf,
      surfaces: { elev, rud, ailL: ailerons[0], ailR: ailerons[1] },
    };
  };
})(window.BW);
