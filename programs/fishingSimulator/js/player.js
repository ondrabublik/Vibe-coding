'use strict';
// Hráč: kamera z první osoby, pointer lock, myš a klávesnice, chůze s kolizemi.
(function (FS) {
  const U = FS.U, W = FS.World;
  const V3 = THREE.Vector3;
  const P = {
    yaw: 0.12, pitch: -0.12, pos: new V3(3.2, 0, -0.4), locked: false, bob: 0,
    input: { lmb: false, rmb: false, dx: 0, dy: 0, lmbPressed: false }, keys: {},
    moveAxis: { x: 0, y: 0 }, // analogová chůze (joystick na mobilu, šipky na TV)
    vel: new V3(), bobAmp: 0, eyeY: null, // plynulý rozjezd, doznívání kroku, vyhlazená výška očí
  };
  FS.Player = P;

  P.init = function (camera, canvas) {
    P.camera = camera; P.canvas = canvas;
    canvas.addEventListener('mousedown', (e) => {
      if (FS.Shop.open) {
        if (e.button === 0) FS.UI.shopSelect(FS.Shop.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
        return;
      }
      if (FS.UI.modal) return;
      if (!P.active()) { P.lock(); return; }
      if (e.button === 0) { P.input.lmb = true; P.input.lmbPressed = true; }
      if (e.button === 2) P.input.rmb = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) P.input.lmb = false;
      if (e.button === 2) P.input.rmb = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      // na TV by ukazovátko Magic Remote točilo kamerou při každém pohybu ruky
      if (P.active() && !FS.Device.tv) {
        // Chrome na Windows při zamčeném kurzoru občas pošle nesmyslně velký skok – zahodit
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
        const s = FS.Game.state.settings.sens;
        P.input.dx += e.movementX * s; P.input.dy += e.movementY * s;
      } else if (FS.Shop.open && e.target === canvas) {
        const it = FS.Shop.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        FS.UI.shopHover(it, e.clientX, e.clientY);
        canvas.style.cursor = it ? 'pointer' : 'default';
      }
    });
    canvas.addEventListener('wheel', (e) => { if (P.active()) { FS.Fishing.onWheel(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      P.locked = document.pointerLockElement === canvas;
      if (!P.locked) { P.input.lmb = P.input.rmb = false; }
      document.getElementById('pause').style.display = !P.locked && !P.fallback && !FS.UI.modal && P.started ? 'flex' : 'none';
    });
    // když prohlížeč zamčení kurzoru nepovolí, hraje se s volným kurzorem
    document.addEventListener('pointerlockerror', () => { P.fallback = true; });
    document.getElementById('pause').addEventListener('click', () => P.lock());
    window.addEventListener('keydown', (e) => {
      if (FS.Controls.onKeyDown(e)) return;
      const k = e.code;
      if (k === 'Tab') e.preventDefault();
      if (!P.started) return;
      if (FS.UI.modal === 'catch') return;
      if (k === 'Escape') {
        if (FS.Shop.open) FS.Shop.leave();
        else if (FS.UI.modal) FS.UI.closePanel();
        return;
      }
      if (FS.Shop.open) { if (k === 'KeyE') FS.Shop.leave(); return; }
      if (k === 'Tab' || k === 'KeyI') { FS.UI.openPanel('gear'); return; }
      if (k === 'KeyJ') { FS.UI.openPanel('journal'); return; }
      if (k === 'KeyH') { FS.UI.openPanel('help'); return; }
      if (FS.UI.modal) return;
      P.keys[k] = true;
      if (k === 'KeyE' && FS.Shop.nearPlayer()) FS.Shop.enter();
      if (k === 'KeyF') FS.Fishing.throwGroundbait();
      if (/^(Digit|Numpad)[1-5]$/.test(k)) FS.Fishing.setReelLevel(+k.slice(-1));
      if (k === 'Equal' || k === 'NumpadAdd') FS.Fishing.setReelLevel(FS.Fishing.reelLevel + 1);
      if (k === 'Minus' || k === 'NumpadSubtract') FS.Fishing.setReelLevel(FS.Fishing.reelLevel - 1);
    });
    window.addEventListener('keyup', (e) => { if (!FS.Controls.onKeyUp(e)) P.keys[e.code] = false; });
    window.addEventListener('blur', () => { P.keys = {}; P.input.lmb = P.input.rmb = false; });
  };

  P.lock = function () {
    if (P.locked) return;
    if (FS.Device.touch || FS.Device.tv) { P.fallback = true; return; }
    // nezpracovaný pohyb myši (bez akcelerace systému) – rovnoměrnější otáčení; kde ho prohlížeč neumí, bez něj
    const plain = () => { try { const r = P.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { P.fallback = true; } };
    try {
      const r = P.canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); });
    } catch (e) { plain(); }
    setTimeout(() => { if (!P.locked && P.started && !FS.UI.modal) P.fallback = true; }, 400);
  };
  // přijímá hra právě vstup myši?
  P.active = () => P.locked || (P.fallback && P.started && !FS.UI.modal && !FS.Shop.open);
  P.unlock = function () {
    if (document.pointerLockElement) document.exitPointerLock();
    P.input.lmb = P.input.rmb = false;
  };

  function walkable(x, z) {
    const h = W.heightAt(x, z);
    if (h < 0.04) return false;
    if (W.fenceDist(x, z) > -0.6) { P.atFence = true; return false; }
    for (const c of W.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.25) ** 2) return false;
    return true;
  }

  P.update = function (dt) {
    const inp = P.input, cam = P.camera;
    if (FS.Shop.open || FS.UI.modal === 'catch') { P.vel.set(0, 0, 0); return; }
    if (!inp.lmb && P.active()) {
      P.yaw -= inp.dx * 0.0022;
      P.pitch = U.clamp(P.pitch - inp.dy * 0.0022, -1.25, 1.0);
    } else if (P.active() && FS.Fishing.state === 'casting') {
      P.yaw -= inp.dx * 0.0022; // při nahazování se míří do stran
    }
    // chůze
    let mx = 0, mz = 0;
    if (!FS.UI.modal) {
      if (P.keys.KeyW || P.keys.ArrowUp) mz += 1;
      if (P.keys.KeyS || P.keys.ArrowDown) mz -= 1;
      if (P.keys.KeyA || P.keys.ArrowLeft) mx -= 1;
      if (P.keys.KeyD || P.keys.ArrowRight) mx += 1;
    }
    const analog = !mx && !mz && !FS.UI.modal && (P.moveAxis.x || P.moveAxis.y);
    if (analog) { mx = P.moveAxis.x; mz = P.moveAxis.y; }
    const moving = mx || mz;
    // cílová rychlost; skutečná se k ní plynule blíží (rozjezd i zastavení ~0,2 s místo skoku)
    let tx = 0, tz = 0;
    if (moving) {
      const l = Math.hypot(mx, mz);
      const fight = FS.Fishing.state === 'fight';
      let sp = (P.keys.ShiftLeft || P.keys.ShiftRight) && !fight ? 4.6 : fight ? 1.1 : 2.3;
      // joystick na mobilu: rychlost podle výchylky, plná výchylka = běh
      if (analog && FS.Device.touch) sp = (fight ? 1.1 : 4.6) * Math.min(1, l);
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      tx = (fx * mz + rx * mx) / l * sp; tz = (fz * mz + rz * mx) / l * sp;
    }
    const k = 1 - Math.exp(-dt * 14);
    P.vel.x += (tx - P.vel.x) * k; P.vel.z += (tz - P.vel.z) * k;
    const speed = Math.hypot(P.vel.x, P.vel.z);
    if (speed < 0.02 && !moving) P.vel.x = P.vel.z = 0;
    if (speed > 0) {
      const vx = P.vel.x * dt, vz = P.vel.z * dt;
      P.atFence = false;
      if (walkable(P.pos.x + vx, P.pos.z + vz)) { P.pos.x += vx; P.pos.z += vz; }
      else if (walkable(P.pos.x + vx, P.pos.z)) { P.pos.x += vx; P.vel.z = 0; }
      else if (walkable(P.pos.x, P.pos.z + vz)) { P.pos.z += vz; P.vel.x = 0; }
      else P.vel.x = P.vel.z = 0;
      P.bob += dt * speed * 2.6;
      const now = FS.uniforms.uTime.value;
      if (P.atFence && moving && !(now < P.fenceToastT)) {
        P.fenceToastT = now + 8;
        FS.UI.toast('Tady končí revír – dál se nechodí.', 2200);
      }
    }
    const gh = W.heightAt(P.pos.x, P.pos.z);
    P.pos.y = gh;
    // výška očí vyhlazená přes drobné nerovnosti terénu (velký skok – teleport – hned)
    if (P.eyeY === null || Math.abs(gh - P.eyeY) > 0.6) P.eyeY = gh;
    else P.eyeY += (gh - P.eyeY) * (1 - Math.exp(-dt * 12));
    // pohupování při chůzi plynule nabíhá a doznívá
    P.bobAmp += ((speed > 0.3 ? 1 : 0) - P.bobAmp) * (1 - Math.exp(-dt * 6));
    const bobY = Math.sin(P.bob) * 0.035 * P.bobAmp;
    cam.position.set(P.pos.x, P.eyeY + 1.68 + bobY, P.pos.z);
    cam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  };

  P.endFrame = function () {
    P.input.dx = 0; P.input.dy = 0; P.input.lmbPressed = false;
  };
})(window.FS);
