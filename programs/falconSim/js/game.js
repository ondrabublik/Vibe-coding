'use strict';
// Main game: scene setup, flight model, input, camera, hunting rules, HUD.
(function (FS) {
  const { clamp, lerp, smoothstep, expDecay } = FS;
  const V3 = BABYLON.Vector3, Q = BABYLON.Quaternion, M = BABYLON.Matrix;

  // ---------------- settings ----------------
  const DEFAULTS = { sens: 1.0, invertY: false, autoLevel: true, quality: 'high', sound: true, markers: true, mouseMode: 'aim' };
  let settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('falconSim.settings') || '{}')); } catch (e) { /* ignore */ }
  const saveSettings = () => { try { localStorage.setItem('falconSim.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  // ---------------- engine & scene ----------------
  const canvas = document.getElementById('c');
  const engine = new BABYLON.Engine(canvas, true, { stencil: false, antialias: true, adaptToDeviceRatio: true, powerPreference: 'high-performance' });
  engine.useReverseDepthBuffer = true;
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.70, 0.78, 0.86, 1);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.00036;
  scene.fogColor = new BABYLON.Color3(0.72, 0.79, 0.86);
  scene.skipPointerMovePicking = true;

  const world = new FS.World(scene, settings.quality);
  const hemi = new BABYLON.HemisphericLight('hemi', new V3(0.1, 1, -0.2), scene);
  hemi.intensity = 0.62;
  hemi.diffuse = new BABYLON.Color3(0.86, 0.91, 1.0);
  hemi.groundColor = new BABYLON.Color3(0.50, 0.49, 0.42);
  hemi.specular = BABYLON.Color3.Black();
  const sun = new BABYLON.DirectionalLight('sun', world.sunDir.clone(), scene);
  sun.intensity = 1.55;
  sun.diffuse = new BABYLON.Color3(1.0, 0.95, 0.86);
  sun.autoUpdateExtends = false;
  sun.autoCalcShadowZBounds = false;
  sun.orthoLeft = -14; sun.orthoRight = 14; sun.orthoTop = 14; sun.orthoBottom = -14;
  sun.shadowMinZ = 1; sun.shadowMaxZ = 400;

  let shadowGen = new BABYLON.ShadowGenerator(2048, sun);
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
  shadowGen.bias = 0.0008;
  shadowGen.normalBias = 0.01;
  shadowGen.darkness = 0.25;

  const cam = new BABYLON.UniversalCamera('cam', new V3(0, 300, 0), scene);
  cam.inputs.clear();
  cam.rotationQuaternion = Q.Identity();
  cam.minZ = 0.06; cam.maxZ = 16000; cam.fov = 0.95;

  const pp = new BABYLON.DefaultRenderingPipeline('pp', true, scene, [cam]);
  pp.samples = engine.webGLVersion > 1 ? 4 : 1;
  pp.fxaaEnabled = true;
  pp.imageProcessingEnabled = true;
  pp.imageProcessing.toneMappingEnabled = true;
  pp.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pp.imageProcessing.exposure = 1.25;
  pp.imageProcessing.contrast = 1.12;
  pp.imageProcessing.vignetteEnabled = true;
  pp.imageProcessing.vignetteWeight = 1.4;
  pp.imageProcessing.vignetteColor = new BABYLON.Color4(0.05, 0.07, 0.08, 0);
  pp.chromaticAberrationEnabled = true;
  pp.chromaticAberration.aberrationAmount = 0;

  function applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    engine.setHardwareScalingLevel(settings.quality === 'low' ? 1.3 : Math.max(1 / dpr, 0.66));
    shadowGen.getShadowMap().refreshRate = settings.quality === 'low' ? 2 : 1;
    pp.samples = settings.quality === 'low' ? 1 : (engine.webGLVersion > 1 ? 4 : 1);
  }

  // ---------------- game state ----------------
  let falcon, prey, audio = new FS.Audio();
  const F = {
    pos: new V3(), vel: new V3(), q: Q.Identity(),
    tuck: 0, brake: 0, talons: 0, flapPhase: 0, flapAmp: 0, flapHold: 0,
    energy: 100, carried: null, groundKill: null, perched: 0, state: 'fly', stateT: 0, eatT: 0, perchY: 0,
    wheelTuck: 0, look: { yaw: 0, pitch: 0 }, carryMatrix: null, lastFlapSign: 1,
    target: null, inThermal: 0, thermalClimb: 0,
  };
  const stats = { score: 0, catches: 0, maxKmh: 0, crashes: 0, species: {}, fastAirCatch: false, nestMeals: 0, thermalClimb: 0, combo: 0, lastCatch: -999, strikes: 0, time: 0 };
  for (const k in FS.SPECIES) stats.species[k] = 0;
  let playing = false, paused = true, time = 0, camMode = 0, zoom = 0;
  const camPos = new V3(), camLook = new V3();

  const CHALLENGES = [
    { id: 'first', t: 'První úlovek', d: 'Ulov jakoukoli kořist', ok: (s) => s.catches >= 1 },
    { id: 'kmh200', t: 'Rychlík', d: 'Dosáhni rychlosti 200 km/h', ok: (s) => s.maxKmh >= 200 },
    { id: 'kmh300', t: 'Živý projektil', d: 'Dosáhni 300 km/h ve střemhlavém letu', ok: (s) => s.maxKmh >= 300 },
    { id: 'air', t: 'Vzdušný úder', d: 'Ulov letícího ptáka rychlostí nad 150 km/h', ok: (s) => s.fastAirCatch },
    { id: 'starling', t: 'Do hejna', d: 'Vytrhni špačka z hejna', ok: (s) => s.species.starling > 0 },
    { id: 'duck', t: 'Nad hladinou', d: 'Ulov kachnu divokou', ok: (s) => s.species.duck > 0 },
    { id: 'hare', t: 'Zaječí honba', d: 'Ulov zajíce polního', ok: (s) => s.species.hare > 0 },
    { id: 'thermal', t: 'Na termice', d: 'Nastoupej v termikách celkem 150 m', ok: (s) => s.thermalClimb >= 150 },
    { id: 'nest', t: 'Donáška', d: 'Přines kořist do hnízda a sněz ji tam', ok: (s) => s.nestMeals > 0 },
    { id: 'master', t: 'Mistr lovec', d: 'Ulov 10 kusů kořisti', ok: (s) => s.catches >= 10 },
    { id: 'all', t: 'Pestrý jídelníček', d: 'Ulov všech 7 druhů', ok: (s) => Object.values(s.species).every((v) => v > 0) },
  ];
  const done = new Set();

  // ---------------- input ----------------
  const keys = {};
  const stick = { x: 0, y: 0 };
  let mouseL = false, mouseR = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (!playing) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (paused) return;
    if (e.code === 'KeyC') { camMode = (camMode + 1) % 4; showMsg(['Kamera za sokolem', 'Blízká kamera', 'Sokolíma očima', 'Filmová kamera'][camMode], '', 1.2); }
    if (e.code === 'KeyM') { settings.sound = !settings.sound; audio.setEnabled(settings.sound); saveSettings(); showMsg(settings.sound ? 'Zvuk zapnut' : 'Zvuk vypnut', '', 1); }
    if (e.code === 'KeyG' && F.carried) dropPrey();
    if (e.code === 'KeyJ') {
      settings.mouseMode = settings.mouseMode === 'aim' ? 'stick' : 'aim';
      saveSettings(); syncSettings();
      stick.x = stick.y = 0;
      basis(); setAimFromDir(F.vel.length() > 3 ? F.vel : f);
      showMsg(settings.mouseMode === 'aim' ? 'Myš: míření' : 'Myš: joystick',
        settings.mouseMode === 'aim' ? 'Ukaž myší, kam letět' : 'Do strany = náklon · nahoru/dolů = přitáhnout/potlačit · R = střed', 2.2);
    }
    if (e.code === 'KeyK') audio.cry();
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseL = mouseR = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (!playing || paused) return;
    if (document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) mouseL = true;
    if (e.button === 2) mouseR = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
  // mouse-aim: the mouse moves a direction in the world, the falcon steers itself toward it
  const aim = { yaw: 0, pitch: 0 };
  const aimDir = new V3(0, 0, 1);
  function setAimFromDir(d) {
    aim.yaw = Math.atan2(d.x, d.z);
    aim.pitch = Math.asin(clamp(d.y / (d.length() || 1), -1, 1));
  }
  function updateAimDir() {
    const cp = Math.cos(aim.pitch);
    aimDir.set(Math.sin(aim.yaw) * cp, Math.sin(aim.pitch), Math.cos(aim.yaw) * cp);
  }
  // Mouse events arrive at irregular times relative to frames, so they are only accumulated here
  // and released smoothly frame by frame in consumeMouse().
  const pend = { x: 0, y: 0 };
  document.addEventListener('mousemove', (e) => {
    if (!playing || paused || document.pointerLockElement !== canvas) return;
    const mx = e.movementX, my = e.movementY;
    // some browsers emit a bogus huge jump right after locking the pointer
    if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
    pend.x += mx; pend.y += my;
  });
  function clearMouse() { pend.x = 0; pend.y = 0; }
  function consumeMouse(dt) {
    const a = expDecay(22, dt);            // ~45 ms smoothing
    const mx = pend.x * a, my = pend.y * a;
    pend.x -= mx; pend.y -= my;
    const iy = settings.invertY ? -1 : 1;
    if (settings.mouseMode === 'aim') {
      const k = 0.0016 * settings.sens;
      aim.yaw += mx * k;
      aim.pitch = clamp(aim.pitch - my * k * iy, -1.45, 1.2);
    } else {
      const k = 0.0020 * settings.sens;
      stick.x = clamp(stick.x + mx * k, -1, 1);
      stick.y = clamp(stick.y + my * k * iy, -1, 1);
    }
  }
  canvas.addEventListener('wheel', (e) => {
    if (!playing || paused) return;
    e.preventDefault();
    F.wheelTuck = clamp(F.wheelTuck + (e.deltaY > 0 ? 0.25 : -0.25), 0, 1);
  }, { passive: false });
  function lockPointer() {
    clearMouse();
    // raw mouse input (no OS acceleration) where supported, plain lock otherwise
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => {}); } catch (e) { /* ignore */ } });
    } catch (e) {
      try { canvas.requestPointerLock(); } catch (e2) { /* ignore */ }
    }
  }
  document.addEventListener('pointerlockchange', () => {
    if (playing && !paused && document.pointerLockElement !== canvas) setPaused(true);
  });

  // ---------------- UI helpers ----------------
  const $ = (id) => document.getElementById(id);
  const ui = {
    score: $('score'), catches: $('catches'), combo: $('combo'), carry: $('carry'), energy: $('energy'), energyTxt: $('energyTxt'),
    spd: $('spd'), agl: $('agl'), vs: $('vs'), wing: $('wing'), thermal: $('thermal'), msg: $('msg'), toasts: $('toasts'), hint: $('hint'),
    markers: $('markers'), fpm: $('fpm'), aim: $('aim'), stick: $('stick'), stickDot: document.querySelector('#stick i'), mini: $('minimap'), flash: $('flash'), fx: $('fx'),
  };
  const cache = {};
  const setText = (el, key, v) => { if (cache[key] !== v) { cache[key] = v; el.textContent = v; } };
  let msgTimer = 0;
  function showMsg(title, sub, dur = 2) {
    ui.msg.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    ui.msg.style.opacity = 1; msgTimer = dur;
  }
  function toast(html) {
    const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = html;
    ui.toasts.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
  function flash(color, strength = 0.5) {
    ui.flash.style.transition = 'none'; ui.flash.style.background = color; ui.flash.style.opacity = strength;
    requestAnimationFrame(() => { ui.flash.style.transition = 'opacity .6s'; ui.flash.style.opacity = 0; });
  }

  function buildSettings(el) {
    el.innerHTML = `
      <label>Ovládání myší <select data-k="mouseMode"><option value="aim">míření</option><option value="stick">joystick</option></select></label>
      <label>Citlivost myši <input type="range" min="0.3" max="2.5" step="0.1" data-k="sens"></label>
      <label>Invertovat osu Y myši <input type="checkbox" data-k="invertY"></label>
      <label>Automatické vyrovnání náklonu <input type="checkbox" data-k="autoLevel"></label>
      <label>Značky kořisti <input type="checkbox" data-k="markers"></label>
      <label>Zvuk <input type="checkbox" data-k="sound"></label>
      <label>Kvalita grafiky <select data-k="quality"><option value="high">vysoká</option><option value="low">nízká</option></select></label>`;
    el.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!settings[k]; else inp.value = settings[k];
      inp.addEventListener('input', () => {
        settings[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
        saveSettings();
        if (k === 'sound') audio.setEnabled(settings.sound);
        if (k === 'quality') applyQuality();
        syncSettings();
      });
    });
  }
  function syncSettings() {
    document.querySelectorAll('.settings [data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!settings[k]; else inp.value = settings[k];
    });
  }
  buildSettings($('settingsMenu'));
  buildSettings($('settingsPause'));

  // ---------------- particles ----------------
  let featherPS, dustPS;
  function makeParticles() {
    const S = 64;
    const t = new BABYLON.DynamicTexture('featherTex', { width: S, height: S }, scene, false);
    const ctx = t.getContext();
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(S / 2, S / 2, S * 0.14, S * 0.44, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,120,120,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(S * 0.42, S * 0.9); ctx.lineTo(S * 0.58, S * 0.1); ctx.stroke();
    t.hasAlpha = true; t.update();
    featherPS = new BABYLON.ParticleSystem('feathers', 400, scene);
    featherPS.particleTexture = t;
    featherPS.emitter = new V3();
    featherPS.minEmitBox = new V3(-0.2, -0.2, -0.2); featherPS.maxEmitBox = new V3(0.2, 0.2, 0.2);
    featherPS.direction1 = new V3(-2, 1.5, -2); featherPS.direction2 = new V3(2, 3, 2);
    featherPS.minEmitPower = 0.6; featherPS.maxEmitPower = 2.2;
    featherPS.minLifeTime = 2.5; featherPS.maxLifeTime = 5;
    featherPS.minSize = 0.05; featherPS.maxSize = 0.12;
    featherPS.minAngularSpeed = -4; featherPS.maxAngularSpeed = 4;
    featherPS.gravity = new V3(0, -0.8, 0);
    featherPS.emitRate = 0;
    featherPS.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    featherPS.colorDead = new BABYLON.Color4(0.8, 0.8, 0.8, 0);
    featherPS.start();
    const d = new BABYLON.DynamicTexture('dustTex', { width: S, height: S }, scene, false);
    const c2 = d.getContext();
    const g = c2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = g; c2.fillRect(0, 0, S, S); d.hasAlpha = true; d.update();
    dustPS = new BABYLON.ParticleSystem('dust', 200, scene);
    dustPS.particleTexture = d;
    dustPS.emitter = new V3();
    dustPS.minEmitBox = new V3(-0.5, 0, -0.5); dustPS.maxEmitBox = new V3(0.5, 0.3, 0.5);
    dustPS.direction1 = new V3(-2, 0.5, -2); dustPS.direction2 = new V3(2, 2, 2);
    dustPS.minLifeTime = 0.6; dustPS.maxLifeTime = 1.5; dustPS.minSize = 0.3; dustPS.maxSize = 1.0;
    dustPS.color1 = new BABYLON.Color4(0.55, 0.48, 0.36, 0.35); dustPS.color2 = new BABYLON.Color4(0.65, 0.6, 0.5, 0.22); dustPS.colorDead = new BABYLON.Color4(0.6, 0.55, 0.45, 0);
    dustPS.gravity = new V3(0, -0.5, 0); dustPS.emitRate = 0; dustPS.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    dustPS.start();
  }
  function hexColor(h, a = 1) {
    const n = parseInt(h.slice(1), 16);
    return new BABYLON.Color4(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a);
  }
  function burstFeathers(pos, hex, n = 45) {
    featherPS.emitter.copyFrom(pos);
    featherPS.color1 = hexColor(hex); featherPS.color2 = new BABYLON.Color4(0.9, 0.9, 0.9, 1);
    featherPS.manualEmitCount = n;
  }
  function burstDust(pos, n = 40) { dustPS.emitter.copyFrom(pos); dustPS.manualEmitCount = n; }

  // ---------------- setup ----------------
  function spawnFalcon(first) {
    const n = world.nest;
    const x = first ? n.x + 40 : F.pos.x, z = first ? n.z - 380 : F.pos.z;
    const heading = first ? Math.PI : Math.atan2(F.vel.x || 0.001, F.vel.z || -1);
    let g = 0;
    for (let k = 0; k <= 6; k++) g = Math.max(g, world.groundAt(x + Math.sin(heading) * k * 40, z + Math.cos(heading) * k * 40));
    F.pos.set(x, Math.max(g + 80, first ? n.y + 60 : g + 80), z);
    Q.RotationYawPitchRollToRef(heading, 0, 0, F.q);
    F.vel.set(Math.sin(heading) * 16, 0, Math.cos(heading) * 16);
    F.state = 'fly'; F.perched = 0; F.stateT = 0; F.tuck = 0; F.brake = 0; F.talons = 0; F.eatT = 0;
    F.flapHold = 0.6;
    stick.x = stick.y = 0;
    aim.yaw = heading; aim.pitch = -0.05;
    camPos.copyFrom(F.pos.subtract(F.vel.normalizeToNew().scale(4)).add(new V3(0, 1, 0)));
  }

  function init() {
    world.build();
    falcon = new FS.Falcon(scene, shadowGen);
    prey = new FS.PreyManager(scene, world);
    prey.init();
    makeParticles();
    spawnFalcon(true);
    applyQuality();
    const btn = $('startBtn');
    btn.disabled = false;
    $('loading').textContent = `Krajina připravena: ${world.treeCount} stromů, ${prey.list.length} zvířat.`;
    btn.addEventListener('click', startGame);
    $('resumeBtn').addEventListener('click', () => { setPaused(false); lockPointer(); });
    $('restartBtn').addEventListener('click', () => { restart(); setPaused(false); lockPointer(); });
  }

  function startGame() {
    audio.init();
    audio.setEnabled(settings.sound);
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    playing = true;
    setPaused(false);
    lockPointer();
    showMsg('Lov začíná', 'Klikni pro ovládání myší · Shift = střemhlavý let', 3);
    setTimeout(() => audio.cry(), 600);
  }
  function restart() {
    stats.score = 0; stats.catches = 0; stats.maxKmh = 0; stats.crashes = 0; stats.fastAirCatch = false; stats.nestMeals = 0; stats.thermalClimb = 0; stats.combo = 0; stats.time = 0;
    for (const k in stats.species) stats.species[k] = 0;
    done.clear();
    if (F.carried) { prey.remove(F.carried); F.carried = null; }
    F.groundKill = null; F.energy = 100;
    spawnFalcon(true);
  }
  function setPaused(p) {
    paused = p;
    $('pause').classList.toggle('hidden', !p);
    if (p) renderPauseInfo();
  }
  function togglePause() {
    if (paused) { setPaused(false); lockPointer(); } else { setPaused(true); if (document.pointerLockElement) document.exitPointerLock(); }
  }
  function renderPauseInfo() {
    $('challengeList').innerHTML = CHALLENGES.map((c) => `<li class="${done.has(c.id) ? 'done' : ''}"><b>${c.t}</b> – ${c.d}</li>`).join('');
    const sp = Object.entries(stats.species).filter(([, v]) => v > 0).map(([k, v]) => `${FS.SPECIES[k].name}: ${v}`).join(', ') || '—';
    const mm = Math.floor(stats.time / 60), ss = Math.floor(stats.time % 60);
    $('stats').innerHTML = `<span>Skóre</span><b>${stats.score}</b><span>Úlovky</span><b>${stats.catches}</b><span>Max. rychlost</span><b>${Math.round(stats.maxKmh)} km/h</b>
      <span>Nárazy</span><b>${stats.crashes}</b><span>Čas lovu</span><b>${mm}:${String(ss).padStart(2, '0')}</b><span>Druhy</span><b>${sp}</b>`;
  }

  // ---------------- flight model ----------------
  const RHO = 1.2, G = 9.81, S0 = 0.125, CLA = 5.0, BASE_MASS = 0.9;
  const RM = new M();
  const f = new V3(), u = new V3(), r = new V3();
  const AX = V3.Right(), AY = V3.Up(), AZ = V3.Forward();
  const tmpQ = new Q();
  function basis() {
    F.q.toRotationMatrix(RM);
    V3.TransformNormalToRef(AZ, RM, f);
    V3.TransformNormalToRef(AY, RM, u);
    V3.TransformNormalToRef(AX, RM, r);
  }
  function rotLocal(axis, ang) { Q.RotationAxisToRef(axis, ang, tmpQ); F.q.multiplyInPlace(tmpQ); F.q.normalize(); }
  function rotWorld(axis, ang) { Q.RotationAxisToRef(axis, ang, tmpQ); tmpQ.multiplyToRef(F.q, F.q); F.q.normalize(); }

  function inputs() {
    const k = (c) => (keys[c] ? 1 : 0);
    const kp = k('KeyS') - k('KeyW'), kr = k('KeyD') - k('KeyA');
    const yaw = k('KeyE') - k('KeyQ');
    // ctrl: 'keys' = rate control from the keyboard, 'aim' / 'stick' = attitude control from the mouse
    let ctrl = settings.mouseMode === 'aim' ? 'aim' : 'stick';
    if (kp || kr) {
      ctrl = 'keys';
      // keyboard overrides the mouse; keep the mouse state in sync so releasing keys is seamless
      if (F.state === 'fly') { basis(); setAimFromDir(F.vel.length() > 3 ? F.vel : f); }
      stick.x = 0; stick.y = 0; clearMouse();
    }
    const pitch = ctrl === 'stick' ? -stick.y : kp;   // + = nose up (used for animation)
    const roll = ctrl === 'stick' ? stick.x : kr;     // + = bank right
    return { ctrl, pitch, roll, yaw, flap: !!keys.Space, stoop: !!(keys.ShiftLeft || keys.ShiftRight), half: !!keys.KeyX, brake: !!keys.KeyF, talons: mouseL || !!keys.KeyT, zoom: mouseR || !!keys.KeyV };
  }

  // Attitude controller shared by both mouse modes.
  // Returns the desired body-up direction (where the lift should point) and the load factor n (in g).
  const dUp = new V3(), tmpA = new V3(), tmpB = new V3();
  function attitudeTarget(inp, vdirX, vdirY, vdirZ, Va) {
    if (inp.ctrl === 'aim') {
      updateAimDir();
      const c = clamp(aimDir.x * vdirX + aimDir.y * vdirY + aimDir.z * vdirZ, -1, 1);
      const ang = Math.acos(c);
      // component of the aim direction perpendicular to the flight path
      let px = aimDir.x - vdirX * c, py = aimDir.y - vdirY * c, pz = aimDir.z - vdirZ * c;
      const pl = Math.hypot(px, py, pz);
      if (pl > 1e-4) { px /= pl; py /= pl; pz /= pl; } else { px = 0; py = 0; pz = 0; }
      // wanted turn rate, proportional to the angle (smooth arrival, no overshoot)
      const omega = Math.min(ang * 1.6, 2.2);
      // required acceleration = turn toward the aim + hold against gravity
      let axr = px * omega * Va, ayr = py * omega * Va + G, azr = pz * omega * Va;
      const along = axr * vdirX + ayr * vdirY + azr * vdirZ;
      axr -= vdirX * along; ayr -= vdirY * along; azr -= vdirZ * along;
      const a = Math.hypot(axr, ayr, azr);
      if (a < 1.0) return null; // e.g. vertical dive straight at the aim: keep attitude
      dUp.set(axr / a, ayr / a, azr / a);
      // low-speed protection: when too slow to hold the path, ease off and let the nose drop
      const slowK = F.flapAmp > 0.5 ? 1 : clamp((Va - 9) / 5, 0.3, 1);
      return { up: dUp, n: clamp(a / G, 0, 9) * slowK };
    }
    // joystick: stick x = bank angle, stick y = pull / push
    const b = stick.x * 1.3;
    // horizon-level "up" around the current forward axis
    tmpA.set(-f.x * f.y, 1 - f.y * f.y, -f.z * f.y);
    if (tmpA.length() < 0.05) return null;
    tmpA.normalize();
    V3.CrossToRef(tmpA, f, tmpB); // right vector of the level attitude
    dUp.set(tmpA.x * Math.cos(b) + tmpB.x * Math.sin(b), tmpA.y * Math.cos(b) + tmpB.y * Math.sin(b), tmpA.z * Math.cos(b) + tmpB.z * Math.sin(b));
    const pull = -stick.y;
    // speed stability: with the stick centred the bird settles at its gliding speed (~60 km/h)
    const base = F.tuck > 0.5 || F.flapAmp > 0.5 ? 1 : clamp(1 + 0.7 * (Va - 17) / 17, 0.25, 1.6);
    const n = pull >= 0 ? base / Math.max(Math.cos(Math.min(Math.abs(b), 1.2)), 0.35) + pull * 6 : base + pull * 2;
    return { up: dUp, n };
  }

  function mass() { return BASE_MASS + (F.carried ? F.carried.sp.mass * 0.5 : 0); }

  function physicsStep(dt, inp) {
    basis();
    const w = world.updraft(F.pos.x, F.pos.y, F.pos.z, time);
    const vax = F.vel.x, vay = F.vel.y - w, vaz = F.vel.z;
    const Va = Math.hypot(vax, vay, vaz) + 1e-4;
    const nx = vax / Va, ny = vay / Va, nz = vaz / Va;
    const vf = vax * f.x + vay * f.y + vaz * f.z;
    const vu = vax * u.x + vay * u.y + vaz * u.z;
    const vr = vax * r.x + vay * r.y + vaz * r.z;
    const alpha = Math.atan2(-vu, Math.max(vf, 0.5));
    const beta = Math.atan2(vr, Math.max(vf, 0.5));
    const open = 1 - 0.86 * F.tuck;
    const S = S0 * open * (1 + 0.25 * F.brake);
    const qd = 0.5 * RHO * Va * Va * (1 - smoothstep(1400, 2200, F.pos.y) * 0.6);
    const m = mass();

    // lift
    const stallA = 0.30 + 0.12 * F.brake;
    let CL = clamp(CLA * alpha, -0.9, 1.35 + 0.45 * F.brake);
    if (Math.abs(alpha) > stallA) CL *= Math.max(0.35, 1 - (Math.abs(alpha) - stallA) * 2.2);
    const L = clamp(qd * S * CL, -m * G * 6, m * G * 12);   // structural / muscle limit ~12 g
    let lx = u.x - nx * (u.x * nx + u.y * ny + u.z * nz), ly = u.y - ny * (u.x * nx + u.y * ny + u.z * nz), lz = u.z - nz * (u.x * nx + u.y * ny + u.z * nz);
    const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
    // drag
    const CD = 0.018 + 0.055 * CL * CL + 0.32 * F.brake;
    const D = qd * (S * CD + 0.0014 +0.0035 * F.talons + (F.carried ? 0.004 : 0));
    // side force (keeps the bird from skidding)
    const side = -vr * Va * RHO * 0.5 * 0.03;
    // flapping thrust
    let T = 0;
    if (F.flapAmp > 0.05 && F.energy > 0) T = F.flapAmp * Math.min(7.8, 100 / Math.max(Va, 6)) * (1 - F.tuck) * (1 + (F.flapHold > 0 ? 0.3 : 0));

    const ax = (L * lx - D * nx + side * r.x + T * f.x) / m;
    const ay = (L * ly - D * ny + side * r.y + T * (f.y + 0.25)) / m - G;
    const az = (L * lz - D * nz + side * r.z + T * f.z) / m;
    F.vel.x += ax * dt; F.vel.y += ay * dt; F.vel.z += az * dt;
    F.pos.x += F.vel.x * dt; F.pos.y += F.vel.y * dt; F.pos.z += F.vel.z * dt;
    F.gLoad = Math.hypot(ax, ay + G, az) / G;

    const auth = clamp(Va / 13, 0.3, 1.25);
    const yawRate = inp.yaw * 0.9 * auth;
    const bank = Math.asin(clamp(-r.y, -1, 1));
    const alphaFor = (n) => (m * G * n) / Math.max(qd * S * CLA, 0.01);
    let trim;
    const tgt = inp.ctrl !== 'keys' ? attitudeTarget(inp, nx, ny, nz, Va) : null;
    if (inp.ctrl !== 'keys') {
      // attitude control: roll the lift vector onto the wanted direction, set angle of attack for the wanted g
      if (tgt) {
        const pu = V3.Dot(tgt.up, f);
        tmpA.set(tgt.up.x - f.x * pu, tgt.up.y - f.y * pu, tgt.up.z - f.z * pu);
        V3.CrossToRef(u, tmpA, tmpB);
        const err = Math.atan2(V3.Dot(tmpB, f), V3.Dot(u, tmpA));
        rotWorld(f, clamp(err * 5, -lerp(3.4, 2.6, F.tuck), lerp(3.4, 2.6, F.tuck)) * Math.min(auth, 1) * dt);
        // with tucked wings the body stays streamlined (little lift is available anyway)
        trim = clamp(alphaFor(tgt.n), -0.22, stallA - 0.02) * (1 - 0.75 * F.tuck);
        // feed-forward: the nose rotates with the flight path curved by the lift
        rotLocal(AX, -((L / m - G * ly) / Va) * dt);
        F.visRoll = clamp(err, -1, 1); F.visPitch = clamp(tgt.n - 1, -1, 1) * 0.5;
      } else {
        trim = 0; F.visRoll = 0; F.visPitch = 0;
      }
    } else {
      // keyboard: rate control with optional wing leveling
      const pitchRate = inp.pitch * lerp(2.1, 1.3, F.tuck) * auth;
      let rollRate = inp.roll * lerp(3.3, 2.4, F.tuck) * Math.min(auth, 1.1);
      if (settings.autoLevel && Math.abs(inp.roll) < 0.06 && u.y > 0.2) rollRate += clamp(-bank * 1.8, -1.6, 1.6);
      rotLocal(AX, -pitchRate * dt);
      rotLocal(AZ, -rollRate * dt);
      // trimmed for a hands-off glide
      trim = clamp(alphaFor(1) * (S / Math.max(S0 * open, 1e-4)), 0, 0.22) * (1 - F.tuck) * Math.max(0, u.y);
      F.visRoll = inp.roll; F.visPitch = inp.pitch;
    }
    rotLocal(AY, yawRate * dt);
    // aerodynamic stability: the nose weathervanes into the airflow around the commanded angle of attack
    const kp = clamp(Va / 9, 0.4, 3.2) * (1.6 + F.tuck * 1.5);
    rotLocal(AX, (alpha - trim) * kp * dt);
    rotLocal(AY, beta * kp * 1.2 * dt);
    // world boundary: steer back toward the valley
    const bx = Math.abs(F.pos.x) > 1780, bz = Math.abs(F.pos.z) > 1780;
    if (bx || bz) {
      const want = Math.atan2(-F.pos.x, -F.pos.z);
      const cur = Math.atan2(f.x, f.z);
      let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      rotWorld(AY, clamp(d, -1, 1) * 0.9 * dt);
    }
    return { Va, alpha, w, bank };
  }

  // ---------------- per-frame game update ----------------
  const talonLocal = new V3(0, -0.12, 0.05);
  const talon0 = new V3(), talon1 = new V3();
  let lastAero = { Va: 16, alpha: 0, w: 0, bank: 0 };
  let flapSoundT = 0;

  function update(dt) {
    time += dt; stats.time += dt;
    consumeMouse(dt);
    const inp = inputs();
    if (keys.KeyR) { stick.x = 0; stick.y = 0; clearMouse(); }
    zoom = lerp(zoom, inp.zoom ? 1 : 0, expDecay(6, dt));

    if (F.state === 'fly') updateFlying(dt, inp);
    else if (F.state === 'perched') updatePerched(dt, inp);
    else updateCrashed(dt);

    updateFalconVisual(dt, inp);
    prey.update(dt, { pos: F.pos, vel: F.vel, tuck: F.tuck, perched: F.state === 'perched', carryMatrix: F.carryMatrix });
    // swept strike test
    if (F.state === 'fly') {
      talon1.copyFrom(V3.TransformCoordinates(talonLocal, falcon.root.getWorldMatrix()));
      if (F.talons > 0.45 && !F.carried) {
        const bonus = 0.25 + (F.talons > 0.9 ? 0.2 : 0);
        const hit = prey.findCatch(talon0, talon1, bonus);
        if (hit) onCatch(hit);
      }
    }
    // alarm calls when a flock flushes
    for (const fl of prey.flocks) {
      if (fl.alarm > 0 && !fl._called) { fl._called = true; if (FS.V3dist(fl.center, F.pos) < 120) audio.alarm(); }
      if (fl.alarm <= 0) fl._called = false;
    }
    world.update(dt, time);
    updateCamera(dt, inp);
    checkChallenges();
    audio.update(F.state === 'fly' ? lastAero.Va : 0, F.tuck, paused);
  }

  function updateFlying(dt, inp) {
    // wing state
    let tuckTarget = inp.stoop ? 1 : inp.half ? 0.5 : F.wheelTuck;
    if (inp.flap || inp.brake) tuckTarget = 0;
    F.tuck = lerp(F.tuck, tuckTarget, expDecay(inp.stoop ? 4.5 : 3.5, dt));
    F.brake = lerp(F.brake, inp.brake ? 1 : 0, expDecay(5, dt));
    // flapping
    F.flapHold = Math.max(0, F.flapHold - dt);
    const wantFlap = (inp.flap || F.flapHold > 0) && F.energy > 0;
    F.flapAmp = lerp(F.flapAmp, wantFlap ? 1 : 0, expDecay(wantFlap ? 6 : 2.5, dt));
    const slow = clamp((16 - lastAero.Va) / 10, 0, 1);
    F.flapPhase += dt * (4.3 + slow * 1.5) * Math.PI * 2 * (0.25 + 0.75 * F.flapAmp);
    const sgn = Math.sin(F.flapPhase) > 0 ? 1 : -1;
    if (sgn < 0 && F.lastFlapSign > 0 && F.flapAmp > 0.4) audio.flap(F.flapAmp);
    F.lastFlapSign = sgn;
    if (F.flapAmp > 0.05) F.energy = Math.max(0, F.energy - dt * 5 * F.flapAmp);
    F.energy = Math.max(0, F.energy - dt * (0.22 + (F.carried ? 0.25 : 0)));
    if (F.energy <= 0 && inp.flap && msgTimer <= 0) showMsg('Vyčerpání', 'Najdi termiku nebo ulov kořist', 2);

    // targeting & talons
    basis();
    F.target = prey.nearest(F.pos, f, 350, 0.55);
    let autoTalon = false;
    if (F.target) {
      const d = FS.V3dist(F.target.pos, F.pos);
      const closing = -((F.target.vel.x - F.vel.x) * (F.target.pos.x - F.pos.x) + (F.target.vel.y - F.vel.y) * (F.target.pos.y - F.pos.y) + (F.target.vel.z - F.vel.z) * (F.target.pos.z - F.pos.z)) / (d + 1e-3);
      autoTalon = d < Math.max(8, closing * 0.7) && closing > 0;
    }
    F.talons = lerp(F.talons, (inp.talons || autoTalon) && !F.carried ? 1 : 0, expDecay(7, dt));

    talon0.copyFrom(V3.TransformCoordinates(talonLocal, falcon.root.computeWorldMatrix(true)));
    const n = Math.max(1, Math.ceil(dt / 0.006));
    const y0 = F.pos.y;
    for (let i = 0; i < n; i++) lastAero = physicsStep(dt / n, inp);
    // thermal climbing bookkeeping
    if (lastAero.w > 1.0) { F.inThermal = 1; const dy = F.pos.y - y0; if (dy > 0) { stats.thermalClimb += dy; } }
    else F.inThermal = Math.max(0, F.inThermal - dt);

    const kmh = lastAero.Va * 3.6;
    stats.maxKmh = Math.max(stats.maxKmh, F.vel.length() * 3.6);

    // collisions
    const hT = world.heightAt(F.pos.x, F.pos.z);
    const g = Math.max(hT, 0);
    if (F.pos.y < g + 0.08) {
      const V = F.vel.length();
      if (hT < 0.2) return crash('Pád do vody', 'Sokol neumí plavat');
      if (V < 12.5 && F.vel.y > -6 && u.y > 0.3) return land(g, 'ground');
      return crash('Náraz do země', `${Math.round(V * 3.6)} km/h je na přistání moc`);
    }
    const tree = world.treeHit(F.pos.x, F.pos.y, F.pos.z, 0.1);
    if (tree) {
      const V = F.vel.length();
      if (V < 10 && F.pos.y > tree[1] + tree[3] * 0.55) return land(F.pos.y, 'tree');
      return crash('Náraz do stromu', 'Pozor na koruny stromů');
    }
  }

  function land(y, where) {
    F.state = 'perched'; F.stateT = 0; F.perchY = y;
    F.pos.y = y;
    F.vel.set(0, 0, 0);
    // keep heading, drop pitch & roll
    basis();
    const hd = Math.atan2(f.x, f.z);
    Q.RotationYawPitchRollToRef(hd, 0, 0, F.q);
    aim.yaw = hd; aim.pitch = 0;
    F.tuck = 0; F.brake = 0; F.flapAmp = 0; F.talons = 0;
    if (F.carried || F.groundKill) { F.eatT = 0; showMsg(where === 'tree' ? 'Na větvi' : 'Přistání', 'Hoduješ…', 1.5); }
    else showMsg(where === 'tree' ? 'Usedl jsi na strom' : 'Přistání', 'Mezerník = vzlet', 1.5);
  }

  function updatePerched(dt, inp) {
    F.stateT += dt;
    const yawKeys = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + ((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0));
    basis();
    if (settings.mouseMode === 'aim') {
      // turn on the spot to face the mouse direction
      if (yawKeys) aim.yaw += yawKeys * 1.6 * dt;
      let d = aim.yaw - Math.atan2(f.x, f.z);
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      rotWorld(AY, clamp(d, -1, 1) * 4 * dt);
    } else {
      const yaw = yawKeys + stick.x * 0.8;
      if (Math.abs(yaw) > 0.02) rotLocal(AY, yaw * 1.6 * dt);
    }
    const meal = F.carried || F.groundKill;
    const atNest = FS.V3dist(F.pos, new V3(world.nest.x, world.nest.y, world.nest.z)) < 25;
    if (meal) {
      F.eatT += dt;
      F.energy = Math.min(100, F.energy + dt * meal.sp.food / 4);
      if (F.groundKill) burstFeathers(F.groundKill.pos.add(new V3(0, 0.1, 0)), meal.sp.color, Math.random() < dt * 4 ? 2 : 0);
      if (F.eatT > 4) {
        const bonus = Math.round(meal.sp.food * 3 * (atNest ? 2 : 1));
        stats.score += bonus;
        if (atNest) { stats.nestMeals++; showMsg('Hostina v hnízdě!', `+${bonus} bodů (bonus ×2)`, 2.5); audio.chime(); }
        else showMsg('Nasycen', `+${bonus} bodů`, 2);
        prey.remove(meal);
        F.carried = null; F.groundKill = null;
      }
    } else {
      F.energy = Math.min(Math.max(F.energy, 0) + dt * 3, Math.max(F.energy, 60));
    }
    setText(ui.hint, 'hint', meal ? `Hoduješ – ${meal.sp.name}${atNest ? ' (v hnízdě ×2)' : ''}` : 'Mezerník – vzlet · A/D – otočit se');
    if (inp.flap && F.stateT > 0.4 && !(meal && F.eatT < 4)) {
      // take off
      basis();
      F.state = 'fly';
      F.vel.set(f.x * 7, 4.5, f.z * 7);
      F.pos.y += 0.3;
      F.flapHold = 1.0;
      Q.RotationYawPitchRollToRef(Math.atan2(f.x, f.z), -0.35, 0, F.q);
      aim.yaw = Math.atan2(f.x, f.z); aim.pitch = 0.2;
      F.energy = Math.max(0, F.energy - 2);
      setText(ui.hint, 'hint', '');
    }
  }

  function crash(title, sub) {
    F.state = 'crashed'; F.stateT = 0;
    stats.crashes++;
    audio.crash();
    burstFeathers(F.pos, '#566070', 60);
    burstDust(F.pos, 50);
    flash('#a33', 0.35);
    showMsg(title, sub, 2.5);
    if (F.carried) { prey.remove(F.carried); F.carried = null; }
    F.groundKill = null;
    F.crashVel = F.vel.clone();
    const g = world.groundAt(F.pos.x, F.pos.z);
    F.pos.y = Math.max(F.pos.y, g + 0.1);
    F.vel.set(0, 0, 0);
  }
  function updateCrashed(dt) {
    F.stateT += dt;
    if (F.stateT > 2.6) {
      // respawn: back up along the approach path, some altitude
      const back = F.crashVel && F.crashVel.length() > 1 ? F.crashVel.normalizeToNew() : new V3(0, 0, 1);
      F.pos.x -= back.x * 120; F.pos.z -= back.z * 120;
      F.pos.x = clamp(F.pos.x, -1700, 1700); F.pos.z = clamp(F.pos.z, -1700, 1700);
      F.vel.set(back.x, 0, back.z);
      if (F.vel.length() < 0.1) F.vel.set(0, 0, 1);
      spawnFalcon(false);
      F.energy = Math.max(10, F.energy - 12);
      stats.combo = 0;
    }
  }

  function onCatch(m) {
    const V = F.vel.length();
    const kmh = V * 3.6;
    const onGround = m.sp.kind === 'mammal' || m.state === 'graze';
    if (onGround && kmh > 150) {
      m.alarm = 5; // it escapes
      return crash('Příliš rychle!', `Na zem se útočí pod 150 km/h (${Math.round(kmh)} km/h)`);
    }
    audio.strike();
    setTimeout(() => audio.cry(), 250);
    burstFeathers(m.pos, m.sp.color, m.sp.kind === 'mammal' ? 12 : 55);
    if (m.sp.kind === 'mammal') burstDust(m.pos, 30);
    flash('#fff', 0.25);
    // score
    const stoop = F.tuck > 0.6 || kmh > 160;
    stats.combo = time - stats.lastCatch < 120 ? stats.combo + 1 : 1;
    stats.lastCatch = time;
    const comboMul = Math.min(2.5, 1 + (stats.combo - 1) * 0.25);
    const pts = Math.round(m.sp.points * (1 + kmh / 200) * (stoop ? 1.4 : 1) * comboMul);
    stats.score += pts;
    stats.catches++;
    stats.species[m.key]++;
    if (!onGround && kmh > 150) stats.fastAirCatch = true;
    showMsg(`${m.sp.name}!`, `+${pts} bodů · ${Math.round(kmh)} km/h${stoop ? ' · střemhlavý úder' : ''}${comboMul > 1 ? ` · série ×${comboMul.toFixed(2)}` : ''}`, 2.8);
    if (onGround) {
      prey.kill(m, 'dead');
      F.groundKill = m;
      // stand just behind the prey, facing it
      const hx = m.pos.x - F.pos.x, hz = m.pos.z - F.pos.z, hl = Math.hypot(hx, hz) || 1;
      const off = m.key === 'hare' ? 0.42 : m.key === 'vole' ? 0.12 : 0.32;
      F.pos.x = m.pos.x - (hx / hl) * off; F.pos.z = m.pos.z - (hz / hl) * off;
      Q.RotationYawPitchRollToRef(Math.atan2(hx, hz), 0, 0, F.q);
      land(world.groundAt(m.pos.x, m.pos.z), 'ground');
    } else {
      prey.kill(m, 'carried');
      F.carried = m;
      F.flapHold = 0.5;
    }
  }

  function dropPrey() {
    const m = F.carried;
    F.carried = null;
    prey.remove(m);
    burstFeathers(F.pos, m.sp.color, 15);
    showMsg('Kořist upuštěna', '', 1.2);
  }

  // ---------------- falcon visuals ----------------
  const tmpV = new V3();
  function updateFalconVisual(dt, inp) {
    const root = falcon.root;
    root.position.copyFrom(F.pos);
    root.rotationQuaternion.copyFrom(F.q);
    F.perched = lerp(F.perched, F.state === 'perched' ? 1 : 0, expDecay(6, dt));
    // head tracks the target
    if (F.target && F.state === 'fly') {
      const inv = M.Invert(root.computeWorldMatrix(true));
      const lp = V3.TransformCoordinates(F.target.pos, inv);
      F.look.yaw = Math.atan2(lp.x, lp.z);
      F.look.pitch = -Math.atan2(lp.y, Math.hypot(lp.x, lp.z));
    } else { F.look.yaw *= 0.95; F.look.pitch *= 0.95; }
    const crashed = F.state === 'crashed';
    falcon.pose.rotation.z = crashed ? 1.3 : 0;
    falcon.update(dt, {
      tuck: crashed ? 0.3 : F.tuck, flapPhase: F.flapPhase, flapAmp: F.state === 'perched' ? 0 : F.flapAmp,
      roll: F.state === 'fly' ? clamp(F.visRoll || 0, -1, 1) : 0, pitch: F.state === 'fly' ? clamp(F.visPitch || 0, -1, 1) : 0, yaw: inp.yaw,
      brake: F.brake, talons: F.talons, perched: F.perched, look: F.look, bank: -lastAero.bank * (F.state === 'fly' ? 1 : 0),
      slow: clamp((14 - lastAero.Va) / 8, 0, 1), eat: F.state === 'perched' && (F.carried || F.groundKill) ? 1 : 0,
    });
    falcon.root.computeWorldMatrix(true);
    falcon.pose.computeWorldMatrix(true);
    falcon.body.computeWorldMatrix(true);
    F.carryMatrix = falcon.carryNode.computeWorldMatrix(true);
    // shadow frustum follows the falcon
    sun.position.copyFrom(F.pos.subtract(world.sunDir.scale(150)));
  }

  // ---------------- camera ----------------
  const camQ = new Q();
  const lqM = new M(), lqR = new V3(), lqU = new V3();
  // orientation looking along fw with the given up hint (yaw-pitch-roll, Babylon LH convention)
  function lookQuat(fw, up, out) {
    const yaw = Math.atan2(fw.x, fw.z);
    const pitch = -Math.asin(clamp(fw.y, -1, 1));
    Q.RotationYawPitchRollToRef(yaw, pitch, 0, out);
    out.toRotationMatrix(lqM);
    V3.TransformNormalToRef(AX, lqM, lqR);
    V3.TransformNormalToRef(AY, lqM, lqU);
    const roll = -Math.atan2(V3.Dot(up, lqR), V3.Dot(up, lqU));
    Q.RotationYawPitchRollToRef(yaw, pitch, roll, out);
    return out;
  }
  let camLookS = null, camUpS = null;
  function updateCamera(dt, inp) {
    basis();
    const V = F.vel.length();
    const vdir = V > 3 && F.state === 'fly' ? F.vel.scale(1 / V) : new V3(f.x, 0, f.z).normalize();
    let look = f.scale(0.45).add(vdir.scale(0.55)).normalize();
    const worldUp = V3.Up();
    const sp = clamp((V - 15) / 70, 0, 1);
    let desired, target, up = worldUp.scale(0.65).add(u.scale(0.35)).normalize();
    const aimMode = settings.mouseMode === 'aim' && F.state === 'fly';
    if (aimMode) {
      // the camera looks where the mouse points; the falcon swings into that direction
      updateAimDir();
      look = aimDir.scale(0.8).add(look.scale(0.2)).normalize();
      up = worldUp.scale(0.85).add(u.scale(0.15)).normalize();
    }
    if (F.state !== 'fly') { up = worldUp; }
    // smooth the viewing direction and the horizon tilt so small corrections of the bird don't shake the view
    if (!camLookS) { camLookS = look.clone(); camUpS = up.clone(); }
    V3.LerpToRef(camLookS, look, expDecay(aimMode ? 18 : 6, dt), camLookS); camLookS.normalize();
    V3.LerpToRef(camUpS, up, expDecay(3, dt), camUpS); camUpS.normalize();
    look = camLookS; up = camUpS;
    if (camMode === 0 || camMode === 1) {
      const dist = camMode === 0 ? 2.25 + sp * 1.3 + (F.state === 'perched' ? 0.6 : 0) : 1.2 + sp * 0.4;
      const h = camMode === 0 ? 0.48 : 0.24;
      desired = F.pos.subtract(look.scale(dist)).add(up.scale(h));
      if (F.state === 'crashed') desired = F.pos.add(new V3(3, 2.5, 3));
      const rate = (aimMode ? 10 : 7) + V * 0.12;
      V3.LerpToRef(camPos, desired, expDecay(rate, dt), camPos);
      // keep the chase distance from stretching at high speed
      const off = camPos.subtract(F.pos); const ol = off.length();
      if (ol > dist * 1.6) camPos.copyFrom(F.pos.add(off.scale((dist * 1.6) / ol)));
      target = F.pos.add(look.scale(camMode === 0 ? 4 : 2)).add(up.scale(0.15));
    } else if (camMode === 2) {
      const headPos = V3.TransformCoordinates(new V3(0, 0.1, 0.32), falcon.root.computeWorldMatrix(true));
      camPos.copyFrom(headPos);
      target = headPos.add(f.scale(10));
      up = worldUp.scale(0.4).add(u.scale(0.6)).normalize();
    } else {
      const a = time * 0.25;
      const R = F.state === 'fly' ? 3.4 : 1.5;
      desired = F.pos.add(new V3(Math.sin(a) * R, (1.8 + Math.sin(a * 0.7)) * R / 6 + 0.15, Math.cos(a) * R));
      V3.LerpToRef(camPos, desired, expDecay(3 + V * 0.15, dt), camPos);
      target = F.pos;
    }
    const g = world.groundAt(camPos.x, camPos.z);
    if (camPos.y < g + 0.35) camPos.y = g + 0.35;
    // subtle buffeting at high speed
    const shake = Math.max(0, V - 50) * 0.00025 * (camMode === 2 ? 0.3 : 1);
    cam.position.set(camPos.x + Math.sin(time * 23.1) * shake, camPos.y + Math.sin(time * 19.7 + 1) * shake, camPos.z + Math.sin(time * 27.3 + 2) * shake);
    const fw = target.subtract(cam.position).normalize();
    lookQuat(fw, up, camQ);
    cam.rotationQuaternion.copyFrom(camQ);
    const baseFov = 0.92 + sp * 0.32;
    cam.fov = lerp(cam.fov, lerp(baseFov, 0.33, zoom), expDecay(5, dt));
    pp.chromaticAberration.aberrationAmount = clamp((V - 50) * 0.08, 0, 4) * (camMode === 3 ? 0 : 1);
  }

  // ---------------- challenges ----------------
  function checkChallenges() {
    for (const c of CHALLENGES) {
      if (!done.has(c.id) && c.ok(stats)) {
        done.add(c.id);
        toast(`Výzva splněna: <b>${c.t}</b><br><small>${c.d}</small>`);
        audio.chime();
        stats.score += 100;
      }
    }
  }

  // ---------------- HUD ----------------
  const markerPool = [];
  function marker(i) {
    if (!markerPool[i]) {
      const d = document.createElement('div'); d.className = 'mk';
      const l = document.createElement('div'); l.className = 'lab'; d.appendChild(l);
      ui.markers.appendChild(d); markerPool[i] = { d, l };
    }
    return markerPool[i];
  }
  const fxCtx = ui.fx.getContext('2d');
  const streaks = [];
  let miniT = 0;
  function project(p) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const s = V3.Project(p, M.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    return s;
  }
  function updateHUD(dt) {
    const V = F.vel.length();
    const kmh = Math.round((F.state === 'fly' ? V : 0) * 3.6);
    setText(ui.spd, 'spd', String(kmh));
    const g = world.groundAt(F.pos.x, F.pos.z);
    setText(ui.agl, 'agl', Math.max(0, Math.round(F.pos.y - g)) + ' m');
    setText(ui.vs, 'vs', (F.state === 'fly' ? F.vel.y : 0).toFixed(1) + ' m/s');
    const wingTxt = F.state !== 'fly' ? 'složená' : F.brake > 0.5 ? 'brzdění' : F.tuck > 0.8 ? 'přitisknutá – střemhlav' : F.flapAmp > 0.4 ? 'mávání' : F.tuck > 0.35 ? 'napůl složená' : 'rozepjatá';
    setText(ui.wing, 'wing', wingTxt);
    setText(ui.score, 'score', String(stats.score));
    setText(ui.catches, 'catches', String(stats.catches));
    const comboMul = time - stats.lastCatch < 120 && stats.combo > 0 ? Math.min(2.5, 1 + stats.combo * 0.25) : 1;
    setText(ui.combo, 'combo', '×' + comboMul.toFixed(2));
    setText(ui.carry, 'carry', F.carried ? `V pařátech: ${F.carried.sp.name} – přistaň a sněz ji (G = pustit)` : '');
    const e = Math.round(F.energy);
    setText(ui.energyTxt, 'energyTxt', String(e));
    if (cache.energyW !== e) { cache.energyW = e; ui.energy.style.width = e + '%'; ui.energy.style.background = e < 20 ? '#d9503f' : ''; }
    const th = lastAero.w;
    setText(ui.thermal, 'thermal', F.state === 'fly' && th > 0.6 ? `Termika ↑ ${th.toFixed(1)} m/s – krouž v ní` : F.state === 'fly' && th < -0.3 ? `Klesavý proud ↓ ${(-th).toFixed(1)} m/s` : '');
    if (F.state === 'fly') {
      let hint = '';
      if (F.target) {
        const d = FS.V3dist(F.target.pos, F.pos);
        const ground = F.target.sp.kind === 'mammal' || F.target.state === 'graze';
        if (ground && d < 150 && kmh > 150) hint = 'Na pozemní kořist zpomal pod 150 km/h (F = brzdit)';
      }
      if (Math.abs(F.pos.x) > 1700 || Math.abs(F.pos.z) > 1700) hint = 'Opouštíš loviště – vracíš se do údolí';
      setText(ui.hint, 'hint', hint);
    } else if (F.state === 'crashed') setText(ui.hint, 'hint', '');
    // virtual stick
    ui.stickDot.style.transform = `translate(${stick.x * 46}px, ${stick.y * 46 * (settings.invertY ? -1 : 1)}px)`;
    // message fade
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) ui.msg.style.opacity = 0; }

    // flight-path marker
    const cw = canvas.clientWidth, chh = canvas.clientHeight;
    const cf = cam.getDirection(V3.Forward());
    if (F.state === 'fly' && V > 3 && camMode !== 3) {
      const p = F.pos.add(F.vel.scale(60 / V));
      if (V3.Dot(p.subtract(cam.position), cf) > 0) {
        const s = project(p);
        ui.fpm.style.display = ''; ui.fpm.style.left = s.x + 'px'; ui.fpm.style.top = s.y + 'px';
      } else ui.fpm.style.display = 'none';
    } else ui.fpm.style.display = 'none';

    // mouse-aim reticle
    const aimOn = settings.mouseMode === 'aim' && F.state === 'fly' && camMode !== 3;
    ui.stick.style.display = settings.mouseMode === 'aim' ? 'none' : '';
    if (aimOn) {
      updateAimDir();
      const p = F.pos.add(aimDir.scale(80));
      if (V3.Dot(p.subtract(cam.position), cf) > 0) {
        const s = project(p);
        ui.aim.style.display = ''; ui.aim.style.left = s.x + 'px'; ui.aim.style.top = s.y + 'px';
      } else ui.aim.style.display = 'none';
    } else ui.aim.style.display = 'none';

    // prey markers
    let mi = 0;
    if (settings.markers || zoom > 0.5) {
      const range = lerp(260, 900, zoom);
      for (const m of prey.list) {
        if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
        const dx = m.pos.x - cam.position.x, dy = m.pos.y - cam.position.y, dz = m.pos.z - cam.position.z;
        const d = Math.hypot(dx, dy, dz);
        const isT = m === F.target;
        if (d > range && !isT) continue;
        if ((dx * cf.x + dy * cf.y + dz * cf.z) / d < 0.3) continue;
        if (mi >= 60) break;
        const s = project(m.pos);
        if (s.x < -20 || s.y < -20 || s.x > cw + 20 || s.y > chh + 20) continue;
        const mk = marker(mi++);
        mk.d.style.display = '';
        mk.d.className = isT ? 'mk target' : 'mk';
        mk.d.style.left = s.x + 'px'; mk.d.style.top = s.y + 'px';
        mk.d.style.borderColor = m.sp.color;
        const lab = isT || zoom > 0.5 ? `${m.sp.name} ${Math.round(FS.V3dist(m.pos, F.pos))} m` : '';
        if (mk.l.textContent !== lab) mk.l.textContent = lab;
      }
      // eyrie marker
      const np = new V3(world.nest.x, world.nest.y + 1, world.nest.z);
      const nd = FS.V3dist(np, cam.position);
      if (V3.Dot(np.subtract(cam.position), cf) > 0 && (F.carried || nd < 1500)) {
        const s = project(np);
        const mk = marker(mi++);
        mk.d.style.display = ''; mk.d.className = 'mk nest'; mk.d.style.borderColor = '';
        mk.d.style.left = s.x + 'px'; mk.d.style.top = s.y + 'px';
        const lab = `Hnízdo ${Math.round(FS.V3dist(np, F.pos))} m`;
        if (mk.l.textContent !== lab) mk.l.textContent = lab;
      }
    }
    for (let i = mi; i < markerPool.length; i++) markerPool[i].d.style.display = 'none';

    // speed streaks
    // resize the overlay only when needed (re-assigning width every frame reallocates it and stutters)
    const W = ui.fx.clientWidth, H = ui.fx.clientHeight;
    if (ui.fx.width !== W || ui.fx.height !== H) { ui.fx.width = W; ui.fx.height = H; }
    fxCtx.clearRect(0, 0, W, H);
    const inten = F.state === 'fly' ? clamp((V - 32) / 50, 0, 1) : 0;
    if (inten > 0 && camMode !== 3) {
      const cx = W / 2, cy = H / 2;
      while (streaks.length < 70) streaks.push({ a: Math.random() * 6.283, r: 0.3 + Math.random() * 0.7, l: 0.05 + Math.random() * 0.15, s: 0.8 + Math.random() * 1.5 });
      fxCtx.lineWidth = 1.5;
      for (const st of streaks) {
        st.r += dt * st.s * (0.8 + inten * 2);
        if (st.r > 1.3) { st.r = 0.25 + Math.random() * 0.3; st.a = Math.random() * 6.283; }
        const R = Math.max(W, H) * 0.5;
        const x1 = cx + Math.cos(st.a) * st.r * R, y1 = cy + Math.sin(st.a) * st.r * R;
        const x2 = cx + Math.cos(st.a) * (st.r + st.l) * R, y2 = cy + Math.sin(st.a) * (st.r + st.l) * R;
        fxCtx.strokeStyle = `rgba(255,255,255,${0.22 * inten * Math.min(1, st.r)})`;
        fxCtx.beginPath(); fxCtx.moveTo(x1, y1); fxCtx.lineTo(x2, y2); fxCtx.stroke();
      }
    }
    // minimap
    miniT -= dt;
    if (miniT <= 0) { miniT = 0.1; drawMinimap(); }
  }

  function drawMinimap() {
    const c = ui.mini, ctx = c.getContext('2d');
    const S = c.width, R = 1400; // metres shown across
    const img = world.minimap, IS = img.width;
    const toImg = (x, z) => [((x + world.half) / world.size) * IS, ((world.half - z) / world.size) * IS];
    const [ix, iy] = toImg(F.pos.x, F.pos.z);
    const span = (R / world.size) * IS;
    ctx.fillStyle = '#243038'; ctx.fillRect(0, 0, S, S);
    ctx.drawImage(img, ix - span / 2, iy - span / 2, span, span, 0, 0, S, S);
    const toMap = (x, z) => [S / 2 + ((x - F.pos.x) / R) * S, S / 2 - ((z - F.pos.z) / R) * S];
    // thermals
    ctx.strokeStyle = 'rgba(255,230,140,0.8)'; ctx.lineWidth = 1.2;
    for (const t of world.thermals) {
      const [x, y] = toMap(t.x, t.z);
      if (x < -20 || y < -20 || x > S + 20 || y > S + 20) continue;
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, (t.radius / R) * S), 0, 7); ctx.stroke();
    }
    // prey (only within falcon's sight)
    for (const m of prey.list) {
      if (!m.alive || m.hidden || m.state === 'carried' || m.state === 'dead') continue;
      if (Math.abs(m.pos.x - F.pos.x) > 450 || Math.abs(m.pos.z - F.pos.z) > 450) continue;
      const [x, y] = toMap(m.pos.x, m.pos.z);
      ctx.fillStyle = m.sp.color; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // nest
    const [nx, ny] = toMap(world.nest.x, world.nest.z);
    const cx = clamp(nx, 6, S - 6), cy = clamp(ny, 6, S - 6);
    ctx.fillStyle = '#ffd27a'; ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    // falcon arrow
    basis();
    const hd = Math.atan2(f.x, f.z);
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(hd);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '11px sans-serif'; ctx.fillText('S', S / 2 - 3, 11);
  }

  FS.V3dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  // ---------------- main loop ----------------
  let idleT = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (falcon) {
      if (playing && !paused) { update(dt); updateHUD(dt); }
      else {
        // attract mode behind the menu: slow orbit around the falcon
        idleT += dt;
        world.update(dt, time + idleT);
        falcon.root.position.copyFrom(F.pos);
        falcon.root.rotationQuaternion.copyFrom(F.q);
        F.flapPhase += dt * 2.2;
        const dbgPose = FS.debug && FS.debug.pose;
        if (dbgPose) F.flapPhase = dbgPose.flapPhase ?? F.flapPhase;
        falcon.update(dt, Object.assign({ tuck: 0, flapPhase: F.flapPhase, flapAmp: 0.35 + 0.35 * Math.sin(idleT * 0.4), roll: 0, pitch: 0, yaw: 0, brake: 0, talons: 0, perched: 0, look: { yaw: Math.sin(idleT * 0.5) * 0.5, pitch: 0.2 }, bank: 0, slow: 0.3 }, dbgPose || {}));
        sun.position.copyFrom(F.pos.subtract(world.sunDir.scale(150)));
        if (!playing) {
          const hold = FS.debug && FS.debug.view;
          const a = hold ? hold[0] : idleT * 0.18 + 2.2;
          const dist = hold ? hold[2] : 1.6;
          cam.position.set(F.pos.x + Math.sin(a) * dist, F.pos.y + (hold ? hold[1] : 0.35), F.pos.z + Math.cos(a) * dist);
          lookQuat(F.pos.add(new V3(0, 0.02, 0)).subtract(cam.position).normalize(), V3.Up(), camQ);
          cam.rotationQuaternion.copyFrom(camQ);
          cam.fov = 0.8;
        }
        audio.update(0, 0, true);
      }
    }
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());

  // build after first paint so the menu is visible while generating
  setTimeout(() => {
    try { init(); } catch (e) { console.error(e); $('loading').textContent = 'Chyba při inicializaci: ' + e.message; }
  }, 50);

  FS.debug = {
    F, stats, scene, keys, stick, aim, mouse(dx, dy) { pend.x += dx; pend.y += dy; }, shadowGen: () => shadowGen, world: () => world, prey: () => prey, falcon: () => falcon, cam, setCam: (m) => (camMode = m),
    // advance the simulation manually (for automated testing while rendering is throttled)
    step(n = 60, dt = 1 / 60, render = true) {
      for (let i = 0; i < n; i++) { update(dt); updateHUD(dt); }
      if (render) scene.render();
      return { pos: F.pos.asArray().map((v) => +v.toFixed(1)), kmh: +(F.vel.length() * 3.6).toFixed(0), vy: +F.vel.y.toFixed(2), state: F.state, energy: +F.energy.toFixed(0), tuck: +F.tuck.toFixed(2) };
    },
  };
})(window.FS);
