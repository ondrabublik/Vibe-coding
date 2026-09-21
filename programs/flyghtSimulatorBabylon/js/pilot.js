'use strict';
// Pilot figures (seated bust in the cockpit, full figure for bail-out) and the parachute.
(function (BW) {
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion, MB = BABYLON.MeshBuilder;

  function pilotMats(scene) {
    return {
      jacket: BW.getMat(scene, '#5b3a22', { spec: 0.15 }),
      helmet: BW.getMat(scene, '#3a281a', { spec: 0.25, power: 30, twoSided: true }),
      skin: BW.getMat(scene, '#dcae8e', { spec: 0.05 }),
      fur: BW.getMat(scene, '#cbb893'),
      scarf: BW.getMat(scene, '#f1ede2', { twoSided: true }),
      brass: BW.getMat(scene, '#9c8450', { spec: 0.6, power: 50 }),
      lens: BW.getMat(scene, '#6f9aa8', { spec: 0.9, power: 90 }),
      trousers: BW.getMat(scene, '#6b6146'),
      boots: BW.getMat(scene, '#1d1a17', { spec: 0.3 }),
      gloves: BW.getMat(scene, '#4a3421'),
    };
  }

  // Collects meshes per material and merges them under a parent node.
  function Builder(scene, parent) {
    const groups = new Map();
    const b = {
      add(mesh, mat) {
        if (!groups.has(mat)) groups.set(mat, []);
        groups.get(mat).push(mesh);
        return mesh;
      },
      ball(d, sx, sy, sz, x, y, z, mat) {
        const m = MB.CreateSphere('pb', { diameter: d, segments: 14 }, scene);
        m.scaling.set(sx, sy, sz);
        m.position.set(x, y, z);
        return b.add(m, mat);
      },
      limb(a, c, d, mat) {
        const dir = c.subtract(a), len = dir.length();
        const m = MB.CreateCylinder('pl', { height: len, diameterTop: d * 0.85, diameterBottom: d, tessellation: 10 }, scene);
        m.position = a.add(c).scale(0.5);
        const up = new V3(0, 1, 0), n = dir.normalize();
        const axis = V3.Cross(up, n), ang = Math.acos(BW.clamp(V3.Dot(up, n), -1, 1));
        m.rotationQuaternion = axis.length() > 1e-6 ? Q.RotationAxis(axis.normalize(), ang) : Q.Identity();
        return b.add(m, mat);
      },
      finish() {
        const out = [];
        for (const [mat, list] of groups) {
          const m = list.length === 1 ? list[0] : BABYLON.Mesh.MergeMeshes(list, true, true);
          m.material = mat;
          m.parent = parent;
          m.isPickable = false;
          out.push(m);
        }
        return out;
      },
    };
    return b;
  }

  // Head with leather helmet, ear flaps and goggles; origin at the neck base, facing +z.
  function buildHead(scene, mats, parent) {
    const b = Builder(scene, parent);
    b.limb(new V3(0, -0.02, -0.01), new V3(0, 0.07, 0), 0.1, mats.skin);
    b.ball(0.215, 1, 1.08, 1.02, 0, 0.12, 0.005, mats.skin);
    b.ball(0.045, 1, 1, 1, 0, 0.105, 0.115, mats.skin); // nose
    const cap = MB.CreateSphere('helmet', { diameter: 0.25, segments: 16, slice: 0.58, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    cap.rotation.x = -0.55;
    cap.position.set(0, 0.125, -0.012);
    b.add(cap, mats.helmet);
    for (const sx of [-1, 1]) {
      b.ball(0.1, 0.32, 0.95, 0.75, sx * 0.108, 0.085, -0.005, mats.helmet); // ear flap
      const ring = MB.CreateTorus('gring', { diameter: 0.068, thickness: 0.016, tessellation: 16 }, scene);
      ring.rotation.x = Math.PI / 2 - 0.25;
      ring.position.set(sx * 0.044, 0.19, 0.098);
      b.add(ring, mats.brass);
      const lens = MB.CreateSphere('lens', { diameter: 0.058, segments: 8 }, scene);
      lens.scaling.z = 0.35;
      lens.rotation.x = -0.25;
      lens.position.set(sx * 0.044, 0.19, 0.1);
      b.add(lens, mats.lens);
    }
    const strap = MB.CreateTorus('strap', { diameter: 0.232, thickness: 0.014, tessellation: 24 }, scene);
    strap.rotation.x = -0.25;
    strap.position.set(0, 0.18, 0.0);
    b.add(strap, mats.helmet);
    return b.finish();
  }

  function addScarf(scene, mats, parent, y, z) {
    const knot = MB.CreateTorus('scarf', { diameter: 0.16, thickness: 0.055, tessellation: 18 }, scene);
    knot.position.set(0, y, z);
    knot.material = mats.scarf;
    knot.parent = parent;
    // Trailing end that flutters in the slipstream
    const pivot = new BABYLON.TransformNode('scarfPivot', scene);
    pivot.parent = parent;
    pivot.position.set(0.05, y, z - 0.07);
    const tail = MB.CreatePlane('scarfTail', { width: 0.08, height: 0.5, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    tail.position.y = -0.25;
    tail.material = mats.scarf;
    tail.parent = pivot;
    [knot, tail].forEach((m) => (m.isPickable = false));
    return { meshes: [knot, tail], pivot };
  }

  // Seated pilot for the cockpit. Returns meshes plus the head node (for looking around).
  BW.buildPilotBust = function (scene, parent) {
    const mats = pilotMats(scene);
    const b = Builder(scene, parent);
    b.ball(1, 0.44, 0.46, 0.3, 0, 0.55, -0.47, mats.jacket); // torso
    b.ball(1, 0.52, 0.16, 0.3, 0, 0.71, -0.47, mats.jacket); // shoulders
    const collar = MB.CreateTorus('collar', { diameter: 0.21, thickness: 0.07, tessellation: 18 }, scene);
    collar.position.set(0, 0.77, -0.45);
    b.add(collar, mats.fur);
    for (const sx of [-1, 1]) {
      const sh = new V3(sx * 0.23, 0.69, -0.46), el = new V3(sx * 0.21, 0.5, -0.22), hand = new V3(sx * 0.07, 0.44, -0.05);
      b.limb(sh, el, 0.1, mats.jacket);
      b.limb(el, hand, 0.085, mats.jacket);
      b.ball(0.09, 1, 0.9, 1.2, hand.x, hand.y, hand.z, mats.gloves);
    }
    const meshes = b.finish();
    const head = new BABYLON.TransformNode('head', scene);
    head.parent = parent;
    head.position.set(0, 0.79, -0.44);
    meshes.push(...buildHead(scene, mats, head));
    const scarf = addScarf(scene, mats, parent, 0.8, -0.44);
    meshes.push(...scarf.meshes);
    return { meshes, head, scarf: scarf.pivot };
  };

  // Full standing figure for the parachute; origin at the harness (waist), arms up on the risers.
  BW.buildPilotFigure = function (scene, parent) {
    const mats = pilotMats(scene);
    const b = Builder(scene, parent);
    b.ball(1, 0.34, 0.22, 0.24, 0, -0.03, 0, mats.trousers); // pelvis
    b.ball(1, 0.42, 0.55, 0.28, 0, 0.3, 0, mats.jacket); // torso
    b.ball(1, 0.5, 0.15, 0.28, 0, 0.5, 0, mats.jacket); // shoulders
    const belt = MB.CreateTorus('belt', { diameter: 0.36, thickness: 0.04, tessellation: 20 }, scene);
    belt.scaling.z = 0.7; belt.position.y = 0.06;
    b.add(belt, mats.boots);
    const collar = MB.CreateTorus('collar', { diameter: 0.21, thickness: 0.07, tessellation: 18 }, scene);
    collar.position.set(0, 0.57, 0);
    b.add(collar, mats.fur);
    for (const sx of [-1, 1]) {
      const hip = new V3(sx * 0.1, -0.06, 0), knee = new V3(sx * 0.12, -0.5, 0.05), ankle = new V3(sx * 0.12, -0.92, 0);
      b.limb(hip, knee, 0.15, mats.trousers);
      b.limb(knee, ankle, 0.12, mats.trousers);
      b.ball(1, 0.12, 0.1, 0.24, sx * 0.12, -0.96, 0.04, mats.boots);
      const sh = new V3(sx * 0.23, 0.5, 0), el = new V3(sx * 0.3, 0.8, 0.02), hand = new V3(sx * 0.26, 1.07, 0);
      b.limb(sh, el, 0.1, mats.jacket);
      b.limb(el, hand, 0.085, mats.jacket);
      b.ball(0.09, 1, 1.1, 1, hand.x, hand.y, hand.z, mats.gloves);
    }
    const meshes = b.finish();
    const head = new BABYLON.TransformNode('head', scene);
    head.parent = parent;
    head.position.set(0, 0.6, 0);
    meshes.push(...buildHead(scene, mats, head));
    const scarf = addScarf(scene, mats, parent, 0.61, 0.0);
    meshes.push(...scarf.meshes);
    return { meshes, head, scarf: scarf.pivot };
  };

  function canopyMaterial(scene) {
    if (scene._bwCanopy) return scene._bwCanopy;
    const tex = new BABYLON.DynamicTexture('canopyTex', { width: 512, height: 64 }, scene, true);
    const ctx = tex.getContext();
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? '#efe9d8' : '#d9cfae';
      ctx.fillRect(i * 32, 0, 32, 64);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(i * 32, 0, 1.5, 64);
    }
    tex.update();
    const m = new BABYLON.StandardMaterial('canopyMat', scene);
    m.diffuseTexture = tex;
    m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    scene._bwCanopy = m;
    return m;
  }

  const RIM_Y = 6.2, RIM_R = 3.3;

  // A pilot bailing out: short free fall, canopy opens, drifts down with the wind and lands.
  class Parachute {
    constructor(game, plane) {
      this.game = game;
      const scene = game.scene;
      this.isPlayer = plane.isPlayer;
      this.pos = plane.localToWorld(new V3(0, 1.6, -0.45), new V3());
      this.vel = plane.vel.scale(0.8);
      plane.u.scaleAndAddToRef(6, this.vel);
      plane.r.scaleAndAddToRef((Math.random() - 0.5) * 5, this.vel);
      this.t = 0;
      this.state = 'open'; // no free fall: the pilot hangs under the canopy right after jumping
      this.openT = 0;
      this.landT = 0;
      this.water = false;
      this.phase = Math.random() * 6;
      const wh = game.windHeading;
      this.wind = new V3(Math.sin(wh), 0, Math.cos(wh)).scale(2.5);

      this.root = new BABYLON.TransformNode('chute', scene);
      this.root.position.copyFrom(this.pos);
      this.root.rotationQuaternion = Q.Identity();
      this.swing = new BABYLON.TransformNode('swing', scene);
      this.swing.parent = this.root;
      this.body = new BABYLON.TransformNode('body', scene);
      this.body.parent = this.swing;
      const fig = BW.buildPilotFigure(scene, this.body);
      this.head = fig.head;
      this.scarf = fig.scarf;

      this.canopy = new BABYLON.TransformNode('canopyNode', scene);
      this.canopy.parent = this.swing;
      const dome = MB.CreateSphere('canopy', { diameter: RIM_R * 2, segments: 24, slice: 0.5, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
      dome.scaling.y = 0.55;
      dome.position.y = RIM_Y;
      dome.material = canopyMaterial(scene);
      dome.parent = this.canopy;
      const lines = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = Math.cos(a) > 0 ? 1 : -1;
        lines.push([new V3(Math.cos(a) * RIM_R, RIM_Y, Math.sin(a) * RIM_R), new V3(sx * 0.26, 1.07, 0)]);
      }
      const ls = MB.CreateLineSystem('lines', { lines }, scene);
      ls.color = new BABYLON.Color3(0.25, 0.23, 0.2);
      ls.parent = this.canopy;
      this.canopyMeshes = [dome, ls];
      this.canopy.scaling.setAll(0.1);
      this.meshes = fig.meshes.concat([dome]);
      this.meshes.forEach((m) => { m.isPickable = false; });
      if (game.shadowGen) this.meshes.forEach((m) => game.shadowGen.addShadowCaster(m, false));
    }

    get focus() { return this.root.position; }

    update(dt) {
      this.t += dt;
      const t = this.t;
      if (this.state === 'open') {
        this.openT += dt;
        const s = BW.smoothstep(0, 1.1, this.openT);
        this.canopy.scaling.set(0.1 + 0.9 * s, 0.25 + 0.75 * BW.smoothstep(0, 0.6, this.openT), 0.1 + 0.9 * s);
        // Drag pulls the velocity towards a steady descent drifting with the wind.
        const k = Math.min(1, dt * (0.5 + 2 * s));
        this.vel.x += (this.wind.x - this.vel.x) * k;
        this.vel.z += (this.wind.z - this.vel.z) * k;
        this.vel.y += (-6 - this.vel.y) * k;
        this.body.rotation.x *= 1 - Math.min(1, dt * 3);
        this.body.rotation.z *= 1 - Math.min(1, dt * 3);
        const sw = 0.03 + 0.25 * Math.exp(-this.openT * 0.6);
        this.swing.rotation.z = Math.sin(t * 1.4 + this.phase) * sw;
        this.swing.rotation.x = Math.sin(t * 1.05 + this.phase * 2) * sw * 0.7;
        this.head.rotation.y = Math.sin(t * 0.4) * 0.8;
      } else {
        // Landed: the canopy collapses downwind, the pilot stands up.
        this.landT += dt;
        const s = BW.smoothstep(0, 2.5, this.landT);
        this.swing.rotation.x *= 1 - Math.min(1, dt * 4);
        this.swing.rotation.z *= 1 - Math.min(1, dt * 4);
        this.canopy.rotation.x = s * 1.45;
        this.canopy.scaling.y = 1 - 0.8 * s;
        if (this.water) this.pos.y = BW.WATER_LEVEL + 0.35 + Math.sin(t * 1.7) * 0.08;
        this.head.rotation.y = Math.sin(t * 0.5) * 0.9;
      }
      if (this.state !== 'landed') {
        this.pos.addInPlace(this.vel.scale(dt));
        const gy = BW.groundHeight(this.pos.x, this.pos.z);
        if (this.pos.y - 0.98 <= gy) {
          this.state = 'landed';
          this.water = BW.isWater(this.pos.x, this.pos.z);
          this.pos.y = this.water ? BW.WATER_LEVEL + 0.35 : gy + 0.98;
          this.vel.setAll(0);
          if (!this.canopy.isEnabled()) { this.canopy.setEnabled(true); this.canopy.scaling.setAll(1); }
        }
      }
      // Face the drift direction
      if (this.state !== 'landed' && Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.5) {
        const yaw = Math.atan2(this.vel.x, this.vel.z);
        Q.RotationYawPitchRollToRef(yaw, 0, 0, this.root.rotationQuaternion);
      }
      if (this.scarf) this.scarf.rotation.x = 0.25 + Math.sin(t * 9) * 0.25;
      this.root.position.copyFrom(this.pos);
    }

    dispose() { this.root.dispose(false, false); }
  }
  BW.Parachute = Parachute;
})(window.BW);
