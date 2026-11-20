'use strict';
// Prey animals: models (thin-instanced for performance) and behaviour (flocks, flight, flushing, fleeing, burrows).
(function (FS) {
  const { Geo, ellipsoid, tube, sheet, clamp, lerp, smoothstep, mix3, rng, hash2 } = FS;
  const V3 = BABYLON.Vector3;

  // ---------------- species ----------------
  const SPECIES = {
    pigeon:    { name: 'Holub', kind: 'bird', cruise: 15, max: 21.5, acc: 11, catchR: 0.55, mass: 0.35, points: 100, alarm: 48, alt: [18, 80], flapHz: 6.5, span: 0.64, food: 30, color: '#9aa5b8' },
    starling:  { name: 'Špaček', kind: 'bird', cruise: 16, max: 20.5, acc: 16, catchR: 0.40, mass: 0.08, points: 70, alarm: 55, alt: [12, 55], flapHz: 11, span: 0.38, food: 12, color: '#57606e' },
    duck:      { name: 'Kachna divoká', kind: 'bird', cruise: 18, max: 23, acc: 8, catchR: 0.65, mass: 1.1, points: 170, alarm: 58, alt: [10, 45], flapHz: 7.5, span: 0.90, food: 55, color: '#4f9a5c' },
    partridge: { name: 'Koroptev', kind: 'ground-bird', cruise: 16, max: 18.5, acc: 14, catchR: 0.55, mass: 0.40, points: 130, alarm: 42, alt: [3, 7], flapHz: 12, span: 0.50, food: 35, color: '#c48a4c' },
    rabbit:    { name: 'Králík', kind: 'mammal', run: 11, catchR: 0.60, mass: 1.5, points: 150, alarm: 55, food: 60, color: '#b39a7a' },
    hare:      { name: 'Zajíc polní', kind: 'mammal', run: 17, catchR: 0.70, mass: 3.5, points: 240, alarm: 72, food: 80, color: '#c9955a' },
    vole:      { name: 'Hraboš', kind: 'mammal', run: 3.6, catchR: 0.45, mass: 0.04, points: 50, alarm: 24, food: 10, color: '#8a6d52' },
  };

  // ---------------- models ----------------
  function birdModel(key) {
    const body = new Geo(), wing = new Geo();
    let wingSpan, chord, shoulder;
    const spk = (nx, ny, nz) => hash2(Math.floor(nx * 40), Math.floor(ny * 40 + nz * 40), 5) > 0.82;
    if (key === 'pigeon') {
      const grey = [0.60, 0.63, 0.69], dark = [0.30, 0.32, 0.36], neck = [0.36, 0.52, 0.47], light = [0.70, 0.72, 0.76];
      ellipsoid(body, 0, 0, 0, 0.055, 0.052, 0.12, 14, 10, (nx, ny, nz) => (nz > 0.55 ? (ny > -0.2 ? neck : mix3(neck, [0.52, 0.40, 0.55], 0.5)) : ny < -0.3 ? light : grey));
      ellipsoid(body, 0, 0.036, 0.125, 0.027, 0.027, 0.032, 12, 8, () => [0.50, 0.54, 0.60]);
      tube(body, [[0, 0.03, 0.155], [0, 0.026, 0.176]], (t) => [0.006 * (1 - t) + 0.001, 0.005 * (1 - t) + 0.001], 6, (t) => (t < 0.3 ? [0.9, 0.9, 0.9] : [0.15, 0.13, 0.13]));
      for (const s of [1, -1]) ellipsoid(body, s * 0.021, 0.045, 0.14, 0.006, 0.006, 0.006, 6, 4, () => [0.8, 0.35, 0.1]);
      sheet(body, 4, 2, (u, v) => [(v - 0.5) * lerp(0.05, 0.075, u), 0.01, -0.09 - u * 0.12], (u) => (u > 0.8 ? dark : grey), () => light);
      wingSpan = 0.30; chord = 0.13; shoulder = [0.035, 0.025, 0.035];
      buildBirdWing(wing, wingSpan, chord, 'pointed', (u, v) => {
        if (u > 0.62) return u > 0.85 ? [0.2, 0.2, 0.23] : [0.45, 0.47, 0.52];
        if (u < 0.5 && ((v > 0.45 && v < 0.55) || (v > 0.68 && v < 0.78))) return [0.12, 0.12, 0.14];
        return grey;
      }, () => [0.88, 0.89, 0.92]);
    } else if (key === 'starling') {
      const blk = [0.08, 0.08, 0.10];
      ellipsoid(body, 0, 0, 0, 0.032, 0.030, 0.075, 12, 8, (nx, ny, nz) => (spk(nx, ny, nz) ? [0.8, 0.78, 0.7] : ny > 0 ? mix3(blk, [0.10, 0.18, 0.14], 0.4) : blk));
      ellipsoid(body, 0, 0.018, 0.075, 0.018, 0.018, 0.022, 10, 6, () => [0.07, 0.07, 0.09]);
      tube(body, [[0, 0.016, 0.092], [0, 0.012, 0.118]], (t) => [0.004 * (1 - t) + 0.0006, 0.004 * (1 - t) + 0.0006], 6, () => [0.95, 0.80, 0.15]);
      sheet(body, 3, 2, (u, v) => [(v - 0.5) * 0.045, 0.005, -0.06 - u * 0.06], () => blk, () => blk);
      wingSpan = 0.17; chord = 0.075; shoulder = [0.02, 0.015, 0.02];
      buildBirdWing(wing, wingSpan, chord, 'triangle', (u) => (u > 0.7 ? [0.05, 0.05, 0.07] : [0.10, 0.11, 0.13]), () => [0.22, 0.21, 0.22]);
    } else if (key === 'duck') {
      const green = [0.07, 0.36, 0.17], chest = [0.45, 0.25, 0.17], side = [0.70, 0.68, 0.64], back = [0.42, 0.38, 0.32];
      ellipsoid(body, 0, 0, 0, 0.085, 0.075, 0.21, 16, 10, (nx, ny, nz) => {
        if (nz > 0.72) return green;
        if (nz > 0.66) return [0.95, 0.95, 0.95];
        if (nz > 0.35 && ny < 0.4) return chest;
        if (nz < -0.8) return ny > 0 ? [0.08, 0.08, 0.09] : [0.95, 0.95, 0.95];
        return ny > 0.35 ? back : side;
      });
      ellipsoid(body, 0, 0.055, 0.225, 0.040, 0.042, 0.052, 12, 8, () => green);
      tube(body, [[0, 0.045, 0.265], [0, 0.038, 0.315]], () => [0.018, 0.007], 8, (t) => (t > 0.9 ? [0.2, 0.2, 0.1] : [0.9, 0.78, 0.2]));
      sheet(body, 3, 2, (u, v) => [(v - 0.5) * 0.09, 0.01, -0.19 - u * 0.08], () => [0.35, 0.33, 0.3], () => [0.9, 0.9, 0.9]);
      wingSpan = 0.40; chord = 0.16; shoulder = [0.05, 0.035, 0.07];
      buildBirdWing(wing, wingSpan, chord, 'pointed', (u, v) => {
        if (u < 0.45 && v > 0.62 && v < 0.85) return [0.16, 0.26, 0.72];
        return u > 0.65 ? [0.33, 0.31, 0.29] : [0.47, 0.43, 0.38];
      }, () => [0.85, 0.85, 0.86]);
    } else { // partridge
      const grey = [0.55, 0.53, 0.50], brown = [0.50, 0.40, 0.28];
      ellipsoid(body, 0, 0, 0, 0.07, 0.068, 0.13, 14, 10, (nx, ny, nz) => {
        if (ny < -0.2 && nz > -0.2 && nz < 0.3 && Math.abs(nx) < 0.5) return [0.45, 0.22, 0.12];
        if (ny > 0.3) return spk(nx, ny, nz) ? [0.7, 0.62, 0.45] : brown;
        return Math.sin(nz * 30) > 0.6 && Math.abs(nx) > 0.6 ? [0.55, 0.30, 0.18] : grey;
      });
      ellipsoid(body, 0, 0.045, 0.125, 0.032, 0.032, 0.038, 12, 8, (nx, ny, nz) => (nz > 0.1 && ny < 0.5 ? [0.86, 0.52, 0.26] : [0.45, 0.38, 0.28]));
      tube(body, [[0, 0.04, 0.16], [0, 0.034, 0.178]], (t) => [0.006 * (1 - t) + 0.001, 0.006 * (1 - t) + 0.001], 6, () => [0.5, 0.5, 0.45]);
      sheet(body, 3, 2, (u, v) => [(v - 0.5) * 0.07, 0.01, -0.11 - u * 0.06], () => [0.7, 0.35, 0.18], () => grey);
      for (const s of [1, -1]) tube(body, [[s * 0.03, -0.05, 0.0], [s * 0.03, -0.1, 0.01]], () => [0.006, 0.006], 5, () => [0.55, 0.45, 0.4]);
      wingSpan = 0.22; chord = 0.12; shoulder = [0.045, 0.03, 0.03];
      buildBirdWing(wing, wingSpan, chord, 'round', (u, v) => (Math.sin(u * 30 + v * 8) > 0.5 ? [0.35, 0.27, 0.18] : brown), () => [0.72, 0.68, 0.60]);
    }
    return { body, wing, shoulder };
  }

  function buildBirdWing(geo, span, chord, shape, colTop, colBot) {
    sheet(geo, 6, 3, (u, v) => {
      let c = chord;
      if (shape === 'pointed') c *= u < 0.45 ? 1 : lerp(1, 0.15, (u - 0.45) / 0.55);
      else if (shape === 'triangle') c *= lerp(1, 0.1, u);
      else c *= u < 0.6 ? 1 : lerp(1, 0.55, (u - 0.6) / 0.4);
      const sweep = (shape === 'round' ? 0.1 : 0.35) * u * u * chord;
      const x = u * span;
      const z = chord * 0.35 - sweep - v * c;
      const y = Math.sin(v * Math.PI) * c * 0.06;
      return [x, y, z];
    }, colTop, colBot);
  }

  function mammalModel(key) {
    const g = new Geo();
    const sc = key === 'hare' ? 1.3 : key === 'vole' ? 0.33 : 1;
    const fur = key === 'hare' ? [0.62, 0.47, 0.30] : key === 'vole' ? [0.44, 0.34, 0.25] : [0.53, 0.46, 0.37];
    const belly = key === 'vole' ? [0.6, 0.55, 0.48] : [0.84, 0.80, 0.72];
    const S = (v) => v * sc;
    const col = (nx, ny, nz) => {
      const n = hash2(Math.floor(nx * 20), Math.floor((ny + nz) * 20), 3) * 0.12 - 0.06;
      const c = ny < -0.45 ? belly : fur;
      return [c[0] + n, c[1] + n, c[2] + n];
    };
    if (key === 'vole') {
      ellipsoid(g, 0, S(0.1), 0, S(0.085), S(0.075), S(0.16), 12, 8, col);
      ellipsoid(g, 0, S(0.11), S(0.15), S(0.055), S(0.05), S(0.065), 10, 6, col);
      for (const s of [1, -1]) {
        ellipsoid(g, s * S(0.035), S(0.155), S(0.15), S(0.022), S(0.022), S(0.01), 6, 4, () => [0.35, 0.25, 0.2]);
        ellipsoid(g, s * S(0.04), S(0.125), S(0.19), S(0.01), S(0.01), S(0.01), 6, 4, () => [0.02, 0.02, 0.02]);
      }
      tube(g, [[0, S(0.09), S(-0.15)], [0, S(0.07), S(-0.25)]], () => [S(0.012), S(0.012)], 5, () => [0.4, 0.3, 0.25]);
      return { body: g };
    }
    // lagomorph
    ellipsoid(g, 0, S(0.13), 0, S(0.085), S(0.095), S(0.17), 14, 10, col);
    ellipsoid(g, 0, S(0.11), S(-0.1), S(0.09), S(0.085), S(0.1), 12, 8, col);     // haunches
    ellipsoid(g, 0, S(0.20), S(0.16), S(0.05), S(0.055), S(0.075), 12, 8, col);   // head
    const earLen = key === 'hare' ? 0.13 : 0.085;
    for (const s of [1, -1]) {
      tube(g, [[s * S(0.022), S(0.24), S(0.14)], [s * S(0.03), S(0.24 + earLen * 0.6), S(0.08)], [s * S(0.034), S(0.24 + earLen * 0.95), S(0.02)]],
        (t) => [S(0.018) * (1 - t * 0.5), S(0.007)], 6, (t) => (key === 'hare' && t > 0.8 ? [0.05, 0.05, 0.05] : fur));
      ellipsoid(g, s * S(0.036), S(0.215), S(0.19), S(0.012), S(0.013), S(0.012), 6, 4, () => [0.05, 0.03, 0.02]);
      // legs
      tube(g, [[s * S(0.05), S(0.07), S(-0.12)], [s * S(0.05), S(0.01), S(-0.02)], [s * S(0.05), S(0.005), S(0.06)]], () => [S(0.022), S(0.02)], 6, () => fur);
      tube(g, [[s * S(0.04), S(0.10), S(0.12)], [s * S(0.04), S(0.01), S(0.13)]], () => [S(0.013), S(0.013)], 6, () => fur);
    }
    ellipsoid(g, 0, S(0.16), S(-0.21), S(0.03), S(0.03), S(0.03), 8, 6, () => (key === 'hare' ? [0.1, 0.1, 0.1] : [0.95, 0.95, 0.95]));
    tube(g, [[0, S(0.19), S(0.225)], [0, S(0.185), S(0.235)]], () => [S(0.008), S(0.008)], 5, () => [0.35, 0.2, 0.2]);
    return { body: g };
  }

  // ---------------- renderer (thin instances) ----------------
  class SpeciesRenderer {
    constructor(scene, key, count, mat) {
      this.key = key; this.count = count;
      const sp = SPECIES[key];
      this.meshes = [];
      this.buffers = [];
      const mk = (geo, name) => {
        const m = geo.toMesh(key + name, scene, mat);
        m.isPickable = false;
        const buf = new Float32Array(count * 16);
        m.thinInstanceSetBuffer('matrix', buf, 16, false);
        this.buffers.push(buf);
        m.alwaysSelectAsActiveMesh = true;
        m.doNotSyncBoundingInfo = true;
        this.meshes.push(m);
        return m;
      };
      if (sp.kind === 'mammal') {
        this.body = mk(mammalModel(key).body, 'Body');
      } else {
        const md = birdModel(key);
        this.body = mk(md.body, 'Body');
        this.wingR = mk(md.wing, 'WingR');
        const wl = new Geo();
        wl.p = md.wing.p.slice(); wl.c = md.wing.c.slice(); wl.i = md.wing.i.slice();
        wl.transform((x, y, z) => [-x, y, z]);
        for (let k = 0; k < wl.i.length; k += 3) { const t = wl.i[k + 1]; wl.i[k + 1] = wl.i[k + 2]; wl.i[k + 2] = t; }
        this.wingL = mk(wl, 'WingL');
        this.shoulder = md.shoulder;
      }
    }
    set(i, which, matrix) { matrix.copyToArray(this.buffers[which], i * 16); }
    hide(i) { for (const b of this.buffers) b.fill(0, i * 16, i * 16 + 16); }
    flush() { for (const m of this.meshes) m.thinInstanceBufferUpdated('matrix'); }
  }

  // ---------------- manager ----------------
  const TMP_Q = new BABYLON.Quaternion();
  const TMP_M = new BABYLON.Matrix();
  const TMP_M2 = new BABYLON.Matrix();
  const TMP_M3 = new BABYLON.Matrix();
  const ONE = new V3(1, 1, 1);

  class PreyManager {
    constructor(scene, world) {
      this.scene = scene; this.world = world;
      this.list = [];
      this.flocks = [];
      this.renderers = {};
      this.r = rng(2024);
      this.mat = new BABYLON.StandardMaterial('preyMat', scene);
      this.mat.diffuseColor = BABYLON.Color3.White();
      this.mat.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
      this.mat.backFaceCulling = true;
      this.time = 0;
    }

    init() {
      const plan = { pigeon: [5, 8], starling: [2, 26], duck: [4, 5], partridge: [4, 6], rabbit: [16, 1], hare: [10, 1], vole: [18, 1] };
      for (const key in plan) {
        const [groups, size] = plan[key];
        const total = groups * size;
        this.renderers[key] = new SpeciesRenderer(this.scene, key, total, this.mat);
        let idx = 0;
        for (let g = 0; g < groups; g++) {
          const flock = { key, members: [], alarm: 0, wp: new V3(), center: new V3(), mode: 'fly', timer: 0 };
          for (let k = 0; k < size; k++) {
            const ind = { sp: SPECIES[key], key, idx: idx++, pos: new V3(), prev: new V3(), vel: new V3(), yaw: 0, pitch: 0, bank: 0,
              state: 'idle', t: 0, flapPh: this.r() * 6.28, flapAmp: 1, flock, alive: true, hidden: false, alarm: 0, zig: 0, zigDir: 1, home: null, respawnT: 0, bob: this.r() * 6 };
            flock.members.push(ind);
            this.list.push(ind);
          }
          this.flocks.push(flock);
          this.spawnFlock(flock, true);
        }
      }
      // blob shadows under ground animals & low flyers
      const S = 64;
      const dt = new BABYLON.DynamicTexture('blob', { width: S, height: S }, this.scene, false);
      const ctx = dt.getContext();
      const gr = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S); dt.hasAlpha = true; dt.update();
      const blob = BABYLON.MeshBuilder.CreateGround('blob', { width: 1, height: 1 }, this.scene);
      const bm = new BABYLON.StandardMaterial('blobMat', this.scene);
      bm.diffuseTexture = dt; bm.useAlphaFromDiffuseTexture = true; bm.diffuseColor = BABYLON.Color3.Black();
      bm.specularColor = BABYLON.Color3.Black(); bm.disableLighting = true; bm.zOffset = -2;
      blob.material = bm; blob.isPickable = false;
      this.blobBuf = new Float32Array(this.list.length * 16);
      blob.thinInstanceSetBuffer('matrix', this.blobBuf, 16, false);
      blob.alwaysSelectAsActiveMesh = true;
      this.blob = blob;
    }

    // ---------- spawning ----------
    findSpot(test, cx, cz, rMin, rMax, tries = 200) {
      for (let k = 0; k < tries; k++) {
        const a = this.r() * Math.PI * 2, d = rMin + this.r() * (rMax - rMin);
        const x = clamp(cx + Math.cos(a) * d, -1800, 1800), z = clamp(cz + Math.sin(a) * d, -1800, 1800);
        if (test(x, z)) return [x, z];
      }
      return null;
    }
    spawnFlock(flock, initial, near) {
      const W = this.world;
      const key = flock.key;
      const cx = near ? near.x : 0, cz = near ? near.z : -200;
      const rMin = initial ? 0 : 450, rMax = initial ? 1700 : 1000;
      const land = (x, z) => { const h = W.heightAt(x, z); return h > 2 && h < 280 && W.slopeAt(x, z) < 0.3; };
      let spot;
      if (key === 'duck') spot = this.findSpot((x, z) => W.heightAt(x, z) < -3, W.lake.x, W.lake.z, 0, 330);
      else if (key === 'partridge' || key === 'hare') spot = this.findSpot((x, z) => land(x, z) && W.farmMask(x, z) > 0.4 && !W.fieldInfo(x, z).hedge, cx, cz, rMin, rMax);
      else if (key === 'rabbit') spot = this.findSpot((x, z) => { if (!land(x, z)) return false; const d = W.forestDensity(x, z, W.heightAt(x, z), W.slopeAt(x, z)); return d > 0.02 && d < 0.35 && !W.treeHit(x, W.heightAt(x, z) + 0.5, z, 1); }, cx, cz, rMin, rMax, 600);
      else if (key === 'vole') spot = this.findSpot((x, z) => land(x, z) && W.forestDensity(x, z, W.heightAt(x, z), 0) < 0.05, cx, cz, rMin, rMax);
      else spot = this.findSpot(land, cx, cz, rMin, rMax);
      if (!spot) spot = this.findSpot(land, 0, -300, 0, 1200) || [0, -400];
      const [x, z] = spot;
      const g = W.groundAt(x, z);
      const sp = SPECIES[key];
      flock.alarm = 0; flock.timer = 0;
      flock.home = new V3(x, g, z);
      if (sp.kind === 'bird') {
        flock.mode = key === 'duck' && this.r() < 0.6 ? 'swim' : 'fly';
        flock.cruiseAlt = sp.alt[0] + this.r() * (sp.alt[1] - sp.alt[0]);
        this.newWaypoint(flock);
      } else if (sp.kind === 'ground-bird') flock.mode = 'ground';
      else flock.mode = 'ground';
      const heading = this.r() * Math.PI * 2;
      for (const ind of flock.members) {
        ind.alive = true; ind.hidden = false; ind.state = 'idle'; ind.alarm = 0; ind.t = this.r() * 3;
        const spread = sp.kind === 'mammal' ? 0 : key === 'starling' ? 12 : 5;
        let px = x + (this.r() - 0.5) * spread, pz = z + (this.r() - 0.5) * spread;
        if (flock.mode === 'fly') {
          ind.pos.set(px, W.groundAt(px, pz) + flock.cruiseAlt + (this.r() - 0.5) * 4, pz);
          ind.vel.set(Math.sin(heading), 0, Math.cos(heading)).scaleInPlace(sp.cruise);
          ind.state = 'fly';
        } else if (flock.mode === 'swim') {
          if (W.heightAt(px, pz) > -1) { px = x; pz = z; }
          ind.pos.set(px, 0.02, pz); ind.vel.set(0, 0, 0); ind.state = 'swim';
        } else {
          ind.pos.set(px, W.groundAt(px, pz), pz); ind.vel.set(0, 0, 0); ind.state = 'graze';
        }
        ind.yaw = heading + (this.r() - 0.5) * 0.5;
        ind.prev.copyFrom(ind.pos);
        if (key === 'rabbit') ind.home = ind.pos.clone();
      }
    }
    newWaypoint(flock) {
      const W = this.world;
      const base = flock.key === 'duck' ? new V3(W.lake.x, 0, W.lake.z) : flock.home;
      const range = flock.key === 'duck' ? 650 : 700;
      const a = this.r() * Math.PI * 2, d = this.r() * range;
      const x = clamp(base.x + Math.cos(a) * d, -1750, 1750), z = clamp(base.z + Math.sin(a) * d, -1750, 1750);
      flock.wp.set(x, 0, z);
    }

    // ---------- threat perception ----------
    senses(ind, F) {
      const dx = F.pos.x - ind.pos.x, dy = F.pos.y - ind.pos.y, dz = F.pos.z - ind.pos.z;
      const d = Math.hypot(dx, dy, dz);
      let r = ind.sp.alarm;
      if (d > r * 1.5) return false;
      // a stoop from high above & behind is hard to notice
      if (dy > 20) r *= 0.78;
      const fx = Math.sin(ind.yaw), fz = Math.cos(ind.yaw);
      if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) + 1e-3) < -0.3) r *= 0.72;
      if (F.tuck > 0.7) r *= 0.85;
      if (F.perched) r *= 0.5;
      const closing = -(F.vel.x * dx + F.vel.y * dy + F.vel.z * dz) / (d + 1e-3);
      return d < r && (closing > 2 || d < r * 0.45);
    }

    // ---------- update ----------
    update(dt, F) {
      this.time += dt;
      const W = this.world;
      for (const fl of this.flocks) {
        // flock-level perception & bookkeeping
        let alarmed = false, cx = 0, cy = 0, cz = 0, n = 0, vx = 0, vy = 0, vz = 0;
        for (const m of fl.members) {
          if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
          if (this.senses(m, F)) { alarmed = true; m.alarm = 3.5; }
          cx += m.pos.x; cy += m.pos.y; cz += m.pos.z; vx += m.vel.x; vy += m.vel.y; vz += m.vel.z; n++;
        }
        if (n) { fl.center.set(cx / n, cy / n, cz / n); fl.avgVel = new V3(vx / n, vy / n, vz / n); }
        if (alarmed && SPECIES[fl.key].kind !== 'mammal') fl.alarm = 4 + this.r() * 2;
        fl.alarm = Math.max(0, fl.alarm - dt);
        fl.timer += dt;
        // relocate flocks that are too far from the falcon (ducks stay at their lake)
        const far = Math.hypot(fl.center.x - F.pos.x, fl.center.z - F.pos.z);
        if ((n === 0 || far > 1500) && fl.key !== 'duck') {
          fl.respawn = (fl.respawn || 0) + dt;
          if (fl.respawn > (n === 0 ? 15 : 3)) { fl.respawn = 0; this.spawnFlock(fl, false, F.pos); }
        } else if (n === 0 && fl.key === 'duck') {
          fl.respawn = (fl.respawn || 0) + dt;
          if (fl.respawn > 25) { fl.respawn = 0; this.spawnFlock(fl, false); }
        }
        const sp = SPECIES[fl.key];
        if (sp.kind === 'bird') this.updateBirdFlock(fl, dt, F);
        else if (sp.kind === 'ground-bird') this.updateCovey(fl, dt, F);
        else for (const m of fl.members) this.updateMammal(m, dt, F);
      }
      this.render(F, dt);
    }

    steerBird(m, dt, desired, acc) {
      const sx = desired.x - m.vel.x, sy = desired.y - m.vel.y, sz = desired.z - m.vel.z;
      const l = Math.hypot(sx, sy, sz);
      const k = l > acc * dt ? (acc * dt) / l : 1;
      m.vel.x += sx * k; m.vel.y += sy * k; m.vel.z += sz * k;
    }

    updateBirdFlock(fl, dt, F) {
      const W = this.world, sp = SPECIES[fl.key];
      const alarmed = fl.alarm > 0;
      if (fl.mode === 'swim') {
        if (alarmed) { fl.mode = 'fly'; fl.cruiseAlt = sp.alt[1]; this.newWaypoint(fl); }
        for (const m of fl.members) {
          if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
          m.prev.copyFrom(m.pos);
          if (fl.mode === 'fly') { m.state = 'fly'; m.vel.set(Math.sin(m.yaw) * 6, 5, Math.cos(m.yaw) * 6); continue; }
          m.t -= dt;
          if (m.t < 0) { m.t = 2 + this.r() * 4; m.yaw += (this.r() - 0.5) * 1.5; }
          const nx = m.pos.x + Math.sin(m.yaw) * 0.4 * dt, nz = m.pos.z + Math.cos(m.yaw) * 0.4 * dt;
          if (W.heightAt(nx, nz) < -0.8) { m.pos.x = nx; m.pos.z = nz; } else m.yaw += Math.PI * dt;
          m.pos.y = 0.02 + Math.sin(this.time * 2 + m.bob) * 0.01;
          m.vel.set(0, 0, 0); m.pitch = 0; m.bank = 0; m.flapAmp = 0; m.state = 'swim';
        }
        return;
      }
      // flying flock: waypoint following + boids + evasion
      const toWp = new V3(fl.wp.x - fl.center.x, 0, fl.wp.z - fl.center.z);
      if (toWp.length() < 60) this.newWaypoint(fl);
      // ducks sometimes settle back on the lake
      if (fl.key === 'duck' && !alarmed && fl.timer > 40 && this.r() < dt * 0.02) {
        fl.wp.set(W.lake.x + (this.r() - 0.5) * 200, 0, W.lake.z + (this.r() - 0.5) * 150);
        fl.landing = true;
      }
      if (fl.landing && Math.hypot(fl.center.x - fl.wp.x, fl.center.z - fl.wp.z) < 40 && W.heightAt(fl.center.x, fl.center.z) < -2) {
        fl.landing = false; fl.mode = 'swim'; fl.timer = 0;
        for (const m of fl.members) if (m.alive && m.state === 'fly') { m.state = 'swim'; m.pos.y = 0.02; m.t = 0; }
        return;
      }
      const wpDir = toWp.normalize();
      const desired = new V3();
      for (const m of fl.members) {
        if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
        m.prev.copyFrom(m.pos);
        const g = W.groundAt(m.pos.x, m.pos.z);
        const targetY = g + (fl.landing ? 6 : fl.cruiseAlt);
        let spd = sp.cruise;
        desired.set(wpDir.x * spd, clamp((targetY - m.pos.y) * 0.5, -4, 4), wpDir.z * spd);
        // boids: cohesion / alignment / separation
        const coh = fl.key === 'starling' ? 0.25 : 0.12;
        desired.x += (fl.center.x - m.pos.x) * coh; desired.y += (fl.center.y - m.pos.y) * coh; desired.z += (fl.center.z - m.pos.z) * coh;
        if (fl.avgVel) { desired.x += (fl.avgVel.x - m.vel.x) * 0.3; desired.z += (fl.avgVel.z - m.vel.z) * 0.3; }
        for (const o of fl.members) {
          if (o === m || !o.alive || o.hidden) continue;
          const dx = m.pos.x - o.pos.x, dy = m.pos.y - o.pos.y, dz = m.pos.z - o.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const rr = fl.key === 'starling' ? 2.2 : 3.2;
          if (d2 < rr * rr && d2 > 1e-6) { const f = (rr * rr - d2) / (rr * rr) * 8; desired.x += dx * f; desired.y += dy * f; desired.z += dz * f; }
        }
        // murmuration waves
        if (fl.key === 'starling') {
          desired.x += Math.sin(this.time * 0.9 + m.pos.z * 0.05) * 3;
          desired.y += Math.sin(this.time * 1.3 + m.pos.x * 0.07) * 2;
        }
        let acc = sp.acc;
        if (alarmed || m.alarm > 0) {
          // evasive flight: away from the falcon, dive toward cover, hard jinks when close
          const ax = m.pos.x - F.pos.x, ay = m.pos.y - F.pos.y, az = m.pos.z - F.pos.z;
          const ad = Math.hypot(ax, ay, az) + 1e-3;
          m.zig -= dt;
          if (m.zig < 0) { m.zig = 0.35 + this.r() * 0.7; m.zigDir = this.r() < 0.5 ? -1 : 1; }
          const px = -az / ad, pz = ax / ad;       // perpendicular
          const jink = ad < 30 ? 1.1 : 0.4;
          desired.set(ax / ad + px * m.zigDir * jink, (ay / ad) * 0.4 - 0.25, az / ad + pz * m.zigDir * jink).normalize().scaleInPlace(sp.max);
          if (fl.key === 'duck' && Math.hypot(m.pos.x - W.lake.x, m.pos.z - W.lake.z) < 350 && ad < 25) desired.y = -12; // crash-dive to water
          if (m.pos.y - g < 4) desired.y = Math.max(desired.y, 3);
          acc *= ad < 30 ? 2.2 : 1.5;
          m.alarm = Math.max(0, m.alarm - dt);
        }
        // terrain & tree avoidance
        const ahead = W.groundAt(m.pos.x + m.vel.x * 1.5, m.pos.z + m.vel.z * 1.5);
        if (m.pos.y < ahead + 5) desired.y = Math.max(desired.y, (ahead + 8 - m.pos.y) * 2);
        // keep inside the valley
        if (Math.abs(m.pos.x) > 1700 || Math.abs(m.pos.z) > 1700) { desired.x -= m.pos.x * 0.02; desired.z -= m.pos.z * 0.02; }
        this.steerBird(m, dt, desired, acc);
        const s = m.vel.length();
        const maxS = alarmed ? sp.max : sp.cruise * 1.15;
        if (s > maxS) m.vel.scaleInPlace(maxS / s);
        else if (s < sp.cruise * 0.6) m.vel.scaleInPlace((sp.cruise * 0.6) / Math.max(s, 0.1));
        m.pos.addInPlace(m.vel.scale(dt));
        // water landing ducks can't go below surface
        const gy = W.groundAt(m.pos.x, m.pos.z);
        if (m.pos.y < gy + 0.5) { m.pos.y = gy + 0.5; if (m.vel.y < 0) m.vel.y = 0; }
        this.orientFlying(m, dt, alarmed);
      }
    }

    orientFlying(m, dt, alarmed) {
      const h = Math.hypot(m.vel.x, m.vel.z);
      const yaw = Math.atan2(m.vel.x, m.vel.z);
      let dyaw = yaw - m.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const rate = dyaw / Math.max(dt, 1e-3);
      m.yaw = yaw;
      m.pitch = lerp(m.pitch, -Math.atan2(m.vel.y, h), FS.expDecay(8, dt));
      m.bank = lerp(m.bank, clamp(-Math.atan(rate * h / 9.81), -1.2, 1.2), FS.expDecay(6, dt));
      // flap when climbing / fleeing; otherwise flap-glide rhythm
      const sp = m.sp;
      const gliding = !alarmed && m.vel.y < 0.5 && Math.sin(this.time * 0.7 + m.bob * 3) > (m.key === 'pigeon' ? 0.3 : 0.7);
      m.flapAmp = lerp(m.flapAmp, gliding ? 0 : 1, FS.expDecay(5, dt));
      m.flapPh += dt * sp.flapHz * (alarmed ? 1.3 : 1) * Math.PI * 2;
    }

    updateCovey(fl, dt, F) {
      const W = this.world, sp = SPECIES[fl.key];
      const alarmed = fl.alarm > 0;
      if (fl.mode === 'ground' && alarmed) {
        // flush! explode into the air away from the falcon
        fl.mode = 'fly'; fl.timer = 0;
        const away = new V3(fl.center.x - F.pos.x, 0, fl.center.z - F.pos.z).normalize();
        fl.flee = away;
        for (const m of fl.members) {
          if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
          m.state = 'fly';
          const a = (this.r() - 0.5) * 0.9;
          m.vel.set(away.x * Math.cos(a) - away.z * Math.sin(a), 0, away.x * Math.sin(a) + away.z * Math.cos(a)).scaleInPlace(9);
          m.vel.y = 6;
        }
      }
      if (fl.mode === 'fly' && fl.timer > 6 + (fl.key.length % 3) && !alarmed) {
        fl.mode = 'landing';
      }
      for (const m of fl.members) {
        if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
        m.prev.copyFrom(m.pos);
        const g = W.groundAt(m.pos.x, m.pos.z);
        if (m.state === 'fly') {
          const dir = fl.flee || new V3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
          const tY = fl.mode === 'landing' ? g - 1 : g + 4 + Math.sin(this.time * 2 + m.bob) * 1.5;
          const desired = new V3(dir.x * sp.max, (tY - m.pos.y) * 1.5, dir.z * sp.max);
          if (alarmed) {
            const ax = m.pos.x - F.pos.x, az = m.pos.z - F.pos.z, ad = Math.hypot(ax, az) + 1e-3;
            m.zig -= dt;
            if (m.zig < 0) { m.zig = 0.4 + this.r() * 0.6; m.zigDir = this.r() < 0.5 ? -1 : 1; }
            desired.x = (ax / ad - az / ad * m.zigDir * 0.8) * sp.max; desired.z = (az / ad + ax / ad * m.zigDir * 0.8) * sp.max;
          }
          if (fl.mode === 'landing') { desired.x *= 0.5; desired.z *= 0.5; }
          this.steerBird(m, dt, desired, sp.acc);
          m.pos.addInPlace(m.vel.scale(dt));
          if (m.pos.y < g + 0.05) {
            m.pos.y = g;
            if (fl.mode === 'landing') { m.state = 'graze'; m.vel.set(0, 0, 0); m.flapAmp = 0; m.pitch = 0; m.bank = 0; }
            else m.vel.y = Math.max(m.vel.y, 2);
          }
          if (m.state === 'fly') this.orientFlying(m, dt, true);
        } else {
          this.groundWander(m, dt, 0.7, true);
          m.flapAmp = 0; m.pitch = 0; m.bank = 0;
        }
      }
      if (fl.mode === 'landing' && fl.members.every((m) => !m.alive || m.hidden || m.state !== 'fly')) { fl.mode = 'ground'; fl.flee = null; }
    }

    groundWander(m, dt, speed, hop) {
      const W = this.world;
      m.t -= dt;
      if (m.t < 0) {
        m.t = 1 + this.r() * 3.5;
        m.moving = this.r() < 0.55;
        m.yaw += (this.r() - 0.5) * 2.2;
        if (m.home && m.home.subtract(m.pos).length() > 25) m.yaw = Math.atan2(m.home.x - m.pos.x, m.home.z - m.pos.z);
      }
      const v = m.moving ? speed : 0;
      const nx = m.pos.x + Math.sin(m.yaw) * v * dt, nz = m.pos.z + Math.cos(m.yaw) * v * dt;
      if (W.heightAt(nx, nz) > 0.8 && W.slopeAt(nx, nz) < 0.45) { m.pos.x = nx; m.pos.z = nz; } else m.yaw += Math.PI * 0.5;
      m.pos.y = W.groundAt(m.pos.x, m.pos.z);
      m.vel.set(Math.sin(m.yaw) * v, 0, Math.cos(m.yaw) * v);
      m.gait = v;
    }

    updateMammal(m, dt, F) {
      if (!m.alive || m.state === 'carried' || m.state === 'dead') return;
      const W = this.world, sp = m.sp;
      m.prev.copyFrom(m.pos);
      if (m.hidden) {
        m.t -= dt;
        if (m.t < 0 && Math.hypot(F.pos.x - m.pos.x, F.pos.z - m.pos.z) > 60) { m.hidden = false; m.state = 'graze'; m.t = 2; }
        return;
      }
      const threat = this.senses(m, F);
      if (threat) { m.alarm = 5; if (m.state === 'graze') { m.state = 'alert'; m.t = 0.25 + this.r() * 0.3; } }
      m.alarm = Math.max(0, m.alarm - dt);
      if (m.state === 'alert') {
        m.t -= dt; m.gait = 0; m.vel.set(0, 0, 0);
        m.yaw = lerp(m.yaw, Math.atan2(m.pos.x - F.pos.x, m.pos.z - F.pos.z), 0.1);
        if (m.t < 0) {
          m.state = 'flee'; m.zig = 0;
          if (m.key === 'vole') m.cover = 2 + this.r() * 2.5;
        }
      } else if (m.state === 'flee') {
        let dir = Math.atan2(m.pos.x - F.pos.x, m.pos.z - F.pos.z);
        if (m.key === 'rabbit' && m.home) {
          const dh = Math.hypot(m.home.x - m.pos.x, m.home.z - m.pos.z);
          if (dh < 80) dir = Math.atan2(m.home.x - m.pos.x, m.home.z - m.pos.z);
          if (dh < 1.2) { m.hidden = true; m.t = 10 + this.r() * 8; this.popBurrow(m); return; }
        }
        if (m.key === 'vole') { m.cover -= dt; if (m.cover < 0) { m.hidden = true; m.t = 8 + this.r() * 6; return; } }
        // hares zig-zag hard when the falcon is close
        m.zig -= dt;
        const fd = Math.hypot(F.pos.x - m.pos.x, F.pos.y - m.pos.y, F.pos.z - m.pos.z);
        if (m.zig < 0) { m.zig = (m.key === 'hare' ? 0.45 : 0.7) + this.r() * 0.6; m.zigDir = this.r() < 0.5 ? -1 : 1; }
        const zigAmt = m.key === 'hare' ? (fd < 35 ? 1.0 : 0.35) : m.key === 'rabbit' ? 0.3 : 0.6;
        const target = dir + m.zigDir * zigAmt;
        let d = target - m.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        m.yaw += clamp(d, -9 * dt, 9 * dt);
        const v = sp.run;
        const nx = m.pos.x + Math.sin(m.yaw) * v * dt, nz = m.pos.z + Math.cos(m.yaw) * v * dt;
        if (W.heightAt(nx, nz) > 0.5 && W.slopeAt(nx, nz) < 0.5) { m.pos.x = nx; m.pos.z = nz; } else m.yaw += Math.PI * 0.6;
        m.pos.y = W.groundAt(m.pos.x, m.pos.z);
        m.vel.set(Math.sin(m.yaw) * v, 0, Math.cos(m.yaw) * v);
        m.gait = v;
        if (m.alarm <= 0) { m.state = 'graze'; m.t = 1; }
      } else {
        this.groundWander(m, dt, m.key === 'vole' ? 0.4 : 1.1, true);
        m.state = 'graze';
      }
      // far away -> relocate near falcon
      if (Math.hypot(m.pos.x - F.pos.x, m.pos.z - F.pos.z) > 1500) {
        m.respawnT += dt;
        if (m.respawnT > 2) { m.respawnT = 0; this.spawnFlock(m.flock, false, F.pos); }
      }
    }
    popBurrow(m) { /* hook for effects */ }

    // ---------- catching ----------
    // Swept test between the talons' motion and each prey's motion during the step
    findCatch(t0, t1, bonus) {
      let best = null, bestD = 1e9;
      for (const m of this.list) {
        if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
        const ex = m.pos.x - t1.x, ey = m.pos.y - t1.y, ez = m.pos.z - t1.z;
        if (Math.abs(ex) > 40 || Math.abs(ez) > 40 || Math.abs(ey) > 40) continue;
        const r0x = m.prev.x - t0.x, r0y = m.prev.y - t0.y, r0z = m.prev.z - t0.z;
        const dx = ex - r0x, dy = ey - r0y, dz = ez - r0z;
        const dd = dx * dx + dy * dy + dz * dz;
        const t = dd > 1e-9 ? clamp(-(r0x * dx + r0y * dy + r0z * dz) / dd, 0, 1) : 1;
        const cx = r0x + dx * t, cy = r0y + dy * t, cz = r0z + dz * t;
        const d = Math.hypot(cx, cy, cz);
        const R = m.sp.catchR + bonus + (m.sp.kind === 'mammal' ? 0.25 : 0);
        if (d < R && d < bestD) { best = m; bestD = d; }
      }
      return best;
    }
    nearest(pos, fwd, maxD, cone) {
      let best = null, bestS = 1e9;
      for (const m of this.list) {
        if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
        const dx = m.pos.x - pos.x, dy = m.pos.y - pos.y, dz = m.pos.z - pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > maxD || d < 0.1) continue;
        const c = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
        if (c < cone) continue;
        const s = d * (1.6 - c);
        if (s < bestS) { bestS = s; best = m; }
      }
      return best;
    }
    kill(m, mode) {
      m.state = mode; // 'carried' or 'dead'
      m.vel.set(0, 0, 0);
      m.flapAmp = 0;
    }
    remove(m) {
      m.alive = false; m.state = 'idle';
      m.hidden = true;
    }

    // ---------- rendering ----------
    render(F, dt) {
      const blob = this.blobBuf;
      let bi = 0;
      for (const m of this.list) {
        const R = this.renderers[m.key];
        const i = m.idx;
        const visible = m.alive && !m.hidden;
        if (!visible) { R.hide(i); blob.fill(0, bi * 16, bi * 16 + 16); bi++; continue; }
        let world;
        if (m.state === 'carried' && F.carryMatrix) {
          const sc = m.sp.kind === 'mammal' ? 0.8 : 1;
          BABYLON.Quaternion.RotationYawPitchRollToRef(0, m.sp.kind === 'mammal' ? 0.2 : 0.25, m.sp.kind === 'mammal' ? 1.4 : 0.3, TMP_Q);
          BABYLON.Matrix.ComposeToRef(new V3(sc, sc, sc), TMP_Q, new V3(0, m.sp.kind === 'mammal' ? -0.02 : -0.03, 0), TMP_M2);
          TMP_M2.multiplyToRef(F.carryMatrix, TMP_M);
          world = TMP_M;
          const p = TMP_M.getTranslation(); m.pos.copyFrom(p);
        } else {
          let pitch = m.pitch, bank = m.bank, y = m.pos.y;
          if (m.state === 'dead') { bank = 1.45; y += 0.03; }
          if (m.sp.kind === 'mammal' && m.state !== 'dead') {
            // hopping gait: bob & pitch
            m.bob += dt * (4 + (m.gait || 0) * 2.2);
            const g = m.gait || 0;
            if (g > 0.05) { const ph = m.bob; y += Math.abs(Math.sin(ph)) * Math.min(0.12, 0.02 + g * 0.012) * (m.key === 'vole' ? 0.3 : 1); pitch = Math.cos(ph) * 0.18; }
            else pitch = m.state === 'alert' ? -0.35 : 0;
          }
          BABYLON.Quaternion.RotationYawPitchRollToRef(m.yaw, pitch, bank, TMP_Q);
          BABYLON.Matrix.ComposeToRef(ONE, TMP_Q, new V3(m.pos.x, y, m.pos.z), TMP_M);
          world = TMP_M;
        }
        R.set(i, 0, world);
        if (R.wingR) {
          const folded = m.state === 'swim' || m.state === 'graze' || m.state === 'carried' || m.state === 'dead';
          const a = folded ? -0.2 : Math.sin(m.flapPh) * 0.95 * m.flapAmp + 0.12 * (1 - m.flapAmp);
          const sw = folded ? 1.45 : 0;
          const sh = R.shoulder;
          BABYLON.Quaternion.RotationYawPitchRollToRef(sw, 0, a, TMP_Q);
          BABYLON.Matrix.ComposeToRef(ONE, TMP_Q, new V3(sh[0] * (folded ? 0.6 : 1), sh[1], sh[2]), TMP_M2);
          TMP_M2.multiplyToRef(world, TMP_M3); R.set(i, 1, TMP_M3);
          BABYLON.Quaternion.RotationYawPitchRollToRef(-sw, 0, -a, TMP_Q);
          BABYLON.Matrix.ComposeToRef(ONE, TMP_Q, new V3(-sh[0] * (folded ? 0.6 : 1), sh[1], sh[2]), TMP_M2);
          TMP_M2.multiplyToRef(world, TMP_M3); R.set(i, 2, TMP_M3);
        }
        // blob shadow
        const g = this.world.groundAt(m.pos.x, m.pos.z);
        const hgt = m.pos.y - g;
        if (hgt < 25 && m.state !== 'carried') {
          const s = (m.sp.kind === 'mammal' ? (m.key === 'hare' ? 0.55 : m.key === 'vole' ? 0.18 : 0.42) : m.sp.span * 0.7) * (1 + hgt * 0.03);
          BABYLON.Matrix.ComposeToRef(new V3(s, 1, s * 1.3), BABYLON.Quaternion.RotationYawPitchRoll(m.yaw, 0, 0), new V3(m.pos.x, g + 0.06, m.pos.z), TMP_M2);
          TMP_M2.copyToArray(blob, bi * 16);
        } else blob.fill(0, bi * 16, bi * 16 + 16);
        bi++;
      }
      for (const k in this.renderers) this.renderers[k].flush();
      this.blob.thinInstanceBufferUpdated('matrix');
    }
  }

  FS.SPECIES = SPECIES;
  FS.PreyManager = PreyManager;
})(window.FS);
