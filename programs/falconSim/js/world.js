'use strict';
// Procedural hunting ground: terrain with farmland, lake, forests, mountains, clouds, thermals and the eyrie.
(function (FS) {
  const { clamp, lerp, smoothstep, mix3, fbm, ridged, hash2, rng } = FS;

  const SIZE = 4000;          // world is [-2000, 2000]^2 metres
  const HALF = SIZE / 2;
  const N = 500;              // terrain cells per side (8 m)
  const CELL = SIZE / N;
  const LAKE = { x: -520, z: 120 };
  const SUN_DIR = new BABYLON.Vector3(-0.45, -0.72, 0.53).normalize();

  class World {
    constructor(scene, quality) {
      this.scene = scene;
      this.quality = quality;
      this.size = SIZE; this.half = HALF;
      this.sunDir = SUN_DIR;
      this.lake = LAKE;
      this.trees = [];          // [x, y, z, height, radius, type]
      this.treeGrid = new Map();
      this.thermals = [];
      this.burrows = [];
    }

    build() {
      this.buildHeights();
      this.buildTerrain();
      this.buildWater();
      this.buildSky();
      this.buildTrees();
      this.buildRocks();
      this.buildClouds();
      this.buildNest();
      this.buildThermals();
      this.buildMinimap();
    }

    // ---------- height field ----------
    farmMask(x, z) {
      const s = smoothstep(-150, -600, z + fbm(x / 600, z / 600, 2, 41) * 260);
      return s * (1 - smoothstep(1250, 1650, Math.abs(x)));
    }
    rawHeight(x, z) {
      const n1 = fbm(x / 1100, z / 1100, 5, 11);
      let h = 34 + n1 * 110 + fbm(x / 170, z / 170, 3, 23) * 7;
      // mountain range in the north
      const mz = z + fbm(x / 700, z / 700, 3, 5) * 350;
      const mMask = smoothstep(450, 1250, mz);
      const r = 0.65 * ridged(x / 760, z / 760, 4, 7) + 0.35 * (fbm(x / 900, z / 900, 3, 9) * 0.5 + 0.5);
      h += mMask * (Math.pow(r, 1.9) * 560 + 40);
      // flat farmland in the south
      const farm = this.farmMask(x, z);
      h = lerp(h, 22 + n1 * 26, farm * 0.8);
      // lake
      const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25) + fbm(x / 220, z / 220, 2, 31) * 90;
      h = lerp(h, -14, smoothstep(360, 140, dl));
      // a ring of mountains closing the valley
      const e = Math.max(Math.abs(x), Math.abs(z));
      h += smoothstep(1450, 1950, e) * (220 + ridged(x / 380, z / 380, 3, 3) * 380);
      return h;
    }
    forestDensity(x, z, h, slope) {
      let f = fbm(x / 420, z / 420, 4, 61) + 0.05;
      f -= this.farmMask(x, z) * 0.55;
      if (h < 3 || h > 420 || slope > 0.55) return 0;
      if (h > 300) f -= (h - 300) / 250;
      return smoothstep(0.06, 0.28, f);
    }
    fieldInfo(x, z) {
      const a = 0.32, ca = Math.cos(a), sa = Math.sin(a);
      const u = x * ca + z * sa, v = -x * sa + z * ca;
      const cu = Math.floor(u / 150), cv = Math.floor(v / 95);
      const fu = u / 150 - cu, fv = v / 95 - cv;
      const type = Math.floor(hash2(cu, cv, 77) * 6);
      const hedge = fu < 0.045 || fv < 0.07;
      return { u, v, type, hedge, cu, cv };
    }

    buildHeights() {
      const H = new Float32Array((N + 1) * (N + 1));
      for (let j = 0; j <= N; j++) {
        const z = -HALF + j * CELL;
        for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = this.rawHeight(-HALF + i * CELL, z);
      }
      this.H = H;
    }
    gridH(i, j) {
      i = clamp(i, 0, N); j = clamp(j, 0, N);
      return this.H[j * (N + 1) + i];
    }
    heightAt(x, z) {
      const fx = clamp((x + HALF) / CELL, 0, N - 1e-4), fz = clamp((z + HALF) / CELL, 0, N - 1e-4);
      const i = Math.floor(fx), j = Math.floor(fz);
      const tx = fx - i, tz = fz - j;
      const h00 = this.H[j * (N + 1) + i], h10 = this.H[j * (N + 1) + i + 1];
      const h01 = this.H[(j + 1) * (N + 1) + i], h11 = this.H[(j + 1) * (N + 1) + i + 1];
      // match the triangle split used by the mesh (diagonal 00-11)
      if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
      return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
    }
    groundAt(x, z) { return Math.max(this.heightAt(x, z), 0); }
    slopeAt(x, z) {
      const e = CELL;
      const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
      const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
      return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
    }

    groundColor(x, z, h, slope) {
      const moist = fbm(x / 300, z / 300, 3, 51);
      let col = mix3([0.50, 0.54, 0.27], [0.23, 0.41, 0.15], smoothstep(-0.35, 0.35, moist));
      // meadow flowers / dry patches
      const m2 = fbm(x / 60, z / 60, 2, 53);
      col = mix3(col, [0.58, 0.58, 0.30], smoothstep(0.25, 0.55, m2) * 0.5);
      const farm = this.farmMask(x, z);
      if (farm > 0.02 && slope < 0.25) {
        const f = this.fieldInfo(x, z);
        const pal = [[0.80, 0.69, 0.37], [0.36, 0.52, 0.19], [0.43, 0.33, 0.22], [0.86, 0.78, 0.22], [0.47, 0.57, 0.26], [0.66, 0.60, 0.33]];
        let fc = pal[f.type].slice();
        const stripe = Math.sin(f.u * 1.3) * 0.035;
        fc = [fc[0] + stripe, fc[1] + stripe, fc[2] + stripe];
        if (f.hedge) fc = [0.15, 0.26, 0.10];
        col = mix3(col, fc, smoothstep(0.02, 0.35, farm));
      }
      const fd = this.forestDensity(x, z, h, slope);
      col = mix3(col, [0.13, 0.22, 0.09], fd * 0.85);
      // rock on steep slopes & high up
      const rockT = Math.max(smoothstep(0.28, 0.48, slope), smoothstep(330, 470, h) * 0.9);
      const rockCol = mix3([0.46, 0.43, 0.39], [0.36, 0.34, 0.33], smoothstep(-0.3, 0.3, fbm(x / 90, z / 90, 2, 57)));
      col = mix3(col, rockCol, rockT);
      // snow on high ridges
      const snowLine = 470 + fbm(x / 200, z / 200, 2, 59) * 50;
      col = mix3(col, [0.94, 0.95, 0.98], smoothstep(snowLine, snowLine + 40, h) * (1 - smoothstep(0.35, 0.6, slope)));
      // shore & lake bed
      col = mix3(col, [0.74, 0.68, 0.49], smoothstep(4, 0.5, h));
      if (h < 0) col = mix3([0.34, 0.33, 0.24], [0.18, 0.22, 0.20], smoothstep(0, -12, h));
      const b = 0.93 + fbm(x / 25, z / 25, 2, 91) * 0.14;
      return [col[0] * b, col[1] * b, col[2] * b];
    }

    buildTerrain() {
      const scene = this.scene;
      const V = (N + 1) * (N + 1);
      const pos = new Float32Array(V * 3), col = new Float32Array(V * 4), uv = new Float32Array(V * 2);
      const idx = new Uint32Array(N * N * 6);
      this.colors = new Float32Array(V * 3);
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const k = j * (N + 1) + i;
          const x = -HALF + i * CELL, z = -HALF + j * CELL, h = this.H[k];
          pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
          uv[k * 2] = i / N; uv[k * 2 + 1] = j / N;
          const dx = (this.gridH(i + 1, j) - this.gridH(i - 1, j)) / (2 * CELL);
          const dz = (this.gridH(i, j + 1) - this.gridH(i, j - 1)) / (2 * CELL);
          const slope = 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
          const c = this.groundColor(x, z, h, slope);
          col[k * 4] = c[0]; col[k * 4 + 1] = c[1]; col[k * 4 + 2] = c[2]; col[k * 4 + 3] = 1;
          this.colors[k * 3] = c[0]; this.colors[k * 3 + 1] = c[1]; this.colors[k * 3 + 2] = c[2];
        }
      }
      let t = 0;
      const sgn = FS.Geo ? null : null; // orientation checked below
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const a = j * (N + 1) + i, b = a + 1, c = a + N + 2, d = a + N + 1;
          idx[t++] = a; idx[t++] = b; idx[t++] = c;
          idx[t++] = a; idx[t++] = c; idx[t++] = d;
        }
      }
      // make sure normals face up (flip winding if needed)
      const test = [];
      BABYLON.VertexData.ComputeNormals([0, 0, 0, 1, 0, 0, 1, 0, 1], [0, 1, 2], test);
      if (test[1] < 0) for (let k = 0; k < idx.length; k += 3) { const tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp; }
      const nrm = new Float32Array(V * 3);
      BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
      const mesh = new BABYLON.Mesh('terrain', scene);
      const vd = new BABYLON.VertexData();
      vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.colors = col; vd.uvs = uv;
      vd.applyToMesh(mesh);
      const mat = new BABYLON.StandardMaterial('terrainMat', scene);
      mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
      mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
      mat.diffuseTexture = this.makeGrainTexture();
      mat.diffuseTexture.uScale = N * 1.5; mat.diffuseTexture.vScale = N * 1.5;
      mesh.material = mat;
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      this.terrain = mesh;

      // skirt beyond the playable area
      const skMat = new BABYLON.StandardMaterial('skirtMat', scene);
      skMat.diffuseColor = new BABYLON.Color3(0.30, 0.36, 0.26);
      skMat.specularColor = BABYLON.Color3.Black();
      const W = 30000;
      const parts = [
        [0, HALF + W / 2 - 5, W, W],
        [0, -HALF - W / 2 + 5, W, W],
        [HALF + W / 2 - 5, 0, W, SIZE],
        [-HALF - W / 2 + 5, 0, W, SIZE],
      ];
      parts.forEach((p, k) => {
        const g = BABYLON.MeshBuilder.CreateGround('skirt' + k, { width: p[2], height: p[3] }, scene);
        g.position.set(p[0], 230, p[1]);
        g.material = skMat; g.isPickable = false;
      });
    }

    makeGrainTexture() {
      const S = 128;
      const tex = new BABYLON.DynamicTexture('grain', { width: S, height: S }, this.scene, true);
      const ctx = tex.getContext();
      const img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        // tileable noise from wrapped hashing
        let v = 0, a = 0.5, f = 8;
        for (let o = 0; o < 3; o++) {
          const cx = (x / S) * f, cy = (y / S) * f;
          const ix = Math.floor(cx), iy = Math.floor(cy);
          const tx = cx - ix, ty = cy - iy;
          const h = (i, j) => hash2(((i % f) + f) % f, ((j % f) + f) % f, 5 + o);
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const n = lerp(lerp(h(ix, iy), h(ix + 1, iy), sx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx), sy);
          v += (n - 0.5) * a; a *= 0.5; f *= 2;
        }
        v += (hash2(x, y, 99) - 0.5) * 0.18;
        const c = clamp(Math.round(232 + v * 70), 0, 255);
        const k = (y * S + x) * 4;
        img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = c; img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.update();
      tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      tex.anisotropicFilteringLevel = 8;
      return tex;
    }

    // ---------- water ----------
    buildWater() {
      const scene = this.scene;
      const water = BABYLON.MeshBuilder.CreateGround('water', { width: 1400, height: 1400, subdivisions: 1 }, scene);
      water.position.set(LAKE.x, 0, LAKE.z);
      const mat = new BABYLON.StandardMaterial('waterMat', scene);
      mat.diffuseColor = new BABYLON.Color3(0.10, 0.24, 0.30);
      mat.emissiveColor = new BABYLON.Color3(0.06, 0.13, 0.17);
      mat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.85);
      mat.specularPower = 220;
      mat.alpha = 0.86;
      // tileable normal map from sine waves
      const S = 256;
      const tex = new BABYLON.DynamicTexture('waterN', { width: S, height: S }, scene, true);
      const ctx = tex.getContext();
      const img = ctx.createImageData(S, S);
      const waves = [];
      const r = rng(9);
      for (let k = 0; k < 9; k++) waves.push([Math.floor(r() * 7) - 3 || 1, Math.floor(r() * 7) - 3 || 2, r() * 6.28, 0.4 + r() * 0.6]);
      const hf = (u, v) => { let s = 0; for (const w of waves) s += Math.sin((w[0] * u + w[1] * v) * 6.2832 + w[2]) * w[3] / Math.hypot(w[0], w[1]); return s; };
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, e = 1 / S;
        const dx = (hf(u + e, v) - hf(u - e, v)) * 0.8, dy = (hf(u, v + e) - hf(u, v - e)) * 0.8;
        const l = Math.hypot(dx, dy, 1);
        const k = (y * S + x) * 4;
        img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.update();
      tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      tex.uScale = tex.vScale = 60;
      mat.bumpTexture = tex;
      mat.bumpTexture.level = 0.35;
      water.material = mat;
      water.isPickable = false;
      this.water = water;
      this.waterTex = tex;
    }

    // ---------- sky, light ----------
    buildSky() {
      const scene = this.scene;
      const sky = BABYLON.MeshBuilder.CreateBox('sky', { size: 15000 }, scene);
      sky.infiniteDistance = true;
      sky.applyFog = false;
      sky.isPickable = false;
      if (BABYLON.SkyMaterial) {
        const sm = new BABYLON.SkyMaterial('skyMat', scene);
        sm.backFaceCulling = false;
        sm.useSunPosition = true;
        sm.sunPosition = SUN_DIR.scale(-100);
        sm.luminance = 1.0;
        sm.turbidity = 5;
        sm.rayleigh = 1.6;
        sm.mieCoefficient = 0.004;
        sm.mieDirectionalG = 0.85;
        sky.material = sm;
      } else {
        const sm = new BABYLON.StandardMaterial('skyMat', scene);
        sm.backFaceCulling = false; sm.disableLighting = true;
        sm.emissiveColor = new BABYLON.Color3(0.55, 0.72, 0.92);
        sky.material = sm;
      }
      this.sky = sky;
    }

    // ---------- vegetation ----------
    makeTreeMeshes() {
      const scene = this.scene;
      const colorize = (m, fn) => {
        const p = m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const c = [];
        for (let k = 0; k < p.length; k += 3) { const col = fn(p[k], p[k + 1], p[k + 2]); c.push(col[0], col[1], col[2], 1); }
        m.setVerticesData(BABYLON.VertexBuffer.ColorKind, c);
      };
      const bark = () => [0.30, 0.22, 0.15];
      // conifer
      const parts = [];
      const trunk = BABYLON.MeshBuilder.CreateCylinder('t', { height: 4, diameterTop: 0.25, diameterBottom: 0.5, tessellation: 6 }, scene);
      trunk.position.y = 2; trunk.bakeCurrentTransformIntoVertices(); colorize(trunk, bark); parts.push(trunk);
      const tiers = [[2.2, 5.5, 3.4], [5.0, 5.0, 2.8], [7.6, 4.6, 2.1], [10.0, 4.0, 1.4]];
      tiers.forEach(([y, h, r], k) => {
        const cone = BABYLON.MeshBuilder.CreateCylinder('c', { height: h, diameterTop: 0, diameterBottom: r * 2, tessellation: 8 }, scene);
        cone.position.y = y + h / 2; cone.bakeCurrentTransformIntoVertices();
        colorize(cone, (x, yy, z) => {
          const rel = (yy - y) / h; const d = Math.hypot(x, z) / r;
          const s = 0.55 + 0.45 * rel + k * 0.04 - (1 - d) * 0.15;
          return [0.10 * s + 0.02, 0.24 * s + 0.03, 0.12 * s + 0.02];
        });
        parts.push(cone);
      });
      const pine = BABYLON.Mesh.MergeMeshes(parts, true);
      pine.name = 'pine';
      // broadleaf
      const bp = [];
      const tr2 = BABYLON.MeshBuilder.CreateCylinder('t2', { height: 5, diameterTop: 0.3, diameterBottom: 0.6, tessellation: 6 }, scene);
      tr2.position.y = 2.5; tr2.bakeCurrentTransformIntoVertices(); colorize(tr2, bark); bp.push(tr2);
      const blobs = [[0, 7.2, 0, 3.6], [1.9, 6.0, 0.7, 2.6], [-1.6, 6.3, -0.9, 2.7], [0.4, 8.8, -0.6, 2.5], [-0.6, 6.0, 1.8, 2.4]];
      const rr = rng(3);
      blobs.forEach(([x, y, z, r]) => {
        const s = BABYLON.MeshBuilder.CreateIcoSphere('b', { radius: r, subdivisions: 2, flat: false }, scene);
        const p = s.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        for (let k = 0; k < p.length; k += 3) {
          const j = 1 + (FS.perlin(p[k] * 0.9 + x, p[k + 2] * 0.9 + p[k + 1] * 0.7, 4) * 0.22);
          p[k] *= j; p[k + 1] *= j * 0.85; p[k + 2] *= j;
        }
        s.setVerticesData(BABYLON.VertexBuffer.PositionKind, p);
        s.position.set(x, y, z); s.bakeCurrentTransformIntoVertices();
        colorize(s, (px, py, pz) => {
          const shade = 0.55 + 0.45 * clamp((py - 4) / 6, 0, 1) + (rr() - 0.5) * 0.08;
          return [0.20 * shade, 0.38 * shade, 0.12 * shade];
        });
        bp.push(s);
      });
      const oak = BABYLON.Mesh.MergeMeshes(bp, true);
      oak.name = 'oak';
      [pine, oak].forEach((m) => {
        const mat = new BABYLON.StandardMaterial(m.name + 'Mat', scene);
        mat.diffuseColor = BABYLON.Color3.White();
        mat.specularColor = BABYLON.Color3.Black();
        m.material = mat;
        m.isPickable = false;
      });
      return { pine, oak };
    }

    buildTrees() {
      const { pine, oak } = this.makeTreeMeshes();
      const r = rng(1234);
      const spacing = this.quality === 'low' ? 15 : 11;
      const mats = { pine: [], oak: [] }, cols = { pine: [], oak: [] };
      const maxTrees = this.quality === 'low' ? 5000 : 11000;
      const m = new BABYLON.Matrix();
      const q = new BABYLON.Quaternion();
      let count = 0;
      for (let z = -HALF + 40; z < HALF - 40 && count < maxTrees; z += spacing) {
        for (let x = -HALF + 40; x < HALF - 40 && count < maxTrees; x += spacing) {
          const px = x + (r() - 0.5) * spacing * 0.9, pz = z + (r() - 0.5) * spacing * 0.9;
          const h = this.heightAt(px, pz);
          if (h < 2.5) continue;
          const slope = this.slopeAt(px, pz);
          let p = this.forestDensity(px, pz, h, slope);
          const farm = this.farmMask(px, pz);
          if (farm > 0.3 && slope < 0.25) {
            const f = this.fieldInfo(px, pz);
            p = f.hedge ? 0.22 : 0.0008;
          } else if (p < 0.02) p = 0.0025;
          if (r() > p) continue;
          const conifer = h > 170 ? r() < 0.85 : (fbm(px / 300, pz / 300, 2, 71) > 0.05 ? r() < 0.7 : r() < 0.15);
          const type = conifer ? 'pine' : 'oak';
          const s = (conifer ? 1.0 : 0.95) * (0.75 + r() * 0.6) * (h > 300 ? 0.75 : 1);
          BABYLON.Quaternion.RotationYawPitchRollToRef(r() * 6.28, (r() - 0.5) * 0.06, (r() - 0.5) * 0.06, q);
          BABYLON.Matrix.ComposeToRef(new BABYLON.Vector3(s, s * (0.9 + r() * 0.25), s), q, new BABYLON.Vector3(px, h - 0.3, pz), m);
          const arr = new Float32Array(16); m.copyToArray(arr);
          mats[type].push(arr);
          const tint = 0.85 + r() * 0.3;
          cols[type].push(tint * (0.95 + r() * 0.1), tint, tint * (0.9 + r() * 0.15), 1);
          const H = (conifer ? 14 : 10.5) * s, R = (conifer ? 3.0 : 4.2) * s;
          this.addTree([px, h, pz, H, R, conifer ? 1 : 0]);
          count++;
        }
      }
      for (const [mesh, type] of [[pine, 'pine'], [oak, 'oak']]) {
        const list = mats[type];
        const buf = new Float32Array(list.length * 16);
        list.forEach((a, k) => buf.set(a, k * 16));
        mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
        mesh.thinInstanceSetBuffer('color', new Float32Array(cols[type]), 4, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
      }
      this.treeCount = count;
    }
    addTree(t) {
      this.trees.push(t);
      const key = Math.floor(t[0] / 40) + ',' + Math.floor(t[2] / 40);
      let a = this.treeGrid.get(key);
      if (!a) { a = []; this.treeGrid.set(key, a); }
      a.push(t);
    }
    // returns tree hit or null for a point
    treeHit(x, y, z, margin = 0) {
      const ci = Math.floor(x / 40), cj = Math.floor(z / 40);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const a = this.treeGrid.get((ci + di) + ',' + (cj + dj));
        if (!a) continue;
        for (const t of a) {
          const dy = y - t[1];
          if (dy < 0 || dy > t[3]) continue;
          const d = Math.hypot(x - t[0], z - t[2]);
          let rad;
          if (t[5] === 1) rad = dy < t[3] * 0.16 ? 0.35 : t[4] * (1 - (dy - t[3] * 0.16) / (t[3] * 0.84));
          else rad = dy < t[3] * 0.38 ? 0.4 : t[4] * Math.sin(Math.PI * clamp((dy - t[3] * 0.3) / (t[3] * 0.7), 0, 1)) + 0.4;
          if (d < rad + margin) return t;
        }
      }
      return null;
    }

    buildRocks() {
      const scene = this.scene;
      const rock = BABYLON.MeshBuilder.CreateIcoSphere('rock', { radius: 1, subdivisions: 2, flat: true }, scene);
      const p = rock.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      const c = [];
      for (let k = 0; k < p.length; k += 3) {
        const j = 1 + FS.perlin(p[k] * 1.7 + 3, p[k + 2] * 1.7 + p[k + 1], 2) * 0.35;
        p[k] *= j; p[k + 1] *= j * 0.7; p[k + 2] *= j;
        const s = 0.8 + p[k + 1] * 0.15;
        c.push(0.48 * s, 0.46 * s, 0.43 * s, 1);
      }
      rock.setVerticesData(BABYLON.VertexBuffer.PositionKind, p);
      rock.setVerticesData(BABYLON.VertexBuffer.ColorKind, c);
      rock.convertToFlatShadedMesh();
      const mat = new BABYLON.StandardMaterial('rockMat', scene);
      mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
      rock.material = mat;
      rock.isPickable = false;
      const r = rng(77);
      const list = [];
      const m = new BABYLON.Matrix();
      const q = new BABYLON.Quaternion();
      for (let k = 0; k < 9000 && list.length < 900; k++) {
        const x = (r() - 0.5) * (SIZE - 100), z = (r() - 0.5) * (SIZE - 100);
        const h = this.heightAt(x, z);
        if (h < 1) continue;
        const slope = this.slopeAt(x, z);
        const want = slope > 0.2 || h > 250 ? 0.5 : 0.03;
        if (r() > want) continue;
        const s = 0.6 + Math.pow(r(), 3) * (slope > 0.2 ? 9 : 3);
        BABYLON.Quaternion.RotationYawPitchRollToRef(r() * 6.28, r() * 0.4, r() * 0.4, q);
        BABYLON.Matrix.ComposeToRef(new BABYLON.Vector3(s * (0.8 + r() * 0.6), s, s * (0.8 + r() * 0.6)), q, new BABYLON.Vector3(x, h - s * 0.25, z), m);
        const a = new Float32Array(16); m.copyToArray(a); list.push(a);
      }
      const buf = new Float32Array(list.length * 16);
      list.forEach((a, k) => buf.set(a, k * 16));
      rock.thinInstanceSetBuffer('matrix', buf, 16, true);
      rock.thinInstanceRefreshBoundingInfo(false);
    }

    // ---------- clouds ----------
    buildClouds() {
      const scene = this.scene;
      const S = 128;
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const r = rng(55);
      for (let k = 0; k < 14; k++) {
        const x = S / 2 + (r() - 0.5) * S * 0.4, y = S / 2 + (r() - 0.5) * S * 0.3, rad = S * (0.14 + r() * 0.16);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.6, 'rgba(250,250,252,0.25)');
        g.addColorStop(1, 'rgba(245,247,250,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
      }
      const sm = new BABYLON.SpriteManager('clouds', cv.toDataURL(), 700, { width: S, height: S }, scene);
      sm.isPickable = false;
      sm.disableDepthWrite = true;
      sm.fogEnabled = true;
      this.cloudSprites = [];
      const cr = rng(66);
      for (let c = 0; c < 55; c++) {
        const cx = (cr() - 0.5) * 5200, cz = (cr() - 0.5) * 5200, cy = 900 + cr() * 260;
        const n = 7 + Math.floor(cr() * 8);
        const sx = 140 + cr() * 160, sz = 90 + cr() * 120;
        for (let k = 0; k < n; k++) {
          const sp = new BABYLON.Sprite('c', sm);
          sp.position = new BABYLON.Vector3(cx + (cr() - 0.5) * sx, cy + (cr() - 0.3) * 30, cz + (cr() - 0.5) * sz);
          sp.size = 90 + cr() * 110;
          sp.angle = cr() * 6.28;
          const shade = 0.88 + cr() * 0.12;
          sp.color = new BABYLON.Color4(shade, shade, shade * 1.02, 0.9);
          this.cloudSprites.push(sp);
        }
      }
    }

    // ---------- the eyrie ----------
    buildNest() {
      const scene = this.scene;
      // highest reachable crag in the northern range, near the middle
      let best = null;
      for (let j = 0; j <= N; j += 2) for (let i = 0; i <= N; i += 2) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL;
        if (Math.abs(x) > 700 || z < 650 || z > 1350) continue;
        const h = this.H[j * (N + 1) + i];
        if (!best || h > best.h) best = { x, z, h };
      }
      const nest = new BABYLON.TransformNode('nest', scene);
      const y = this.heightAt(best.x, best.z);
      nest.position.set(best.x, y, best.z);
      const g = new FS.Geo();
      const r = rng(8);
      for (let k = 0; k < 70; k++) {
        const a = r() * 6.28, rad = 0.55 + r() * 0.35, h = 0.05 + r() * 0.3;
        const a2 = a + 0.8 + r() * 0.8;
        FS.tube(g, [[Math.cos(a) * rad, h, Math.sin(a) * rad], [Math.cos(a2) * (rad + 0.1), h + (r() - 0.5) * 0.15, Math.sin(a2) * (rad + 0.1)]],
          () => [0.025, 0.025], 4, () => { const s = 0.7 + r() * 0.4; return [0.38 * s, 0.28 * s, 0.17 * s]; });
      }
      FS.ellipsoid(g, 0, 0.08, 0, 0.62, 0.1, 0.62, 12, 6, () => [0.30, 0.22, 0.14]);
      const eggs = [[0.12, 0.2, 0.05], [-0.1, 0.2, -0.08], [0.02, 0.2, -0.16]];
      eggs.forEach(([x, yy, z]) => FS.ellipsoid(g, x, yy, z, 0.04, 0.04, 0.052, 10, 6, (nx, ny) => ny > 0.3 && nx > 0 ? [0.55, 0.30, 0.22] : [0.78, 0.55, 0.42]));
      const mat = new BABYLON.StandardMaterial('nestMat', scene);
      mat.specularColor = BABYLON.Color3.Black();
      const m = g.toMesh('nestMesh', scene, mat, nest);
      m.receiveShadows = true;
      this.nest = { x: best.x, y, z: best.z, node: nest };
    }

    // ---------- thermals ----------
    buildThermals() {
      const scene = this.scene;
      const r = rng(4242);
      const spots = [];
      let guard = 0;
      while (spots.length < 9 && guard++ < 2000) {
        const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000 - 200;
        const h = this.heightAt(x, z);
        if (h < 5 || h > 200) continue;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 450)) continue;
        spots.push({ x, z, base: h, radius: 55 + r() * 45, strength: 3.2 + r() * 2.3, top: h + 520 + r() * 250, phase: r() * 6.28 });
      }
      // include one thermal near the start so it is discoverable
      spots.push({ x: this.nest.x + 120, z: this.nest.z - 420, base: this.heightAt(this.nest.x + 120, this.nest.z - 420), radius: 80, strength: 4.2, top: this.nest.y + 300, phase: 0 });
      this.thermals = spots;
      // subtle drifting fluff so thermals can be spotted
      const S = 32;
      const dt = new BABYLON.DynamicTexture('fluff', { width: S, height: S }, scene, false);
      const ctx = dt.getContext();
      const gr = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S); dt.hasAlpha = true; dt.update();
      spots.forEach((s, k) => {
        const ps = new BABYLON.ParticleSystem('thermal' + k, 260, scene);
        ps.particleTexture = dt;
        ps.emitter = new BABYLON.Vector3(s.x, s.base + 2, s.z);
        ps.minEmitBox = new BABYLON.Vector3(-s.radius * 0.6, 0, -s.radius * 0.6);
        ps.maxEmitBox = new BABYLON.Vector3(s.radius * 0.6, 60, s.radius * 0.6);
        ps.direction1 = new BABYLON.Vector3(-0.4, s.strength * 0.9, -0.4);
        ps.direction2 = new BABYLON.Vector3(0.4, s.strength * 1.1, 0.4);
        ps.minEmitPower = 1; ps.maxEmitPower = 1;
        ps.minLifeTime = 25; ps.maxLifeTime = 45;
        ps.emitRate = 7;
        ps.minSize = 0.25; ps.maxSize = 0.6;
        ps.color1 = new BABYLON.Color4(1, 1, 0.95, 0.75);
        ps.color2 = new BABYLON.Color4(0.95, 0.95, 0.9, 0.5);
        ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
        ps.gravity = BABYLON.Vector3.Zero();
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.preWarmCycles = 300; ps.preWarmStepOffset = 10;
        ps.start();
        s.ps = ps;
      });
    }
    // vertical air velocity at a point (thermal lift / sink)
    updraft(x, y, z, time) {
      let w = 0;
      for (const s of this.thermals) {
        const wob = Math.sin(time * 0.1 + s.phase) * 15;
        const d = Math.hypot(x - s.x - wob, z - s.z);
        if (d > s.radius * 1.6 || y > s.top) continue;
        const vert = smoothstep(s.top, s.top - 120, y) * smoothstep(s.base - 5, s.base + 30, y);
        if (d < s.radius) w += s.strength * (1 - (d / s.radius) ** 2) * vert;
        else w -= 0.7 * Math.sin(Math.PI * (d - s.radius) / (s.radius * 0.6)) * vert;
      }
      return w;
    }

    // ---------- minimap ----------
    buildMinimap() {
      const S = 512;
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const wx = -HALF + (x + 0.5) / S * SIZE, wz = HALF - (y + 0.5) / S * SIZE;
        const i = clamp(Math.round((wx + HALF) / CELL), 0, N), j = clamp(Math.round((wz + HALF) / CELL), 0, N);
        const k = j * (N + 1) + i;
        let c = [this.colors[k * 3], this.colors[k * 3 + 1], this.colors[k * 3 + 2]];
        const h = this.H[k];
        const shade = clamp(1 + (this.gridH(i - 1, j) - this.gridH(i + 1, j) + this.gridH(i, j + 1) - this.gridH(i, j - 1)) * 0.02, 0.6, 1.35);
        if (h < 0) c = [0.16, 0.36, 0.48];
        const o = (y * S + x) * 4;
        img.data[o] = clamp(c[0] * shade * 255, 0, 255); img.data[o + 1] = clamp(c[1] * shade * 255, 0, 255); img.data[o + 2] = clamp(c[2] * shade * 255, 0, 255); img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.minimap = cv;
    }

    update(dt, time) {
      if (this.waterTex) { this.waterTex.uOffset = time * 0.004; this.waterTex.vOffset = time * 0.0027; }
      for (const sp of this.cloudSprites) {
        sp.position.x += dt * 2.2;
        if (sp.position.x > 2800) sp.position.x -= 5600;
      }
    }
  }

  FS.World = World;
})(window.FS);
