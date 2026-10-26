'use strict';
// Ovládání mimo počítač: dotykové ovládání na mobilu a dálkový ovladač televize LG (webOS).
// Obojí jen zapisuje do FS.Player.input / moveAxis / yaw – herní logika zůstává stejná jako s myší.
(function (FS) {
  const $ = (id) => document.getElementById(id);

  // ---------- zařízení ----------
  const UA = navigator.userAgent;
  const Q = new URLSearchParams(location.search);
  const force = (k) => (Q.get(k) === '1' ? true : Q.get(k) === '0' ? false : null);
  const tvF = force('tv'), touchF = force('touch');
  const tv = tvF !== null ? tvF : /Web0S|webOS|NetCast|SmartTV|SMART-TV|HbbTV/i.test(UA);
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const touch = !tv && (touchF !== null ? touchF : (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && coarse);
  const qual = Q.get('q');
  FS.Device = { tv, touch, desktop: !tv && !touch, low: qual === 'low' || (qual !== 'high' && (tv || touch)) };
  document.documentElement.classList.add(tv ? 'tv' : touch ? 'touch' : 'desktop');
  // text podle zařízení: dev(počítač, mobil, televize)
  FS.dev = (desk, mob, tvTxt) => (tv ? tvTxt : touch ? mob : desk);

  const C = { reelLatch: false };
  FS.Controls = C;

  function gameActive() {
    const P = FS.Player;
    return !!(P.started && !FS.UI.modal && !FS.Shop.open);
  }
  function releaseAll() {
    const inp = FS.Player.input;
    inp.lmb = inp.rmb = false;
    FS.Player.moveAxis.x = FS.Player.moveAxis.y = 0;
  }

  C.openMenu = function () {
    const F = FS.Fishing;
    $('menuShop').style.display = FS.Shop.nearPlayer() && F.state === 'idle' ? '' : 'none';
    FS.UI.openPanel('menu');
  };

  C.init = function () {
    const P = FS.Player;
    if (tv || touch) P.fallback = true; // bez zamykání kurzoru
    $('menuPanel').querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      FS.Audio.ui();
      if (a === 'gear' || a === 'journal' || a === 'help') { FS.UI.openPanel(a); return; }
      FS.UI.closePanel();
      if (a === 'feed') FS.Fishing.throwGroundbait();
      if (a === 'shop' && FS.Shop.nearPlayer()) FS.Shop.enter();
    }));
    if (touch) initTouch();
    if (tv) {
      $('shopHelp').textContent = 'Šipkami vyber zboží, OK = koupit / nasadit.';
      $('shopClose').textContent = 'Odejít [Zpět]';
      window.addEventListener('blur', () => { held.clear(); okMode = null; });
    }
    if (touch) { $('shopHelp').textContent = 'Ťukni na zboží ve stánku nebo vyber v seznamu.'; $('shopClose').textContent = 'Odejít'; }
    $('catchRotHint').textContent = FS.dev('Táhni myší pro otočení ryby', 'Táhni prstem pro otočení ryby', '');
    C.inited = true;
  };

  // ======================================================================
  // Mobil – virtuální joystick, rozhlížení tažením, tlačítka akcí
  // ======================================================================
  let stickId = null, stickX = 0, stickY = 0;
  const STICK_R = 55;
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* syntetická událost */ } };
  function initTouch() {
    const ui = $('touchUI'), P = FS.Player, inp = P.input;
    // bez posouvání, přibližování a emulovaných myších událostí
    ui.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    ui.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    const sens = () => FS.Game.state.settings.sens * 1.5;

    // joystick (levá část obrazovky)
    const zone = $('moveZone'), stick = $('stick'), knob = $('stickKnob');
    const stickIdle = () => { stick.className = ''; stick.style.left = ''; stick.style.top = ''; knob.style.transform = ''; };
    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      stickId = e.pointerId; capture(zone, e);
      stickX = e.clientX; stickY = e.clientY;
      stick.className = 'on';
      stick.style.left = stickX + 'px'; stick.style.top = stickY + 'px';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - stickX, dy = e.clientY - stickY;
      const l = Math.hypot(dx, dy);
      if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.hypot(dx, dy) / STICK_R < 0.15 ? 0 : 1; // mrtvá zóna
      P.moveAxis.x = (dx / STICK_R) * k; P.moveAxis.y = (-dy / STICK_R) * k;
    });
    const stickEnd = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null; P.moveAxis.x = P.moveAxis.y = 0; stickIdle();
    };
    zone.addEventListener('pointerup', stickEnd);
    zone.addEventListener('pointercancel', stickEnd);

    // tažení = rozhlížení (stejné jednotky jako pohyb myši)
    const drag = (el, onDown, onMove, onUp) => {
      const last = {};
      el.addEventListener('pointerdown', (e) => {
        capture(el, e);
        last[e.pointerId] = [e.clientX, e.clientY];
        if (onDown) onDown(e);
      });
      el.addEventListener('pointermove', (e) => {
        const l = last[e.pointerId];
        if (!l) return;
        onMove(e.clientX - l[0], e.clientY - l[1]);
        l[0] = e.clientX; l[1] = e.clientY;
      });
      const end = (e) => { if (!last[e.pointerId]) return; delete last[e.pointerId]; if (onUp) onUp(e); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    drag($('lookZone'), null, (dx, dy) => { inp.dx += dx * sens(); inp.dy += dy * sens(); });

    // Akce = levé tlačítko myši: drž (síla hodu), ťukni (zásek), táhni (míření / vedení prutu)
    const act = $('btnAction');
    drag(act, () => { inp.lmb = true; inp.lmbPressed = true; act.classList.add('down'); },
      (dx, dy) => { inp.dx += dx * sens(); inp.dy += dy * sens(); },
      () => { inp.lmb = false; act.classList.remove('down'); });
    // Navíjet = pravé tlačítko myši
    const reel = $('btnReel');
    drag(reel, () => { inp.rmb = true; reel.classList.add('down'); }, () => {}, () => { inp.rmb = false; reel.classList.remove('down'); });
    // − / + = kolečko myši (podržením se opakuje)
    const repeatBtn = (el, fn) => {
      let t = null;
      const stop = () => { clearTimeout(t); t = null; el.classList.remove('down'); };
      const loop = (delay) => { fn(); t = setTimeout(() => loop(110), delay); };
      el.addEventListener('pointerdown', (e) => { capture(el, e); el.classList.add('down'); loop(420); });
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointercancel', stop);
    };
    repeatBtn($('btnPlus'), () => FS.Fishing.onWheel(-1));
    repeatBtn($('btnMinus'), () => FS.Fishing.onWheel(1));
    $('btnSpeed').addEventListener('pointerdown', () => { FS.Fishing.setReelLevel(FS.Fishing.reelLevel % 5 + 1); FS.Audio.ui(); });
    $('btnMenu').addEventListener('pointerdown', () => C.openMenu());
    // nápis u stánku se dá ťuknout
    $('prompt').addEventListener('pointerdown', () => { if (gameActive() && FS.Shop.nearPlayer()) FS.Shop.enter(); });

    // celá obrazovka a orientace na šířku (kde to prohlížeč dovolí)
    $('playBtn').addEventListener('click', () => {
      const de = document.documentElement;
      try {
        const r = de.requestFullscreen ? de.requestFullscreen() : de.webkitRequestFullscreen && de.webkitRequestFullscreen();
        if (r && r.then) r.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
      } catch (e) { /* nepodporováno */ }
    });
  }

  let touchOn = false;
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  function updateTouch() {
    const on = gameActive();
    if (on !== touchOn) {
      touchOn = on;
      $('touchUI').classList.toggle('on', on);
      if (!on) {
        releaseAll();
        stickId = null;
        document.querySelectorAll('#touchUI .down').forEach((b) => b.classList.remove('down'));
      }
    }
    if (!on) return;
    const F = FS.Fishing;
    const lbl = { idle: 'Nahodit', casting: 'Pusť!', flying: 'Brzda', water: F.mode() === 'lure' ? 'Cuknout / zásek' : 'Zásek', ground: 'Zásek', fight: 'Vést prut', landed: '–', flop: '–' };
    setText($('btnAction'), lbl[F.state] || 'Akce');
    setText($('wheelLbl'), F.state === 'fight' || F.mode() === 'lure' ? 'Brzda' : 'Hloubka');
    setText($('btnSpeed'), 'Rychlost ' + F.reelLevel);
  }

  // ======================================================================
  // Televize LG – dálkový ovladač (šipky, OK, Zpět, barevná tlačítka, CH▲▼)
  // ======================================================================
  const KC = { 13: 'ok', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 461: 'back', 27: 'back', 8: 'back', 403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 33: 'chUp', 34: 'chDown', 427: 'chUp', 428: 'chDown' };
  // na počítači se dá TV režim (?tv=1) zkoušet klávesami R G Y B místo barevných tlačítek
  const KEYS_PC = { KeyR: 'red', KeyG: 'green', KeyY: 'yellow', KeyB: 'blue' };
  const keyName = (e) => KC[e.keyCode] || KEYS_PC[e.code];
  const held = new Set();
  let okMode = null, rodLmb = false;

  // aktuálně otevřená obrazovka s tlačítky (pro pohyb výběru šipkami)
  function activeRoot() {
    if ($('start').style.display === 'flex') return $('start');
    if (FS.UI.modal === 'catch') return $('catchCard');
    if (FS.Shop.open) return $('shopPanel');
    if (FS.UI.modal) return $(FS.UI.modal + 'Panel');
    return null;
  }
  // tlačítka a posuvníky; karty (zboží, deník) jen tehdy, když nemají žádné aktivní tlačítko –
  // jinak by se k nekoupitelnému zboží v dlouhém seznamu nedalo dojet
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('button, input[type=range], .card, .jcard'), (el) => {
      if (el.disabled || el.offsetParent === null) return false;
      if (el.tagName === 'DIV') {
        if (el.querySelector('button:not([disabled])')) return false;
        el.tabIndex = -1;
      }
      return true;
    });
  }
  // vlastní třída zvýraznění – :focus nemusí platit, když okno prohlížeče nemá fokus
  let marked = null;
  function setFocus(el) {
    if (marked) marked.classList.remove('tvFocus');
    marked = el;
    if (el) { el.classList.add('tvFocus'); el.focus(); }
  }
  function focusFirst(root) {
    const list = focusables(root);
    const pref = list.filter((el) => el.classList.contains('primary'))[0] || list.filter((el) => !el.hasAttribute('data-close'))[0] || list[0];
    if (pref) setFocus(pref);
  }
  function moveFocus(root, dir) {
    const list = focusables(root);
    let cur = document.activeElement;
    if (list.indexOf(cur) < 0) cur = marked;
    if (list.indexOf(cur) < 0) { focusFirst(root); return; }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let cy = r.top + r.height / 2;
    // vybraný prvek odrolovaný mimo seznam – počítat od viditelného okraje seznamu
    const sc = cur.closest('#shopList, .win');
    if (sc) { const R = sc.getBoundingClientRect(); cy = Math.max(R.top, Math.min(R.bottom, cy)); }
    let best = null, bs = 1e9;
    for (const el of list) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      // v kolmém směru mezera mezi okraji (překrývající se prvky = 0), ne mezi středy
      const across = dir === 'left' || dir === 'right'
        ? Math.max(0, q.top - r.bottom, r.top - q.bottom)
        : Math.max(0, q.left - r.right, r.left - q.right);
      if (along <= 2) continue;
      const s = along + across * 2.5;
      if (s < bs) { bs = s; best = el; }
    }
    // seznam (obchod, deník) se nejdřív doroluje, než výběr skočí ven z něj – i k zboží, které nejde koupit
    const vert = dir === 'up' || dir === 'down';
    const canScroll = sc && (dir === 'down' ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2 : sc.scrollTop > 0);
    if (vert && canScroll && (!best || !sc.contains(best))) { sc.scrollTop += dir === 'down' ? 140 : -140; return; }
    if (best) { setFocus(best); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' }); }
  }
  function back() {
    if (FS.UI.modal === 'catch' || $('start').style.display === 'flex') return;
    if (FS.Shop.open) FS.Shop.leave();
    else if (FS.UI.modal) FS.UI.closePanel();
    else C.openMenu();
  }

  C.onKeyDown = function (e) {
    if (!tv) return false;
    const n = keyName(e);
    const root = activeRoot();
    if (root) {
      if (!n) return false;
      const a = document.activeElement && document.activeElement !== document.body ? document.activeElement : marked;
      if (a && a.type === 'range' && (n === 'left' || n === 'right')) return true; // posuvník ovládá prohlížeč
      e.preventDefault();
      if (n === 'ok') { if (!e.repeat) { if (a && root.contains(a)) a.click(); else focusFirst(root); } }
      else if (n === 'left' || n === 'right' || n === 'up' || n === 'down') moveFocus(root, n);
      else if (n === 'back') back();
      else if (n === 'yellow' && !FS.Shop.open && FS.UI.modal !== 'catch') FS.UI.openPanel('gear');
      else if (n === 'blue' && !FS.Shop.open && FS.UI.modal !== 'catch') { if (FS.UI.modal === 'menu') FS.UI.closePanel(); else C.openMenu(); }
      return true;
    }
    const P = FS.Player, F = FS.Fishing, inp = P.input;
    if (!P.started) return false;
    if (!n) {
      // čísla 1–5 na ovladači = rychlost navíjení
      const d = e.keyCode >= 49 && e.keyCode <= 53 ? e.keyCode - 48 : e.keyCode >= 97 && e.keyCode <= 101 ? e.keyCode - 96 : 0;
      if (d) { F.setReelLevel(d); return true; }
      return false;
    }
    e.preventDefault();
    if (e.repeat && n !== 'chUp' && n !== 'chDown') return true;
    switch (n) {
      case 'left': case 'right': case 'up': case 'down': held.add(n); break;
      case 'ok':
        if (F.state === 'idle' && FS.Shop.nearPlayer()) { FS.Shop.enter(); break; }
        if (F.state === 'fight') { okMode = 'reel'; inp.rmb = true; } else { okMode = 'act'; inp.lmb = true; inp.lmbPressed = true; }
        break;
      case 'red':
        C.reelLatch = !C.reelLatch;
        inp.rmb = C.reelLatch || okMode === 'reel';
        FS.UI.toast(C.reelLatch ? 'Navíjení zapnuto (červené = vypnout)' : 'Navíjení vypnuto', 1200);
        break;
      case 'green': F.throwGroundbait(); break;
      case 'yellow': FS.UI.openPanel('gear'); break;
      case 'blue': case 'back': C.openMenu(); break;
      case 'chUp': F.onWheel(-1); break;
      case 'chDown': F.onWheel(1); break;
    }
    return true;
  };
  C.onKeyUp = function (e) {
    if (!tv) return false;
    const n = keyName(e);
    if (!n) return false;
    held.delete(n);
    if (n === 'ok' && okMode) {
      const inp = FS.Player.input;
      if (okMode === 'reel') inp.rmb = C.reelLatch; else inp.lmb = rodLmb;
      okMode = null;
    }
    return true;
  };

  let lastState = null, lastRoot = null;
  function updateTV(dt) {
    const P = FS.Player, F = FS.Fishing, inp = P.input;
    // při otevření panelu rovnou vybrat první tlačítko
    const root = activeRoot();
    if (root !== lastRoot) { lastRoot = root; if (root) focusFirst(root); else { setFocus(null); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } }
    // zapnuté navíjení se vypne, když je montáž venku z vody
    if (F.state !== lastState) {
      lastState = F.state;
      if (C.reelLatch && (F.state === 'idle' || F.state === 'casting' || F.state === 'flop' || F.state === 'landed')) { C.reelLatch = false; inp.rmb = okMode === 'reel'; }
    }
    if (C.reelLatch) inp.rmb = true;
    if (!gameActive()) {
      P.moveAxis.y = 0;
      if (rodLmb) { rodLmb = false; inp.lmb = false; }
      return;
    }
    const turn = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const fwd = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    if (F.state === 'fight') {
      // šipky vedou prut (jako levé tlačítko + myš)
      P.moveAxis.y = 0;
      const steer = !!(turn || fwd);
      if (steer !== rodLmb) { rodLmb = steer; inp.lmb = steer || okMode === 'act'; }
      inp.dx += turn * 380 * dt;
      inp.dy += fwd * 380 * dt;
    } else {
      if (rodLmb) { rodLmb = false; inp.lmb = okMode === 'act'; }
      if (F.state === 'casting') { inp.dx += turn * 260 * dt; P.moveAxis.y = 0; } // míření hodu
      else { P.yaw -= turn * 1.5 * dt; P.moveAxis.y = fwd; }
    }
  }

  C.update = function (dt) {
    if (!C.inited) return;
    if (touch) updateTouch();
    if (tv) updateTV(dt);
  };
})(window.FS);
