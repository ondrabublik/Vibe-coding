'use strict';
// Terrain, water, sky, clouds, forests, villages and the airfield.
(function (BW) {
  const V3 = BABYLON.Vector3, MB = BABYLON.MeshBuilder, C3 = BABYLON.Color3;

  // Unit triangular prism: base x -0.5..0.5 at y=0, ridge at y=1, z -0.5..0.5.
  function makePrism(name, scene) {
    const p = [
      -0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, -0.5, 0, 0.5,
      0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
      -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5,
      0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, -0.5,
    ];
    const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
    const normals = [];
    BABYLON.VertexData.ComputeNormals(p, idx, normals);
    const vd = new BABYLON.VertexData();
    vd.positions = p; vd.indices = idx; vd.normals = normals;
    const m = new BABYLON.Mesh(name, scene);
    vd.applyToMesh(m);
    return m;
  }

  function twoSided(mat) { mat.backFaceCulling = false; mat.twoSidedLighting = true; return mat; }

  function softTexture(scene, name, size, draw) {
    const t = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
    draw(t.getContext(), size);
    t.update();
    t.hasAlpha = true;
    return t;
  }

  class World {
    constructor(scene, game) {
      this.scene = scene;
      this.game = game;
      const rng = (this.rng = BW.rng(1917));
      this.forests = [];
      while (this.forests.length < 60) {
        const x = (rng() - 0.5) * 13000, z = (rng() - 0.5) * 13000;
        if (Math.abs(x) < 500 && Math.abs(z) < 1600) continue;
        if (BW.terrainHeight(x, z) < BW.WATER_LEVEL + 4) continue;
        this.forests.push({ x, z, r: 150 + rng() * 380 });
      }
      this.villages = [];
      while (this.villages.length < 8) {
        const x = (rng() - 0.5) * 11000, z = (rng() - 0.5) * 11000;
        if (Math.hypot(x, z) < 1500) continue;
        const h = BW.terrainHeight(x, z);
        if (h < BW.WATER_LEVEL + 8 || h > 200) continue;
        this.villages.push({ x, z });
      }
      // Ground-attack mission: the enemy depot site is chosen before trees and houses are placed.
      this.site = game.mode === 'ground' ? BW.pickDepotSite(this) : null;
      this.buildSky();
      this.buildGround();
      this.buildWater();
      this.buildClouds();
      this.buildTrees();
      this.buildVillages();
      this.buildAirfield();
      this.buildShips();
    }

    buildSky() {
      const scene = this.scene;
      const sky = new BABYLON.SkyMaterial('sky', scene);
      sky.backFaceCulling = false;
      sky.turbidity = 6;
      sky.luminance = 1.0;
      sky.rayleigh = 1.8;
      sky.mieCoefficient = 0.004;
      sky.mieDirectionalG = 0.85;
      sky.useSunPosition = true;
      sky.sunPosition = this.game.sunDir.scale(-100);
      const box = MB.CreateBox('skyBox', { size: 50000 }, scene);
      box.material = sky;
      box.infiniteDistance = true;
      box.applyFog = false;
      box.isPickable = false;
    }

    buildGround() {
      const scene = this.scene, W = BW.WORLD_SIZE, SUB = 256;
      const ground = MB.CreateGround('ground', { width: W, height: W, subdivisions: SUB }, scene);
      const pos = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      const uvs = ground.getVerticesData(BABYLON.VertexBuffer.UVKind);
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], z = pos[i * 3 + 2];
        let h = BW.terrainHeight(x, z);
        // Push the lake beds well below the water plane: the shoreline then crosses the water at a steep
        // angle and the two surfaces never fight for depth (no flickering). Gameplay uses the analytic height.
        if (h < BW.WATER_LEVEL) h = BW.WATER_LEVEL - 2 - (BW.WATER_LEVEL - h) * 2.5;
        pos[i * 3 + 1] = h;
        uvs[i * 2] = x / W + 0.5;
        uvs[i * 2 + 1] = z / W + 0.5;
      }
      const idx = ground.getIndices();
      const normals = [];
      BABYLON.VertexData.ComputeNormals(pos, idx, normals);
      const colors = new Float32Array(n * 4);
      const rng = BW.rng(7);
      for (let i = 0; i < n; i++) {
        const ny = normals[i * 3 + 1];
        const shade = BW.clamp(0.72 + 0.3 * ny, 0.6, 1) * (0.93 + rng() * 0.07);
        colors[i * 4] = colors[i * 4 + 1] = colors[i * 4 + 2] = shade;
        colors[i * 4 + 3] = 1;
      }
      ground.setVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
      ground.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
      ground.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs);
      ground.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors, false, 4);
      ground.refreshBoundingInfo();

      const mat = new BABYLON.StandardMaterial('groundMat', scene);
      mat.diffuseTexture = this.makeGroundTexture();
      mat.specularColor = C3.Black();
      ground.material = mat;
      ground.receiveShadows = true;
      ground.isPickable = false;
      ground.freezeWorldMatrix();
      this.ground = ground;
    }

    makeGroundTexture() {
      const S = 2048, W = BW.WORLD_SIZE, rng = BW.rng(42);
      const tex = new BABYLON.DynamicTexture('groundTex', { width: S, height: S }, this.scene, true);
      const ctx = tex.getContext();
      const toC = (x, z) => [(x / W + 0.5) * S, (0.5 - z / W) * S];
      const k = S / W;
      ctx.fillStyle = '#62803c';
      ctx.fillRect(0, 0, S, S);
      // Patchwork of fields
      const pal = ['#6b8a3e', '#7d9446', '#8a9a4c', '#a39a55', '#6f7f3a', '#5f7b35', '#94a05a', '#b3a464', '#7a6a45', '#88934f', '#9c8b56', '#71893f'];
      for (let i = 0; i < 5200; i++) {
        const x = rng() * S, y = rng() * S;
        const w = 10 + rng() * 34, h = 8 + rng() * 26;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(x * 0.004) * 0.5 + Math.cos(y * 0.003) * 0.4);
        ctx.fillStyle = pal[(rng() * pal.length) | 0];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#3f5a2a';
        ctx.fillRect(-w / 2, -h / 2, w, 1.2);
        ctx.fillRect(-w / 2, -h / 2, 1.2, h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // Speckles
      for (let i = 0; i < 40000; i++) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(30,50,20,0.18)' : 'rgba(200,210,150,0.12)';
        ctx.fillRect(rng() * S, rng() * S, 1.5, 1.5);
      }
      // Roads between villages and the airfield
      ctx.strokeStyle = 'rgba(150,130,95,0.9)';
      ctx.lineWidth = 1.6;
      const pts = [{ x: 260, z: -700 }].concat(this.villages);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const [ax, ay] = toC(a.x, a.z), [bx, by] = toC(b.x, b.z);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2 + (rng() - 0.5) * 120, (ay + by) / 2 + (rng() - 0.5) * 120, bx, by);
        ctx.stroke();
      }
      // Forest floor
      for (const f of this.forests) {
        const [cx, cy] = toC(f.x, f.z);
        ctx.fillStyle = 'rgba(38,58,26,0.85)';
        for (let j = 0; j < 7; j++) {
          ctx.beginPath();
          ctx.arc(cx + (rng() - 0.5) * f.r * k, cy + (rng() - 0.5) * f.r * k, f.r * k * (0.5 + rng() * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Villages
      for (const v of this.villages) {
        const [cx, cy] = toC(v.x, v.z);
        ctx.fillStyle = 'rgba(140,125,95,0.8)';
        ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
      }
      // Trampled ground of the enemy depot and its access road
      if (this.site) {
        const [cx, cy] = toC(this.site.x, this.site.z);
        let near = this.villages[0];
        for (const v of this.villages) if (Math.hypot(v.x - this.site.x, v.z - this.site.z) < Math.hypot(near.x - this.site.x, near.z - this.site.z)) near = v;
        const [vx, vy] = toC(near.x, near.z);
        ctx.strokeStyle = 'rgba(150,130,95,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke();
        ctx.fillStyle = 'rgba(128,108,78,0.55)';
        ctx.beginPath(); ctx.ellipse(cx, cy, 95 * k, 75 * k, 0.4, 0, Math.PI * 2); ctx.fill();
      }
      // Height based overlay: shores, rock and snow (low-res then smoothed)
      const L = 256, ov = document.createElement('canvas');
      ov.width = ov.height = L;
      const octx = ov.getContext('2d'), img = octx.createImageData(L, L);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const x = ((i + 0.5) / L - 0.5) * W, z = (0.5 - (j + 0.5) / L) * W;
        const h = BW.terrainHeight(x, z), o = (j * L + i) * 4;
        let r = 0, g = 0, b = 0, a = 0;
        if (h < BW.WATER_LEVEL + 7) { r = 150; g = 140; b = 100; a = 200; }
        else if (h > 480) { r = 235; g = 238; b = 242; a = 255 * BW.smoothstep(480, 600, h); }
        else if (h > 260) { r = 120; g = 112; b = 96; a = 230 * BW.smoothstep(260, 380, h); }
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ov, 0, 0, S, S);
      tex.update();
      tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      tex.anisotropicFilteringLevel = 8;
      return tex;
    }

    buildWater() {
      const scene = this.scene, W = BW.WORLD_SIZE;
      const w = MB.CreateGround('water', { width: W, height: W, subdivisions: 1 }, scene);
      w.position.y = BW.WATER_LEVEL;
      const m = new BABYLON.StandardMaterial('waterMat', scene);
      // Colour variation (large tiles) ...
      const col = softTexture(scene, 'waterCol', 256, (ctx, S) => {
        const rng = BW.rng(77);
        ctx.fillStyle = '#3d6378'; ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 260; i++) {
          const x = rng() * S, y = rng() * S, r = 10 + rng() * 40;
          const c = rng() < 0.5 ? '30,70,90,' : '110,150,165,', a = rng() < 0.5 ? 0.2 : 0.14;
          for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
            const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
            gr.addColorStop(0, 'rgba(' + c + a + ')'); gr.addColorStop(1, 'rgba(' + c + '0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
      col.hasAlpha = false;
      col.uScale = col.vScale = W / 900;
      col.wrapU = col.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      // ... and small waves: tileable normal map from a sum of sines with integer frequencies.
      const S = 256;
      const bump = new BABYLON.DynamicTexture('waterBump', { width: S, height: S }, scene, true);
      const ctx = bump.getContext(), img = ctx.createImageData(S, S), rng = BW.rng(31);
      const waves = [];
      for (let i = 0; i < 14; i++) {
        const kx = Math.round((rng() - 0.5) * 12), ky = Math.round(1 + rng() * 6) * (rng() < 0.5 ? -1 : 1);
        waves.push({ kx, ky, a: 1 / Math.hypot(kx, ky), ph: rng() * 6.283 });
      }
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let dx = 0, dy = 0;
        for (const wv of waves) {
          const c = Math.cos(((wv.kx * x + wv.ky * y) / S) * 6.283 + wv.ph) * wv.a;
          dx += c * wv.kx; dy += c * wv.ky;
        }
        const nx = -dx * 0.09, ny = -dy * 0.09, l = Math.hypot(nx, ny, 1), o = (y * S + x) * 4;
        img.data[o] = (nx / l * 0.5 + 0.5) * 255;
        img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
        img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      bump.update();
      bump.wrapU = bump.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      bump.uScale = bump.vScale = W / 45;
      bump.level = 0.4;
      bump.anisotropicFilteringLevel = 8;
      m.diffuseTexture = col;
      m.bumpTexture = bump;
      m.specularColor = new C3(0.5, 0.5, 0.47);
      m.specularPower = 200;
      m.emissiveColor = new C3(0.04, 0.07, 0.09);
      w.material = m;
      w.isPickable = false;
      w.receiveShadows = true;
      w.freezeWorldMatrix();
      this.waterBump = bump;
    }

    // ------------------------------------------------------------ ships
    // Deep enough spots on the lakes, away from each other.
    findWaterSpots(n, rng) {
      const out = [], WL = BW.WATER_LEVEL;
      for (let i = 0; i < 6000 && out.length < n; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (BW.BATTLE_RADIUS - 300);
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (BW.terrainHeight(x, z) > WL - 5) continue;
        let ok = true;
        for (let k = 0; k < 8 && ok; k++) {
          const b = (k / 8) * Math.PI * 2;
          if (BW.terrainHeight(x + Math.sin(b) * 70, z + Math.cos(b) * 70) > WL - 2) ok = false;
        }
        if (ok && out.every((o) => Math.hypot(o.x - x, o.z - z) > 700)) out.push({ x, z });
      }
      return out;
    }

    buildShips() {
      const scene = this.scene, rng = BW.rng(21);
      const wakeMat = new BABYLON.StandardMaterial('wakeMat', scene);
      // Foam: speckles fading out along the wake (u runs from the stern backwards).
      wakeMat.diffuseTexture = softTexture(scene, 'wakeTex', 128, (ctx, S) => {
        const r = BW.rng(5);
        ctx.clearRect(0, 0, S, S);
        for (let i = 0; i < 900; i++) {
          const x = Math.pow(r(), 1.6) * S, y = r() * S, fade = 1 - x / S;
          ctx.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.35) * fade})`;
          ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 5, 1 + r() * 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
      });
      wakeMat.useAlphaFromDiffuseTexture = true;
      wakeMat.emissiveColor = new C3(0.6, 0.62, 0.62);
      wakeMat.specularColor = C3.Black();
      wakeMat.backFaceCulling = false;
      wakeMat.disableDepthWrite = true;
      this.wakeMat = wakeMat;
      this.ships = [];
      this.findWaterSpots(8, rng).forEach((sp, i) => {
        const sail = i % 3 === 2;
        const ship = sail ? this.buildSailboat(rng) : this.buildSteamer(rng);
        Object.assign(ship, {
          sail, x: sp.x, z: sp.z, heading: rng() * Math.PI * 2, speed: sail ? 2.5 : 4 + rng() * 1.5,
          turnDir: 0, bob: rng() * 6,
        });
        ship.root.meshes = ship.meshes;
        ship.meshes.forEach((mm) => {
          mm.isPickable = false;
          if (this.game.shadowGen) this.game.shadowGen.addShadowCaster(mm, false);
        });
        this.ships.push(ship);
      });
      this.shipT = 0;
    }

    // Hull lofted through stations {z, w (half beam), t (deck height), d (draft)}: sides + deck.
    hull(stations, hullMat, deckMat) {
      const scene = this.scene;
      const sides = stations.map((s) => [
        new V3(-s.w, s.t, s.z), new V3(-s.w * 0.97, 0, s.z), new V3(-s.w * 0.75, -s.d * 0.7, s.z), new V3(0, -s.d, s.z),
        new V3(s.w * 0.75, -s.d * 0.7, s.z), new V3(s.w * 0.97, 0, s.z), new V3(s.w, s.t, s.z),
      ]);
      const h = MB.CreateRibbon('hull', { pathArray: sides, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
      h.material = hullMat;
      const deck = MB.CreateRibbon('deck', {
        pathArray: [stations.map((s) => new V3(-s.w * 0.97, s.t - 0.08, s.z)), stations.map((s) => new V3(s.w * 0.97, s.t - 0.08, s.z))],
        sideOrientation: BABYLON.Mesh.DOUBLESIDE,
      }, scene);
      deck.material = deckMat;
      return [h, deck];
    }

    // V-shaped wake behind the stern (fades out along its length). It has its own node that follows
    // only the ship's position and heading: the hull's pitching would dip the long strips under water.
    wake(ship, sternZ, beam, len) {
      const out = [];
      const root = (ship.wakeRoot = new BABYLON.TransformNode('wakeRoot', this.scene));
      for (const sx of [-1, 1]) {
        const a = [new V3(sx * beam * 0.7, 0, sternZ), new V3(sx * (beam * 0.9 + len * 0.16), 0, sternZ - len)];
        const b = [new V3(sx * beam * 0.2, 0, sternZ), new V3(sx * (beam * 0.5 + len * 0.13), 0, sternZ - len)];
        const m = MB.CreateRibbon('wake', { pathArray: [a, b], sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
        m.material = this.wakeMat;
        m.parent = root;
        m.isPickable = false;
        out.push(m);
      }
      return out;
    }

    finishShip(root, parts) {
      const byMat = new Map();
      for (const p of parts) {
        if (!byMat.has(p.material)) byMat.set(p.material, []);
        byMat.get(p.material).push(p);
      }
      const meshes = [];
      for (const [mat, list] of byMat) {
        const m = BABYLON.Mesh.MergeMeshes(list, true, true);
        m.material = mat;
        m.parent = root;
        meshes.push(m);
      }
      return meshes;
    }

    // Small coastal cargo steamer, ~34 m.
    buildSteamer(rng) {
      const scene = this.scene, root = new BABYLON.TransformNode('steamer', scene);
      const hullC = ['#2a2927', '#3a2b24', '#2c3438'][(rng() * 3) | 0];
      const parts = this.hull([
        { z: -17, w: 0.4, t: 2.4, d: 1.2 }, { z: -16.4, w: 2.8, t: 2.3, d: 1.8 }, { z: -13, w: 3.4, t: 2.0, d: 2.2 },
        { z: -4, w: 3.6, t: 1.9, d: 2.3 }, { z: 5, w: 3.6, t: 1.9, d: 2.3 }, { z: 10.5, w: 3.0, t: 2.1, d: 2.2 },
        { z: 14.5, w: 1.6, t: 2.5, d: 1.9 }, { z: 17.3, w: 0.06, t: 3.0, d: 1.2 },
      ], BW.getMat(scene, hullC, { spec: 0.15 }), BW.getMat(scene, '#8a6f4e'));
      const white = BW.getMat(scene, '#dcd6c4'), dark = BW.getMat(scene, '#232220', { spec: 0.2 });
      const box = (w, h, d, x, y, z, mat) => { const b = MB.CreateBox('b', { width: w, height: h, depth: d }, scene); b.position.set(x, y, z); b.material = mat; parts.push(b); return b; };
      const cyl = (h, dia, x, y, z, mat, dTop) => {
        const c = MB.CreateCylinder('c', { height: h, diameter: dia, diameterTop: dTop === undefined ? dia : dTop, tessellation: 14 }, scene);
        c.position.set(x, y, z); c.material = mat; parts.push(c); return c;
      };
      box(6, 2.4, 9, 0, 3.0, -3, white); // deckhouse
      box(4.6, 1.8, 3, 0, 5.1, -0.5, white); // bridge
      box(5.2, 0.15, 3.6, 0, 6.05, -0.5, dark);
      cyl(5.5, 1.7, 0, 6.6, -5, dark); // funnel
      cyl(0.9, 1.75, 0, 8.6, -5, BW.getMat(scene, ['#9a2a20', '#c9b24a', '#e0e0d8'][(rng() * 3) | 0]));
      box(4, 0.6, 4.5, 0, 2.2, 8, dark); // cargo hatches
      box(4, 0.6, 4, 0, 2.3, -12, dark);
      cyl(11, 0.25, 0, 7.5, 11.5, BW.getMat(scene, '#5a4632'), 0.15); // masts
      cyl(10, 0.25, 0, 7.2, -14.2, BW.getMat(scene, '#5a4632'), 0.15);
      for (const sx of [-1, 1]) {
        const lb = MB.CreateCylinder('lb', { height: 4.2, diameter: 1.1, tessellation: 10 }, scene);
        lb.rotation.x = Math.PI / 2; lb.scaling.set(1, 1, 0.6); lb.position.set(sx * 3.1, 4.6, -6); lb.material = white; parts.push(lb);
      }
      const meshes = this.finishShip(root, parts);
      // Invisible emitter at the funnel top for the smoke (added once the effects exist).
      const funnel = new BABYLON.TransformNode('funnelTop', scene);
      funnel.parent = root; funnel.position.set(0, 9.4, -5);
      const ship = { root, meshes, funnel };
      meshes.push(...this.wake(ship, -16, 3.2, 90));
      return ship;
    }

    // Fishing sailboat, ~11 m.
    buildSailboat(rng) {
      const scene = this.scene, root = new BABYLON.TransformNode('sailboat', scene);
      const parts = this.hull([
        { z: -5.2, w: 0.3, t: 0.9, d: 0.6 }, { z: -4.8, w: 1.4, t: 0.85, d: 0.9 }, { z: 0, w: 1.9, t: 0.8, d: 1.1 },
        { z: 3.5, w: 1.4, t: 0.95, d: 1.0 }, { z: 5.6, w: 0.05, t: 1.3, d: 0.6 },
      ], BW.getMat(scene, ['#4a3a2a', '#35505a', '#6a2e24'][(rng() * 3) | 0], { spec: 0.1 }), BW.getMat(scene, '#8a6f4e'));
      const wood = BW.getMat(scene, '#5a4632');
      const mast = MB.CreateCylinder('mast', { height: 9, diameterTop: 0.1, diameterBottom: 0.18, tessellation: 8 }, scene);
      mast.position.set(0, 5.2, 1.2); mast.material = wood; parts.push(mast);
      const cabin = MB.CreateBox('cab', { width: 2, height: 1, depth: 2.2 }, scene);
      cabin.position.set(0, 1.2, -2.2); cabin.material = BW.getMat(scene, '#8a6f4e'); parts.push(cabin);
      const sail = MB.CreateRibbon('sail', {
        pathArray: [[new V3(0, 1.6, 1.0), new V3(0, 9.3, 1.0)], [new V3(0.8, 1.6, -3.8), new V3(0.1, 2.2, -3.4)]],
        sideOrientation: BABYLON.Mesh.DOUBLESIDE,
      }, scene);
      sail.material = BW.getMat(scene, ['#e4dcc4', '#c9a27a', '#b8563c'][(rng() * 3) | 0], { twoSided: true });
      parts.push(sail);
      const meshes = this.finishShip(root, parts);
      const ship = { root, meshes };
      meshes.push(...this.wake(ship, -5, 1.5, 35));
      return ship;
    }

    addShipSmoke(fx) {
      for (const s of this.ships) {
        if (!s.funnel) continue;
        const e = MB.CreateBox('smokeEm', { size: 0.1 }, this.scene);
        e.parent = s.funnel; e.isVisible = false; e.isPickable = false;
        const ps = fx.makeSystem(90, e);
        ps.minEmitBox = new V3(-0.4, 0, -0.4); ps.maxEmitBox = new V3(0.4, 0, 0.4);
        ps.color1 = new BABYLON.Color4(0.18, 0.17, 0.16, 0.55);
        ps.color2 = new BABYLON.Color4(0.3, 0.29, 0.28, 0.45);
        ps.colorDead = new BABYLON.Color4(0.5, 0.5, 0.5, 0);
        ps.minLifeTime = 5; ps.maxLifeTime = 8;
        ps.emitRate = 10;
        ps.direction1 = new V3(-0.2, 1, -0.2); ps.direction2 = new V3(0.2, 1, 0.2);
        ps.minEmitPower = 1.5; ps.maxEmitPower = 2.5;
        ps.gravity = new V3(1.2, 0.3, 0.6);
        ps.addSizeGradient(0, 1.8); ps.addSizeGradient(1, 11);
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.start();
      }
    }

    update(dt) {
      this.shipT += dt;
      if (this.waterBump) { this.waterBump.uOffset += dt * 0.012; this.waterBump.vOffset += dt * 0.007; }
      const WL = BW.WATER_LEVEL, t = this.shipT;
      const deep = (s, d, a) => BW.terrainHeight(s.x + Math.sin(s.heading + a) * d, s.z + Math.cos(s.heading + a) * d) < WL - 2.5;
      for (const s of this.ships) {
        // Steer away from the shore: turn toward the freer side while the way ahead is shallow.
        if (!deep(s, 80, 0) || !deep(s, 50, 0.45) || !deep(s, 50, -0.45)) {
          if (!s.turnDir) s.turnDir = deep(s, 70, 0.9) ? 1 : deep(s, 70, -0.9) ? -1 : (Math.random() < 0.5 ? 1 : -1);
          s.heading += s.turnDir * 0.09 * dt;
        } else s.turnDir = 0;
        if (deep(s, 20, 0)) {
          const v = s.speed * (s.turnDir ? 0.6 : 1) * dt;
          s.x += Math.sin(s.heading) * v; s.z += Math.cos(s.heading) * v;
        }
        const r = s.root;
        r.position.set(s.x, WL + Math.sin(t * 0.9 + s.bob) * 0.08, s.z);
        s.wakeRoot.position.set(s.x, WL + 0.1, s.z);
        s.wakeRoot.rotation.y = s.heading;
        r.rotation.set(Math.sin(t * 0.6 + s.bob) * 0.012, s.heading, Math.sin(t * 0.8 + s.bob * 2) * (s.sail ? 0.05 : 0.02) + (s.sail ? 0.06 : 0));
      }
    }

    buildClouds() {
      const scene = this.scene, rng = BW.rng(99);
      const mats = [0, 1, 2].map((v) => {
        const tex = softTexture(scene, 'cloud' + v, 256, (ctx, S) => {
          const r2 = BW.rng(500 + v);
          for (let i = 0; i < 70; i++) {
            const x = S * (0.2 + r2() * 0.6), y = S * (0.35 + r2() * 0.35 - (Math.abs(x / S - 0.5)) * 0.3);
            const r = S * (0.06 + r2() * 0.12);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            const shade = 235 + ((r2() * 20) | 0) - (y / S) * 40;
            g.addColorStop(0, `rgba(${shade},${shade},${shade + 8},0.55)`);
            g.addColorStop(1, `rgba(${shade},${shade},${shade + 8},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          }
        });
        const m = new BABYLON.StandardMaterial('cloudMat' + v, scene);
        m.diffuseTexture = tex;
        m.useAlphaFromDiffuseTexture = true;
        m.emissiveColor = new C3(0.95, 0.95, 0.97);
        m.disableLighting = true;
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        return m;
      });
      this.clouds = [];
      for (let c = 0; c < 18; c++) {
        const cx = (rng() - 0.5) * 14000, cz = (rng() - 0.5) * 14000, cy = 950 + rng() * 500;
        const count = 3 + ((rng() * 5) | 0);
        for (let i = 0; i < count; i++) {
          const size = 250 + rng() * 450;
          const p = MB.CreatePlane('cloud', { width: size * 1.6, height: size }, scene);
          p.material = mats[(rng() * 3) | 0];
          p.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
          p.position.set(cx + (rng() - 0.5) * 900, cy + (rng() - 0.5) * 120, cz + (rng() - 0.5) * 900);
          p.isPickable = false;
          this.clouds.push(p);
        }
      }
    }

    buildTrees() {
      const scene = this.scene, rng = BW.rng(5);
      const colorize = (m, c) => {
        const n = m.getTotalVertices(), col = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = 1; }
        m.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, false, 4);
        return m;
      };
      const trunk = () => { const t = MB.CreateCylinder('t', { height: 4, diameter: 0.7, tessellation: 5 }, scene); t.position.y = 2; return colorize(t, [0.33, 0.25, 0.17]); };
      const pineCrown = MB.CreateCylinder('c', { height: 11, diameterTop: 0, diameterBottom: 5.5, tessellation: 7 }, scene);
      pineCrown.position.y = 8.5;
      colorize(pineCrown, [0.16, 0.3, 0.15]);
      const pine = BABYLON.Mesh.MergeMeshes([trunk(), pineCrown], true);
      const leafCrown = MB.CreateIcoSphere('l', { radius: 4.2, subdivisions: 1, flat: true }, scene);
      leafCrown.position.y = 7;
      leafCrown.scaling.y = 1.15;
      colorize(leafCrown, [0.24, 0.38, 0.17]);
      const leaf = BABYLON.Mesh.MergeMeshes([trunk(), leafCrown], true);
      const mat = new BABYLON.StandardMaterial('treeMat', scene);
      mat.diffuseColor = C3.White();
      mat.specularColor = C3.Black();
      pine.material = leaf.material = mat;

      const bufs = [[], []];
      const place = (x, z) => {
        if (Math.abs(x) < 320 && Math.abs(z) < 1500) return;
        if (this.site && Math.hypot(x - this.site.x, z - this.site.z) < 260) return;
        const h = BW.terrainHeight(x, z);
        if (h < BW.WATER_LEVEL + 3 || h > 420) return;
        const s = 0.7 + rng() * 0.7;
        const m = BABYLON.Matrix.Compose(new V3(s, s * (0.85 + rng() * 0.3), s), BABYLON.Quaternion.RotationYawPitchRoll(rng() * 6.28, 0, 0), new V3(x, h - 0.3, z));
        bufs[h > 150 || rng() < 0.45 ? 0 : 1].push(m);
      };
      for (const f of this.forests) {
        const cnt = Math.floor((f.r * f.r) / 1400);
        for (let i = 0; i < cnt; i++) {
          const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * f.r;
          place(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d);
        }
      }
      // Tree lines along field edges
      for (let i = 0; i < 90; i++) {
        let x = (rng() - 0.5) * 12000, z = (rng() - 0.5) * 12000;
        const a = rng() * Math.PI, dx = Math.cos(a) * 14, dz = Math.sin(a) * 14;
        for (let j = 0; j < 25; j++) { place(x + (rng() - 0.5) * 4, z + (rng() - 0.5) * 4); x += dx; z += dz; }
      }
      [pine, leaf].forEach((mesh, i) => {
        const arr = new Float32Array(bufs[i].length * 16);
        bufs[i].forEach((m, j) => m.copyToArray(arr, j * 16));
        mesh.thinInstanceSetBuffer('matrix', arr, 16, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
        mesh.isPickable = false;
        mesh.freezeWorldMatrix();
      });
    }

    buildVillages() {
      const scene = this.scene, rng = BW.rng(11);
      const walls = MB.CreateBox('wall', { size: 1 }, scene);
      walls.position.y = 0.5;
      walls.bakeCurrentTransformIntoVertices();
      const roof = makePrism('roof', scene);
      walls.material = BW.getMat(scene, '#d6cbb0');
      roof.material = twoSided(BW.getMat(scene, '#8a3b2a').clone('roofMat'));
      const wm = [], rm = [];
      const addHouse = (x, z, rot, w, d, h) => {
        const y = BW.terrainHeight(x, z) - 0.5;
        const q = BABYLON.Quaternion.RotationYawPitchRoll(rot, 0, 0);
        wm.push(BABYLON.Matrix.Compose(new V3(w, h, d), q, new V3(x, y, z)));
        rm.push(BABYLON.Matrix.Compose(new V3(w * 1.15, h * 0.7, d * 1.08), q, new V3(x, y + h, z)));
      };
      for (const v of this.villages) {
        const rot0 = rng() * Math.PI;
        for (let i = 0; i < 16; i++) {
          const along = (i - 8) * 22 + (rng() - 0.5) * 6, side = (i % 2 ? 1 : -1) * (14 + rng() * 8);
          const x = v.x + Math.cos(rot0) * along - Math.sin(rot0) * side;
          const z = v.z + Math.sin(rot0) * along + Math.cos(rot0) * side;
          addHouse(x, z, -rot0, 8 + rng() * 5, 11 + rng() * 6, 5 + rng() * 2);
        }
        // Church
        addHouse(v.x, v.z, -rot0, 7, 7, 22);
      }
      // Farmhouse near the airfield
      addHouse(330, -820, 0.3, 10, 16, 6);
      addHouse(355, -790, 0.3, 8, 10, 5);
      [[walls, wm], [roof, rm]].forEach(([mesh, list]) => {
        const arr = new Float32Array(list.length * 16);
        list.forEach((m, j) => m.copyToArray(arr, j * 16));
        mesh.thinInstanceSetBuffer('matrix', arr, 16, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
        mesh.isPickable = false;
        mesh.receiveShadows = true;
      });
    }

    buildAirfield() {
      const scene = this.scene, A = BW.AIRFIELD;
      // Grass overlay with a mowed runway strip
      const tex = new BABYLON.DynamicTexture('fieldTex', { width: 512, height: 2048 }, scene, true);
      const ctx = tex.getContext(), rng = BW.rng(3);
      const W = A.halfWidth * 2 + 40, L = A.halfLength * 2 + 60;
      const px = 512 / W, pz = 2048 / L;
      ctx.fillStyle = '#6a8c40'; ctx.fillRect(0, 0, 512, 2048);
      for (let i = 0; i < 30000; i++) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(40,70,25,0.25)' : 'rgba(170,190,110,0.2)';
        ctx.fillRect(rng() * 512, rng() * 2048, 2, 2);
      }
      const rw = A.runwayHalfWidth * px, rl = A.runwayHalfLength * pz;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? '#86a653' : '#7b9c4a';
        ctx.fillRect(256 - rw + (i * 2 * rw) / 12, 1024 - rl, (2 * rw) / 12 + 1, 2 * rl);
      }
      ctx.fillStyle = 'rgba(120,100,60,0.35)';
      ctx.fillRect(256 - 6 * px, 1024 - rl, 12 * px, 2 * rl);
      tex.update();
      tex.hasAlpha = false;
      const field = MB.CreateGround('airfield', { width: W, height: L }, scene);
      field.position.y = 0.12;
      const fm = new BABYLON.StandardMaterial('fieldMat', scene);
      fm.diffuseTexture = tex;
      fm.specularColor = C3.Black();
      fm.zOffset = -4;
      field.material = fm;
      field.receiveShadows = true;
      field.isPickable = false;
      field.freezeWorldMatrix();

      const white = BW.getMat(scene, '#eeeeea');
      const canvas = BW.getMat(scene, '#c9bd98');
      const canvasDark = twoSided(BW.getMat(scene, '#b3a680').clone('canvasDark'));
      const woodM = BW.getMat(scene, '#6b4a2b');
      const statics = [];
      const box = (w, h, d, x, y, z, mat, ry) => {
        const b = MB.CreateBox('b', { width: w, height: h, depth: d }, scene);
        b.position.set(x, y, z);
        if (ry) b.rotation.y = ry;
        b.material = mat;
        statics.push(b);
        return b;
      };
      // Runway edge markers and landing "T"
      for (let z = -A.runwayHalfLength; z <= A.runwayHalfLength; z += 115) {
        box(3, 0.3, 1.2, -A.runwayHalfWidth - 3, 0.15, z, white);
        box(3, 0.3, 1.2, A.runwayHalfWidth + 3, 0.15, z, white);
      }
      box(20, 0.3, 3, -48, 0.15, -540, white);
      box(3, 0.3, 16, -48, 0.15, -530, white);

      // Bessonneau hangars
      for (let i = 0; i < 3; i++) {
        const z = -380 + i * 34, x = 125;
        box(20, 5.5, 26, x, 2.75, z, canvas);
        const roof = makePrism('hroof', scene);
        roof.material = canvasDark;
        roof.scaling.set(21, 4.5, 27);
        roof.position.set(x, 5.5, z);
        statics.push(roof);
        box(0.3, 5, 10, x - 10.1, 2.5, z, BW.getMat(scene, '#3a3325'));
      }
      // Hut, fuel barrels, tents
      box(8, 3.2, 6, 110, 1.6, -230, BW.getMat(scene, '#7a5a3a'));
      const hutRoof = makePrism('hutroof', scene);
      hutRoof.material = roofMatFor(scene);
      hutRoof.scaling.set(9, 2, 7);
      hutRoof.position.set(110, 3.2, -230);
      statics.push(hutRoof);
      for (let i = 0; i < 8; i++) {
        const b = MB.CreateCylinder('barrel', { height: 1.2, diameter: 0.8, tessellation: 10 }, scene);
        b.position.set(100 + (i % 4) * 1.0, 0.6, -212 + Math.floor(i / 4) * 1.0);
        b.material = BW.getMat(scene, '#46522f', { spec: 0.3 });
        statics.push(b);
      }
      for (let i = 0; i < 4; i++) {
        const t = makePrism('tent', scene);
        t.material = canvasDark;
        t.scaling.set(5, 3, 6);
        t.position.set(150, 0, -170 + i * 10);
        statics.push(t);
      }
      // Windsock
      const pole = MB.CreateCylinder('pole', { height: 9, diameter: 0.2 }, scene);
      pole.position.set(-70, 4.5, -300);
      pole.material = woodM;
      statics.push(pole);
      const sock = MB.CreateCylinder('sock', { height: 4, diameterTop: 0.4, diameterBottom: 1.1, tessellation: 10 }, scene);
      sock.material = BW.getMat(scene, '#e06a1c');
      sock.rotation.x = Math.PI / 2 + 0.25;
      sock.rotation.y = this.game.windHeading + Math.PI;
      sock.position.set(-70, 8.6, -300);
      sock.position.addInPlace(new V3(Math.sin(sock.rotation.y), 0, Math.cos(sock.rotation.y)).scale(2));
      statics.push(sock);
      statics.forEach((m) => { m.isPickable = false; m.receiveShadows = true; if (this.game.shadowGen) this.game.shadowGen.addShadowCaster(m, false); });

      // Two parked biplanes next to the hangars
      [[95, -365, -Math.PI / 2], [95, -330, -Math.PI / 2 + 0.15]].forEach(([x, z, h]) => {
        const m = BW.buildBiplane(scene, BW.SCHEMES.ally, 'parked');
        const th = BW.PHYS.tailAngle;
        m.root.position.set(x, BW.gearClearance(th), z);
        m.root.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(h, -th, 0);
        m.disc.setEnabled(false);
        m.head.setEnabled(false);
        if (this.game.shadowGen) m.meshes.forEach((mm) => this.game.shadowGen.addShadowCaster(mm, false));
      });
    }
  }

  function roofMatFor(scene) {
    return twoSided(BW.getMat(scene, '#5a3a2a').clone('hutRoofMat'));
  }

  BW.World = World;
})(window.BW);
