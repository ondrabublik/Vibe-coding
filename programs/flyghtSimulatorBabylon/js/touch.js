'use strict';
// On-screen touch controls for phones and tablets (Pointer Events, so they also work with a mouse
// for testing: add ?touch=1 to the URL; ?touch=0 forces them off).
(function (BW) {
  const $ = (id) => document.getElementById(id);

  BW.isTouch = function () {
    const q = location.search;
    if (/[?&]touch=0/.test(q)) return false;
    if (/[?&]touch=1/.test(q)) return true;
    const mm = (s) => window.matchMedia && window.matchMedia(s).matches;
    return mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && mm('(hover: none)'));
  };

  class TouchControls {
    constructor(game) {
      this.g = game;
      this.el = {};
      ['touch', 'tAim', 'tAimHint', 'tStick', 'tKnob', 'tThrottle', 'tThrFill', 'tThrVal', 'tFire', 'tBrake', 'tCam', 'tPause', 'tFull']
        .forEach((id) => (this.el[id] = $(id)));
      const g = game, t = g.touch, el = this.el;

      // Hold-type buttons (fire, brake): active while a finger is on them.
      const hold = (node, key) => {
        const on = (e) => { e.preventDefault(); node.setPointerCapture(e.pointerId); t[key] = true; node.classList.add('on'); };
        const off = () => { t[key] = false; node.classList.remove('on'); };
        node.addEventListener('pointerdown', on);
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => node.addEventListener(ev, off));
      };
      hold(el.tFire, 'fire');
      hold(el.tBrake, 'brake');
      const tap = (node, fn) => node.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
      tap(el.tCam, () => g.toggleCamera());
      tap(el.tPause, () => g.setPaused(true));
      tap(el.tFull, () => BW.toggleFullscreen());

      // Aim pad: dragging a finger moves the aim point (like the mouse in mouse-aim mode).
      const drag = {};
      el.tAim.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.tAim.setPointerCapture(e.pointerId);
        drag[e.pointerId] = { x: e.clientX, y: e.clientY };
        el.tAimHint.classList.add('gone');
      });
      el.tAim.addEventListener('pointermove', (e) => {
        const d = drag[e.pointerId];
        if (!d) return;
        // Dragging across the shorter screen side turns the aim by ~90 degrees.
        const k = 1.6 / Math.max(200, Math.min(window.innerWidth, window.innerHeight));
        g.moveAim((e.clientX - d.x) * k, (e.clientY - d.y) * k);
        d.x = e.clientX; d.y = e.clientY;
      });
      ['pointerup', 'pointercancel'].forEach((ev) => el.tAim.addEventListener(ev, (e) => delete drag[e.pointerId]));

      // Virtual joystick: deflection = stick (down = pull, as the S key); released it recentres
      // and the stability assist levels the plane.
      let stickId = null;
      const stickMove = (e) => {
        const r = el.tStick.getBoundingClientRect(), R = r.width / 2;
        let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
        const l = Math.hypot(x, y);
        if (l > 1) { x /= l; y /= l; }
        el.tKnob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
        const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
        t.sx = dz(x); t.sy = dz(y);
      };
      const stickEnd = () => { stickId = null; t.sx = t.sy = 0; el.tKnob.style.transform = ''; };
      el.tStick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        stickId = e.pointerId;
        el.tStick.setPointerCapture(e.pointerId);
        stickMove(e);
      });
      el.tStick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => el.tStick.addEventListener(ev, stickEnd));

      // Throttle lever: finger position on the track sets the throttle directly.
      let thrId = null;
      const thrSet = (e) => {
        const r = el.tThrottle.getBoundingClientRect();
        if (g.player && g.player.alive) g.player.throttle = BW.clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      };
      el.tThrottle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        thrId = e.pointerId;
        el.tThrottle.setPointerCapture(e.pointerId);
        thrSet(e);
      });
      el.tThrottle.addEventListener('pointermove', (e) => { if (e.pointerId === thrId) thrSet(e); });
      ['pointerup', 'pointercancel'].forEach((ev) => el.tThrottle.addEventListener(ev, () => (thrId = null)));
    }

    show(v) {
      this.el.touch.classList.toggle('hidden', !v);
      if (!v) return;
      const aim = this.g.aimMode();
      this.el.tAim.style.display = aim ? '' : 'none';
      this.el.tStick.style.display = aim ? 'none' : '';
      this.el.tAimHint.classList.remove('gone');
      this.el.tFull.style.display = BW.canFullscreen() ? '' : 'none';
    }

    update() {
      const p = this.g.player;
      if (!p) return;
      const thr = Math.round(p.throttle * 100);
      this.el.tThrFill.style.height = thr + '%';
      this.el.tThrVal.textContent = thr + ' %';
    }
  }
  BW.TouchControls = TouchControls;

  BW.canFullscreen = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  // Fullscreen and landscape lock (only allowed from a user gesture; silently ignored where unsupported, e.g. iPhone).
  BW.enterFullscreen = function () {
    const d = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!req) return;
    try {
      const r = req.call(d);
      const lock = () => { try { const l = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (l && l.catch) l.catch(() => {}); } catch (e) { /* ignore */ } };
      if (r && r.then) r.then(lock).catch(() => {}); else lock();
    } catch (e) { /* ignore */ }
  };
  BW.toggleFullscreen = function () {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) try { const r = ex.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
    } else BW.enterFullscreen();
  };
})(window.BW);
