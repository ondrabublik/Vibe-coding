'use strict';
// Terén, tvar rybníka, dlažba, asfaltová cesta, balvany, vzdálené stavení.
(function (FS) {
  const U = FS.U;
  const W = {};
  FS.World = W;

  // Obrys rybníka (x, z) – hráč stojí u jižního břehu a dívá se na sever (-z).
  const POND_CTRL = [
    [-7, -4.8], [-2, -4.0], [3, -3.75], [8, -4.0], [13, -5.3], [17.5, -8.2], [20.5, -12.5], [22, -18], [21.4, -24],
    [19, -29.5], [14, -34], [7, -37.5], [-1, -39.5], [-10, -40.6], [-20, -40.4], [-30, -38.4], [-38, -34],
    [-44, -27.5], [-46.5, -20], [-44.5, -13], [-38, -8.6], [-29, -6.3], [-18, -5.4],
  ];
  W.pond = U.catmullClosed(POND_CTRL, 6);
  W.pondCenter = [-12, -22];

  W.platform = [[-1.4, -3.2], [-0.2, -0.8], [2.2, 0.5], [5.2, 0.9], [7.6, 0.1], [9.0, -1.7], [8.8, -4.3], [3, -4.7], [-1.1, -4.6]];
  const PATH_CTRL = [[7.5, 22], [9.2, 12], [10.6, 5], [13.0, 0.4], [16.6, -3.6], [21.2, -7.6], [26, -11.6], [31, -16], [37, -21], [45, -27], [56, -34], [72, -43], [95, -55]];
  W.path = U.catmullOpen(PATH_CTRL, 6);
  W.pathWidth = 2.5;
  W.shopPos = new THREE.Vector3(14.5, 0, 13.5);

  // Revír – elipsa, kam může hráč chodit; po obvodu vede dřevěný plot.
  W.bounds = { cx: -10, cz: -14, rx: 58, rz: 50 };
  // > 1 venku, < 1 uvnitř
  W.boundsK = (x, z) => Math.hypot((x - W.bounds.cx) / W.bounds.rx, (z - W.bounds.cz) / W.bounds.rz);
  // přibližná vzdálenost k plotu v metrech (kladná venku)
  W.fenceDist = (x, z) => (W.boundsK(x, z) - 1) * Math.min(W.bounds.rx, W.bounds.rz);
  // velikost terénu – za ním už je jen mlha a obloha
  W.extent = 700;

  // --- znaménková vzdálenost k rybníku (záporná uvnitř) na mřížce ---
  const SDG = { x0: -62, z0: -56, x1: 42, z1: 10, res: 0.5 };
  SDG.nx = Math.round((SDG.x1 - SDG.x0) / SDG.res) + 1;
  SDG.nz = Math.round((SDG.z1 - SDG.z0) / SDG.res) + 1;
  SDG.data = new Float32Array(SDG.nx * SDG.nz);
  for (let j = 0; j < SDG.nz; j++) {
    for (let i = 0; i < SDG.nx; i++) {
      const x = SDG.x0 + i * SDG.res, z = SDG.z0 + j * SDG.res;
      const d = U.distToPolyline(x, z, W.pond, true).d;
      SDG.data[j * SDG.nx + i] = U.pointInPoly(x, z, W.pond) ? -d : d;
    }
  }
  W.pondSD = function (x, z) {
    const fx = (x - SDG.x0) / SDG.res, fz = (z - SDG.z0) / SDG.res;
    if (fx < 0 || fz < 0 || fx >= SDG.nx - 1 || fz >= SDG.nz - 1) {
      const cx = U.clamp(x, SDG.x0, SDG.x1), cz = U.clamp(z, SDG.z0, SDG.z1);
      return W.pondSD(cx === SDG.x1 ? cx - 0.01 : cx, cz === SDG.z1 ? cz - 0.01 : cz) + Math.hypot(x - cx, z - cz);
    }
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const d = SDG.data, n = SDG.nx;
    const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
    return U.lerp(U.lerp(a, b, u), U.lerp(c, e, u), v);
  };

  W.pathDist = function (x, z) {
    // rychlé zamítnutí
    if (x < 4 || z > 26) return 99;
    return U.distToPolyline(x, z, W.path, false).d;
  };
  W.inPlatform = (x, z) => U.pointInPoly(x, z, W.platform);
  W.platformEdgeDist = (x, z) => U.distToPolyline(x, z, W.platform, true).d;

  function maxDepth(x, z) {
    return 2.4 + 1.1 * U.fbm2(x * 0.035 + 5, z * 0.035 - 3, 3) + 0.9 * U.smoothstep(-35, 5, x) * U.smoothstep(-8, -30, z);
  }

  // --- výška terénu ---
  W.heightAt = function (x, z) {
    const sd = W.pondSD(x, z);
    let h;
    if (sd >= 0) {
      h = 0.13 + 0.3 * U.smoothstep(0, 4.5, sd) + 0.25 * U.smoothstep(6, 40, sd);
      h += U.fbm2(x * 0.03, z * 0.03, 3) * 0.45 * U.smoothstep(3, 22, sd);
      h += U.fbm2(x * 0.25, z * 0.25, 2) * 0.05;
      const r = Math.hypot(x + 10, z + 18);
      h += U.smoothstep(100, 260, r) * (3 + U.fbm2(x * 0.004, z * 0.004, 3) * 16);
      h += U.smoothstep(300, W.extent, r) * 22 * (0.6 + U.fbm2(x * 0.002 + 9, z * 0.002, 2));
    } else {
      const d = -sd;
      h = 0.13 - 0.5 * U.smoothstep(0, 1.4, d) - maxDepth(x, z) * U.smoothstep(0.6, 15, d);
      h += U.fbm2(x * 0.18, z * 0.18, 2) * 0.07;
    }
    // dlažba – rampa do vody
    if (x > -3 && x < 11 && z > -6 && z < 3) {
      const inside = W.inPlatform(x, z);
      const ed = W.platformEdgeDist(x, z);
      const ph = U.lerp(0.25, -0.18, U.smoothstep(-0.6, -4.6, z));
      const w = inside ? 1 : 1 - U.smoothstep(0, 1.2, ed);
      h = U.lerp(h, ph - 0.03, w);
    }
    // cesta – zarovnání
    const pd = W.pathDist(x, z);
    if (pd < 4) h = U.lerp(h, Math.max(h, 0.28), (1 - U.smoothstep(1.2, 4, pd)) * 0.7);
    return h;
  };
  W.waterDepth = (x, z) => Math.max(0, -W.heightAt(x, z));

  // Hustota rákosí v okolí břehu (0..1)
  W.reedDensity = function (x, z) {
    const sd = W.pondSD(x, z);
    if (sd < -3.2 || sd > 1.2) return 0;
    const band = U.smoothstep(-3.2, -1.6, sd) * (1 - U.smoothstep(0.2, 1.2, sd));
    let zone = U.smoothstep(-7, -11, z); // vzdálený břeh a boky
    zone = Math.max(zone, U.smoothstep(-24, -32, x)); // levý konec
    zone = Math.max(zone, U.smoothstep(15, 19, x) * U.smoothstep(-6, -9, z));
    // mezera na vzdáleném břehu
    zone *= 1 - 0.85 * U.smoothstep(4, 1, Math.abs(x + 6)) * U.smoothstep(-34, -38, z);
    // levý blízký okraj – vyšší porost
    zone = Math.max(zone, U.smoothstep(-9, -13, x) * U.smoothstep(-3, -6, z) * 0.7);
    const clump = U.smoothstep(-0.25, 0.3, U.fbm2(x * 0.12, z * 0.12, 3));
    return band * zone * clump;
  };

  // --- barvy terénu ---
  function fieldColor(x, z) {
    const a = 0.35, c = Math.cos(a), s = Math.sin(a);
    const u = x * c - z * s, v = x * s + z * c;
    const ci = Math.floor(u / 90), cj = Math.floor(v / 55);
    const hsh = Math.abs(Math.sin(ci * 127.1 + cj * 311.7) * 43758.5453) % 1;
    if (hsh < 0.35) return [0.78, 0.7, 0.42];
    if (hsh < 0.6) return [0.45, 0.56, 0.22];
    if (hsh < 0.78) return [0.52, 0.42, 0.3];
    return [0.62, 0.62, 0.34];
  }
  W.groundColor = function (x, z, h) {
    const sd = W.pondSD(x, z);
    const n = U.fbm2(x * 0.06 + 3, z * 0.06, 3);
    const n2 = U.fbm2(x * 0.4, z * 0.4, 2);
    let col = U.mix3([0.34, 0.47, 0.16], [0.6, 0.57, 0.3], U.smoothstep(-0.05, 0.3, n));
    col = col.map((v) => v * (0.88 + n2 * 0.25));
    // les na pravé straně – tmavší podrost
    const forest = U.smoothstep(26, 34, x) * U.smoothstep(-6, -14, z);
    col = U.mix3(col, [0.27, 0.3, 0.16], forest * 0.7);
    // u cesty prošlapané
    const pd = W.pathDist(x, z);
    if (pd < 2.4) col = U.mix3(col, [0.5, 0.48, 0.34], (1 - U.smoothstep(1.2, 2.4, pd)) * 0.5);
    // u břehu
    if (sd < 1.6 && sd > -0.4) col = U.mix3(col, [0.3, 0.33, 0.16], (1 - U.smoothstep(0, 1.6, sd)) * 0.6);
    // pod vodou: bahno
    if (h < 0.02) {
      const depth = Math.max(0, -h);
      let mud = U.mix3([0.36, 0.33, 0.22], [0.22, 0.24, 0.12], U.smoothstep(0.1, 0.8, depth));
      mud = mud.map((v) => v * (0.85 + n2 * 0.3));
      const k = Math.exp(-depth * 1.1);
      mud = U.mix3([0.07, 0.1, 0.06], mud, k);
      col = U.mix3(col, mud, U.smoothstep(0.02, -0.12, h));
    }
    const r = Math.hypot(x + 10, z + 18);
    if (r > 75) col = U.mix3(col, fieldColor(x, z), U.smoothstep(75, 120, r));
    return col;
  };

  // --- stavba terénu ---
  W.buildTerrain = function (scene) {
    const N = 220;
    const cx = -10, cz = -18;
    // uprostřed hustá pravidelná síť, k okraji (W.extent) řídne
    const map = (u) => {
      const a = Math.abs(u);
      const v = a < 0.62 ? (a / 0.62) * 110 : 110 + ((a - 0.62) / 0.38) ** 2 * (W.extent - 110);
      return Math.sign(u) * v;
    };
    const vc = (N + 1) * (N + 1);
    const pos = new Float32Array(vc * 3), col = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = cx + map(i / N * 2 - 1), z = cz + map(j / N * 2 - 1);
        const h = W.heightAt(x, z);
        const k = j * (N + 1) + i;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const c = W.groundColor(x, z, h);
        col[k * 3] = U.s2l(c[0]); col[k * 3 + 1] = U.s2l(c[1]); col[k * 3 + 2] = U.s2l(c[2]);
        uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
      }
    }
    const idx = new Uint32Array(N * N * 6);
    let p = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: FS.Tex.groundDetail(), roughness: 0.96, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    W.terrain = mesh;
    return mesh;
  };

  // Dlažba – síť nad terénem uvnitř polygonu
  W.buildPlatform = function (scene) {
    const tex = FS.Tex.cobble();
    const res = 0.25;
    const xs = [], zs = [];
    for (let x = -2; x <= 10; x += res) xs.push(x);
    for (let z = -5.5; z <= 2; z += res) zs.push(z);
    const nx = xs.length, nz = zs.length;
    const pos = [], uv = [], idx = [];
    const inside = [];
    // vlnitý okraj, aby nebyl hranatý
    const insideEdge = (x, z) => W.inPlatform(x, z) && W.platformEdgeDist(x, z) > 0.05 * (1 + U.noise2(x * 3, z * 3));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j];
      pos.push(x, W.heightAt(x, z) + 0.035 + U.noise2(x * 4, z * 4) * 0.006, z);
      uv.push(x / 3.2, z / 3.2);
      inside.push(insideEdge(x, z));
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (inside[a] && inside[b] && inside[c] && inside[d]) { idx.push(a, c, b, b, c, d); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.9, color: 0xb9b0a2, envMapIntensity: 0.6 });
    FS.applyMurk(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // malé dřevěné molo vpravo od dlažby
    const planks = FS.Tex.planks([0.5, 0.4, 0.3]);
    const pm = new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85 });
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 1.5), pm);
      b.position.set(i * 0.3, 0, 0);
      b.rotation.z = (Math.random() - 0.5) * 0.03;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    }
    for (const sx of [-0.1, 1.6]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), pm);
      beam.position.set(sx, -0.07, 0);
      g.add(beam);
    }
    g.position.set(9.6, W.heightAt(10.3, -2.6) + 0.12, -2.6);
    g.rotation.y = -0.5;
    scene.add(g);
    return mesh;
  };

  W.buildPath = function (scene) {
    const tex = FS.Tex.asphalt();
    const P = W.path;
    const pos = [], uv = [], idx = [];
    let along = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const nx = -dz, nz = dx;
      if (i > 0) along += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const cols = 7;
      for (let k = 0; k < cols; k++) {
        const s = k / (cols - 1) - 0.5;
        const wob = (k === 0 || k === cols - 1) ? U.noise2(along * 0.8, k) * 0.12 : 0;
        const x = P[i][0] + nx * (s * W.pathWidth + Math.sign(s) * wob), z = P[i][1] + nz * (s * W.pathWidth + Math.sign(s) * wob);
        pos.push(x, W.heightAt(x, z) + 0.05 - Math.abs(s) * 0.03, z);
        uv.push(s * W.pathWidth / 3, along / 3);
      }
      if (i > 0) {
        for (let k = 0; k < cols - 1; k++) {
          const a0 = (i - 1) * cols + k, b0 = a0 + 1, c0 = i * cols + k, d0 = c0 + 1;
          idx.push(a0, b0, c0, b0, d0, c0);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  // Balvany
  W.colliders = [];
  W.buildRocks = function (scene) {
    const tex = FS.Tex.granite();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 0.88, vertexColors: true, color: 0xa8a49c, envMapIntensity: 0.5 });
    const rock = (x, z, sx, sy, sz, rot, seed, sink = 0.25) => {
      const geo = new THREE.IcosahedronGeometry(1, 5);
      const p = geo.attributes.position;
      const cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const n = U.fbm2(v.x * 1.3 + seed, v.z * 1.3 + v.y * 0.7, 4) * 0.28 + U.noise2(v.x * 5 + seed, v.y * 5) * 0.03;
        // plošší vršek, zaoblené hrany
        let y = v.y;
        if (y > 0.35) y = 0.35 + (y - 0.35) * 0.55;
        v.set(v.x, y, v.z).multiplyScalar(1 + n);
        p.setXYZ(i, v.x, v.y, v.z);
        const low = U.smoothstep(0.1, -0.6, v.y);
        cols[i * 3] = U.lerp(1, 0.55, low); cols[i * 3 + 1] = U.lerp(1, 0.6, low); cols[i * 3 + 2] = U.lerp(1, 0.42, low);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.rotation.y = rot;
      m.position.set(x, W.heightAt(x, z) + sy * (0.62 - sink), z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      W.colliders.push({ x, z, r: Math.max(sx, sz) * 0.9 });
    };
    rock(2.6, 3.2, 0.85, 0.62, 0.55, 0.4, 1);
    rock(7.2, 1.9, 1.15, 0.42, 0.62, -0.2, 2, 0.15);
    rock(10.4, 0.2, 0.75, 0.32, 0.48, 0.9, 3, 0.1);
    rock(-4.5, 4.5, 0.4, 0.25, 0.32, 0.3, 4);
    rock(12.5, 6.2, 0.35, 0.22, 0.3, 1.3, 5);
    rock(-15, -2, 0.55, 0.3, 0.4, 2.1, 6);
    rock(23, -2, 0.6, 0.35, 0.5, 0.5, 7);
  };

  // Dřevěný plot po hranici revíru; kde ho křižuje cesta, je závora.
  // Volá se až po stromech, aby se plot vyhnul kmenům.
  W.buildFence = function (scene) {
    const B = W.bounds;
    const mat = new THREE.MeshStandardMaterial({ map: FS.Tex.bark(), color: 0xa89a86, roughness: 0.95 });
    const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 1.15, 6); postGeo.translate(0, 0.5, 0);
    const railGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 5); railGeo.rotateZ(Math.PI / 2);
    // body po obvodu elipsy zhruba po 2,6 m
    const steps = 132, pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = B.cx + Math.cos(a) * B.rx, z = B.cz + Math.sin(a) * B.rz;
      let ok = W.pathDist(x, z) > 2.2;
      for (const c of W.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.3) ** 2) { ok = false; break; }
      pts.push({ x, z, y: W.heightAt(x, z), ok, onPath: W.pathDist(x, z) <= 2.2 });
    }
    const posts = pts.filter((p) => p.ok);
    const rails = [];
    for (let i = 0; i < steps; i++) {
      const a = pts[i], b = pts[(i + 1) % steps];
      if (a.ok && b.ok) rails.push([a, b]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const pm = new THREE.InstancedMesh(postGeo, mat, posts.length);
    posts.forEach((p, i) => {
      q.setFromAxisAngle(up, p.x * 7.3);
      m4.compose(new THREE.Vector3(p.x, p.y - 0.12, p.z), q, new THREE.Vector3(1, U.rr(0.92, 1.05), 1));
      pm.setMatrixAt(i, m4);
    });
    const rm = new THREE.InstancedMesh(railGeo, mat, rails.length * 2);
    rails.forEach(([a, b], i) => {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      q.setFromAxisAngle(up, Math.atan2(-dz, dx));
      for (let k = 0; k < 2; k++) {
        const h = k ? 0.85 : 0.45;
        m4.compose(new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2), q, new THREE.Vector3(len + 0.12, 1, 1));
        rm.setMatrixAt(i * 2 + k, m4);
      }
    });
    pm.castShadow = rm.castShadow = true;
    pm.receiveShadow = rm.receiveShadow = true;
    scene.add(pm, rm);

    // závora přes cestu – pruhované břevno mezi dvěma sloupky
    const onPath = pts.filter((p) => p.onPath);
    if (onPath.length) {
      const mid = onPath[Math.floor(onPath.length / 2)];
      const near = U.distToPolyline(mid.x, mid.z, W.path, false);
      const a = W.path[near.i], b = W.path[near.i + 1];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const px = a[0] + (b[0] - a[0]) * near.s, pz = a[1] + (b[1] - a[1]) * near.s;
      const { c, g } = U.canvas(128, 8);
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f2f2ee' : '#c4231c'; g.fillRect(k * 16, 0, 16, 8); }
      const poleMat = new THREE.MeshStandardMaterial({ map: U.tex(c, { repeat: false }), roughness: 0.6 });
      const half = W.pathWidth / 2 + 0.9;
      const gate = new THREE.Group();
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(postGeo, mat);
        p.position.set(-dz * half * s, 0, dx * half * s);
        p.scale.set(1.4, 1, 1.4);
        gate.add(p);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, half * 2 + 0.3, 8), poleMat);
      bar.rotation.z = Math.PI / 2;
      const barG = new THREE.Group();
      barG.add(bar);
      barG.position.y = 0.95;
      barG.rotation.y = Math.atan2(-dx, -dz); // břevno napříč cestou
      gate.add(barG);
      gate.position.set(px, W.heightAt(px, pz) - 0.1, pz);
      gate.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      scene.add(gate);
    }
  };

  // Vzdálené stavení vlevo (jako na fotce)
  W.buildFarm = function (scene) {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: U.col(0.62, 0.6, 0.56), roughness: 0.95 });
    const roof = new THREE.MeshStandardMaterial({ color: U.col(0.42, 0.4, 0.38), roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(32, 4.5, 10), wall);
    body.position.y = 2.25;
    g.add(body);
    const rg = new THREE.CylinderGeometry(0.01, 7.5, 3, 4, 1);
    rg.rotateY(Math.PI / 4); rg.scale(1, 1, 0.75);
    const r = new THREE.Mesh(new THREE.BoxGeometry(33, 0.4, 11.2), roof);
    r.position.y = 4.7;
    g.add(r);
    g.position.set(-118, W.heightAt(-118, -62), -62);
    g.rotation.y = 0.12;
    scene.add(g);
    const b2 = g.clone();
    b2.position.set(-150, W.heightAt(-150, -70), -70);
    b2.scale.set(0.6, 1, 0.8);
    scene.add(b2);
  };
})(window.FS);
