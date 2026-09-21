'use strict';
// Mission types (dogfight, bomber interception, ground attack) and their actors:
// Gotha bomber model, flexible machine guns (bomber gunners, anti-aircraft nests),
// ground targets of the enemy depot and falling bombs.
(function (BW) {
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion, MB = BABYLON.MeshBuilder;
  const UP = new V3(0, 1, 0);
  const tG = new V3(), tD = new V3(), tL = new V3(), tM = new V3(), tQ = new Q();

  // ================================================================ shared materials
  function lozengeMat(scene) {
    if (scene._bwLozenge) return scene._bwLozenge;
    const S = 256, t = new BABYLON.DynamicTexture('lozenge', { width: S, height: S }, scene, true);
    const ctx = t.getContext(), rng = BW.rng(1918);
    const pal = ['#565069', '#6c6580', '#4f5b50', '#6f6751', '#5e4f63', '#545a6c'];
    ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, S, S);
    // Irregular hexagons ("lozenge" camouflage), tiling seamlessly (the pattern repeats every 256 px).
    const cw = 64, ch = 64;
    for (let j = -1; j <= S / ch + 1; j++) for (let i = -1; i <= S / cw + 1; i++) {
      const cx = i * cw + (j % 2 ? cw / 2 : 0), cy = j * ch;
      ctx.fillStyle = pal[(rng() * pal.length) | 0];
      ctx.beginPath();
      ctx.moveTo(cx - cw / 2, cy); ctx.lineTo(cx - cw / 4, cy - ch / 2 - 1); ctx.lineTo(cx + cw / 4, cy - ch / 2 - 1);
      ctx.lineTo(cx + cw / 2, cy); ctx.lineTo(cx + cw / 4, cy + ch / 2 + 1); ctx.lineTo(cx - cw / 4, cy + ch / 2 + 1);
      ctx.closePath(); ctx.fill();
    }
    t.update();
    t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    const m = new BABYLON.StandardMaterial('lozengeMat', scene);
    m.diffuseTexture = t;
    m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    scene._bwLozenge = m;
    return m;
  }

  function crossMat(scene) {
    if (scene._bwCross) return scene._bwCross;
    const t = new BABYLON.DynamicTexture('crossTex', { width: 128, height: 128 }, scene, true);
    const ctx = t.getContext();
    ctx.clearRect(0, 0, 128, 128);
    BW.drawMarking(ctx, 64, 64, 62, 62, 'cross');
    t.update();
    const m = new BABYLON.StandardMaterial('crossMat', scene);
    m.diffuseTexture = t;
    m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    m.zOffset = -2;
    scene._bwCross = m;
    return m;
  }

  // Lofted tube through superelliptic cross-sections {z, w, h, y}, centred at x0.
  function loft(scene, secs, x0) {
    const N = 18;
    const paths = secs.map((s) => {
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        pts.push(new V3(x0 + s.w * Math.sign(c) * Math.pow(Math.abs(c), 0.6), s.y + s.h * Math.sign(sn) * Math.pow(Math.abs(sn), 0.6), s.z));
      }
      return pts;
    });
    return MB.CreateRibbon('loft', { pathArray: paths, closePath: true, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  }

  // Machine gun on a yaw/pitch mount with a muzzle flash. Returns the nodes for BW.Gun.
  function buildMG(scene, parent, pos, metal) {
    const yaw = new BABYLON.TransformNode('mgYaw', scene);
    yaw.parent = parent; yaw.position.copyFrom(pos);
    const pitch = new BABYLON.TransformNode('mgPitch', scene);
    pitch.parent = yaw;
    const parts = [];
    const cyl = (len, d, z) => {
      const c = MB.CreateCylinder('mg', { height: len, diameter: d, tessellation: 8 }, scene);
      c.rotation.x = Math.PI / 2; c.position.z = z;
      parts.push(c);
    };
    cyl(1.25, 0.07, 0.55); // barrel
    cyl(0.75, 0.16, 0.35); // cooling jacket
    const body = MB.CreateBox('mgb', { width: 0.14, height: 0.2, depth: 0.5 }, scene);
    body.position.z = -0.15; parts.push(body);
    const drum = MB.CreateCylinder('drum', { height: 0.12, diameter: 0.3, tessellation: 10 }, scene);
    drum.rotation.z = Math.PI / 2; drum.position.set(0.14, 0.02, 0.05); parts.push(drum);
    const mg = BABYLON.Mesh.MergeMeshes(parts, true, true);
    mg.parent = pitch;
    mg.material = metal;
    mg.isPickable = false;
    const flash = MB.CreateSphere('flash', { diameter: 0.4, segments: 6 }, scene);
    flash.scaling.z = 2.2;
    flash.material = BW.getMat(scene, '#ffd36b', { emissive: true });
    flash.parent = pitch; flash.position.z = 1.35;
    flash.setEnabled(false);
    flash.isPickable = false;
    return { yaw, pitch, flash, mesh: mg };
  }

  // ================================================================ bomber model
  // Gotha G.V-like twin-engine pusher bomber, ~24 m span. Local frame as the fighter: x right, y up, z forward.
  const BFUS = [
    { z: 6.35, w: 0.2, h: 0.22, y: 0.2 },
    { z: 6.0, w: 0.62, h: 0.62, y: 0.1 },
    { z: 5.0, w: 0.78, h: 0.82, y: 0.05 },
    { z: 1.0, w: 0.8, h: 0.86, y: 0.05 },
    { z: -2.2, w: 0.62, h: 0.68, y: 0.12 },
    { z: -5.5, w: 0.36, h: 0.42, y: 0.3 },
    { z: -8.6, w: 0.13, h: 0.16, y: 0.5 },
    { z: -9.05, w: 0.02, h: 0.03, y: 0.52 },
  ];
  const BNAC = [
    { z: 2.3, w: 0.36, h: 0.44, y: 0.75 },
    { z: 1.9, w: 0.5, h: 0.6, y: 0.75 },
    { z: -0.7, w: 0.48, h: 0.56, y: 0.75 },
    { z: -1.85, w: 0.22, h: 0.26, y: 0.75 },
    { z: -2.1, w: 0.05, h: 0.06, y: 0.75 },
  ];
  const NAC_X = 3.4;
  BW.BOMBER_HITBOXES = [
    { min: new V3(-11.8, -0.9, -1.1), max: new V3(11.8, 2.45, 1.95) },
    { min: new V3(-0.85, -0.9, -9.2), max: new V3(0.85, 1.0, 6.4) },
    { min: new V3(-3.3, 0.3, -9.4), max: new V3(3.3, 2.1, -7.1) },
  ];

  BW.buildBomber = function (scene) {
    const root = new BABYLON.TransformNode('bomber', scene);
    root.rotationQuaternion = Q.Identity();
    const loz = lozengeMat(scene), cross = crossMat(scene);
    const fusM = BW.getMat(scene, '#a39f88', { spec: 0.1 });
    const metal = BW.getMat(scene, '#3a3a38', { spec: 0.5, power: 40 });
    const grille = BW.getMat(scene, '#1e1e1c', { spec: 0.3 });
    const wood = BW.getMat(scene, '#6a4a2c', { spec: 0.2 });
    const tire = BW.getMat(scene, '#1c1c1c', { spec: 0.1 });
    const groups = new Map();
    const add = (m, mat) => {
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(m);
      return m;
    };
    const box = (w, h, d, x, y, z, mat, uv) => {
      const o = { width: w, height: h, depth: d };
      // Texture repeats every `uv` metres (top/bottom faces have u along z).
      if (uv) o.faceUV = [[w, h], [w, h], [d, h], [d, h], [d, w], [d, w]].map(([a, b]) => new BABYLON.Vector4(0, 0, a / uv, b / uv));
      const b = MB.CreateBox('b', o, scene);
      b.position.set(x, y, z);
      return add(b, mat);
    };
    const rod = (a, b, d, mat) => {
      const len = V3.Distance(a, b);
      const c = MB.CreateCylinder('rod', { height: len, diameter: d, tessellation: 6 }, scene);
      c.position.copyFrom(a).addInPlace(b).scaleInPlace(0.5);
      const dir = b.subtract(a).normalize();
      const axis = V3.Cross(UP, dir);
      const ang = Math.acos(BW.clamp(V3.Dot(UP, dir), -1, 1));
      c.rotationQuaternion = axis.lengthSquared() > 1e-8 ? Q.RotationAxis(axis.normalize(), ang) : Q.Identity();
      return add(c, mat);
    };
    const decal = (size, x, y, z, rx, ry) => {
      const p = MB.CreatePlane('cross', { size }, scene);
      p.position.set(x, y, z); p.rotation.set(rx, ry, 0);
      return add(p, cross);
    };

    // Fuselage, nacelles, radiators
    add(loft(scene, BFUS, 0), fusM);
    for (const sx of [-1, 1]) {
      add(loft(scene, BNAC, sx * NAC_X), metal);
      box(0.66, 0.8, 0.1, sx * NAC_X, 0.75, 2.34, grille);
    }
    // Wings (upper and lower), tailplane, fin and rudder
    const UW = 2.3, LW = -0.72;
    box(23.6, 0.14, 2.8, 0, UW, 0.45, loz, 6);
    box(21.6, 0.14, 2.5, 0, LW, 0.35, loz, 6);
    box(6.6, 0.1, 1.7, 0, 0.62, -8.1, loz, 6);
    box(0.08, 1.35, 1.3, 0, 1.3, -8.35, loz, 6);
    box(0.06, 1.8, 0.95, 0, 1.15, -9.1, BW.getMat(scene, '#e8e4d8'));
    // Interplane struts, cabane, engine mounts
    for (const x of [-10.6, -7.2, 7.2, 10.6]) for (const z of [1.45, -0.55]) rod(new V3(x, LW, z), new V3(x, UW, z), 0.1, wood);
    for (const sx of [-1, 1]) {
      for (const z of [1.5, -0.4]) {
        rod(new V3(sx * 0.55, 0.8, z), new V3(sx * 0.9, UW, z), 0.09, wood);
        for (const dx of [-0.3, 0.3]) {
          rod(new V3(sx * NAC_X + dx, LW, z), new V3(sx * NAC_X + dx, 0.3, z), 0.09, wood);
          rod(new V3(sx * NAC_X + dx, 1.2, z), new V3(sx * NAC_X + dx, UW, z), 0.09, wood);
        }
      }
      // Main gear: twin wheels under each engine
      for (const dx of [-0.42, 0.42]) {
        const w = MB.CreateCylinder('wheel', { height: 0.18, diameter: 1.05, tessellation: 18 }, scene);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * NAC_X + dx, -1.75, 1.05);
        add(w, tire);
        rod(new V3(sx * NAC_X + dx, LW, 1.6), new V3(sx * NAC_X + dx, -1.75, 1.05), 0.08, wood);
        rod(new V3(sx * NAC_X + dx, LW, 0.2), new V3(sx * NAC_X + dx, -1.75, 1.05), 0.08, wood);
      }
      rod(new V3(sx * (NAC_X - 0.5), -1.75, 1.05), new V3(sx * (NAC_X + 0.5), -1.75, 1.05), 0.07, metal);
      // Crosses: upper wing top, lower wing bottom
      decal(2.3, sx * 9.2, UW + 0.08, 0.45, Math.PI / 2, 0);
      decal(2.1, sx * 8.6, LW - 0.08, 0.35, -Math.PI / 2, 0);
      decal(1.0, sx * 0.39, 0.4, -5.2, 0, -sx * Math.PI / 2);
      decal(0.9, sx * 0.04, 1.15, -9.1, 0, -sx * Math.PI / 2);
    }
    rod(new V3(0, -0.2, -8.3), new V3(0, -0.75, -8.6), 0.08, wood); // tail skid

    const meshes = [];
    let body = null;
    for (const [mat, list] of groups) {
      const m = BABYLON.Mesh.MergeMeshes(list, true, true);
      m.material = mat;
      m.parent = root;
      m.isPickable = false;
      meshes.push(m);
      if (mat === fusM) body = m;
    }

    // Pusher propellers (counter-rotating)
    const props = [], blades = [], discs = [];
    for (const sx of [-1, 1]) {
      const prop = new BABYLON.TransformNode('prop', scene);
      prop.parent = root; prop.position.set(sx * NAC_X, 0.75, -2.3);
      const parts = [];
      for (const sy of [-1, 1]) {
        const b = MB.CreateSphere('bl', { diameter: 1, segments: 12 }, scene);
        b.scaling.set(0.22, 1.6, 0.08);
        b.position.set(0, sy * 0.8, 0);
        b.rotation.y = sy * 0.28 * sx;
        parts.push(b);
      }
      const blade = BABYLON.Mesh.MergeMeshes(parts, true, true);
      blade.material = wood; blade.parent = prop; blade.isPickable = false;
      const disc = MB.CreateDisc('disc', { radius: 1.65, tessellation: 32, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
      disc.material = BW.getMat(scene, '#3a2c1e', { alpha: 0.16 });
      disc.parent = prop; disc.isPickable = false;
      props.push(prop); blades.push(blade); discs.push(disc);
      meshes.push(blade);
    }

    // Crew: nose gunner, pilot, rear gunner (facing backwards)
    const crew = new BABYLON.TransformNode('crew', scene);
    crew.parent = root;
    for (const [z, ry] of [[5.75, 0], [3.95, 0], [-2.1, Math.PI]]) {
      const n = new BABYLON.TransformNode('seat', scene);
      n.parent = crew; n.position.set(0, 0.1, z); n.rotation.y = ry;
      BW.buildPilotBust(scene, n);
    }
    const guns = {
      nose: buildMG(scene, root, new V3(0, 1.0, 5.3), metal),
      rear: buildMG(scene, root, new V3(0, 1.15, -1.55), metal),
    };
    guns.rear.yaw.rotation.y = Math.PI;

    return {
      root, meshes, body, guns,
      prop: { rotation: { set z(v) { props[0].rotation.z = v; props[1].rotation.z = -v; } } },
      blade: { set isVisible(v) { blades.forEach((b) => (b.isVisible = v)); } },
      disc: {
        set isVisible(v) { discs.forEach((d) => (d.isVisible = v)); },
        setEnabled(v) { discs.forEach((d) => d.setEnabled(v)); },
      },
      flashes: [], pilot: crew, head: crew, pilotHead: null, scarf: null, surfaces: null,
    };
  };

  // ================================================================ flexible machine gun
  // Used by bomber gunners (mounted on a plane) and by anti-aircraft nests (fixed on the ground).
  class Gun {
    constructor(game, o) {
      this.g = game;
      this.owner = o.owner; // bullets are credited to it (plane or ground target)
      this.plane = o.plane || null;
      this.local = o.local || null; // mount position in plane space
      this.pos = o.pos ? o.pos.clone() : new V3();
      this.axis = o.axis.clone().normalize(); // centre of the field of fire (plane space or world)
      this.cosArc = Math.cos(o.arc);
      this.range = o.range;
      this.spread = o.spread;
      this.interval = o.interval || 0.1;
      this.turn = o.turn || 2.5;
      this.reaction = o.reaction || 0.6;
      this.nodes = o.nodes;
      this.dir = new V3();
      this.worldAxis(this.dir);
      this.target = null;
      this.cool = 0; this.scanT = Math.random() * 0.4; this.trackT = 0;
      this.burstT = 0; this.pauseT = Math.random(); this.flashT = 0;
    }

    worldPos(out) { return this.plane ? this.plane.localToWorld(this.local, out) : out.copyFrom(this.pos); }
    worldAxis(out) { return this.plane ? this.axis.applyRotationQuaternionToRef(this.plane.q, out) : out.copyFrom(this.axis); }

    pick(wp) {
      const axis = this.worldAxis(tM);
      let best = null, bd = this.range * 1.2;
      for (const o of this.g.planes) {
        if (o.faction === this.owner.faction || !o.alive || o.onGround) continue;
        tL.copyFrom(o.pos).subtractInPlace(wp);
        const d = tL.length();
        if (d > bd || d < 1) continue;
        if (V3.Dot(tL, axis) / d < this.cosArc) continue;
        bd = d; best = o;
      }
      return best;
    }

    update(dt) {
      if (this.flashT > 0) {
        this.flashT -= dt;
        if (this.flashT <= 0) this.nodes.flash.setEnabled(false);
      }
      const wp = this.worldPos(tG);
      this.scanT -= dt;
      if (this.scanT <= 0 || (this.target && !this.target.alive)) {
        this.scanT = 0.4;
        const t = this.pick(wp);
        if (t !== this.target) this.trackT = 0;
        this.target = t;
      }
      this.cool -= dt;
      const t = this.target;
      if (!t) { this.burstT = 0; return; }
      // Lead: where the target will be when the bullet gets there (bullets inherit the mount's velocity).
      tL.copyFrom(t.pos).subtractInPlace(wp);
      const dist = tL.length(), tof = dist / BW.PHYS.bulletSpeed;
      tD.copyFrom(t.vel);
      if (this.plane) tD.subtractInPlace(this.plane.vel);
      tD.scaleInPlace(tof).addInPlace(tL).normalize();
      // The gunner swings the gun with limited speed, so fast crossing targets are hard to follow.
      this.dir.addInPlace(tD.subtract(this.dir).scaleInPlace(Math.min(1, dt * this.turn))).normalize();
      this.trackT += dt;
      this.setVisual();
      const err = Math.acos(BW.clamp(V3.Dot(this.dir, tD), -1, 1));
      if (this.pauseT > 0) { this.pauseT -= dt; return; }
      if (dist < this.range && err < 0.05 && this.trackT > this.reaction) {
        if (this.cool < -this.interval) this.cool = 0;
        while (this.cool <= 0) {
          this.cool += this.interval;
          tM.copyFrom(this.dir).scaleInPlace(1.4).addInPlace(wp);
          this.g.weapons.fireFrom(this.owner, tM, this.dir, this.spread, this.plane ? this.plane.vel : null);
          this.owner.shots = (this.owner.shots || 0) + 1;
          this.nodes.flash.setEnabled(true);
          this.nodes.flash.scaling.x = this.nodes.flash.scaling.y = 0.7 + Math.random() * 0.6;
          this.flashT = 0.04;
        }
        this.burstT += dt;
        if (this.burstT > 0.8 + Math.random() * 1.4) { this.burstT = 0; this.pauseT = 0.5 + Math.random() * 1.2; }
      } else this.burstT = 0;
    }

    setVisual() {
      const n = this.nodes;
      if (!n) return;
      tL.copyFrom(this.dir);
      if (this.plane) { Q.InverseToRef(this.plane.q, tQ); tL.applyRotationQuaternionInPlace(tQ); }
      n.yaw.rotation.y = Math.atan2(tL.x, tL.z);
      n.pitch.rotation.x = -Math.asin(BW.clamp(tL.y, -1, 1));
    }
  }
  BW.Gun = Gun;

  // ================================================================ bomber AI
  class BomberPilot extends BW.AIPilot {
    constructor(plane, game, cfg, route) {
      super(plane, game, cfg);
      this.state = 'inbound';
      this.aimPt = route.aim; // bomb release point (over the airfield)
      this.exit = route.exit;
      this.alt = route.alt;
      this.bombsLeft = 0;
      this.dropT = 0;
      const guns = plane.model.guns;
      const gcfg = { owner: plane, plane, range: 520, spread: cfg.gunnerSpread, interval: 0.14, turn: 2.8, reaction: 0.5 };
      this.guns = [
        new Gun(game, Object.assign({}, gcfg, { local: new V3(0, 1.0, 5.3), axis: new V3(0, 0.1, 1), arc: 1.65, nodes: guns.nose })),
        // Rear gunner covers the upper rear hemisphere; low behind the tail is his blind spot.
        new Gun(game, Object.assign({}, gcfg, { local: new V3(0, 1.15, -1.55), axis: new V3(0, 0.55, -1), arc: 1.1, nodes: guns.rear })),
      ];
    }

    update(dt) {
      const p = this.p, g = this.g;
      p.input.fire = false;
      if (!p.alive) return;
      p.throttle = 1;
      for (const gun of this.guns) gun.update(dt);

      if (this.bombsLeft > 0) {
        this.dropT -= dt;
        if (this.dropT <= 0) {
          this.dropT = 0.3;
          this.bombsLeft--;
          g.bombs.drop(p.localToWorld(new V3((this.bombsLeft % 2 ? 0.6 : -0.6), -0.9, 0.3), tM), p.vel);
        }
      }
      if (this.state === 'inbound') {
        const dx = this.aimPt.x - p.pos.x, dz = this.aimPt.z - p.pos.z;
        // Release a stick of bombs over the airfield.
        const along = (dx * p.vel.x + dz * p.vel.z) / (Math.hypot(p.vel.x, p.vel.z) || 1);
        // Bombs from ~520 m fall for ~10 s and carry on ~470 m forward, so release well before the aim point.
        if (Math.hypot(dx, dz) < 600 && along < 540) {
          this.state = 'outbound';
          this.bombsLeft = 8;
          g.onBomberRelease(p);
        }
      }
      const dest = this.state === 'inbound' ? this.aimPt : this.exit;
      // Hold altitude above the terrain ahead, fly straight at the destination.
      const gh = Math.max(BW.groundHeight(p.pos.x, p.pos.z), BW.groundHeight(p.pos.x + p.vel.x * 8, p.pos.z + p.vel.z * 8));
      const alt = Math.max(this.alt, gh + 220);
      // Steer at most ~35 deg off the nose: a heavy bomber turns around in a flat banked turn, never a loop.
      const hf = Math.atan2(p.f.x, p.f.z), hd = Math.atan2(dest.x - p.pos.x, dest.z - p.pos.z);
      const h = hf + BW.clamp(Math.atan2(Math.sin(hd - hf), Math.cos(hd - hf)), -0.6, 0.6);
      tD.set(Math.sin(h), BW.clamp((alt - p.pos.y) / 300, -0.12, 0.2), Math.cos(h));
      this.steer(tD.normalize(), 0.35);
    }
  }
  BW.BomberPilot = BomberPilot;

  // ================================================================ ground targets
  const KINDS = {
    depot: { name: 'sklad munice', hp: 110, primary: true, blast: 38 },
    fuel: { name: 'nádrž s palivem', hp: 70, primary: true, blast: 30 },
    supply: { name: 'zásoby', hp: 55, primary: true, blast: 0 },
    aa: { name: 'kulometné hnízdo', hp: 40, primary: false, blast: 0 },
  };

  class GroundTarget {
    constructor(game, kind, x, z, rot, diff) {
      const scene = game.scene;
      this.g = game;
      this.kind = kind;
      this.spec = KINDS[kind];
      this.name = this.spec.name;
      this.primary = this.spec.primary;
      this.faction = 'enemy';
      this.isPlayer = false;
      this.alive = true;
      this.hp = this.maxHp = this.spec.hp;
      this.kills = 0; this.hits = 0; this.shots = 0;
      const gy = BW.terrainHeight(x, z);
      const root = (this.root = new BABYLON.TransformNode('gt', scene));
      root.position.set(x, gy, z);
      root.rotation.y = rot;
      const size = this['build_' + kind](scene, root);
      const w = Math.abs(Math.sin(rot)) > 0.5 ? size.d : size.w, d = Math.abs(Math.sin(rot)) > 0.5 ? size.w : size.d;
      this.min = new V3(x - w / 2, gy - 2, z - d / 2);
      this.max = new V3(x + w / 2, gy + size.h, z + d / 2);
      this.center = new V3(x, gy + size.h * 0.45, z);
      this.pos = this.center;
      this.radius = Math.max(w, d) / 2 + 1;
      this.meshes.forEach((m) => {
        m.isPickable = false;
        m.receiveShadows = true;
        if (game.shadowGen) game.shadowGen.addShadowCaster(m, false);
      });
      if (kind === 'aa') {
        this.gun = new Gun(game, {
          owner: this, pos: new V3(x, gy + 1.5, z), axis: UP, arc: 1.5,
          range: diff.aaRange, spread: diff.aaSpread, interval: 0.1, turn: 1.9, reaction: 0.7, nodes: this.mg,
        });
      }
      this.fx = [];
      this.secondary = [];
    }

    merge(scene, root, list, mat) {
      const m = BABYLON.Mesh.MergeMeshes(list, true, true);
      m.material = mat;
      m.parent = root;
      this.meshes.push(m);
      return m;
    }

    build_depot(scene, root) {
      this.meshes = [];
      const B = (w, h, d, x, y, z, rz) => { const b = MB.CreateBox('b', { width: w, height: h, depth: d }, scene); b.position.set(x, y, z); if (rz) b.rotation.z = rz; return b; };
      this.merge(scene, root, [B(10, 4.4, 16, 0, 1.7, 0)], BW.getMat(scene, '#6b5236', { spec: 0.05 }));
      this.merge(scene, root, [B(6.1, 0.22, 16.8, -2.55, 5.2, 0, 0.5), B(6.1, 0.22, 16.8, 2.55, 5.2, 0, -0.5)], BW.getMat(scene, '#4a4640', { spec: 0.05 }));
      this.merge(scene, root, [B(4, 3.2, 0.2, 0, 1.6, 8.02), B(4, 3.2, 0.2, 0, 1.6, -8.02)], BW.getMat(scene, '#2e261c'));
      const crates = [];
      for (let i = 0; i < 6; i++) crates.push(B(1.4, 1, 1, 6.2 + (i % 2) * 1.5, 0.5 + Math.floor(i / 4), -5 + (i % 3) * 1.2));
      this.merge(scene, root, crates, BW.getMat(scene, '#7a6038'));
      return { w: 13, h: 6.4, d: 16.6 };
    }

    build_fuel(scene, root) {
      this.meshes = [];
      const tank = MB.CreateCylinder('tank', { height: 4.6, diameter: 6, tessellation: 24 }, scene);
      tank.position.y = 2.3;
      const top = MB.CreateCylinder('top', { height: 0.8, diameterTop: 1, diameterBottom: 6.1, tessellation: 24 }, scene);
      top.position.y = 5;
      this.merge(scene, root, [tank, top], BW.getMat(scene, '#56603f', { spec: 0.3, power: 30 }));
      const barrels = [];
      for (let i = 0; i < 6; i++) {
        const b = MB.CreateCylinder('barrel', { height: 1.2, diameter: 0.8, tessellation: 10 }, scene);
        b.position.set(-4 + (i % 3) * 0.9, 0.6, 3.6 + Math.floor(i / 3) * 0.9);
        barrels.push(b);
      }
      this.merge(scene, root, barrels, BW.getMat(scene, '#3c3a30', { spec: 0.3 }));
      return { w: 9, h: 5.4, d: 9.5 };
    }

    build_supply(scene, root) {
      this.meshes = [];
      const tarp = MB.CreateBox('tarp', { width: 8, height: 2.6, depth: 6 }, scene);
      tarp.position.y = 1.3;
      const ridge = MB.CreateCylinder('ridge', { height: 8, diameter: 2.4, tessellation: 10 }, scene);
      ridge.rotation.z = Math.PI / 2; ridge.scaling.set(1, 1, 2.3); ridge.position.y = 2.5;
      this.merge(scene, root, [tarp, ridge], BW.getMat(scene, '#857c5c', { spec: 0.02 }));
      const crates = [];
      for (let i = 0; i < 8; i++) {
        const c = MB.CreateBox('c', { width: 1.2, height: 0.9, depth: 0.9 }, scene);
        c.position.set(-3.5 + (i % 4) * 1.4, 0.45 + Math.floor(i / 6) * 0.9, -4 - Math.floor(i / 4) * 1.1);
        crates.push(c);
      }
      this.merge(scene, root, crates, BW.getMat(scene, '#7a6038'));
      return { w: 9, h: 3.8, d: 9 };
    }

    build_aa(scene, root) {
      this.meshes = [];
      const bags = MB.CreateTorus('bags', { diameter: 4.4, thickness: 1.2, tessellation: 22 }, scene);
      bags.scaling.y = 0.85; bags.position.y = 0.35;
      this.merge(scene, root, [bags], BW.getMat(scene, '#9a8a64', { spec: 0.02 }));
      const metal = BW.getMat(scene, '#2f302c', { spec: 0.5, power: 40 });
      const legs = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2, leg = MB.CreateCylinder('leg', { height: 1.6, diameter: 0.07, tessellation: 5 }, scene);
        leg.position.set(Math.sin(a) * 0.35, 0.72, Math.cos(a) * 0.35);
        leg.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
        legs.push(leg);
      }
      this.merge(scene, root, legs, metal);
      this.mg = buildMG(scene, root, new V3(0, 1.5, 0), metal);
      this.meshes.push(this.mg.mesh);
      // Gunner turns with the gun
      const seat = new BABYLON.TransformNode('gunner', scene);
      seat.parent = this.mg.yaw; seat.position.set(0, -1.05, 0.1);
      this.gunner = seat;
      BW.buildPilotBust(scene, seat);
      return { w: 5.4, h: 2.2, d: 5.4 };
    }

    update(dt) {
      if (this.alive && this.gun) this.gun.update(dt);
      for (let i = this.secondary.length - 1; i >= 0; i--) {
        this.secondary[i] -= dt;
        if (this.secondary[i] <= 0) {
          this.secondary.splice(i, 1);
          const p = this.center.add(new V3((Math.random() - 0.5) * 10, Math.random() * 3, (Math.random() - 0.5) * 10));
          this.g.effects.explosion(p);
          this.g.audio.explosion(p);
        }
      }
    }

    damage(amount, attacker) {
      if (!this.alive) return;
      this.hp -= amount;
      if (this.hp <= 0) this.destroy(attacker);
    }

    destroy(attacker) {
      const g = this.g;
      this.alive = false;
      this.hp = 0;
      g.effects.explosion(this.center);
      g.audio.explosion(this.center);
      if (this.kind === 'depot') this.secondary.push(0.4, 0.9, 1.6);
      if (this.kind === 'fuel') this.secondary.push(0.25);
      // Blast wave hurts planes that strafe too low over an ammunition or fuel store.
      if (this.spec.blast) {
        for (const p of g.planes) {
          if (!p.alive) continue;
          const d = V3.Distance(p.pos, this.center);
          if (d < this.spec.blast) p.damage(60 * (1 - d / this.spec.blast), this, p.pos);
        }
      }
      // Wreck: collapsed and charred
      const charred = BW.getMat(g.scene, '#2b2622', { spec: 0.02 });
      this.meshes.forEach((m) => (m.material = charred));
      this.root.scaling.y = this.kind === 'aa' ? 0.7 : 0.35;
      if (this.gunner) this.gunner.setEnabled(false);
      if (this.mg) { this.mg.pitch.rotation.x = 0.5; this.mg.flash.setEnabled(false); }
      this.burn();
      g.onTargetDestroyed(this, attacker);
    }

    // Long-lasting fire and smoke column over the wreck.
    burn() {
      const fx = this.g.effects, big = this.kind !== 'aa';
      const smoke = fx.makeSystem(big ? 160 : 60, this.center.clone());
      smoke.minEmitBox = new V3(-2, 0, -2); smoke.maxEmitBox = new V3(2, 1, 2);
      smoke.color1 = new BABYLON.Color4(0.12, 0.11, 0.1, 0.75);
      smoke.color2 = new BABYLON.Color4(0.25, 0.23, 0.2, 0.6);
      smoke.colorDead = new BABYLON.Color4(0.4, 0.4, 0.4, 0);
      smoke.minSize = 4; smoke.maxSize = 8;
      smoke.minLifeTime = 5; smoke.maxLifeTime = 9;
      smoke.emitRate = big ? 16 : 6;
      smoke.direction1 = new V3(-0.3, 1, -0.3); smoke.direction2 = new V3(0.3, 1, 0.3);
      smoke.minEmitPower = 2; smoke.maxEmitPower = 4;
      smoke.gravity = new V3(1.2, 1.5, 0);
      smoke.addSizeGradient(0, 4); smoke.addSizeGradient(1, big ? 24 : 12);
      smoke.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
      smoke.start();
      this.fx.push(smoke);
      if (!big) return;
      const fire = fx.makeSystem(120, this.center.clone());
      fire.minEmitBox = new V3(-3, -1, -3); fire.maxEmitBox = new V3(3, 1, 3);
      fire.color1 = new BABYLON.Color4(1, 0.6, 0.15, 1);
      fire.color2 = new BABYLON.Color4(1, 0.3, 0.05, 1);
      fire.colorDead = new BABYLON.Color4(0.3, 0.1, 0, 0);
      fire.minSize = 1.5; fire.maxSize = 3.5;
      fire.minLifeTime = 0.4; fire.maxLifeTime = 0.9;
      fire.emitRate = 90;
      fire.direction1 = new V3(-0.3, 1, -0.3); fire.direction2 = new V3(0.3, 2, 0.3);
      fire.minEmitPower = 1; fire.maxEmitPower = 3;
      fire.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
      fire.start();
      this.fx.push(fire);
    }
  }
  BW.GroundTarget = GroundTarget;

  // Fairly flat place for the depot, 3.2–4.4 km from the airfield, away from villages and water.
  BW.pickDepotSite = function (world) {
    let best = null, bs = Infinity;
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2, r = 3200 + Math.random() * 1200;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (world.villages.some((v) => Math.hypot(v.x - x, v.z - z) < 700)) continue;
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j < 17; j++) {
        const rr = j === 0 ? 0 : j <= 8 ? 90 : 190, aa = (j % 8) * (Math.PI / 4);
        const h = BW.terrainHeight(x + Math.sin(aa) * rr, z + Math.cos(aa) * rr);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (lo < BW.WATER_LEVEL + 6 || hi > 260) continue;
      const score = hi - lo + (world.forests.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 120) ? 40 : 0);
      if (score < bs) { bs = score; best = { x, z }; }
    }
    return best || { x: 0, z: 3800 };
  };

  // ================================================================ bombs
  class Bombs {
    constructor(game) {
      this.g = game;
      const scene = game.scene;
      const body = MB.CreateCylinder('bomb', { height: 1.3, diameter: 0.3, tessellation: 10 }, scene);
      const nose = MB.CreateSphere('bn', { diameter: 0.3, segments: 6 }, scene);
      nose.position.y = 0.65;
      const fin1 = MB.CreateBox('f', { width: 0.55, height: 0.35, depth: 0.03 }, scene);
      fin1.position.y = -0.62;
      const fin2 = fin1.clone('f2'); fin2.rotation.y = Math.PI / 2;
      const base = (this.base = BABYLON.Mesh.MergeMeshes([body, nose, fin1, fin2], true));
      base.rotation.x = Math.PI / 2;
      base.bakeCurrentTransformIntoVertices();
      base.material = BW.getMat(scene, '#34352f', { spec: 0.3 });
      base.isPickable = false;
      base.setEnabled(false);
      this.craterMat = BW.getMat(scene, '#3b3024', { alpha: 0.85 }).clone('craterMat');
      this.craterMat.zOffset = -8;
      this.list = [];
    }

    drop(pos, vel) {
      const m = this.base.createInstance('b');
      m.rotationQuaternion = new Q();
      this.list.push({ m, pos: pos.clone(), vel: vel.clone() });
    }

    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const b = this.list[i];
        b.vel.y -= 9.81 * dt;
        b.vel.scaleInPlace(1 - 0.02 * dt);
        b.pos.addInPlace(tM.copyFrom(b.vel).scaleInPlace(dt));
        const gy = BW.groundHeight(b.pos.x, b.pos.z);
        if (b.pos.y <= gy) {
          b.m.dispose();
          this.list.splice(i, 1);
          this.explode(new V3(b.pos.x, gy, b.pos.z));
          continue;
        }
        b.m.position.copyFrom(b.pos);
        tM.copyFrom(b.vel).normalize();
        Q.RotationYawPitchRollToRef(Math.atan2(tM.x, tM.z), -Math.asin(BW.clamp(tM.y, -1, 1)), 0, b.m.rotationQuaternion);
      }
    }

    explode(p) {
      const g = this.g, water = BW.isWater(p.x, p.z);
      g.effects.explosion(p.add(new V3(0, 1, 0)), water);
      g.audio.explosion(p);
      if (!water) {
        const c = MB.CreateDisc('crater', { radius: 3 + Math.random() * 2, tessellation: 14 }, g.scene);
        c.rotation.x = Math.PI / 2;
        c.position.set(p.x, p.y + 0.2, p.z);
        c.material = this.craterMat;
        c.isPickable = false;
      }
      for (const pl of g.planes) {
        if (pl.destroyed) continue;
        const d = V3.Distance(pl.pos, p);
        if (pl.onGround && d < 22) pl.crash('bomb');
        else if (pl.alive && d < 25) pl.damage(50 * (1 - d / 25), null, pl.pos);
      }
    }
  }
  BW.Bombs = Bombs;

  // ================================================================ mission types
  const count = (g, fn) => g.planes.reduce((n, p) => n + (fn(p) ? 1 : 0), 0);
  const CARD = ['severně', 'severovýchodně', 'východně', 'jihovýchodně', 'jižně', 'jihozápadně', 'západně', 'severozápadně'];
  const bearingText = (x, z) => {
    let a = Math.atan2(x, z);
    if (a < 0) a += Math.PI * 2;
    return CARD[Math.round(a / (Math.PI / 4)) % 8];
  };
  const hpRow = (pl) => ['Stav letounu', pl.destroyed || !pl.alive ? 'zničen' : Math.round((Math.max(0, pl.hp) / pl.maxHp) * 100) + ' %'];
  const pilotRow = (pl) => ['Pilot', pl.bailedOut ? 'zachránil se na padáku' : pl.alive ? 'v pořádku' : 'zahynul'];
  const accRow = (pl) => ['Přesnost střelby', (pl.shots ? Math.round((pl.hits / pl.shots) * 100) : 0) + ' % (' + pl.hits + ' / ' + pl.shots + ')'];

  BW.MissionModes = {
    // ------------------------------------------------------------ dogfight
    dogfight: {
      setup() {},
      start(g) {
        const d = g.diff, n = d.enemies;
        if (d.groups > 1) {
          const first = Math.ceil(n / 2);
          g.spawnEnemies(first, 0);
          g.groupsLeft.push({ count: n - first, at: g.time + 70 });
        } else g.spawnEnemies(n, 0);
        g.hud.message('Nepřátelské letouny na obzoru! Na ně!', 5, 'alert');
      },
      update(g) {
        // Reinforcements arrive after a while or once the first group is thinned out.
        if (g.groupsLeft.length && g.phase === 'combat') {
          const alive = count(g, (p) => p.faction === 'enemy' && p.alive);
          const grp = g.groupsLeft[0];
          if (g.time > grp.at || alive <= 1) {
            g.groupsLeft.shift();
            g.spawnEnemies(grp.count, 1);
            g.hud.message('Pozor, další nepřátelská skupina!', 5, 'alert');
          }
        }
        if (g.phase === 'combat' && g.enemiesSpawned && !g.groupsLeft.length && !g.planes.some((p) => p.faction === 'enemy' && p.alive)) {
          g.phase = 'rtb';
          g.hud.message('Všechna nepřátelská letadla sestřelena!', 6, 'good');
          g.hud.message('Vrať se na letiště a přistaň.', 8);
        }
      },
      objective() { return 'Sestřel nepřátelské letouny'; },
      status(g) { return { label: 'Nepřátelé', value: g.enemiesSpawned ? g.enemiesLeft() : '?' }; },
      killNote(g) { return ` Zbývá ${g.enemiesLeft()}.`; },
      successText: 'Nepřítel byl odražen a přistál jsi na domovském letišti.',
      endRows(g) {
        const pl = g.player, st = g.stats;
        return [['Tvoje sestřely', pl.kills], ['Sestřely spojenců', st.allyKills], ['Ztráty spojenců', st.alliesLost + ' z ' + g.diff.allies], accRow(pl), hpRow(pl), pilotRow(pl)];
      },
      stars(g) {
        const pl = g.player;
        let s = 1;
        if (pl.kills >= Math.ceil(g.diff.enemies / 3)) s++;
        if (g.stats.alliesLost === 0 && pl.hp > pl.maxHp * 0.5) s++;
        return s;
      },
    },

    // ------------------------------------------------------------ bomber interception
    bombers: {
      setup(g) { g.stats.bombersTotal = g.diff.bombers; g.stats.through = 0; g.stats.bomberKills = 0; g.stats.playerBomberKills = 0; },
      start(g) {
        const d = g.diff;
        const bearing = Math.random() * Math.PI * 2, dist = 6000;
        const cx = Math.sin(bearing) * dist, cz = Math.cos(bearing) * dist;
        const heading = Math.atan2(-cx, -cz);
        const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
        const alt = 520 + Math.random() * 60;
        // Way home: a point beyond the edge of the battle area (planes are removed on crossing it).
        const exit = new V3(cx, 0, cz).scaleInPlace(1.4);
        g.bomberList = [];
        for (let i = 0; i < d.bombers; i++) {
          const lat = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 55, back = Math.ceil(i / 2) * 45;
          const pos = new V3(cx + rx * lat - fx * back, alt + (i % 2) * 12, cz + rz * lat - fz * back);
          const p = new BW.Plane(g, {
            faction: 'enemy', name: 'bomber', hp: d.bomberHp, build: BW.buildBomber,
            perf: { thrust: 0.78, rate: 0.5, stall: 1 }, pos, vel: new V3(fx * 46, 0, fz * 46), heading, throttle: 1,
          });
          p.bomber = true;
          p.hitboxes = BW.BOMBER_HITBOXES;
          p.hitR = 13;
          p.collideR = 10;
          g.planes.push(p);
          g.bomberList.push(p);
          // Each bomber aims at its own point across the field, keeping the formation's spread.
          const aim = new V3(rx * lat * 0.7, 0, rz * lat * 0.7);
          g.ais.push(new BW.BomberPilot(p, g, Object.assign({}, d, { skill: 0.6 }), { aim, exit, alt }));
        }
        const lead = () => g.bomberList.find((b) => b.alive) || null;
        g.escorts = [];
        for (let j = 0; j < d.escorts; j++) {
          const side = j % 2 ? 1 : -1, lat = side * (90 + Math.floor(j / 2) * 60), back = 30 + Math.floor(j / 2) * 50;
          const pos = new V3(cx + rx * lat - fx * back, alt + 70 + j * 8, cz + rz * lat - fz * back);
          const e = new BW.Plane(g, {
            faction: 'enemy', name: 'escort', hp: d.enemyHp,
            scheme: BW.SCHEMES.enemies[j % BW.SCHEMES.enemies.length],
            pos, vel: new V3(fx * 46, 0, fz * 46), heading, throttle: 0.7,
          });
          g.planes.push(e);
          const ai = new BW.AIPilot(e, g, Object.assign({}, d, { escort: lead }));
          ai.slot = { lat, up: 70 + j * 8, back };
          ai.exit = exit;
          g.ais.push(ai);
          g.escorts.push(ai);
        }
        g.enemiesSpawned = true;
        g.hud.message(`Bombardéry Gotha letí ${bearingText(cx, cz)} od letiště na naši základnu!`, 7, 'alert');
        g.hud.message('Zachyť je a sestřel, než shodí pumy.', 7);
      },
      update(g) {
        if (g.phase !== 'combat' || !g.enemiesSpawned) return;
        if (!g.bomberList.some((b) => b.alive && b.ai.state === 'inbound')) {
          g.phase = 'rtb';
          for (const ai of g.escorts) if (ai.p.alive) ai.state = 'retreat';
          if (g.failT > 0) return; // the raid succeeded, the mission is about to fail
          if (g.stats.through > 0) g.hud.message('Nálet skončil, zbylé bombardéry se obracejí k domovu.', 6, 'good');
          else g.hud.message('Všechny bombardéry sestřeleny!', 6, 'good');
          g.hud.message('Doprovod se stahuje. Vrať se na letiště a přistaň.', 8);
        }
      },
      objective(g) { return g.phase === 'combat' ? 'Sestřel bombardéry' : 'Vzlétni a zachyť bombardéry'; },
      status(g) {
        return {
          label: 'Bombardéry', value: g.enemiesSpawned ? count(g, (p) => p.bomber && p.alive && p.ai.state === 'inbound') : g.diff.bombers,
          extra: ['Pronikly k letišti', g.stats.through + ' / ' + g.diff.allowedThrough + ' povoleno'],
        };
      },
      killNote(g, plane) {
        const n = count(g, (p) => p.bomber && p.alive && p.ai.state === 'inbound');
        return plane.bomber && n ? ` Zbývá ${BW.plural(n, 'bombardér', 'bombardéry', 'bombardérů')}.` : '';
      },
      successText: 'Nálet byl odražen a přistál jsi na domovském letišti.',
      endRows(g) {
        const pl = g.player, st = g.stats;
        return [
          ['Sestřelené bombardéry', st.bomberKills + ' z ' + st.bombersTotal],
          ['Pronikly k letišti', st.through + ' (povoleno ' + g.diff.allowedThrough + ')'],
          ['Tvoje sestřely', pl.kills + (st.playerBomberKills ? ` (z toho ${st.playerBomberKills} bombardérů)` : '')],
          ['Ztráty spojenců', st.alliesLost + ' z ' + g.diff.allies], accRow(pl), hpRow(pl), pilotRow(pl),
        ];
      },
      stars(g) {
        const pl = g.player, st = g.stats;
        let s = 1;
        if (st.through === 0) s++;
        if (st.playerBomberKills >= Math.ceil(st.bombersTotal / 2) && pl.hp > pl.maxHp * 0.5) s++;
        return s;
      },
    },

    // ------------------------------------------------------------ ground attack
    ground: {
      setup(g) {
        const d = g.diff, site = g.world.site;
        g.site = new V3(site.x, BW.terrainHeight(site.x, site.z), site.z);
        const rot = Math.random() * Math.PI * 2, c = Math.cos(rot), s = Math.sin(rot);
        const at = (lx, lz) => [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
        const layout = [['depot', -30, 12, 0], ['depot', 28, -14, Math.PI / 2], ['fuel', 4, 42, 0], ['fuel', 20, 38, 0], ['supply', -12, -42, 0]];
        for (const [k, lx, lz, r] of layout) {
          const [x, z] = at(lx, lz);
          g.targets.push(new BW.GroundTarget(g, k, x, z, r, d));
        }
        for (let i = 0; i < d.aaNests; i++) {
          const a = (i / d.aaNests) * Math.PI * 2 + 0.3 + (Math.random() - 0.5) * 0.4, r = 95 + Math.random() * 45;
          const [x, z] = at(Math.sin(a) * r, Math.cos(a) * r);
          g.targets.push(new BW.GroundTarget(g, 'aa', x, z, 0, d));
        }
        // Decoration: tents and stacks of crates between the targets
        const decor = { tent: [], crate: [] };
        for (let i = 0; i < 9; i++) {
          const [x, z] = at(-70 + (i % 3) * 9, -5 + Math.floor(i / 3) * 12 + (i > 5 ? 30 : 0));
          const t = MB.CreateCylinder('tent', { height: 6, diameter: 4.4, tessellation: 3 }, g.scene);
          t.rotation.set(0, rot, Math.PI / 2);
          t.bakeCurrentTransformIntoVertices();
          t.rotation.set(0, 0, 0);
          t.position.set(x, BW.terrainHeight(x, z) + 0.9, z);
          decor.tent.push(t);
        }
        for (let i = 0; i < 14; i++) {
          const [x, z] = at(-5 + (Math.random() - 0.5) * 60, -10 + (Math.random() - 0.5) * 50);
          const c = MB.CreateBox('crate', { width: 1.6, height: 1, depth: 1.1 }, g.scene);
          c.rotation.y = rot + (Math.random() - 0.5) * 0.3;
          c.position.set(x, BW.terrainHeight(x, z) + 0.5, z);
          decor.crate.push(c);
        }
        for (const [k, hex] of [['tent', '#8a8468'], ['crate', '#7a6038']]) {
          const m = BABYLON.Mesh.MergeMeshes(decor[k], true, true);
          m.material = BW.getMat(g.scene, hex, { spec: 0.02 });
          m.isPickable = false;
          m.receiveShadows = true;
          if (k === 'tent') m.convertToFlatShadedMesh();
        }
        g.stats.primaryTotal = layout.length;
        g.stats.aaTotal = d.aaNests;
        Object.assign(g.stats, { primaryDown: 0, aaDown: 0, playerPrimary: 0, playerAA: 0 });
        g.patrol = [];
      },
      start(g) {
        const d = g.diff, site = g.site;
        for (let i = 0; i < d.patrol; i++) {
          const a = Math.random() * Math.PI * 2;
          const x = site.x + Math.sin(a) * 700, z = site.z + Math.cos(a) * 700, heading = a + Math.PI / 2;
          const e = new BW.Plane(g, {
            faction: 'enemy', name: 'patrol', hp: d.enemyHp, scheme: BW.SCHEMES.enemies[i % BW.SCHEMES.enemies.length],
            pos: new V3(x, BW.groundHeight(x, z) + 420 + i * 20, z), vel: new V3(Math.sin(heading) * 50, 0, Math.cos(heading) * 50), heading, throttle: 1,
          });
          g.planes.push(e);
          const ai = new BW.AIPilot(e, g, Object.assign({}, d, { guard: site }));
          ai.exit = new V3(site.x, 0, site.z).normalize().scaleInPlace(8500);
          g.ais.push(ai);
          g.patrol.push(ai);
        }
        g.enemiesSpawned = true;
        const km = (Math.hypot(site.x, site.z) / 1000).toFixed(1);
        g.hud.message(`Nepřátelský sklad leží ${km} km ${bearingText(site.x, site.z)} od letiště.`, 7, 'alert');
        g.hud.message(`Znič všech ${g.stats.primaryTotal} cílů. Pozor na kulometná hnízda!`, 7);
        if (d.patrol) g.hud.message('Nad skladem hlídkují nepřátelské stíhačky.', 7);
      },
      update(g) {
        if (g.phase === 'combat' && !g.targets.some((t) => t.primary && t.alive)) {
          g.phase = 'rtb';
          for (const ai of g.patrol) if (ai.p.alive) ai.state = 'retreat';
          g.hud.message('Sklad je zničen!', 6, 'good');
          g.hud.message('Vrať se na letiště a přistaň.', 8);
        }
      },
      objective(g) { return g.phase === 'combat' ? 'Znič nepřátelský sklad' : 'Vzlétni a leť ke skladu'; },
      status(g) {
        return {
          label: 'Zbývající cíle', value: g.targets.filter((t) => t.primary && t.alive).length,
          extra: ['Kulometná hnízda', g.targets.filter((t) => t.kind === 'aa' && t.alive).length],
        };
      },
      killNote() { return ''; },
      successText: 'Sklad nepřítele je zničen a přistál jsi na domovském letišti.',
      endRows(g) {
        const pl = g.player, st = g.stats;
        return [
          ['Zničené cíle', st.primaryDown + ' z ' + st.primaryTotal + ` (ty: ${st.playerPrimary})`],
          ['Umlčená kulometná hnízda', st.aaDown + ' z ' + st.aaTotal + ` (ty: ${st.playerAA})`],
          ['Tvoje sestřely', pl.kills],
          ['Ztráty spojenců', st.alliesLost + ' z ' + g.diff.allies], accRow(pl), hpRow(pl), pilotRow(pl),
        ];
      },
      stars(g) {
        const pl = g.player, st = g.stats;
        let s = 1;
        if (st.playerPrimary >= Math.ceil(st.primaryTotal / 2)) s++;
        if (st.alliesLost === 0 && pl.hp > pl.maxHp * 0.5) s++;
        return s;
      },
    },
  };
})(window.BW);
