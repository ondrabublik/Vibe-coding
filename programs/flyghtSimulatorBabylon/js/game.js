'use strict';
// Game controller: scene setup, input, camera, mission flow and UI screens.
(function (BW) {
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion;
  const $ = (id) => document.getElementById(id);
  const EYE = new V3(0, 1.1, -0.6);
  const OPT_KEY = 'bw-biplanes-options';
  // Some environments (remote desktops, embedded browsers, virtual keyboards) send key events
  // without e.code; fall back to e.key / keyCode so the controls still work there.
  const KEY_FALLBACK = {
    arrowleft: 'ArrowLeft', left: 'ArrowLeft', arrowright: 'ArrowRight', right: 'ArrowRight',
    arrowup: 'ArrowUp', up: 'ArrowUp', arrowdown: 'ArrowDown', down: 'ArrowDown',
    ' ': 'Space', spacebar: 'Space', shift: 'ShiftLeft', escape: 'Escape', esc: 'Escape',
    '+': 'NumpadAdd', '-': 'Minus', '=': 'Equal', pageup: 'PageUp', pagedown: 'PageDown',
  };
  const KEYCODE_FALLBACK = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 32: 'Space', 16: 'ShiftLeft', 27: 'Escape' };
  function keyId(e) {
    if (e.code) return e.code;
    const k = (e.key || '').toLowerCase();
    if (KEY_FALLBACK[k]) return KEY_FALLBACK[k];
    if (/^[a-z]$/.test(k)) return 'Key' + k.toUpperCase();
    if (KEYCODE_FALLBACK[e.keyCode]) return KEYCODE_FALLBACK[e.keyCode];
    if (e.keyCode >= 65 && e.keyCode <= 90) return 'Key' + String.fromCharCode(e.keyCode);
    return '';
  }
  const AIM_MAX_PITCH = 0.9; // ~52 deg: steeper aim points only lead to stalls or flying into the ground
  const AIM_LEASH = 0.7; // ~40 deg: max angle between the aim point and the nose
  const AIM_MAX_BANK = 1.3; // ~75 deg: the mouse autopilot never rolls further

  class Game {
    constructor() {
      this.canvas = $('renderCanvas');
      this.engine = new BABYLON.Engine(this.canvas, true, { stencil: true }, true);
      this.audio = new BW.Audio();
      this.hud = new BW.HUD(this);
      this.keys = {};
      this.mouse = { x: 0, y: 0, left: false, right: false };
      this.look = { yaw: 0, pitch: 0 };
      this.camMode = 'chase';
      this.state = 'menu';
      this.scene = null;
      this.planes = [];
      this.options = Object.assign({ difficulty: 'normal', invert: false, sound: true, cockpit: false }, this.loadOptions());
      if (!this.options.mouseMode) this.options.mouseMode = this.options.mouse ? 'stick' : 'aim';
      this.aim = { yaw: 0, pitch: 0 };
      this.aimDir = new V3(0, 0, 1);
      this.gpPrev = {};
      this.setupInput();
      this.setupUI();
      this.engine.runRenderLoop(() => this.frame());
      window.addEventListener('resize', () => this.engine.resize());
    }

    loadOptions() {
      try { return JSON.parse(localStorage.getItem(OPT_KEY)) || {}; } catch (e) { return {}; }
    }
    saveOptions() {
      try { localStorage.setItem(OPT_KEY, JSON.stringify(this.options)); } catch (e) { /* ignore */ }
    }

    // ------------------------------------------------------------ UI
    setupUI() {
      const list = $('diffList');
      for (const [key, d] of Object.entries(BW.DIFFICULTIES)) {
        const b = document.createElement('button');
        b.className = 'diff';
        b.dataset.key = key;
        b.innerHTML = `<b>${d.name}</b><span>${d.desc}</span>`;
        b.addEventListener('click', () => { this.options.difficulty = key; this.refreshMenu(); });
        list.appendChild(b);
      }
      const bind = (id, key) => {
        const cb = $(id);
        cb.checked = !!this.options[key];
        cb.addEventListener('change', () => {
          this.options[key] = cb.checked;
          if (key === 'sound') this.audio.setMuted(!cb.checked);
          this.saveOptions();
        });
      };
      const mm = $('optMouseMode');
      mm.value = this.options.mouseMode;
      mm.addEventListener('change', () => { this.options.mouseMode = mm.value; this.saveOptions(); });
      bind('optInvert', 'invert'); bind('optSound', 'sound'); bind('optCockpit', 'cockpit');
      this.audio.setMuted(!this.options.sound);
      $('startBtn').addEventListener('click', () => this.startMission());
      $('resumeBtn').addEventListener('click', () => { this.setPaused(false); this.lockPointer(); });
      $('restartBtn').addEventListener('click', () => this.startMission());
      $('pauseMenuBtn').addEventListener('click', () => this.showMenu());
      $('againBtn').addEventListener('click', () => this.startMission());
      $('endMenuBtn').addEventListener('click', () => this.showMenu());
      this.refreshMenu();
    }

    refreshMenu() {
      document.querySelectorAll('#diffList .diff').forEach((b) => b.classList.toggle('sel', b.dataset.key === this.options.difficulty));
      this.saveOptions();
    }

    showMenu() {
      this.state = 'menu';
      $('pauseScreen').classList.add('hidden');
      $('endScreen').classList.add('hidden');
      $('menu').classList.remove('hidden');
      this.hud.show(false);
      this.audio.update(null, false);
    }

    setPaused(p) {
      if (p && this.state !== 'playing') return;
      if (!p && this.state !== 'paused') return;
      this.state = p ? 'paused' : 'playing';
      $('pauseScreen').classList.toggle('hidden', !p);
      if (this.audio.ctx) p ? this.audio.ctx.suspend() : this.audio.ctx.resume();
    }

    // ------------------------------------------------------------ input
    setupInput() {
      const block = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      window.addEventListener('keydown', (e) => {
        if (this.state === 'menu') return;
        const code = keyId(e);
        if (!code) return;
        if (block.includes(code)) e.preventDefault();
        if (e.repeat) { this.keys[code] = true; return; }
        this.keys[code] = true;
        if (code === 'KeyC') this.toggleCamera();
        if (code === 'KeyP') this.setPaused(this.state === 'playing');
        if (code === 'Escape') this.setPaused(true);
        if (code === 'KeyM') {
          this.options.sound = !this.options.sound;
          $('optSound').checked = this.options.sound;
          this.audio.setMuted(!this.options.sound);
          this.saveOptions();
        }
      });
      window.addEventListener('keyup', (e) => {
        const code = keyId(e);
        if (!code) return;
        this.keys[code] = false;
        // Space/arrows released over a focused button would "click" it (e.g. restart the mission).
        if (this.state !== 'menu' && block.includes(code)) e.preventDefault();
      });
      window.addEventListener('blur', () => { this.keys = {}; this.mouse.left = this.mouse.right = false; });
      const c = this.canvas;
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('mousemove', (e) => {
        this.mouse.x = e.offsetX; this.mouse.y = e.offsetY;
        if (this.mouse.right) {
          this.look.yaw += e.movementX * 0.005;
          this.look.pitch = BW.clamp(this.look.pitch + e.movementY * 0.005, -1.2, 1.2);
        } else if (this.options.mouseMode === 'aim' && this.state === 'playing') {
          // Mouse aim: moving the mouse moves the point the plane flies toward.
          const inv = this.options.invert ? -1 : 1;
          // Clamp single events: browsers occasionally report huge jumps under pointer lock.
          const dx = BW.clamp(e.movementX, -120, 120), dy = BW.clamp(e.movementY, -120, 120);
          if (!this.aimTouched) {
            // After flying with the keys, only a deliberate mouse movement (not hand jitter)
            // hands control back to the mouse autopilot.
            // Movement summed over a short sliding window (~0.3 s).
            const now = performance.now();
            this.aimAccum = (this.aimAccum || 0) * Math.exp(-(now - (this.aimAccumT || now)) / 300) + Math.abs(dx) + Math.abs(dy);
            this.aimAccumT = now;
            if (this.aimAccum < 25) return;
            this.aimAccum = 0;
          }
          this.aim.yaw += dx * 0.0022;
          this.aim.pitch = BW.clamp(this.aim.pitch - dy * 0.0022 * inv, -AIM_MAX_PITCH, AIM_MAX_PITCH);
          this.aimTouched = true;
          if (this.player && !this.player.onGround) this.leashAim(this.player);
        }
      });
      c.addEventListener('mousedown', (e) => {
        if (e.button === 0) this.mouse.left = true;
        if (e.button === 2) this.mouse.right = true;
        this.lockPointer();
      });
      document.addEventListener('pointerlockchange', () => {
        // Leaving pointer lock (Esc) pauses the game in mouse-aim mode.
        if (!document.pointerLockElement && this.state === 'playing' && this.options.mouseMode === 'aim') this.setPaused(true);
      });
      // Mouse wheel: throttle (up = more power), 5 % per notch.
      c.addEventListener('wheel', (e) => {
        if (this.state !== 'playing' || !this.player || !this.player.alive) return;
        e.preventDefault();
        const notches = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
        this.player.throttle = BW.clamp(this.player.throttle - BW.clamp(notches, -3, 3) * 0.05, 0, 1);
      }, { passive: false });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
    }

    lockPointer() {
      if (this.options.mouseMode !== 'aim' || this.state !== 'playing' || document.pointerLockElement) return;
      try {
        const r = this.canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* pointer lock unavailable: plain mouse movement still works */ }
    }

    resetAim(p) {
      this.aim.yaw = Math.atan2(p.f.x, p.f.z);
      this.aim.pitch = p.onGround ? 0 : Math.asin(BW.clamp(p.f.y, -1, 1));
    }

    // Keep the aim point within AIM_LEASH (per axis) of the nose: the plane never has to fly a
    // loop or roll inverted to reach it, and a large mouse movement just drags the point along.
    // Applied on every mouse event, so a fast swipe can never flip to the other side.
    leashAim(p) {
      const hdg = Math.atan2(p.f.x, p.f.z), pit = Math.asin(BW.clamp(p.f.y, -1, 1));
      const dy = Math.atan2(Math.sin(this.aim.yaw - hdg), Math.cos(this.aim.yaw - hdg));
      this.aim.yaw = hdg + BW.clamp(dy, -AIM_LEASH, AIM_LEASH);
      this.aim.pitch = BW.clamp(this.aim.pitch, pit - AIM_LEASH, pit + AIM_LEASH);
      this.aim.pitch = BW.clamp(this.aim.pitch, -AIM_MAX_PITCH, AIM_MAX_PITCH);
    }

    // Mouse-aim autopilot: bank-to-turn with limited bank (never inverted), damped roll and
    // flight-path control. Returns stick inputs.
    flyToAim(p, d, dt) {
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      const st = this.aimCtl || (this.aimCtl = {
        bank: p.bank, rollRate: 0, f: p.f.clone(), qRate: 0, rRate: 0, iy: 0, ix: 0,
        d: d.clone(), aimQ: 0, aimR: 0, aimHdgRate: 0,
      });
      // Errors of the nose (= gun line) against the aim point, in the plane's own frame.
      const lx = V3.Dot(d, p.r), ly = V3.Dot(d, p.u), lz = V3.Dot(d, p.f);
      const ex = Math.atan2(lx, Math.max(lz, 0.05)), ey = Math.atan2(ly, Math.max(lz, 0.05));
      // Nose rotation rates (pitch q, yaw r) and roll rate, smoothed, for damping.
      const df = p.f.subtract(st.f);
      st.f.copyFrom(p.f);
      const k = Math.min(1, dt * 20);
      st.qRate += (V3.Dot(df, p.u) / dt - st.qRate) * k;
      st.rRate += (V3.Dot(df, p.r) / dt - st.rRate) * k;
      const bank = p.bank;
      st.rollRate += (wrap(bank - st.bank) / dt - st.rollRate) * Math.min(1, dt * 15);
      st.bank = bank;
      // How fast the aim point itself moves (feed-forward: the nose starts moving with it
      // instead of waiting for an error to build up).
      const dd = d.subtract(st.d);
      const ka = Math.min(1, dt * 10);
      st.aimQ += (BW.clamp(V3.Dot(dd, p.u) / dt, -1, 1) - st.aimQ) * ka;
      st.aimR += (BW.clamp(V3.Dot(dd, p.r) / dt, -1, 1) - st.aimR) * ka;
      st.aimHdgRate += (wrap(Math.atan2(d.x, d.z) - Math.atan2(st.d.x, st.d.z)) / dt - st.aimHdgRate) * ka;
      st.d.copyFrom(d);

      const headErr = wrap(Math.atan2(d.x, d.z) - Math.atan2(p.f.x, p.f.z));
      if (p.onGround) return { pitch: BW.clamp(ey * 3, -1, 1), roll: 0, yaw: BW.clamp(headErr * 3, -1, 1) };

      // Integral terms remove the last fraction of a degree (only while close to the aim).
      const near = Math.abs(ex) < 0.12 && Math.abs(ey) < 0.12;
      st.iy = near ? BW.clamp(st.iy + ey * dt, -0.08, 0.08) : st.iy * 0.9;
      st.ix = near ? BW.clamp(st.ix + ex * dt, -0.08, 0.08) : st.ix * 0.9;

      // Roll: bank-to-turn for heading changes, limited to AIM_MAX_BANK, damped.
      // Bank needed for a level turn at the aim point's turn rate: tan(bank) = omega * V / g.
      const ffBank = Math.atan((BW.clamp(st.aimHdgRate, -0.6, 0.6) * Math.max(p.V, 20)) / 9.81);
      const bankDes = BW.clamp(headErr * 3.5 + ffBank, -AIM_MAX_BANK, AIM_MAX_BANK);
      let roll = BW.clamp(wrap(bankDes - bank) * 2.5 - st.rollRate * 0.5, -1, 1);
      // Hard limiter: past the bank limit always roll back, never towards inverted.
      const over = Math.abs(bank) - AIM_MAX_BANK;
      if (over > 0) roll = -Math.sign(bank) * Math.max(Math.abs(roll), BW.clamp(over * 4 + 0.3, 0, 1));
      // Elevator points the nose directly at the aim (in the plane frame), with a turn feed-forward.
      const turnPull = Math.min(0.35, Math.abs(Math.sin(bank)) * 0.4) * BW.smoothstep(0.01, 0.08, Math.abs(headErr));
      let pitch = BW.clamp(ey * 7 + (st.aimQ - st.qRate) * 0.35 + st.aimQ * 0.5 + st.iy * 5 + turnPull, -0.8, 1);
      const stall = BW.PHYS.stall * p.perf.stall;
      if (p.aoa > stall * 0.85) pitch = Math.min(pitch, 0);
      if (p.V < 28) pitch = Math.min(pitch, BW.clamp((p.V - 22) / 6, 0, 1) * 0.5);
      // Beyond the bank limit don't push or pull hard: that would roll the plane over further.
      if (over > 0) pitch = BW.clamp(pitch, -0.2, 0.3);
      // Rudder does the fine sideways aiming; fades out in large turns where banking does the work.
      const yaw = BW.clamp(ex * 7 + (st.aimR - st.rRate) * 0.4 + st.aimR * 0.8 + st.ix * 5, -1, 1) *
        (1 - 0.7 * BW.smoothstep(0.1, 0.3, Math.abs(ex)));
      return { pitch, roll, yaw };
    }

    toggleCamera() { this.camMode = this.camMode === 'chase' ? 'cockpit' : 'chase'; }

    readPlayerInput(dt) {
      const k = this.keys, p = this.player, inp = p.input;
      let pitch = 0, roll = 0, yaw = 0, fire = !!k.Space || this.mouse.left, brake = !!k.KeyB, thr = 0;
      if (k.KeyW || k.ArrowUp) pitch -= 1;
      if (k.KeyS || k.ArrowDown) pitch += 1;
      if (k.KeyA || k.ArrowLeft) roll -= 1;
      if (k.KeyD || k.ArrowRight) roll += 1;
      if (k.KeyQ) yaw -= 1;
      if (k.KeyE) yaw += 1;
      if (k.KeyR || k.ShiftLeft || k.ShiftRight || k.Equal || k.NumpadAdd || k.PageUp) thr += 1;
      if (k.KeyF || k.Minus || k.NumpadSubtract || k.PageDown) thr -= 1;
      if (this.options.invert) pitch = -pitch;

      if (this.options.mouseMode === 'stick') {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight, sc = 0.28 * Math.min(w, h);
        const dz = (v) => (Math.abs(v) < 0.06 ? 0 : v - Math.sign(v) * 0.06);
        const sx = dz(BW.clamp((this.mouse.x - w / 2) / sc, -1, 1));
        const sy = dz(BW.clamp((this.mouse.y - h / 2) / sc, -1, 1));
        // Keys take priority over the mouse stick on each axis.
        if (roll === 0) roll = sx;
        if (pitch === 0) pitch = this.options.invert ? -sy : sy;
      }

      const gp = navigator.getGamepads ? Array.from(navigator.getGamepads()).find((g) => g) : null;
      if (gp) {
        const ax = (i) => (Math.abs(gp.axes[i] || 0) > 0.12 ? gp.axes[i] : 0);
        const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        roll += ax(0);
        pitch += this.options.invert ? -ax(1) : ax(1);
        yaw += ax(2);
        thr -= ax(3);
        if (btn(4)) yaw -= 1;
        if (btn(5)) yaw += 1;
        fire = fire || btn(7) || btn(0);
        brake = brake || btn(1);
        if (btn(3) && !this.gpPrev.cam) this.toggleCamera();
        if (btn(9) && !this.gpPrev.pause) this.setPaused(true);
        this.gpPrev = { cam: btn(3), pause: btn(9) };
      }

      if (this.options.mouseMode === 'aim') {
        if (!p.onGround && this.aimTouched) {
          // Keep the aim flyable: no steep climbs when slow, no dives close to the ground.
          const maxUp = BW.clamp((p.V - 24) / 22, 0, 1) * AIM_MAX_PITCH;
          const predAgl = p.agl + Math.min(0, p.vel.y) * 3;
          const maxDown = -BW.clamp((predAgl - 90) / 200, 0, 1) * AIM_MAX_PITCH;
          const k = Math.min(1, dt * 3);
          if (this.aim.pitch > maxUp) this.aim.pitch += (maxUp - this.aim.pitch) * k;
          if (this.aim.pitch < maxDown) this.aim.pitch += (maxDown - this.aim.pitch) * k;
        }
        const ay = this.aim.yaw, ap = this.aim.pitch;
        this.aimDir.set(Math.sin(ay) * Math.cos(ap), Math.sin(ap), Math.cos(ay) * Math.cos(ap));
        if (pitch !== 0 || roll !== 0 || !this.aimTouched) {
          // Keyboard/gamepad has priority; the aim point follows the nose meanwhile.
          this.resetAim(p);
          if (pitch !== 0 || roll !== 0) this.aimAccum = 0;
          this.aimTouched = false;
          this.aimCtl = null;
          p.mouseFlying = false;
        } else {
          if (!p.onGround) {
            this.leashAim(p);
            const ay2 = this.aim.yaw, ap2 = this.aim.pitch;
            this.aimDir.set(Math.sin(ay2) * Math.cos(ap2), Math.sin(ap2), Math.cos(ay2) * Math.cos(ap2));
          }
          p.mouseFlying = true;
          const c = this.flyToAim(p, this.aimDir, dt);
          pitch = c.pitch; roll = c.roll; yaw += c.yaw;
        }
      }

      inp.pitch = BW.clamp(pitch, -1, 1);
      inp.roll = BW.clamp(roll, -1, 1);
      inp.yaw = BW.clamp(yaw, -1, 1);
      inp.fire = fire;
      inp.brake = brake;
      p.throttle = BW.clamp(p.throttle + thr * dt * 0.6, 0, 1);
    }

    // ------------------------------------------------------------ mission
    startMission() {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      $('menu').classList.add('hidden');
      $('pauseScreen').classList.add('hidden');
      $('endScreen').classList.add('hidden');
      $('loading').classList.remove('hidden');
      this.audio.init();
      this.audio.setMuted(!this.options.sound);
      if (this.audio.ctx) this.audio.ctx.resume();
      // Let the loading text paint before the heavy world build.
      setTimeout(() => this.buildMission(), 30);
    }

    buildMission() {
      if (this.scene) { this.scene.dispose(); this.scene = null; }
      this.planes = [];
      this.ais = [];
      const diff = (this.diff = BW.DIFFICULTIES[this.options.difficulty] || BW.DIFFICULTIES.normal);
      const scene = (this.scene = new BABYLON.Scene(this.engine));
      scene.clearColor = new BABYLON.Color4(0.72, 0.8, 0.88, 1);
      scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
      scene.fogDensity = 0.00016;
      scene.fogColor = new BABYLON.Color3(0.74, 0.8, 0.86);
      scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);
      scene.skipPointerMovePicking = true;

      this.sunDir = new V3(-0.45, -0.72, 0.52).normalize();
      this.windHeading = 1.9;
      const hemi = new BABYLON.HemisphericLight('hemi', new V3(0, 1, 0), scene);
      hemi.intensity = 0.55;
      hemi.groundColor = new BABYLON.Color3(0.35, 0.33, 0.28);
      const sun = (this.sun = new BABYLON.DirectionalLight('sun', this.sunDir, scene));
      sun.intensity = 1.05;
      sun.diffuse = new BABYLON.Color3(1, 0.96, 0.88);
      sun.autoUpdateExtends = false;
      sun.autoCalcShadowZBounds = false;
      sun.orthoLeft = -90; sun.orthoRight = 90; sun.orthoTop = 90; sun.orthoBottom = -90;
      sun.shadowMinZ = 1; sun.shadowMaxZ = 900;
      const sg = (this.shadowGen = new BABYLON.ShadowGenerator(2048, sun));
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
      sg.bias = 0.002;
      sg.darkness = 0.35;

      this.glow = new BABYLON.GlowLayer('glow', scene, { mainTextureSamples: 1, blurKernelSize: 24 });
      this.glow.intensity = 0.9;

      const cam = (this.camera = new BABYLON.UniversalCamera('cam', new V3(0, 5, -500), scene));
      cam.inputs.clear();
      cam.rotationQuaternion = Q.Identity();
      cam.fov = 1.05;
      cam.minZ = 0.3;
      cam.maxZ = 50000;
      this.camQ = Q.Identity();

      this.world = new BW.World(scene, this);
      this.effects = new BW.Effects(this);
      this.weapons = new BW.Weapons(this);
      this.glow.addIncludedOnlyMesh(this.weapons.tracers.ally);
      this.glow.addIncludedOnlyMesh(this.weapons.tracers.enemy);

      // Player and wingmen lined up on the runway, facing north.
      const player = (this.player = new BW.Plane(this, {
        faction: 'ally', isPlayer: true, name: 'player', hp: diff.playerHp, scheme: BW.SCHEMES.player,
        perf: { thrust: 1.1, rate: 1.12, stall: 1.08 },
        pos: new V3(0, 0, -470), heading: 0, onGround: true, throttle: 0.08,
      }));
      player.gunSpread = 0.003;
      player.assist = true;
      this.planes.push(player);
      player.model.flashes.forEach((f) => this.glow.addIncludedOnlyMesh(f));
      const slots = [[-24, -505], [24, -505], [-48, -540], [48, -540]];
      for (let i = 0; i < diff.allies; i++) {
        const a = new BW.Plane(this, {
          faction: 'ally', name: 'ally' + i, hp: 100, scheme: BW.SCHEMES.ally,
          pos: new V3(slots[i][0], 0, slots[i][1]), heading: 0, onGround: true, throttle: 0.08,
        });
        this.planes.push(a);
        this.ais.push(new BW.AIPilot(a, this, Object.assign({ maxOnPlayer: 0 }, BW.ALLY_AI)));
      }

      this.time = 0;
      this.missionTime = 0;
      this.phase = 'runway';
      this.alliesGo = false;
      this.enemiesSpawned = false;
      this.groupsLeft = [];
      this.chutes = [];
      this.playerChute = null;
      this.stats = { allyKills: 0, alliesLost: 0, enemiesTotal: diff.enemies };
      this.endTimer = -1;
      this.camMode = this.options.cockpit ? 'cockpit' : 'chase';
      this.look.yaw = this.look.pitch = 0;
      this.camTarget = player;
      this.camQ.copyFrom(player.q);
      this.resetAim(player);
      this.aimTouched = false;
      this.audio.listener = player;
      this.weapons.clear();

      this.hud.reset();
      this.hud.show(true);
      $('loading').classList.add('hidden');
      this.state = 'playing';
      this.lockPointer();
      this.hud.message('Přidej plyn (R / Shift) a rozjeď se po dráze.', 7);
      this.hud.message('Nad 90 km/h přitáhni (S / šipka dolů) a vzlétni.', 7);
      scene.onDisposeObservable.add(() => { this.planes = []; });
    }

    pendingEnemies() { return this.groupsLeft.reduce((s, g) => s + g.count, 0); }

    objectiveText() {
      switch (this.phase) {
        case 'runway': return 'Vzlétni z letiště';
        case 'combat': return 'Sestřel nepřátelské letouny';
        case 'rtb': return 'Vrať se a přistaň na letišti';
        case 'done': return 'Mise splněna';
        default: return 'Mise selhala';
      }
    }

    spawnEnemies(count, groupIndex) {
      const diff = this.diff;
      const bearing = (groupIndex === 0 ? 0 : (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.55) + (Math.random() - 0.5) * 1.0;
      const dist = 3000 + Math.random() * 500;
      const cx = Math.sin(bearing) * dist, cz = Math.cos(bearing) * dist;
      const heading = Math.atan2(-cx, -cz);
      const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
      const alt = 650 + Math.random() * 200;
      for (let i = 0; i < count; i++) {
        const lat = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 40, back = Math.ceil(i / 2) * 35;
        const pos = new V3(cx + rx * lat - fx * back, alt + Math.random() * 30, cz + rz * lat - fz * back);
        const e = new BW.Plane(this, {
          faction: 'enemy', name: 'enemy', hp: diff.enemyHp,
          scheme: BW.SCHEMES.enemies[(i + groupIndex * 2) % BW.SCHEMES.enemies.length],
          pos, vel: new V3(fx * 50, 0, fz * 50), heading, throttle: 1,
        });
        this.planes.push(e);
        this.ais.push(new BW.AIPilot(e, this, diff));
      }
      this.enemiesSpawned = true;
    }

    missionUpdate(dt) {
      const pl = this.player, diff = this.diff;
      if (this.state === 'playing') this.missionTime += dt;
      if (!this.alliesGo && (pl.V > 4 || !pl.onGround)) {
        this.alliesGo = true;
        if (diff.allies > 0) this.hud.message('Spolubojovníci startují s tebou.', 4);
      }
      if (this.phase === 'runway' && pl.alive && !pl.onGround && pl.agl > 40) {
        this.phase = 'combat';
        const n = diff.enemies;
        if (diff.groups > 1) {
          const first = Math.ceil(n / 2);
          this.spawnEnemies(first, 0);
          this.groupsLeft.push({ count: n - first, at: this.time + 70 });
        } else this.spawnEnemies(n, 0);
        this.hud.message('Nepřátelské letouny na obzoru! Na ně!', 5, 'alert');
      }
      // Reinforcements arrive after a while or once the first group is thinned out.
      if (this.groupsLeft.length && this.phase === 'combat') {
        const alive = this.planes.filter((p) => p.faction === 'enemy' && p.alive).length;
        const g = this.groupsLeft[0];
        if (this.time > g.at || alive <= 1) {
          this.groupsLeft.shift();
          this.spawnEnemies(g.count, 1);
          this.hud.message('Pozor, další nepřátelská skupina!', 5, 'alert');
        }
      }
      if (this.phase === 'combat' && this.enemiesSpawned && !this.groupsLeft.length &&
          !this.planes.some((p) => p.faction === 'enemy' && p.alive)) {
        this.phase = 'rtb';
        this.hud.message('Všechna nepřátelská letadla sestřelena!', 6, 'good');
        this.hud.message('Vrať se na letiště a přistaň.', 8);
      }
      if (pl.alive && pl.onGround && BW.onAirfield(pl.pos.x, pl.pos.z) && pl.V < 1) {
        if (pl.hp < pl.maxHp && this.phase !== 'rtb') {
          if (!this.repairing) this.hud.message('Mechanici opravují letoun…', 3);
          this.repairing = true;
          pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.1 * dt);
          if (pl.hp > pl.maxHp * 0.6) { this.effects.updateDamageSmoke(pl, null); pl.enginePower = 1; }
        }
        if (this.phase === 'rtb' && this.state === 'playing') this.endMission(true);
      } else this.repairing = false;

      if (this.endTimer > 0) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.showEnd();
      }
    }

    endMission(success, reason) {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.state = 'ended';
      this.phase = success ? 'done' : 'failed';
      this.success = success;
      this.failReason = reason || '';
      if (success) { this.player.input.brake = true; this.player.throttle = 0; }
      this.endTimer = success ? 1.5 : 3.5;
    }

    showEnd() {
      const pl = this.player, st = this.stats;
      const t = Math.floor(this.missionTime);
      $('endTitle').textContent = this.success ? 'Mise splněna' : 'Mise selhala';
      $('endTitle').className = this.success ? 'good' : 'bad';
      $('endReason').textContent = this.success ? 'Nepřítel byl odražen a přistál jsi na domovském letišti.' : this.failReason;
      const acc = pl.shots ? Math.round((pl.hits / pl.shots) * 100) : 0;
      const rows = [
        ['Obtížnost', this.diff.name],
        ['Čas mise', Math.floor(t / 60) + ' min ' + (t % 60) + ' s'],
        ['Tvoje sestřely', pl.kills],
        ['Sestřely spojenců', st.allyKills],
        ['Ztráty spojenců', st.alliesLost + ' z ' + this.diff.allies],
        ['Přesnost střelby', acc + ' % (' + pl.hits + ' / ' + pl.shots + ')'],
        ['Stav letounu', pl.destroyed || !pl.alive ? 'zničen' : Math.round((Math.max(0, pl.hp) / pl.maxHp) * 100) + ' %'],
        ['Pilot', pl.bailedOut ? 'zachránil se na padáku' : pl.alive ? 'v pořádku' : 'zahynul'],
      ];
      $('endStats').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
      let stars = 0;
      if (this.success) {
        stars = 1;
        if (pl.kills >= Math.ceil(this.diff.enemies / 3)) stars++;
        if (st.alliesLost === 0 && pl.hp > pl.maxHp * 0.5) stars++;
      }
      $('endStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      $('endScreen').classList.remove('hidden');
    }

    // ------------------------------------------------------------ events
    onBulletHit(target, owner, point) {
      owner.hits++;
      this.effects.spark(point);
      if (owner.isPlayer) { this.hud.hitMarker(); this.audio.hit(); }
      if (target.isPlayer) { this.hud.damageFlash(); this.audio.hurt(); }
      const dmg = BW.PHYS.bulletDamage * (target.isPlayer ? this.diff.dmgToPlayer : 1) * (owner.isPlayer ? 1.15 : 1);
      target.damage(dmg, owner, point);
    }

    enemiesLeft() {
      return this.planes.filter((p) => p.faction === 'enemy' && p.alive).length + this.pendingEnemies();
    }

    onShotDown(plane, attacker) {
      if (attacker && attacker !== plane) attacker.kills++;
      this.creditKill(plane, attacker);
      // The player always bails out when there is enough height; AI pilots sometimes.
      if (plane.agl > 45 && (plane.isPlayer || Math.random() < 0.35)) plane.bailTimer = 0.5 + Math.random() * (plane.isPlayer ? 0.2 : 1.2);
    }

    bailOut(plane) {
      plane.bailTimer = 0;
      plane.bailedOut = true;
      plane.model.pilot.setEnabled(false);
      const chute = new BW.Parachute(this, plane);
      this.chutes.push(chute);
      if (plane.isPlayer) {
        this.playerChute = chute;
        this.hud.message('Vyskočil jsi s padákem!', 5, 'alert');
        this.endMission(false, 'Byl jsi sestřelen, ale zachránil ses na padáku.');
        this.endTimer = 7; // let the canopy open before the summary
      }
    }

    updateChutes(dt) {
      for (const p of this.planes) {
        if (p.bailTimer > 0 && !p.destroyed) {
          p.bailTimer -= dt;
          if (p.bailTimer <= 0) this.bailOut(p);
        }
      }
      for (let i = this.chutes.length - 1; i >= 0; i--) {
        const c = this.chutes[i];
        c.update(dt);
        // AI parachutes are removed some time after landing
        if (!c.isPlayer && c.state === 'landed' && c.landT > 40) { c.dispose(); this.chutes.splice(i, 1); }
      }
    }

    creditKill(plane, attacker) {
      if (plane.faction === 'enemy') {
        const left = this.enemiesLeft();
        if (attacker && attacker.isPlayer) this.hud.message(`Sestřelil jsi nepřítele! Zbývá ${left}.`, 4, 'good');
        else {
          this.stats.allyKills++;
          this.hud.message(`Spojenec sestřelil nepřítele. Zbývá ${left}.`, 4);
        }
      } else if (plane.isPlayer) {
        this.hud.message('Byl jsi sestřelen!', 5, 'alert');
      } else {
        this.stats.alliesLost++;
        this.hud.message('Ztratili jsme spojence!', 4, 'alert');
      }
    }

    onCrash(plane, reason, wasAlive) {
      this.audio.explosion(plane.pos);
      if (wasAlive && !plane.isPlayer) {
        // Flew into the ground without being shot down
        if (plane.lastHitBy) plane.lastHitBy.kills++;
        this.creditKill(plane, plane.lastHitBy);
      }
      if (plane.isPlayer) {
        const texts = {
          ground: 'Tvůj letoun narazil do země.', water: 'Zřítil ses do vody.',
          rough: 'Přistání v terénu mimo letiště skončilo havárií.', collision: 'Srazil ses s jiným letadlem.',
        };
        plane.bailTimer = 0;
        if (plane.bailedOut) return; // the pilot is already hanging under the parachute
        let text = wasAlive ? texts[reason] || 'Havaroval jsi.' : 'Byl jsi sestřelen nepřítelem.';
        if (wasAlive) this.hud.message('Havárie!', 4, 'alert');
        this.endMission(false, text);
      }
    }

    onTouchdown(plane, vs) {
      if (!plane.isPlayer || plane.airTime < 3) return;
      const onField = BW.onAirfield(plane.pos.x, plane.pos.z);
      const q = vs > -2 ? 'Měkké přistání' : vs > -4 ? 'Přistání' : 'Tvrdé přistání';
      if (this.phase === 'rtb') this.hud.message(onField ? q + '! Zabrzdi (B) a zastav.' : q + ' mimo letiště – dojeď nebo vzlétni znovu.', 5, onField ? 'good' : '');
      else if (this.phase === 'combat') this.hud.message(onField ? q + '. Zastav, mechanici letoun opraví.' : q + ' mimo letiště.', 5);
    }

    checkCollisions() {
      const pl = this.player;
      if (!pl.alive || pl.onGround) return;
      for (const o of this.planes) {
        if (o === pl || o.destroyed || o.onGround) continue;
        if (V3.DistanceSquared(o.pos, pl.pos) < 25) {
          o.alive = false; o.crash('collision');
          pl.crash('collision');
          return;
        }
      }
    }

    // ------------------------------------------------------------ frame
    frame() {
      if (!this.scene) return;
      const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
      if (this.state === 'playing' || this.state === 'ended' || this.state === 'menu') this.update(dt);
      this.updateCamera(dt);
      this.scene.render();
      this.hud.update(dt);
    }

    update(dt) {
      this.time += dt;
      const pl = this.player;
      if (this.state === 'playing' && pl.alive) this.readPlayerInput(dt);
      else if (pl.alive) { pl.input.fire = false; pl.input.pitch = pl.input.roll = pl.input.yaw = 0; }
      for (const ai of this.ais) ai.update(dt);
      // The mouse autopilot needs crisp surfaces; keyboard input stays a bit smoothed.
      for (const p of this.planes) p.smoothControls(dt, p.isPlayer ? (p.mouseFlying ? 18 : 7) : 4);
      const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
      for (let i = 0; i < n; i++) for (const p of this.planes) p.step(h);
      for (const p of this.planes) { p.updateGuns(dt); if (!p.destroyed) p.syncMesh(dt); }
      this.weapons.update(dt);
      this.updateChutes(dt);
      this.effects.update(dt);
      if (this.state === 'playing') this.checkCollisions();
      this.missionUpdate(dt);
      // Keep the shadow frustum around the player
      this.sun.position.copyFrom(pl.pos).subtractInPlace(this.sunDir.scale(400));
      this.audio.update(pl, this.state === 'playing' || this.state === 'ended');
    }

    updateCamera(dt) {
      const cam = this.camera, p = this.player;
      if (!p) return;
      if (!this.mouse.right) {
        const k = Math.exp(-dt * 7); // view returns to normal in ~0.4 s
        this.look.yaw *= k; this.look.pitch *= k;
      }
      const yawOff = this.look.yaw + (this.keys.KeyX ? Math.PI : 0);
      const look = Q.RotationYawPitchRoll(yawOff, this.look.pitch, 0);
      if (this.playerChute) {
        // Follow the player's parachute, slowly circling it
        const c = this.playerChute;
        this.wreckAng = (this.wreckAng || 0) + dt * 0.2;
        const tgt = c.focus.add(new V3(0, 2.5, 0));
        const d = 17;
        cam.position.set(tgt.x + Math.sin(this.wreckAng) * d, tgt.y + 1.5, tgt.z + Math.cos(this.wreckAng) * d);
        const gy = BW.groundHeight(cam.position.x, cam.position.z) + 1.5;
        if (cam.position.y < gy) cam.position.y = gy;
        const dir = tgt.subtract(cam.position).normalize();
        Q.RotationYawPitchRollToRef(Math.atan2(dir.x, dir.z), -Math.asin(dir.y), 0, cam.rotationQuaternion);
        cam.minZ = 0.3; cam.fov = 1.0;
        return;
      }
      if (p.destroyed) {
        // Orbit the crash site
        this.wreckAng = (this.wreckAng || 0) + dt * 0.25;
        const c = p.pos;
        const gy = BW.groundHeight(c.x, c.z);
        cam.position.set(c.x + Math.sin(this.wreckAng) * 70, Math.max(c.y, gy) + 35, c.z + Math.cos(this.wreckAng) * 70);
        const d = new V3(c.x, Math.max(c.y, gy), c.z).subtractInPlace(cam.position).normalize();
        Q.RotationYawPitchRollToRef(Math.atan2(d.x, d.z), -Math.asin(d.y), 0, cam.rotationQuaternion);
        cam.minZ = 0.5;
        return;
      }
      if (this.camMode === 'cockpit') {
        p.model.pilot.setEnabled(false);
        p.localToWorld(EYE, cam.position);
        p.q.multiplyToRef(look, cam.rotationQuaternion);
        cam.minZ = 0.1;
        cam.fov = 1.2;
        this.camQ.copyFrom(p.q);
        return;
      }
      p.model.pilot.setEnabled(!p.bailedOut);
      cam.fov = 1.05;
      let rot;
      if (this.options.mouseMode === 'aim' && p.alive && this.aimTouched) {
        const aimQ = Q.RotationYawPitchRoll(this.aim.yaw, -this.aim.pitch, 0);
        Q.SlerpToRef(this.camQ, aimQ, 1 - Math.exp(-dt * 8), this.camQ);
        rot = this.camQ.multiply(look);
      } else {
        Q.SlerpToRef(this.camQ, p.q, 1 - Math.exp(-dt * 4.5), this.camQ);
        rot = this.camQ.multiply(look);
      }
      const off = new V3(0, 3.0, -14).applyRotationQuaternion(rot);
      cam.position.copyFrom(p.pos).addInPlace(off);
      const gy = BW.groundHeight(cam.position.x, cam.position.z) + 1.5;
      if (cam.position.y < gy) cam.position.y = gy;
      rot.multiplyToRef(Q.RotationYawPitchRoll(0, 0.07, 0), cam.rotationQuaternion);
      cam.minZ = 0.4;
    }

    project(world) {
      const cam = this.camera, e = this.engine;
      const w = e.getRenderWidth(), h = e.getRenderHeight();
      const vz = V3.TransformCoordinates(world, cam.getViewMatrix()).z;
      const s = V3.Project(world, BABYLON.Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      const k = this.canvas.clientWidth / w;
      return { x: s.x * k, y: s.y * k, front: vz > 0 };
    }
  }

  window.addEventListener('DOMContentLoaded', () => { BW.game = new Game(); });
})(window.BW);
