'use strict';
// Procedural peregrine falcon: lofted body & head, individually modelled flight feathers,
// articulated wings (shoulder / elbow / wrist), fanning tail, legs with talons.
// Local frame: +Z forward, +Y up, +X right. Units: metres (wingspan ~1 m).
(function (FS) {
  const { Geo, loft, tube, ellipsoid, sheet, interpKeys, clamp, lerp, smoothstep, mix3 } = FS;

  // palette
  const SLATE = [0.29, 0.33, 0.40];
  const SLATE_L = [0.45, 0.50, 0.57];
  const SLATE_D = [0.17, 0.19, 0.23];
  const HOOD = [0.10, 0.11, 0.13];
  const CREAM = [0.95, 0.91, 0.82];
  const BUFF = [0.90, 0.83, 0.71];
  const BAR = [0.26, 0.24, 0.25];
  const YELLOW = [0.98, 0.78, 0.12];
  const BEAK = [0.42, 0.47, 0.56];

  // wing poses: accumulated sweep angles of humerus (A1), forearm (A2), hand (A3), dihedral, twist
  const POSE = {
    spread: { A1: -0.10, A2: 0.06, A3: 0.40, dih: 0.10, tw: 0.0, fold: 0.0, pitch: 0.0 },
    half:   { A1: 0.42, A2: 0.02, A3: 1.05, dih: 0.02, tw: 0.05, fold: 0.5, pitch: 0.0 },
    tuck:   { A1: 1.22, A2: -1.42, A3: 1.52, dih: -0.28, tw: 0.0, fold: 1.0, pitch: -0.15 },
    flare:  { A1: -0.32, A2: -0.06, A3: 0.18, dih: 0.38, tw: -0.35, fold: 0.0, pitch: 0.0 },
  };
  const lerpPose = (a, b, t) => {
    const r = {};
    for (const k in a) r[k] = lerp(a[k], b[k], t);
    return r;
  };

  class Falcon {
    constructor(scene, shadowGen) {
      this.scene = scene;
      this.mat = new BABYLON.StandardMaterial('falconMat', scene);
      this.mat.diffuseColor = BABYLON.Color3.White();
      this.mat.specularColor = new BABYLON.Color3(0.10, 0.10, 0.11);
      this.mat.specularPower = 18;
      this.eyeMat = new BABYLON.StandardMaterial('eyeMat', scene);
      this.eyeMat.diffuseColor = new BABYLON.Color3(0.05, 0.03, 0.02);
      this.eyeMat.specularColor = new BABYLON.Color3(1, 1, 1);
      this.eyeMat.specularPower = 160;
      this.meshes = [];

      this.root = new BABYLON.TransformNode('falcon', scene);
      this.root.rotationQuaternion = BABYLON.Quaternion.Identity();
      this.pose = new BABYLON.TransformNode('falconPose', scene);   // perch / tumble offsets
      this.pose.parent = this.root;
      this.body = new BABYLON.TransformNode('falconBody', scene);
      this.body.parent = this.pose;

      this.buildBody();
      this.buildHead();
      this.wings = [this.buildWing(1), this.buildWing(-1)];
      this.buildTail();
      this.legs = [this.buildLeg(1), this.buildLeg(-1)];
      this.carryNode = new BABYLON.TransformNode('carry', scene);
      this.carryNode.parent = this.body;
      this.carryNode.position.set(0, -0.13, 0.0);

      this.meshes.forEach((m) => {
        m.isPickable = false;
        // only the big surfaces cast shadows; tiny parts cost draw calls without visible benefit
        if (shadowGen && /^(fBody|fHead|primary|secondary|tertial|rectrix|wingCover)$/.test(m.name)) shadowGen.addShadowCaster(m, false);
      });
      this.t = 0;
      this.headYaw = 0; this.headPitch = 0;
    }

    add(m) { this.meshes.push(m); return m; }

    // ---------------- body ----------------
    buildBody() {
      const keys = [
        { z: -0.215, y: 0.010, rx: 0.016, ryT: 0.010, ryB: 0.010 },
        { z: -0.180, y: 0.012, rx: 0.030, ryT: 0.020, ryB: 0.024 },
        { z: -0.120, y: 0.013, rx: 0.052, ryT: 0.036, ryB: 0.046 },
        { z: -0.050, y: 0.015, rx: 0.066, ryT: 0.046, ryB: 0.062 },
        { z: 0.010, y: 0.018, rx: 0.071, ryT: 0.050, ryB: 0.068 },
        { z: 0.065, y: 0.022, rx: 0.066, ryT: 0.049, ryB: 0.066 },
        { z: 0.110, y: 0.030, rx: 0.053, ryT: 0.045, ryB: 0.054 },
        { z: 0.145, y: 0.038, rx: 0.040, ryT: 0.038, ryB: 0.040 },
        { z: 0.165, y: 0.042, rx: 0.034, ryT: 0.034, ryB: 0.033 },
      ];
      const rings = interpKeys(keys, 70);
      const g = new Geo();
      loft(g, rings, 36, (x, y, z, c, s) => {
        const under = smoothstep(0.1, -0.4, s);
        // upperparts: slate with darker bars, bluer rump
        let back = mix3(SLATE, SLATE_L, smoothstep(-0.06, -0.19, z));
        const bar = Math.sin(z * 190 + Math.abs(x) * 70);
        if (bar > 0.5) back = mix3(back, SLATE_D, 0.55);
        back = mix3(back, HOOD, smoothstep(0.115, 0.15, z) * smoothstep(-0.3, 0.2, s));
        // underparts: plain cream throat/breast with fine drops, barred belly & flanks
        let u = mix3(BUFF, CREAM, smoothstep(0.02, 0.10, z));
        if (z < 0.075) {
          const b = Math.sin(z * 330 + c * 1.6);
          if (b > 0.3) u = mix3(u, BAR, 0.8 * smoothstep(0.075, 0.04, z));
        } else if (z < 0.13) {
          const sp = Math.sin(z * 420) * Math.sin(c * 22);
          if (sp > 0.82) u = mix3(u, BAR, 0.6);
        }
        return mix3(back, u, under);
      });
      this.add(g.toMesh('fBody', this.scene, this.mat, this.body));

      // scapular feathers covering the wing roots on the back
      const sg = new Geo();
      for (const side of [1, -1]) {
        for (let k = 0; k < 4; k++) {
          const len = 0.10 - k * 0.012, w = 0.035;
          const x0 = side * (0.030 + k * 0.006), z0 = 0.075 - k * 0.028, y0 = 0.060 - k * 0.004;
          const yaw = side * (0.18 + k * 0.05);
          this.featherGeo(sg, len, w, { camber: 0.2, droop: 0.02, colTop: () => (k % 2 ? SLATE : mix3(SLATE, SLATE_D, 0.3)), colBot: () => SLATE_D },
            (x, y, z) => {
              const cx = x * Math.cos(yaw) - z * Math.sin(yaw), cz = x * Math.sin(yaw) + z * Math.cos(yaw);
              return [cx + x0, y + y0 - 0.1 * (-z), cz + z0];
            });
        }
      }
      this.add(sg.toMesh('fScap', this.scene, this.mat, this.body));
    }

    // ---------------- head ----------------
    buildHead() {
      const scene = this.scene;
      this.neck = new BABYLON.TransformNode('neck', scene);
      this.neck.parent = this.body;
      this.neck.position.set(0, 0.045, 0.150);
      this.head = new BABYLON.TransformNode('head', scene);
      this.head.parent = this.neck;
      const keys = [
        { z: -0.030, y: -0.002, rx: 0.033, ryT: 0.032, ryB: 0.034 },
        { z: -0.005, y: 0.004, rx: 0.042, ryT: 0.040, ryB: 0.039 },
        { z: 0.025, y: 0.008, rx: 0.045, ryT: 0.043, ryB: 0.037 },
        { z: 0.050, y: 0.007, rx: 0.039, ryT: 0.037, ryB: 0.030 },
        { z: 0.070, y: 0.002, rx: 0.027, ryT: 0.026, ryB: 0.021 },
        { z: 0.083, y: -0.003, rx: 0.015, ryT: 0.015, ryB: 0.013 },
        { z: 0.089, y: -0.005, rx: 0.006, ryT: 0.007, ryB: 0.006 },
      ];
      const g = new Geo();
      loft(g, interpKeys(keys, 34), 34, (x, y, z, c, s) => {
        const ax = Math.abs(x);
        let col = HOOD;
        const lower = y < 0.0 + z * 0.08;
        if (lower) {
          col = CREAM;
          // malar "moustache" stripe below the eye
          const malar = z > 0.018 && z < 0.068 && ax > 0.016 && y > -0.036 + (0.068 - z) * 0.1;
          if (malar) col = HOOD;
          // dark nape reaching down the back of the head
          if (z < -0.012 && s > -0.55) col = HOOD;
        }
        if (!lower && z < 0.0 && ax > 0.03 && y < 0.018) col = mix3(HOOD, CREAM, 0.15);
        return col;
      }, true, true);
      this.add(g.toMesh('fHead', scene, this.mat, this.head));

      // beak: hooked upper mandible, cere, lower mandible
      const bg = new Geo();
      const up = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        up.push([0, -0.004 + 0.004 * Math.sin(t * 2.2) - 0.022 * Math.pow(t, 2.6), 0.080 + 0.024 * Math.sin(t * Math.PI * 0.5)]);
      }
      tube(bg, up, (t) => { const r = 0.0105 * Math.pow(1 - t, 0.75) + 0.0006; return [r * 0.72, r]; }, 12,
        (t) => (t < 0.12 ? YELLOW : t > 0.72 ? [0.10, 0.10, 0.12] : mix3(BEAK, [0.25, 0.28, 0.33], t)));
      const low = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; low.push([0, -0.0105 - 0.004 * t, 0.080 + 0.016 * t]); }
      tube(bg, low, (t) => { const r = 0.0065 * (1 - t) + 0.0006; return [r * 0.8, r * 0.6]; }, 10, (t) => (t < 0.2 ? YELLOW : mix3(BEAK, [0.15, 0.15, 0.18], t)));
      // nostril tubercles
      for (const sd of [1, -1]) ellipsoid(bg, sd * 0.006, 0.0005, 0.084, 0.0022, 0.0022, 0.0026, 8, 5, () => [0.05, 0.05, 0.05]);
      this.add(bg.toMesh('fBeak', scene, this.mat, this.head));

      // eyes & yellow eye-rings
      const ringMat = new BABYLON.StandardMaterial('eyeRingMat', scene);
      ringMat.diffuseColor = new BABYLON.Color3(YELLOW[0], YELLOW[1], YELLOW[2]);
      ringMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      for (const sd of [1, -1]) {
        const eye = BABYLON.MeshBuilder.CreateSphere('fEye', { diameter: 0.021, segments: 12 }, scene);
        eye.parent = this.head; eye.material = this.eyeMat;
        eye.position.set(sd * 0.0305, 0.013, 0.050);
        eye.scaling.set(0.75, 1, 1);
        this.add(eye);
        const ring = BABYLON.MeshBuilder.CreateTorus('fEyeRing', { diameter: 0.0215, thickness: 0.0035, tessellation: 18 }, scene);
        ring.parent = this.head; ring.material = ringMat;
        ring.position.set(sd * 0.0335, 0.013, 0.051);
        ring.rotation.z = Math.PI / 2; ring.rotation.y = sd * 0.25;
        this.add(ring);
        // dark brow ridge
        const bro = new Geo();
        ellipsoid(bro, 0, 0, 0, 0.007, 0.004, 0.014, 10, 6, () => HOOD);
        const bm = bro.toMesh('fBrow', scene, this.mat, this.head);
        bm.position.set(sd * 0.029, 0.026, 0.054); bm.rotation.y = sd * 0.35;
        this.add(bm);
      }
    }

    // ---------------- feathers ----------------
    // Builds one feather into geo pointing along -Z from the origin; xf maps local -> target coords.
    featherGeo(geo, len, wid, o, xf) {
      const asym = o.asym ?? 0.5, camber = o.camber ?? 0.12, droop = o.droop ?? 0.0;
      const emarg = o.emarg ?? 0, tip = o.tip ?? 0.28;
      const nt = o.nt ?? 12, ns = 4;
      const start = geo.p.length / 3;
      const grid = (u, v) => {
        // u along the feather (0 base .. 1 tip); v across (0 .. 1)
        let w = wid * (0.30 + 0.70 * smoothstep(0, 0.22, u));
        if (u > 1 - tip) { const k = (u - (1 - tip)) / tip; w *= Math.sqrt(Math.max(0, 1 - k * k)) * 0.92 + 0.08 * (1 - k); }
        if (emarg > 0) w *= 1 - emarg * smoothstep(0.45, 0.62, u) * (v > 0.5 ? 1 : 0.5);
        const s = v * 2 - 1;
        const x = s < 0 ? s * w * (1 - asym) : s * w * asym;
        const y = camber * wid * (1 - s * s) * Math.sin(Math.PI * Math.min(1, u * 1.1)) - droop * u * u * len;
        return [x, y, -u * len];
      };
      sheet(geo, nt, ns, grid,
        (u, v) => { let c = o.colTop(u, v); if (Math.abs(v - 0.5) < 0.13) c = mix3(c, o.rachis || c, 0.5); return c; },
        (u, v) => o.colBot(u, v));
      if (xf) geo.transform(xf, start);
    }
    featherMesh(name, len, wid, o, parent) {
      const g = new Geo();
      this.featherGeo(g, len, wid, o);
      const m = g.toMesh(name, this.scene, this.mat, parent);
      return this.add(m);
    }

    // ---------------- wings ----------------
    buildWing(side) {
      const scene = this.scene;
      const root = new BABYLON.TransformNode('wingRoot', scene);
      root.parent = this.body;
      root.position.set(side * 0.040, 0.040, 0.055);
      root.scaling.x = side;           // mirror the left wing
      const shoulder = new BABYLON.TransformNode('shoulder', scene); shoulder.parent = root;
      const elbow = new BABYLON.TransformNode('elbow', scene); elbow.parent = shoulder;
      const wrist = new BABYLON.TransformNode('wrist', scene); wrist.parent = elbow;
      const humLen = 0.100, foreLen = 0.128, handLen = 0.088;
      elbow.position.x = humLen; wrist.position.x = foreLen;
      [shoulder, elbow, wrist].forEach((n) => { n.rotationQuaternion = BABYLON.Quaternion.Identity(); });

      // fleshy leading edge (patagium + covert blanket) per bone
      const cover = (parent, len, chordF, chordB, thick, x0) => {
        const g = new Geo();
        const keys = [];
        const n = 8;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const bulge = Math.sin(Math.PI * clamp(t * 1.05, 0, 1));
          keys.push({ z: x0 + t * len, y: 0, x: -(chordB - chordF) * 0.5, rx: (chordF + chordB) * 0.5 * (0.75 + 0.25 * bulge), ryT: thick * (0.6 + 0.4 * bulge), ryB: thick * (0.45 + 0.3 * bulge) });
        }
        loft(g, interpKeys(keys, 14), 18, (x, y, z, c, s) => {
          if (s > -0.1) {
            const lesser = c > 0.3; // leading edge region darker
            return lesser ? mix3(SLATE_D, SLATE, 0.4) : SLATE;
          }
          const b = Math.sin(z * 260) * Math.sin(x * 300);
          return b > 0.2 ? BAR : CREAM;
        });
        // canonical loft axis is Z; map: z->x (along bone), x->z (chord)
        g.transform((x, y, z) => [z, y, x]);
        // swapping axes is a reflection: restore outward-facing winding
        for (let k = 0; k < g.i.length; k += 3) { const t = g.i[k + 1]; g.i[k + 1] = g.i[k + 2]; g.i[k + 2] = t; }
        const m = g.toMesh('wingCover', scene, this.mat, parent);
        this.add(m);
        return m;
      };
      cover(shoulder, humLen + 0.012, 0.028, 0.045, 0.020, -0.012);
      cover(elbow, foreLen + 0.008, 0.020, 0.030, 0.013, -0.006);
      cover(wrist, handLen * 0.85, 0.014, 0.018, 0.009, -0.006);

      const feathers = [];
      const addF = (parent, name, len, wid, pos, spreadPhi, foldOff, colors, extra = {}) => {
        const m = this.featherMesh(name, len, wid, Object.assign({}, colors, extra), parent);
        m.position.set(pos[0], pos[1], pos[2]);
        m.rotationQuaternion = BABYLON.Quaternion.Identity();
        feathers.push({ m, bone: parent === wrist ? 3 : parent === elbow ? 2 : 1, spreadPhi, foldOff, pitch: extra.pitch || 0, idx: extra.idx || 0, group: extra.group });
        return m;
      };

      // flight-feather colouring: dark slate above, pale & barred below
      const flightTop = (dark) => (u, v) => {
        let c = mix3(SLATE, SLATE_D, dark);
        if (Math.sin(u * 44) > 0.55) c = mix3(c, SLATE_D, 0.45);
        return mix3(c, [0.12, 0.13, 0.15], smoothstep(0.75, 1.0, u) * dark);
      };
      const flightBot = (u, v) => {
        let c = [0.86, 0.84, 0.80];
        if (Math.sin(u * 46 + v * 2) > 0.2) c = [0.40, 0.38, 0.39];
        return mix3(c, [0.30, 0.30, 0.32], smoothstep(0.82, 1.0, u) * 0.6);
      };

      // primaries P1..P10 on the hand
      const pLen = [0.150, 0.160, 0.172, 0.186, 0.200, 0.214, 0.226, 0.236, 0.240, 0.228];
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        addF(wrist, 'primary', pLen[i], 0.034 - t * 0.008, [0.004 + i * 0.0088, 0.0016 * (10 - i) * 0.6, -0.004 - i * 0.0012],
          0.30 + Math.pow(t, 1.15) * 1.18, 0.012 * i,
          { colTop: flightTop(0.35 + t * 0.55), colBot: flightBot, rachis: SLATE_D },
          { asym: 0.34, emarg: i >= 7 ? 0.35 : 0, tip: 0.30, camber: 0.10, droop: 0.02, idx: i, group: 'p' });
      }
      // secondaries on the forearm (outer S1 near wrist)
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        addF(elbow, 'secondary', 0.135 - t * 0.012, 0.038, [foreLen - 0.004 - t * (foreLen - 0.006), 0.0015 * i * 0.35, -0.010],
          -0.03 - t * 0.10, 0.02 - t * 0.12,
          { colTop: flightTop(0.2), colBot: flightBot, rachis: SLATE_D },
          { asym: 0.45, tip: 0.35, camber: 0.10, droop: 0.015, idx: i, group: 's' });
      }
      // tertials on the humerus
      for (let i = 0; i < 4; i++) {
        addF(shoulder, 'tertial', 0.115 - i * 0.012, 0.040, [humLen - 0.010 - i * 0.024, 0.004, -0.012],
          -0.12 - i * 0.08, -0.05 - i * 0.05,
          { colTop: flightTop(0.1), colBot: flightBot, rachis: SLATE_D }, { tip: 0.4, camber: 0.12, group: 't' });
      }
      const covTop = (dark) => (u, v) => {
        const c = mix3(SLATE, SLATE_D, dark);
        return u > 0.7 ? mix3(c, SLATE_L, 0.35) : c;
      };
      const covBot = (u, v) => (Math.sin(u * 30 + v * 5) > 0.1 ? [0.36, 0.33, 0.33] : CREAM);
      // greater & median coverts on forearm
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        addF(elbow, 'gCovert', 0.066, 0.032, [foreLen - 0.004 - t * (foreLen - 0.01), 0.0065, -0.011], -0.03 - t * 0.1, 0.02 - t * 0.1,
          { colTop: covTop(0.25), colBot: covBot }, { camber: 0.16, tip: 0.4, nt: 6, group: 'c' });
        if (i < 9) addF(elbow, 'mCovert', 0.042, 0.028, [foreLen - 0.010 - t * (foreLen - 0.02), 0.0105, -0.004], -0.02 - t * 0.1, 0.02 - t * 0.1,
          { colTop: covTop(0.4), colBot: covBot }, { camber: 0.2, tip: 0.45, nt: 5, group: 'c' });
        // under-wing coverts
        addF(elbow, 'uCovert', 0.060, 0.032, [foreLen - 0.006 - t * (foreLen - 0.01), -0.0070, -0.010], -0.03 - t * 0.1, 0.02 - t * 0.1,
          { colTop: () => SLATE_D, colBot: covBot }, { camber: -0.1, tip: 0.4, nt: 6, group: 'c' });
      }
      // humeral coverts
      for (let i = 0; i < 5; i++) {
        addF(shoulder, 'hCovert', 0.060, 0.034, [humLen - 0.006 - i * 0.022, 0.0100, -0.010], -0.08 - i * 0.05, -0.05 - i * 0.05,
          { colTop: covTop(0.3), colBot: covBot }, { camber: 0.2, tip: 0.45, nt: 6, group: 'c' });
        addF(shoulder, 'huCovert', 0.055, 0.034, [humLen - 0.006 - i * 0.022, -0.0085, -0.012], -0.08 - i * 0.05, -0.05 - i * 0.05,
          { colTop: () => SLATE_D, colBot: covBot }, { camber: -0.1, tip: 0.45, nt: 6, group: 'c' });
      }
      // primary coverts & alula on the hand
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        addF(wrist, 'pCovert', 0.060 + t * 0.012, 0.026, [0.004 + i * 0.011, 0.0105, -0.004], 0.35 + t * 0.9, 0.012 * i,
          { colTop: covTop(0.5), colBot: covBot }, { camber: 0.16, tip: 0.4, nt: 6, asym: 0.4, group: 'pc' });
        addF(wrist, 'puCovert', 0.055 + t * 0.01, 0.026, [0.004 + i * 0.011, -0.0065, -0.005], 0.35 + t * 0.9, 0.012 * i,
          { colTop: () => SLATE_D, colBot: covBot }, { camber: -0.1, tip: 0.4, nt: 6, group: 'pc' });
      }
      addF(wrist, 'alula', 0.045, 0.014, [0.002, 0.009, 0.010], 1.2, 0.0, { colTop: covTop(0.6), colBot: covTop(0.6) }, { camber: 0.2, nt: 6, group: 'al' });

      return { side, root, shoulder, elbow, wrist, feathers };
    }

    // ---------------- tail ----------------
    buildTail() {
      const scene = this.scene;
      this.tail = new BABYLON.TransformNode('tail', scene);
      this.tail.parent = this.body;
      this.tail.position.set(0, 0.012, -0.190);
      this.tail.rotationQuaternion = BABYLON.Quaternion.Identity();
      this.tailFeathers = [];
      const top = (u, v) => {
        let c = mix3(SLATE, SLATE_L, 0.4);
        if (Math.sin(u * 42) > 0.45 && u < 0.8) c = SLATE_D;
        if (u > 0.82 && u < 0.93) c = [0.13, 0.14, 0.16];
        if (u >= 0.93) c = [0.93, 0.92, 0.88];
        return c;
      };
      const bot = (u, v) => {
        let c = [0.85, 0.83, 0.79];
        if (Math.sin(u * 42) > 0.25 && u < 0.82) c = [0.38, 0.36, 0.37];
        if (u > 0.82 && u < 0.93) c = [0.22, 0.22, 0.24];
        if (u >= 0.93) c = [0.93, 0.92, 0.88];
        return c;
      };
      for (let i = 0; i < 12; i++) {
        const k = (i - 5.5) / 5.5;
        const len = 0.160 - Math.abs(k) * 0.012;
        const m = this.featherMesh('rectrix', len, 0.034, { colTop: top, colBot: bot, rachis: SLATE_D, camber: 0.06, tip: 0.3, nt: 16 }, this.tail);
        m.position.set(k * 0.018, 0.0022 * (6 - Math.abs(i - 5.5)), 0);
        this.tailFeathers.push({ m, k });
      }
      // upper & under tail coverts (fixed)
      for (let i = 0; i < 5; i++) {
        const k = (i - 2) / 2;
        const m = this.featherMesh('utCovert', 0.075, 0.034, { colTop: () => SLATE_L, colBot: () => SLATE, camber: 0.2, tip: 0.45, nt: 6 }, this.tail);
        m.position.set(k * 0.016, 0.017, 0.035); m.rotation.y = -k * 0.25; m.rotation.x = 0.08;
        const u = this.featherMesh('ltCovert', 0.07, 0.034, { colTop: () => CREAM, colBot: (u2) => (Math.sin(u2 * 30) > 0.3 ? BAR : CREAM), camber: -0.15, tip: 0.45, nt: 6 }, this.tail);
        u.position.set(k * 0.016, -0.012, 0.03); u.rotation.y = -k * 0.25; u.rotation.x = -0.1;
      }
    }

    // ---------------- legs ----------------
    buildLeg(side) {
      const scene = this.scene;
      const hip = new BABYLON.TransformNode('hip', scene);
      hip.parent = this.body;
      hip.position.set(side * 0.024, -0.035, 0.0);
      // feathered "trousers"
      const tg = new Geo();
      ellipsoid(tg, 0, -0.022, 0, 0.020, 0.030, 0.022, 14, 10, (nx, ny, nz) => (Math.sin(ny * 18 + nz * 3) > 0.35 ? BAR : BUFF));
      this.add(tg.toMesh('thigh', scene, this.mat, hip));
      const knee = new BABYLON.TransformNode('knee', scene);
      knee.parent = hip; knee.position.set(0, -0.040, 0.004);
      const lg = new Geo();
      tube(lg, [[0, 0, 0], [0, -0.022, 0.002], [0, -0.046, 0.003]], () => [0.0058, 0.0058], 8, () => YELLOW);
      // scaled "feet pad"
      ellipsoid(lg, 0, -0.048, 0.004, 0.009, 0.006, 0.010, 8, 5, () => YELLOW);
      this.add(lg.toMesh('tarsus', scene, this.mat, knee));
      const foot = new BABYLON.TransformNode('foot', scene);
      foot.parent = knee; foot.position.set(0, -0.048, 0.004);
      const toes = [];
      const toeDefs = [
        { yaw: -0.42 * side, len: [0.018, 0.014], back: false },
        { yaw: 0.0, len: [0.024, 0.018], back: false },
        { yaw: 0.40 * side, len: [0.017, 0.013], back: false },
        { yaw: Math.PI, len: [0.016, 0.0], back: true },
      ];
      for (const d of toeDefs) {
        const base = new BABYLON.TransformNode('toe', scene);
        base.parent = foot; base.rotation.y = d.yaw;
        const s1 = new BABYLON.TransformNode('toe1', scene); s1.parent = base;
        const g1 = new Geo();
        tube(g1, [[0, 0, 0], [0, 0, d.len[0]]], (t) => [0.0042 - t * 0.0008, 0.0042 - t * 0.0008], 7, () => YELLOW);
        this.add(g1.toMesh('toeA', scene, this.mat, s1));
        let tipParent = s1, tipZ = d.len[0];
        let s2 = null;
        if (d.len[1] > 0) {
          s2 = new BABYLON.TransformNode('toe2', scene); s2.parent = s1; s2.position.z = d.len[0];
          const g2 = new Geo();
          tube(g2, [[0, 0, 0], [0, 0, d.len[1]]], (t) => [0.0034 - t * 0.0006, 0.0034 - t * 0.0006], 7, () => YELLOW);
          this.add(g2.toMesh('toeB', scene, this.mat, s2));
          tipParent = s2; tipZ = d.len[1];
        }
        // curved black talon
        const tg2 = new Geo();
        const pts = [];
        for (let i = 0; i <= 6; i++) { const a = (i / 6) * 1.5; pts.push([0, -0.011 * (1 - Math.cos(a)), 0.011 * Math.sin(a)]); }
        tube(tg2, pts, (t) => { const r = 0.0028 * (1 - t) + 0.0003; return [r, r]; }, 7, () => [0.06, 0.06, 0.07]);
        const tm = tg2.toMesh('talon', scene, this.mat, tipParent);
        tm.position.z = tipZ;
        this.add(tm);
        toes.push({ base, s1, s2, back: d.back });
      }
      return { hip, knee, foot, toes, side };
    }

    // ---------------- animation ----------------
    // s: {tuck, flapPhase, flapAmp, roll, pitch, yaw, brake, talons, perched, look:{yaw,pitch}, bank, eat}
    update(dt, s) {
      this.t += dt;
      // blend wing pose
      let P = s.tuck < 0.5 ? lerpPose(POSE.spread, POSE.half, s.tuck * 2) : lerpPose(POSE.half, POSE.tuck, (s.tuck - 0.5) * 2);
      if (s.brake > 0) P = lerpPose(P, POSE.flare, s.brake * (1 - s.tuck));
      const perched = s.perched || 0;
      if (perched > 0) P = lerpPose(P, Object.assign({}, POSE.tuck, { dih: -0.12, A1: 1.28, pitch: -0.05 }), perched);
      // "mantling": half-open drooping wings shielding the prey while feeding
      this.eatS = lerp(this.eatS || 0, s.eat || 0, FS.expDecay(4, dt));
      const eat0 = this.eatS;
      if (eat0 > 0) P = lerpPose(P, { A1: 0.35, A2: -0.25, A3: 0.95, dih: -0.62, tw: 0.25, fold: 0.4, pitch: 0.0 }, eat0 * perched);

      const fa = s.flapAmp * (1 - s.tuck * 0.9);
      const ph = s.flapPhase;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const upstroke = Math.max(0, cs) * fa;  // wing travelling up -> partially folded
      const glideFlex = Math.sin(this.t * 1.7) * 0.015 * (1 - s.tuck);

      for (const w of this.wings) {
        // steering asymmetry: the wing on the inside of the turn folds a little
        const inside = w.side * s.roll;
        const fold = clamp(P.fold + upstroke * 0.35 + Math.max(0, inside) * 0.12, 0, 1);
        const A1 = P.A1 + upstroke * 0.30 + Math.max(0, inside) * 0.08;
        const A2 = P.A2 - upstroke * 0.10;
        const A3 = P.A3 + upstroke * 0.40 + Math.max(0, inside) * 0.10;
        const roll1 = P.dih + fa * 0.95 * sn + glideFlex - inside * 0.05 * (1 - s.tuck);
        const roll2 = fa * 0.25 * Math.sin(ph - 0.5);
        const roll3 = fa * 0.45 * Math.sin(ph - 1.0) + glideFlex * 2;
        const twist = P.tw + fa * 0.35 * cs - s.pitch * 0.06 + inside * 0.05;
        BABYLON.Quaternion.RotationYawPitchRollToRef(A1, twist * 0.5 + P.pitch, roll1, w.shoulder.rotationQuaternion);
        BABYLON.Quaternion.RotationYawPitchRollToRef(A2 - A1, twist * 0.3, roll2, w.elbow.rotationQuaternion);
        BABYLON.Quaternion.RotationYawPitchRollToRef(A3 - A2, twist * 0.4, roll3, w.wrist.rotationQuaternion);
        const accum = [0, A1, A2, A3];
        for (const f of w.feathers) {
          const foldPhi = accum[f.bone] + f.foldOff;
          let phi = lerp(f.spreadPhi, foldPhi, f.group === 'p' || f.group === 'pc' ? Math.pow(fold, 0.8) : fold);
          // slotted primaries: outer primaries separate on the upstroke & in slow flight
          if (f.group === 'p' && f.idx >= 6) phi += (f.idx - 6) * 0.05 * (upstroke + s.brake * 0.6) * (1 - fold);
          const pitchF = f.group === 'p' ? -0.04 * f.idx * (1 - fold) * (0.3 + fa) : 0;
          BABYLON.Quaternion.RotationYawPitchRollToRef(-phi, pitchF, 0, f.m.rotationQuaternion);
        }
      }

      // tail: fans for braking and slow flight, twists when turning, closes in a stoop
      const slow = s.slow || 0;
      const spread = clamp(0.07 + 0.50 * s.brake + 0.25 * slow * (1 - s.tuck) + 0.12 * fa + perched * 0.03, 0.04, 0.62) * (1 - s.tuck * 0.7);
      for (const f of this.tailFeathers) f.m.rotation.y = -f.k * spread;
      BABYLON.Quaternion.RotationYawPitchRollToRef(s.yaw * 0.25, -s.pitch * 0.22 - s.brake * 0.35 + perched * 0.55, -s.roll * 0.25, this.tail.rotationQuaternion);

      // legs: tucked back in flight, thrown forward to strike, straight when perched
      const tal = s.talons;
      const bodyPitch = this.perchPitch(perched, this.eatS);
      for (const L of this.legs) {
        const hipX = lerp(lerp(1.35, -0.85, tal), -bodyPitch + 0.12, perched);
        const kneeX = lerp(lerp(0.4, -0.2, tal), -0.12, perched);
        L.hip.rotation.x = hipX;
        L.knee.rotation.x = kneeX;
        L.foot.rotation.x = lerp(lerp(1.0, -0.3, tal), -(bodyPitch + hipX + kneeX), perched);
        const curl = lerp(lerp(1.0, -0.15, tal), 0.35, perched);
        const spreadT = lerp(0.2, 1.25, tal * (1 - perched)) + perched;
        for (const t of L.toes) {
          t.s1.rotation.x = t.back ? -curl * 0.6 : curl * 0.8;
          if (t.s2) t.s2.rotation.x = curl * 0.9;
          if (!t.back) t.base.rotation.y = (t.base._y0 ??= t.base.rotation.y) * spreadT;
          t.base.rotation.x = t.back ? 0.35 : 0;
        }
      }

      // head: stabilised against bank, looks toward the target
      const lookYaw = clamp(s.look ? s.look.yaw : 0, -1.2, 1.2);
      const lookPitch = clamp(s.look ? s.look.pitch : 0, -0.9, 0.7);
      this.headYaw = lerp(this.headYaw, lookYaw, FS.expDecay(6, dt));
      this.headPitch = lerp(this.headPitch, lookPitch, FS.expDecay(6, dt));
      const eat = this.eatS;
      const peck = eat > 0 ? Math.max(0, Math.sin(this.t * 7)) * 0.6 : 0;
      this.neck.rotation.set(this.headPitch * 0.45 + eat * 0.9 + peck + perched * (0.6 - eat * 0.45) - s.tuck * 0.1, this.headYaw * 0.4, 0);
      this.head.rotation.set(this.headPitch * 0.55 + peck * 0.4, this.headYaw * 0.6, clamp(s.bank || 0, -0.9, 0.9) * 0.7 * (1 - perched));
      this.neck.position.z = 0.150 - s.tuck * 0.008;

      // body motion: bob with wingbeats, upright when perched
      this.body.position.y = -sn * 0.012 * fa;
      this.pose.rotation.x = this.perchPitch(perched, eat);
      this.pose.position.y = perched * 0.135;
    }
    // body pitch when sitting: upright on a perch, hunched forward while feeding
    perchPitch(perched, eat) { return perched * lerp(-0.72, -0.15, eat); }
  }

  Falcon.POSE = POSE;
  FS.Falcon = Falcon;
})(window.FS);
