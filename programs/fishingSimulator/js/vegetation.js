'use strict';
// Tráva, rákosí, orobinec, keře, břízy, listnáče a vzdálené lesy.
(function (FS) {
  const U = FS.U, W = FS.World;
  const Veg = {};
  FS.Veg = Veg;
  const V3 = THREE.Vector3;
  // vzdálenosti detailů (m od hráče)
  const GRASS_FADE = 42; // tráva mizí mezi 32 a 42 m
  const REED_FADE = 95; // rákosí mizí mezi 75 a 95 m
  const TREE_LOD = 60; // dál jsou stromy zjednodušené

  const WIND = `
    vec4 mvPosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    vec4 wPos = modelMatrix * mvPosition;
    float hgt = max(position.y, 0.0) * uHScale;
    float ph = wPos.x * 0.31 + wPos.z * 0.23;
    float gust = 0.6 + 0.4 * sin(uTime * 0.37 + wPos.x * 0.02);
    float w = (sin(uTime * 1.5 + ph) * 0.6 + sin(uTime * 2.6 + ph * 1.7) * 0.25 + 0.35) * gust;
    wPos.x += w * uWindAmp * hgt * hgt;
    wPos.z += w * uWindAmp * 0.55 * hgt * hgt;
    wPos.xyz += sin(uTime * 7.0 + position.x * 9.0 + position.z * 5.0) * uFlutter * hgt;
    // v dálce se trs plynule „zasune" do kořene (bez skokového mizení)
    #ifdef USE_INSTANCING
      vec3 root_ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #else
      vec3 root_ = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #endif
    wPos.xyz = mix(root_, wPos.xyz, 1.0 - smoothstep(uFade.x, uFade.y, distance(cameraPosition.xz, root_.xz)));
    mvPosition = viewMatrix * wPos;
    gl_Position = projectionMatrix * mvPosition;
  `;
  // fade = [začátek, konec] vzdálenosti, kde trs mizí (jinak bez mizení)
  Veg.wind = function (mat, amp, hscale, flutter, key, murk, alphaBoost, fade) {
    const extra = (sh) => {
      sh.uniforms.uTime = FS.uniforms.uTime;
      sh.uniforms.uWindAmp = { value: amp };
      sh.uniforms.uHScale = { value: hscale };
      sh.uniforms.uFlutter = { value: flutter };
      sh.uniforms.uFade = { value: new THREE.Vector2(...(fade || [1e5, 2e5])) };
      sh.vertexShader = 'uniform float uTime; uniform float uWindAmp; uniform float uHScale; uniform float uFlutter; uniform vec2 uFade;\n' +
        sh.vertexShader.replace('#include <project_vertex>', WIND);
      // obě strany listů/stébel osvětlené stejně (prosvítají)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
      // v dálce mipmapy ztrácí alfu – kompenzace, aby koruny „nemizely"
      if (alphaBoost) {
        sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `{
          vec2 ts = vUv * 512.0;
          float lod = max(0.0, 0.5 * log2(max(dot(dFdx(ts), dFdx(ts)), dot(dFdy(ts), dFdy(ts)))));
          diffuseColor.a *= 1.0 + lod * 0.32;
        }
        #include <alphatest_fragment>`);
      }
    };
    if (murk) FS.applyMurk(mat, extra, 'wind-' + key);
    else { mat.onBeforeCompile = extra; mat.customProgramCacheKey = () => 'wind-' + key; }
    return mat;
  };

  const c3 = (r, g, b) => U.col(r, g, b);

  // Drobná vegetace v blocích: každý blok má vlastní InstancedMesh a kreslí se,
  // jen když je v zorném poli a blíž než maxDist (shader ho do té doby plynule zasune).
  Veg.chunks = [];
  function buildChunked(scene, geo, mat, entries, cell, maxDist, layer) {
    const cells = new Map();
    for (const e of entries) {
      const key = Math.floor(e.x / cell) + ',' + Math.floor(e.z / cell);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(e);
    }
    for (const list of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const ctr = new V3();
      list.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.c); ctr.x += e.x; ctr.y += e.y; ctr.z += e.z; });
      ctr.divideScalar(list.length);
      let r = 0;
      for (const e of list) r = Math.max(r, Math.hypot(e.x - ctr.x, e.z - ctr.z));
      im.frustumCulled = false; // vlastní ořez podle bloku níže
      im.receiveShadow = true;
      im.layers.set(layer);
      scene.add(im);
      Veg.chunks.push({ mesh: im, sphere: new THREE.Sphere(ctr, r + 2.5), maxDist });
    }
  }
  const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4();
  Veg.update = function (camera) {
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const cp = camera.position;
    for (const ch of Veg.chunks) {
      const c = ch.sphere.center, lim = ch.maxDist + ch.sphere.radius;
      ch.mesh.visible = (c.x - cp.x) ** 2 + (c.z - cp.z) ** 2 < lim * lim && _frustum.intersectsSphere(ch.sphere);
    }
  };

  // ---------- tráva ----------
  function bladeGeo(segs, width, bend) {
    const pos = [], col = [], nor = [], idx = [];
    const base = c3(0.26, 0.36, 0.11), tip = c3(0.72, 0.76, 0.42);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = width * (1 - t * 0.92) * 0.5;
      const z = bend * t * t;
      pos.push(-w, t, z, w, t, z);
      const c = base.clone().lerp(tip, Math.pow(t, 0.8));
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      nor.push(0, 0.85, -0.5, 0, 0.85, -0.5);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  Veg.buildGrass = function (scene) {
    const geo = bladeGeo(3, 0.07, 0.18);
    // trs listů – 3 stébla v jedné instanci
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const g = geo.clone();
      g.rotateY(k * 2.1 + 0.3);
      g.translate(Math.cos(k * 2.1) * 0.03, 0, Math.sin(k * 2.1) * 0.03);
      g.scale(1, 0.8 + k * 0.15, 1);
      parts.push(g);
    }
    const tuft = mergeIndexed(parts);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    Veg.wind(mat, 0.09, 1.0, 0.0, 'grass', false, false, [GRASS_FADE - 10, GRASS_FADE]);
    const N = FS.Device.low ? 9000 : 18000; // na mobilu a TV polovina trsů
    const entries = [];
    const q = new THREE.Quaternion(), s = new V3(), p = new V3(), e = new THREE.Euler();
    let n = 0, tries = 0;
    const green = c3(0.62, 0.82, 0.45), dry = c3(1.0, 0.92, 0.62), lush = c3(0.5, 0.75, 0.38);
    while (n < N && tries < N * 6) {
      tries++;
      let x, z;
      const r = U.rand();
      if (r < 0.75) { x = U.rr(-16, 22); z = U.rr(-8, 16); }
      else { // podél břehu
        const pt = W.pond[Math.floor(U.rand() * W.pond.length)];
        x = pt[0] + U.rr(-7, 7); z = pt[1] + U.rr(-7, 7);
      }
      const sd = W.pondSD(x, z);
      if (sd < 0.15) continue;
      if (W.inPlatform(x, z) || W.platformEdgeDist(x, z) < 0.12 && x > -3 && x < 11 && z > -6 && z < 3) continue;
      if (W.pathDist(x, z) < 1.4) continue;
      if (Math.hypot(x - W.shopPos.x, z - W.shopPos.z) < 3.4) continue;
      let blocked = false;
      for (const c of W.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r * 0.85) { blocked = true; break; }
      if (blocked) continue;
      const dPlayer = Math.hypot(x - 2, z - 3);
      if (dPlayer > 30 && U.rand() < 0.5) continue;
      const shore = 1 - U.smoothstep(0.3, 3, sd);
      const patch = U.fbm2(x * 0.06 + 3, z * 0.06, 3);
      // posečený trávník, u břehu a v trsech vyšší tráva
      const tall = U.smoothstep(0.15, 0.45, U.fbm2(x * 0.15, z * 0.15, 2));
      let hgt = U.rr(0.06, 0.14) * (1 + shore * 4.5 + tall * 2.2);
      if (x < -6 && z < 2 && z > -6) hgt = Math.max(hgt, U.rr(0.3, 0.75)); // vysoký porost vlevo vpředu
      const h = W.heightAt(x, z);
      p.set(x, h - 0.02, z);
      e.set(U.rr(-0.15, 0.15), U.rr(0, Math.PI * 2), U.rr(-0.15, 0.15));
      q.setFromEuler(e);
      const wd = U.rr(0.5, 0.9) * (hgt < 0.2 ? 0.8 : 1);
      s.set(wd, hgt, wd);
      const col = green.clone().lerp(dry, U.smoothstep(-0.05, 0.35, patch) * 0.85).lerp(lush, shore * 0.6);
      col.multiplyScalar(U.rr(0.8, 1.1));
      entries.push({ x, y: h, z, m: new THREE.Matrix4().compose(p, q, s), c: col });
      n++;
    }
    buildChunked(scene, tuft, mat, entries, 14, GRASS_FADE, 1);
  };

  function mergeIndexed(geos) {
    const pos = [], nor = [], col = [], uv = [], idx = [];
    let off = 0;
    for (const g of geos) {
      const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, UVA = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        if (N) nor.push(N.getX(i), N.getY(i), N.getZ(i));
        if (C) col.push(C.getX(i), C.getY(i), C.getZ(i));
        if (UVA) uv.push(UVA.getX(i), UVA.getY(i));
      }
      const I = g.index;
      if (I) for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off);
      else for (let i = 0; i < P.count; i++) idx.push(i + off);
      off += P.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nor.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (col.length) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  }
  Veg.mergeIndexed = mergeIndexed;

  // ---------- rákosí ----------
  Veg.buildReeds = function (scene) {
    const leaf = (() => {
      const segs = 4, pos = [], col = [], nor = [], idx = [];
      const base = c3(0.22, 0.3, 0.1), mid = c3(0.42, 0.55, 0.2), tip = c3(0.7, 0.66, 0.38);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, w = 0.022 * (1 - t * 0.9), z = 0.22 * t * t * t;
        pos.push(-w, t, z, w, t, z);
        const c = t < 0.6 ? base.clone().lerp(mid, t / 0.6) : mid.clone().lerp(tip, (t - 0.6) / 0.4);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        nor.push(0, 0.6, -0.8, 0, 0.6, -0.8);
        if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      return g;
    })();
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const g = leaf.clone();
      g.scale(1, 0.75 + k * 0.1, 1);
      g.rotateY(k * 1.7);
      g.translate(Math.cos(k * 1.7) * 0.04, 0, Math.sin(k * 1.7) * 0.04);
      parts.push(g);
    }
    const geo = mergeIndexed(parts);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    Veg.wind(mat, 0.22, 0.5, 0.0, 'reed', true, false, [REED_FADE - 20, REED_FADE]);
    const N = 7000;
    const entries = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), e = new THREE.Euler();
    const cattails = [];
    let n = 0, tries = 0;
    Veg.reedPoints = [];
    while (n < N && tries < N * 30) {
      tries++;
      const pt = W.pond[Math.floor(U.rand() * W.pond.length)];
      const x = pt[0] + U.rr(-4.5, 4.5), z = pt[1] + U.rr(-4.5, 4.5);
      const d = W.reedDensity(x, z);
      if (d < 0.05 || U.rand() > d) continue;
      const h = W.heightAt(x, z);
      const top = U.rr(1.2, 2.3) * (0.7 + d * 0.4);
      const len = top - h;
      p.set(x, h - 0.05, z);
      e.set(U.rr(-0.12, 0.12), U.rr(0, Math.PI * 2), U.rr(-0.12, 0.12));
      q.setFromEuler(e);
      s.set(1, len, 1);
      const col = new THREE.Color(1, 1, 1).multiplyScalar(U.rr(0.75, 1.15));
      if (U.rand() < 0.2) col.multiply(c3(1.1, 1.0, 0.75));
      entries.push({ x, y: h + len * 0.5, z, m: new THREE.Matrix4().compose(p, q, s), c: col });
      if (n % 4 === 0) Veg.reedPoints.push([x, z]);
      if (d > 0.45 && U.rand() < 0.05 && h < 0.1) cattails.push({ x, z, h, top: top * U.rr(0.85, 1.05) });
      n++;
    }
    buildChunked(scene, geo, mat, entries, 20, REED_FADE, 1); // vrstva 1 = bez odrazu ve vodě (výkon)

    // orobinec – stonek + palice
    const stemG = new THREE.CylinderGeometry(0.006, 0.009, 1, 5, 1); stemG.translate(0, 0.5, 0);
    const headG = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.022, 0.16, 4, 8) : new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8);
    const stemM = new THREE.MeshLambertMaterial({ color: c3(0.45, 0.5, 0.25) });
    Veg.wind(stemM, 0.2, 0.5, 0, 'cattail', true);
    const headM = new THREE.MeshStandardMaterial({ color: c3(0.33, 0.2, 0.1), roughness: 1 });
    const stems = new THREE.InstancedMesh(stemG, stemM, cattails.length);
    const heads = new THREE.InstancedMesh(headG, headM, cattails.length);
    cattails.forEach((c, i) => {
      const len = c.top - c.h;
      m4.compose(new V3(c.x, c.h, c.z), new THREE.Quaternion(), new V3(1, len, 1));
      stems.setMatrixAt(i, m4);
      m4.compose(new V3(c.x, c.top - 0.12, c.z), new THREE.Quaternion(), new V3(1, 1, 1));
      heads.setMatrixAt(i, m4);
    });
    scene.add(stems, heads);
    Veg.cattailHeads = heads; Veg.cattails = cattails;
  };

  // ---------- stromy ----------
  function scaleUV(g, su, sv) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  // listové karty: [{c:V3, s:size, n:normal hint}]
  function buildCards(cards, center, upBias = 0.35) {
    const pos = [], nor = [], uv = [], idx = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    cards.forEach((cd, k) => {
      e.set(U.rr(-1.2, 1.2), U.rr(0, Math.PI * 2), U.rr(-1.2, 1.2));
      if (cd.flat) e.set(-Math.PI / 2 + U.rr(-0.6, 0.6), U.rr(0, Math.PI * 2), U.rr(-0.45, 0.45));
      q.setFromEuler(e);
      const out = cd.c.clone().sub(center);
      out.y *= 0.6;
      out.normalize().multiplyScalar(0.75).add(new V3(0, upBias, 0)).normalize();
      for (const [a, b] of corners) {
        const v = new V3(a * cd.s, b * cd.s, 0).applyQuaternion(q).add(cd.c);
        pos.push(v.x, v.y, v.z);
        nor.push(out.x, out.y, out.z);
        uv.push(a + 0.5, b + 0.5);
      }
      const o = k * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  function branch(base, dir, len, r0, droop) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      pts.push(base.clone().addScaledVector(dir, len * t).add(new V3(0, -droop * t * t, 0)));
    }
    return { geo: U.tube(pts, (s) => r0 * (1 - s * 0.8), 3), end: pts[4], mid: pts[2] };
  }
  function randInEllipsoid(c, rx, ry, rz, shell = 0.6) {
    while (true) {
      const v = new V3(U.rr(-1, 1), U.rr(-1, 1), U.rr(-1, 1));
      const l = v.length();
      if (l > 1 || l < shell) continue;
      return new V3(c.x + v.x * rx, c.y + v.y * ry, c.z + v.z * rz);
    }
  }

  function makeBirch(seed) {
    U.reseed(seed);
    const H = U.rr(11.5, 15);
    const pts = [], n = 14;
    const lean = U.rr(-0.4, 0.4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push(new V3(Math.sin(t * 2.3 + seed) * 0.22 * t + lean * t * t, t * H, Math.cos(t * 1.9 + seed) * 0.18 * t));
    }
    const trunk = U.tube(pts, (s) => 0.2 * (1 - s * 0.88) + 0.018 + (s < 0.05 ? 0.06 * (1 - s / 0.05) : 0), 6);
    scaleUV(trunk, 1, H / 3.5);
    const wood = [trunk], cards = [];
    const center = new V3(lean * 0.5, H * 0.66, 0);
    for (let b = 0; b < 12; b++) {
      const t = U.rr(0.3, 0.93);
      const bi = Math.floor(t * (n - 1));
      const base = pts[bi].clone();
      const a = U.rr(0, Math.PI * 2), el = U.rr(0.35, 0.95);
      const dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const len = U.rr(1.6, 3.4) * (1.15 - t * 0.6);
      const br = branch(base, dir, len, 0.055 * (1.2 - t), len * 0.35);
      if (b % 2 === 0) wood.push(br.geo);
      for (let k = 0; k < 4; k++) cards.push({ c: br.end.clone().add(new V3(U.rr(-0.8, 0.8), U.rr(-1.1, 0.3), U.rr(-0.8, 0.8))), s: U.rr(1.7, 2.4) });
      cards.push({ c: br.mid.clone().add(new V3(U.rr(-0.6, 0.6), U.rr(-0.6, 0.2), U.rr(-0.6, 0.6))), s: U.rr(1.5, 2.0) });
    }
    for (let k = 0; k < 55; k++) cards.push({ c: randInEllipsoid(center, 2.6, H * 0.32, 2.6, 0.45), s: U.rr(1.9, 2.7) });
    for (let k = 0; k < 4; k++) cards.push({ c: pts[n - 1 - (k % 4)].clone().add(new V3(U.rr(-0.5, 0.5), U.rr(-0.6, 0.3), U.rr(-0.5, 0.5))), s: U.rr(1.0, 1.5) });
    return { wood: U.mergeGeometries(wood), trunk: wood[0], leaves: buildCards(cards, center), H };
  }

  function makeBroad(seed) {
    U.reseed(seed);
    const H = U.rr(9, 14);
    const pts = [], n = 8;
    for (let i = 0; i < n; i++) { const t = i / (n - 1); pts.push(new V3(Math.sin(t * 2 + seed) * 0.3 * t, t * H * 0.55, Math.cos(t * 2.5 + seed) * 0.3 * t)); }
    const trunk = U.tube(pts, (s) => 0.38 * (1 - s * 0.6), 6);
    const wood = [trunk], cards = [];
    const center = new V3(0, H * 0.65, 0);
    const top = pts[n - 1];
    for (let b = 0; b < 6; b++) {
      const a = U.rr(0, 6.28), el = U.rr(0.4, 1.1);
      const dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const br = branch(top, dir, U.rr(2.5, 4.2), 0.16, 0.4);
      wood.push(br.geo);
      for (let k = 0; k < 4; k++) cards.push({ c: br.end.clone().add(new V3(U.rr(-1.2, 1.2), U.rr(-1, 1), U.rr(-1.2, 1.2))), s: U.rr(2.2, 3.0) });
    }
    for (let k = 0; k < 70; k++) cards.push({ c: randInEllipsoid(center, 4.0, H * 0.3, 4.0, 0.5), s: U.rr(2.6, 3.6) });
    return { wood: U.mergeGeometries(wood), trunk: wood[0], leaves: buildCards(cards, center), H };
  }

  function makeShrub(seed) {
    U.reseed(seed);
    const cards = [], wood = [];
    const center = new V3(0, 0.9, 0);
    for (let b = 0; b < 3; b++) {
      const a = U.rr(0, 6.28);
      wood.push(branch(new V3(0, 0, 0), new V3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize(), U.rr(0.8, 1.5), 0.03, 0).geo);
    }
    for (let k = 0; k < 45; k++) cards.push({ c: randInEllipsoid(center, 1.3, 0.9, 1.3, 0.3), s: U.rr(1.2, 1.7) });
    return { wood: U.mergeGeometries(wood), trunk: wood[0], leaves: buildCards(cards, center, 0.4), H: 2 };
  }

  function leafMaterial(kind, amp) {
    const map = FS.Tex.leaves(kind);
    const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide });
    Veg.wind(m, amp, 0.07, 0.025, 'leaf', false, true);
    m.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 });
    return m;
  }

  // Zjednodušená koruna pro dálku: jen každá n-tá listová karta, zvětšená, aby koruna neprořídla.
  function liteLeaves(geo, every, grow) {
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv;
    const pos = [], nor = [], uv = [], idx = [];
    const cards = P.count / 4;
    for (let k = 0; k < cards; k += every) {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < 4; i++) { cx += P.getX(k * 4 + i); cy += P.getY(k * 4 + i); cz += P.getZ(k * 4 + i); }
      cx /= 4; cy /= 4; cz /= 4;
      const o = pos.length / 3;
      for (let i = 0; i < 4; i++) {
        const j = k * 4 + i;
        pos.push(cx + (P.getX(j) - cx) * grow, cy + (P.getY(j) - cy) * grow, cz + (P.getZ(j) - cz) * grow);
        nor.push(N.getX(j), N.getY(j), N.getZ(j));
        uv.push(UV.getX(j), UV.getY(j));
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // Rozmístění instancí. Každá varianta má plnou a zjednodušenou sadu InstancedMesh;
  // stromy se mezi nimi přesouvají podle vzdálenosti od hráče (Veg.updateLOD).
  Veg.lodGroups = [];
  function placeInstanced(scene, variants, woodMat, leafMat, list) {
    const groups = variants.map(() => []);
    list.forEach((it) => groups[it.v % variants.length].push(it));
    const q = new THREE.Quaternion(), up = new V3(0, 1, 0);
    variants.forEach((v, vi) => {
      const items = groups[vi];
      if (!items.length) return;
      for (const it of items) {
        q.setFromAxisAngle(up, it.rot);
        it.m = new THREE.Matrix4().compose(new V3(it.x, it.y, it.z), q, new V3(it.s, it.s * (it.sy || 1), it.s));
      }
      if (!v.lite) v.lite = liteLeaves(v.leaves, 2, 1.3);
      const mk = (geo, mat) => {
        const m = new THREE.InstancedMesh(geo, mat, items.length);
        m.count = 0;
        // stín vrhají plné i zjednodušené stromy – stínová mapa revíru se kreslí jen jednou
        m.castShadow = true; m.receiveShadow = true;
        m.frustumCulled = false;
        if (mat === leafMat) m.customDepthMaterial = leafMat.userData.depth;
        scene.add(m);
        return m;
      };
      Veg.lodGroups.push({
        items,
        wood: mk(v.wood, woodMat), leaves: mk(v.leaves, leafMat),
        liteWood: mk(v.trunk, woodMat), liteLeaves: mk(v.lite, leafMat),
      });
    });
  }

  Veg.updateLOD = function (x, z) {
    const d2 = TREE_LOD * TREE_LOD;
    for (const g of Veg.lodGroups) {
      let n = 0, l = 0;
      for (const it of g.items) {
        if ((it.x - x) ** 2 + (it.z - z) ** 2 < d2) { g.wood.setMatrixAt(n, it.m); g.leaves.setMatrixAt(n++, it.m); }
        else { g.liteWood.setMatrixAt(l, it.m); g.liteLeaves.setMatrixAt(l++, it.m); }
      }
      g.wood.count = g.leaves.count = n;
      g.liteWood.count = g.liteLeaves.count = l;
      for (const m of [g.wood, g.leaves, g.liteWood, g.liteLeaves]) { m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; }
    }
  };

  Veg.buildTrees = function (scene) {
    const birchV = [makeBirch(1), makeBirch(2), makeBirch(3)];
    const broadV = [makeBroad(31), makeBroad(32), makeBroad(33)];
    const shrubV = [makeShrub(41), makeShrub(42)];

    const birchBark = new THREE.MeshStandardMaterial({ map: FS.Tex.birchBark(), roughness: 0.75 });
    const bark = new THREE.MeshStandardMaterial({ map: FS.Tex.bark(), roughness: 0.95 });
    const birchLeaf = leafMaterial('birch', 0.16);
    const broadLeaf = leafMaterial('deciduous', 0.14);
    const shrubLeaf = leafMaterial('shrub', 0.2);
    U.reseed(555);

    const birches = [], broads = [], shrubs = [];
    const okTree = (x, z, minSD = 3) => {
      if (W.pondSD(x, z) < minSD) return false;
      if (W.pathDist(x, z) < 2.2) return false;
      if (Math.hypot(x - W.shopPos.x, z - W.shopPos.z) < 5) return false;
      if (x > -4 && x < 12 && z > -5 && z < 12) return false; // výhled z místa hráče
      if (Math.abs(W.fenceDist(x, z)) < 2.5) return false; // pruh pro plot revíru
      return true;
    };
    const add = (arr, x, z, s, v) => {
      const y = W.heightAt(x, z) - 0.05;
      arr.push({ x, y, z, s, rot: U.rr(0, 6.28), v: v !== undefined ? v : U.ri(0, 5) });
      W.colliders.push({ x, z, r: 0.45 * s });
    };
    // alej bříz podél cesty
    const P = W.path;
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const dx = P[i][0] - P[i - 1][0], dz = P[i][1] - P[i - 1][1];
      const l = Math.hypot(dx, dz);
      acc += l;
      if (acc < 5.2) continue;
      acc = U.rr(-1, 1);
      const nx = -dz / l, nz = dx / l;
      const off = U.rr(2.8, 3.8);
      const x = P[i][0] - nx * off, z = P[i][1] - nz * off;
      if (z > 18 || z < -60) continue;
      if (okTree(x, z, 2)) add(birches, x, z, U.rr(0.85, 1.1));
    }
    // les vpravo vzadu
    for (let k = 0, n = 0; k < 700 && n < 65; k++) {
      const x = U.rr(24, 110), z = U.rr(-90, 6);
      const pd = U.distToPolyline(x, z, P, false);
      if (pd.d < 6) continue;
      // jen na vnější straně cesty
      const a = P[pd.i], b = P[pd.i + 1];
      const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cross < 0) continue;
      if (!okTree(x, z, 6)) continue;
      n++;
      if (U.rand() < 0.7) add(broads, x, z, U.rr(0.85, 1.2)); else add(birches, x, z, U.rr(0.85, 1.1));
    }
    // vzdálený břeh
    for (let k = 0, n = 0; k < 400 && n < 55; k++) {
      const x = U.rr(-75, 24), z = U.rr(-95, -44);
      if (!okTree(x, z, 5)) continue;
      n++;
      if (U.rand() < 0.7) add(broads, x, z, U.rr(0.8, 1.2));
      else add(birches, x, z, U.rr(0.8, 1.05));
    }
    // levá strana a za hráčem
    for (let k = 0, n = 0; k < 400 && n < 33; k++) {
      const left = U.rand() < 0.6;
      const x = left ? U.rr(-100, -52) : U.rr(-40, 5), z = left ? U.rr(-50, 10) : U.rr(24, 60);
      if (!okTree(x, z, 5)) continue;
      n++;
      if (U.rand() < 0.6) add(broads, x, z, U.rr(0.8, 1.2)); else add(birches, x, z, U.rr(0.8, 1.05));
    }
    // keře
    const shrubAt = [[-9.2, -3.2, 1.3], [-11.2, -4.4, 1.1], [-7.4, -3.1, 0.9], [10.2, -5.1, 1.0], [12.6, -6.0, 0.9], [-13.5, -2.4, 1.2],
      [18.5, 4, 0.9], [-20, 6, 1.2], [-25, -4, 1.1], [24, -10.5, 0.9]];
    shrubAt.forEach(([x, z, s], i) => { shrubs.push({ x, y: W.heightAt(x, z) - 0.1, z, s, rot: i, v: i }); W.colliders.push({ x, z, r: 0.9 * s }); });
    for (let k = 0; k < 20; k++) {
      const x = U.rr(-45, 30), z = U.rr(-50, 30);
      if (!okTree(x, z, 1.5)) continue;
      shrubs.push({ x, y: W.heightAt(x, z) - 0.1, z, s: U.rr(0.7, 1.3), rot: U.rr(0, 6), v: k });
    }

    placeInstanced(scene, birchV, birchBark, birchLeaf, birches);
    placeInstanced(scene, broadV, bark, broadLeaf, broads);
    placeInstanced(scene, shrubV, bark, shrubLeaf, shrubs);

    // vzdálené pásy lesa na obzoru – jednoduché koruny z listových karet
    U.reseed(777);
    const farCards = [];
    const fc = new V3(0, 5.5, 0);
    for (let k = 0; k < 12; k++) farCards.push({ c: randInEllipsoid(fc, 3.6, 3.6, 3.6, 0.35), s: U.rr(5.0, 6.4) });
    const farGeo = buildCards(farCards, fc, 0.5);
    const farMat = new THREE.MeshLambertMaterial({ map: FS.Tex.leaves('deciduous'), alphaTest: 0.4, side: THREE.DoubleSide });
    Veg.wind(farMat, 0, 0.07, 0, 'far', false, true);
    const far = [];
    for (let k = 0; k < 3000 && far.length < 300; k++) {
      const a = U.rr(0, Math.PI * 2), r = U.rr(170, 480);
      const x = -10 + Math.cos(a) * r, z = -18 + Math.sin(a) * r;
      if (U.fbm2(x * 0.008, z * 0.008, 3) < -0.02) continue;
      far.push([x, z]);
    }
    const fm = new THREE.InstancedMesh(farGeo, farMat, far.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    far.forEach(([x, z], i) => {
      const s = U.rr(1.0, 1.7);
      m4.compose(new V3(x, W.heightAt(x, z) - 1, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), U.rr(0, 6.28)), new V3(s, s * U.rr(1.0, 1.5), s));
      fm.setMatrixAt(i, m4);
      col.setRGB(1, 1, 1).multiplyScalar(U.rr(0.65, 1.1));
      fm.setColorAt(i, col);
    });
    fm.frustumCulled = false;
    scene.add(fm);
  };
})(window.FS);
