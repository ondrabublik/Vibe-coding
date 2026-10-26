'use strict';
// Rybaření: ovládání prutu myší, nahazování švihem, splávek a nástraha, záběry, zásek, zdolávání, podebrání.
(function (FS) {
  const U = FS.U, W = FS.World;
  const V3 = THREE.Vector3;
  const F = {
    state: 'idle',
    e: 0.62, eVel: 0, eT: 0.62, yaw: 0, yawVel: 0, yawT: 0,
    rig: { pos: new V3(0, 1, 0), vel: new V3() },
    lineLen: 0.9, hang: 0.9, depthSet: 1.2, drag: 2.0,
    hasBait: false, baitTimer: 0, baitDepth: 0, onBottom: false,
    bite: null, fish: null, tension: 0, lureSpeed: 0, lureAction: 0, lureDir: new V3(1, 0, 0),
    floatDy: 0, floatTilt: 0, nibbleT: 0, nibbleAmp: 0, strikeCD: 0, snag: false,
  };
  FS.Fishing = F;

  const g = () => FS.Game.gear();

  // rychlost navíjení: 5 stupňů (klávesy 1–5, kolečko při drženém pravém tlačítku)
  const REEL_LEVELS = [0.35, 0.6, 0.85, 1.15, 1.5];
  F.reelLevel = 4;
  F.reelSpeed = () => g().reel.s.speed * REEL_LEVELS[F.reelLevel - 1];
  F.setReelLevel = function (n) {
    F.reelLevel = U.clamp(n, 1, 5);
    FS.UI.toast(`Rychlost navíjení ${F.reelLevel}/5 – ${U.fmt1(F.reelSpeed())} m/s`, 1100);
    FS.UI.refreshHud();
  };

  F.init = function () {
    F.rig.pos.set(0, 1, 0);
    // kroužek dopadu při nahazování
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({ color: '#7fe0ff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), ring.material);
    ring.add(dot);
    ring.renderOrder = 9;
    ring.visible = false;
    // šipka nad místem dopadu – kroužek je z výšky očí vidět jen šikmo
    const { c, g: cg } = U.canvas(64, 96);
    cg.fillStyle = '#ffffff';
    cg.beginPath(); cg.moveTo(8, 40); cg.lineTo(56, 40); cg.lineTo(32, 90); cg.closePath(); cg.fill();
    cg.fillRect(22, 4, 20, 38);
    const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.tex(c, { repeat: false }), color: '#7fe0ff', depthTest: false, transparent: true }));
    arrow.center.set(0.5, 0);
    arrow.renderOrder = 10;
    ring.add(arrow);
    arrow.position.set(0, 0, 0.3);
    arrow.scale.set(0.45, 0.68, 1);
    ring.userData.arrow = arrow;
    FS.scene.add(ring);
    F.marker = ring;
    F.equipChanged();
  };

  F.equipChanged = function () {
    const G = g();
    FS.Rod.equip(G.rod, G.reel);
    F.drag = Math.min(G.reel.s.drag, G.line.s.str * 0.7);
    F.refreshRig();
  };
  F.refreshRig = function () {
    const G = g();
    const lure = G.method === 'lure' ? G.lure : null;
    FS.Rod.setRig(lure ? null : G.float, lure ? null : (F.hasBait ? G.bait && G.bait.id : null), lure ? lure.id : null, G.hook ? G.hook.s.size : 2);
    F.hang = lure ? 0.6 : 0.9;
  };

  F.mode = () => (g().method === 'lure' ? 'lure' : 'bait');

  // ---------- informace pro AI ----------
  F.rigInfo = function () {
    const G = g();
    const mode = F.mode();
    const info = { active: false, mode, pos: F.baitPos || F.rig.pos, hookSize: G.hook ? G.hook.s.size : 2, lineD: G.line.s.d, floatG: G.float ? G.float.s.g : 5 };
    if (F.state !== 'water' || F.bite || F.snag) return info;
    if (mode === 'bait') {
      if (!F.hasBait || !G.bait) return info;
      info.active = true; info.baitId = G.bait.id; info.soft = !!G.bait.s.soft;
    } else {
      info.active = true; info.lureId = G.lure.id; info.speed = F.lureSpeed; info.action = F.lureAction; info.dir = F.lureDir;
      info.lureBonus = G.rod.s.lure || 1;
      info.depthOk = (f) => Math.abs(f.pos.y - F.rig.pos.y) < 1.6;
    }
    return info;
  };

  // ---------- geometrie prutu ----------
  const _fwd = new V3(), _right = new V3(), _dir = new V3(), _butt = new V3();
  // pomocné vektory pro výpočty v každém snímku (bez nových objektů)
  const _lineDir = new V3(), _prev = new V3(), _d = new V3(), _end = new V3(), _fpos = new V3(), _bpos = new V3(), _tmp = new V3(), _yAxis = new V3(0, 1, 0);
  function rodFrame() {
    const P = FS.Player;
    const cy = P.yaw;
    _fwd.set(-Math.sin(cy), 0, -Math.cos(cy));
    _right.set(Math.cos(cy), 0, -Math.sin(cy));
    _butt.copy(P.camera.position).addScaledVector(_right, 0.26).addScaledVector(_fwd, 0.3);
    _butt.y -= 0.52;
    const Y = cy + F.yaw;
    const fx = -Math.sin(Y), fz = -Math.cos(Y);
    const ce = Math.cos(F.e), se = Math.sin(F.e);
    _dir.set(fx * ce, se, fz * ce).normalize();
  }

  function canCast() {
    const G = g();
    if (F.mode() === 'lure') {
      if (!G.lure) { FS.UI.toast('Nemáš nasazenou žádnou třpytku.'); return false; }
      return true;
    }
    if (!G.float || FS.Game.count(G.float.id) <= 0) { FS.UI.toast('Nemáš splávek – kup si ho ve stánku.'); return false; }
    if (!G.hook || FS.Game.count(G.hook.id) <= 0) { FS.UI.toast('Nemáš háčky – kup si je ve stánku.'); return false; }
    if (!F.hasBait) {
      if (!tryBait()) return false;
    }
    return true;
  }
  function tryBait() {
    const G = g();
    if (!G.bait) { FS.UI.toast('Vyber si návnadu ve výbavě [Tab].'); return false; }
    if (G.bait.s.minHook && G.hook.s.size < G.bait.s.minHook) { FS.UI.toast(`${G.bait.name} nejde nasadit na háček č. ${FS.Gear.hookLabel(G.hook.s.size)} – potřebuješ větší.`); return false; }
    if (FS.Game.count(G.bait.id) <= 0) { FS.UI.toast(`Došla ti návnada: ${G.bait.name}.`); return false; }
    FS.Game.consume(G.bait.id, 1);
    F.hasBait = true; F.baitTimer = 0;
    F.refreshRig();
    return true;
  }

  // ---------- hlavní smyčka ----------
  F.update = function (dt) {
    const P = FS.Player, inp = P.input, G = g();
    const control = inp.lmb && P.active();
    F.strikeCD -= dt;
    if (F.state === 'casting') {
      // prut řídí síla nádechu hodu (viz updateCasting)
    } else if (control) {
      F.eT = U.clamp(F.eT + inp.dy * 0.0062, -0.35, 2.7);
      F.yawT = U.clamp(F.yawT - inp.dx * 0.0032, -0.85, 0.85);
    } else {
      const rest = F.state === 'fight' ? 1.0 : F.state === 'idle' ? 0.62 : 0.5;
      F.eT += (rest - F.eT) * Math.min(1, dt * 1.2);
      F.yawT *= 1 - Math.min(1, dt * 1.5);
    }
    // prut sleduje myš s mírným zpožděním (exponenciální vyhlazení – stabilní i při nízkém FPS, nemůže kmitat)
    const maxW = 11 + 3 * G.rod.s.cast;
    const de = U.clamp((F.eT - F.e) * (1 - Math.exp(-dt * 16)), -maxW * dt, maxW * dt);
    F.e += de;
    F.eVel = dt > 0 ? de / dt : 0;
    const dy = (F.yawT - F.yaw) * (1 - Math.exp(-dt * 12));
    F.yaw += dy;
    F.yawVel = dt > 0 ? dy / dt : 0;
    rodFrame();

    // zásek – rychlé trhnutí prutem vzhůru/dozadu
    // zásek: kliknutí levým tlačítkem ve vodě (nebo škubnutí prutem nahoru)
    if (F.strikeCD <= 0 && F.state === 'water' && P.active() && (inp.lmbPressed || (control && F.eVel > 3.6))) {
      strike(); F.strikeCD = 0.5;
      F.eT = Math.min(2.2, Math.max(F.eT, F.e) + 0.9); // prut viditelně cukne nahoru
    }

    const tip = FS.Rod.tip;
    const lineDir = F.state !== 'idle' && F.state !== 'casting' ? _lineDir.subVectors(F.lineEnd(), tip).normalize() : _lineDir.set(0, -1, 0);
    const load = F.state === 'fight' ? F.tension : F.state === 'water' ? F.tension : 0.05 + (F.mode() === 'lure' ? 0.05 : 0.03);
    FS.Rod.update(dt, { butt: _butt, dir: _dir, tension: load, load: G.rod.s.load * 0.35, lineDir });

    FS.Audio.reelRate = 0; FS.Audio.dragRate = 0; FS.Audio.spoolRate = 0;
    switch (F.state) {
      case 'idle': updateHang(dt, inp); break;
      case 'casting': updateHang(dt, inp); updateCasting(dt, inp); break;
      case 'flying': updateFlying(dt, inp); break;
      case 'water': F.mode() === 'lure' ? updateLure(dt, inp) : updateFloat(dt, inp); break;
      case 'ground': updateGround(dt, inp); break;
      case 'fight': updateFight(dt, inp); break;
      case 'landed': updateHang(dt, inp); break;
      case 'flop': updateFlop(dt); break;
    }
    updateVisuals(dt);
  };

  F.lineEnd = function () {
    return F.rig.pos;
  };

  // --- visící montáž, nahazování ---
  function updateHang(dt, inp) {
    const tip = FS.Rod.tip, r = F.rig;
    F.lineLen = F.hang;
    F.tension = 0;
    // kyvadlo na vlasci (pozičně založená dynamika – tah vlasce předává rychlost)
    const prev = _prev.copy(r.pos);
    r.vel.y -= 9.81 * dt;
    r.vel.multiplyScalar(1 - Math.min(1, dt * 0.8));
    r.pos.addScaledVector(r.vel, dt);
    const d = _d.subVectors(r.pos, tip);
    const L = d.length();
    if (L > F.lineLen) {
      d.divideScalar(L);
      r.pos.copy(tip).addScaledVector(d, F.lineLen);
    }
    const gh = Math.max(W.heightAt(r.pos.x, r.pos.z), 0) + 0.03;
    if (r.pos.y < gh) { r.pos.y = gh; }
    if (dt > 0) r.vel.subVectors(r.pos, prev).divideScalar(dt);
    if (r.pos.y <= gh + 1e-4) r.vel.multiplyScalar(0.6);
    if (F.state === 'idle' && inp.lmbPressed && FS.Player.active() && canCast()) {
      F.state = 'casting';
      F.cast = { charge: 0, swing: 0, power: 0, target: new V3() };
    }
  }

  // Nahazování: držením levého tlačítka roste síla (švih myší nahoru ji zrychlí),
  // míří se pohledem, kroužek ukazuje dopad, puštěním tlačítka se nahodí.
  F.castDistance = function (power) {
    const G = g();
    const grams = F.mode() === 'lure' ? G.lure.s.g : G.float.s.g + 1;
    const maxD = (14 + 22 * G.rod.s.cast) * (0.8 + 0.2 * Math.min(1, grams / 6));
    return 3 + (maxD - 3) * power;
  };
  function updateCasting(dt, inp) {
    const c = F.cast, P = FS.Player;
    c.charge = Math.min(1, c.charge + dt / 1.2);
    const up = Math.max(0, -inp.dy) / Math.max(dt, 1e-3);
    c.swing = Math.max(c.swing * Math.exp(-dt * 1.5), Math.min(1, c.swing + up / 2600 * dt * 4));
    c.power = Math.min(1, Math.max(c.charge, c.swing));
    F.eT = 0.62 + c.power * 1.7; // prut se s rostoucí silou zaklání
    F.yawT = 0;
    const dist = F.castDistance(c.power);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    c.target.set(P.pos.x + fx * dist, 0, P.pos.z + fz * dist);
    const gh = W.heightAt(c.target.x, c.target.z);
    c.water = gh < -0.04;
    c.target.y = Math.max(gh, 0);
    F.marker.visible = true;
    F.marker.position.set(c.target.x, c.target.y + 0.03, c.target.z);
    F.marker.material.color.set(c.water ? (W.reedDensity(c.target.x, c.target.z) > 0.3 ? '#ffd24a' : '#7fe0ff') : '#ff7a5a');
    F.marker.userData.arrow.material.color.copy(F.marker.material.color);
    F.marker.scale.setScalar(0.8 + dist * 0.045);
    FS.UI.castMeter(c.power, dist, c.water);
    if (!inp.lmb) launch();
  }
  function launch() {
    const c = F.cast, r = F.rig, tip = FS.Rod.tip;
    F.marker.visible = false;
    FS.UI.castMeter(0);
    // balistická dráha přesně do cíle (bez odporu vzduchu)
    r.pos.copy(tip);
    const dx = c.target.x - tip.x, dz = c.target.z - tip.z;
    const D = Math.hypot(dx, dz);
    const T = 0.45 + D / 24;
    r.vel.set(dx / T, (c.target.y - tip.y + 0.5 * 9.81 * T * T) / T, dz / T);
    F.state = 'flying';
    F.brake = false;
    F.airDrag = 0;
    F.lineLen = 0.5;
    F.eT = 0.25; // prut švihne dopředu
    FS.Audio.whoosh(0.4 + c.power);
  }

  function updateFlying(dt, inp) {
    const r = F.rig, tip = FS.Rod.tip;
    if (inp.lmbPressed) { F.brake = true; FS.UI.toast('Přibrzdil jsi vlasec.', 1200); }
    const sub = 3, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const sp = r.vel.length();
      r.vel.y -= 9.81 * h;
      r.vel.addScaledVector(r.vel, -F.airDrag * sp * h);
      r.pos.addScaledVector(r.vel, h);
      const d = new V3().subVectors(r.pos, tip), L = d.length();
      if (!F.brake) {
        F.lineLen = Math.max(F.lineLen, L);
        FS.Audio.spoolRate = sp * 2.5;
      } else if (L > F.lineLen) {
        d.divideScalar(L);
        r.pos.copy(tip).addScaledVector(d, F.lineLen);
        const radial = r.vel.dot(d); if (radial > 0) r.vel.addScaledVector(d, -radial * 1.0);
      }
      const gh = W.heightAt(r.pos.x, r.pos.z);
      if (r.pos.y <= 0.0 && gh < -0.04) { landWater(); return; }
      if (r.pos.y <= gh + 0.02) { landGround(gh); return; }
    }
  }

  function landWater() {
    const r = F.rig, G = g();
    r.pos.y = 0;
    r.vel.set(0, 0, 0);
    const grams = F.mode() === 'lure' ? G.lure.s.g : G.float.s.g + 1;
    const size = Math.min(1.4, 0.35 + grams / 14);
    FS.FX.splash(r.pos.x, r.pos.z, size * 0.6);
    FS.Water.addRipple(r.pos.x, r.pos.z, 1.0);
    FS.Audio.splash(size * 0.6);
    FS.FishAI.disturb(r.pos, 1.2 + size * 1.5, 0.7);
    F.state = 'water';
    F.baitDepth = 0;
    F.lineLen = FS.Rod.tip.distanceTo(r.pos) + 0.3;
    F.snag = W.reedDensity(r.pos.x, r.pos.z) > 0.3;
    if (F.snag) FS.UI.toast('Nahodil jsi do rákosí! Navij a zkus to opatrně vyprostit.', 2500);
    F.lureSpeed = 0; F.lureAction = 0;
    const dist = Math.hypot(r.pos.x - FS.Player.pos.x, r.pos.z - FS.Player.pos.z);
    FS.UI.toast(`Nahozeno ${U.fmt1(dist)} m`, 1500);
    if (FS.Game.state.tut < 2) FS.Game.state.tut = 2;
  }
  function landGround(gh) {
    const r = F.rig;
    r.pos.y = gh + 0.02;
    r.vel.set(0, 0, 0);
    F.state = 'ground';
    FS.UI.toast('Nástraha dopadla na břeh. Navij ji pravým tlačítkem.', 2200);
  }

  function updateGround(dt, inp) {
    const r = F.rig, G = g(), tip = FS.Rod.tip;
    if (inp.rmb) {
      F.lineLen -= F.reelSpeed() * dt;
      FS.Audio.reelRate = 14; FS.Rod.setReeling(1, dt);
    }
    const d = new V3().subVectors(tip, r.pos); d.y = 0;
    const L = Math.hypot(tip.x - r.pos.x, tip.z - r.pos.z);
    if (L > F.lineLen) { d.normalize(); r.pos.addScaledVector(d, Math.min(L - F.lineLen, 2 * dt)); }
    r.pos.y = Math.max(W.heightAt(r.pos.x, r.pos.z), 0) + 0.02;
    if (W.heightAt(r.pos.x, r.pos.z) < -0.05) { r.pos.y = 0; F.state = 'water'; F.baitDepth = 0; F.lineLen = Math.max(F.lineLen, tip.distanceTo(r.pos)); return; }
    F.lineLen = Math.max(F.lineLen, Math.min(L, F.lineLen));
    if (L < 2.4) toIdle();
  }

  function toIdle() {
    F.state = 'idle';
    if (F.marker) F.marker.visible = false;
    FS.UI.castMeter(0);
    F.bite = null; F.snag = false;
    F.lineLen = F.hang;
    F.tension = 0;
    const G = g();
    if (F.mode() === 'bait' && G.bait && G.bait.s.soft && F.hasBait && F.baitTimer > G.bait.s.soft * 0.6) {
      F.hasBait = false; FS.UI.toast('Návnada se rozmočila.');
    }
    if (F.mode() === 'bait' && !F.hasBait && G.bait && FS.Game.count(G.bait.id) > 0) tryBait();
    F.refreshRig();
  }
  F.toIdle = toIdle;

  // --- splávek ve vodě ---
  function constrainSurface(dt, maxSpeed) {
    const r = F.rig, tip = FS.Rod.tip;
    const dist = tip.distanceTo(r.pos);
    if (dist > F.lineLen) {
      const ex = dist - F.lineLen;
      const h = new V3(tip.x - r.pos.x, 0, tip.z - r.pos.z);
      const hl = h.length();
      if (hl > 0.01) {
        h.divideScalar(hl);
        const mv = Math.min(ex * 1.2, maxSpeed * dt);
        r.pos.addScaledVector(h, mv);
        F.surfSpeed = mv / dt;
      }
      F.tension = Math.min(1.5, 0.04 + ex * 1.5 + (F.surfSpeed || 0) * 0.08);
    } else {
      F.tension *= 1 - Math.min(1, dt * 4);
      F.surfSpeed = 0;
    }
  }

  function reel(dt, inp, rate = 1) {
    const G = g();
    if (inp.rmb) {
      F.lineLen = Math.max(0.5, F.lineLen - F.reelSpeed() * rate * dt);
      FS.Audio.reelRate = 6 + F.reelSpeed() * 12;
      FS.Rod.setReeling(F.reelSpeed(), dt);
      return true;
    }
    return false;
  }

  // montáž je navinutá: u nohou, na mělčině, nebo už visí skoro pod špičkou prutu
  function nearShore() {
    const r = F.rig, P = FS.Player.pos, tip = FS.Rod.tip;
    const d = Math.hypot(r.pos.x - P.x, r.pos.z - P.z);
    const dTip = Math.hypot(r.pos.x - tip.x, r.pos.z - tip.z);
    return d < 2.6 || dTip < 1.5 || F.lineLen <= tip.y - r.pos.y + 0.6 || W.heightAt(r.pos.x, r.pos.z) > -0.06;
  }

  function updateFloat(dt, inp) {
    const r = F.rig, G = g(), t = FS.uniforms.uTime.value;
    const reeling = reel(dt, inp);
    constrainSurface(dt, 2.6);
    // nedovolit nekonečně volný vlasec
    const dist = FS.Rod.tip.distanceTo(r.pos);
    if (F.lineLen > dist + 2.5) F.lineLen = dist + 2.5;
    r.pos.y = 0;
    if (W.heightAt(r.pos.x, r.pos.z) > -0.03) { // vytaženo na břeh
      toIdle(); return;
    }
    if (reeling && nearShore()) { toIdle(); return; }
    // klesání návnady
    const bottom = W.waterDepth(r.pos.x, r.pos.z);
    const target = Math.min(F.depthSet, bottom - 0.03);
    F.onBottom = F.depthSet >= bottom - 0.05;
    F.baitDepth += U.clamp(target - F.baitDepth, -0.6 * dt, 0.45 * dt);
    F.baitPos = new V3(r.pos.x + 0.02, -F.baitDepth, r.pos.z);
    if (F.hasBait) F.baitTimer += dt;
    if (F.hasBait && G.bait && G.bait.s.soft && F.baitTimer > G.bait.s.soft) {
      F.hasBait = false; F.refreshRig(); FS.UI.toast('Návnada se ve vodě rozpustila – navij a nahoď znovu.');
    }
    if (F.snag) {
      if (reeling && Math.random() < dt * 0.5) {
        F.snag = false;
        if (Math.random() < 0.35) { lose('Vlasec se v rákosí utrhl.', true); return; }
        FS.UI.toast('Vyprostil jsi montáž z rákosí.');
      }
    }
    updateBite(dt);
  }

  // --- přívlač ---
  function updateLure(dt, inp) {
    const r = F.rig, G = g(), lure = G.lure;
    const tip = FS.Rod.tip;
    const reeling = reel(dt, inp, 1.15);
    const before = r.pos.clone();
    const bottom = W.waterDepth(r.pos.x, r.pos.z);
    // potápění / plavání
    const sp = F.lureSpeed;
    let targetDepth;
    if (lure.s.dive) targetDepth = lure.s.dive * U.smoothstep(0.05, 0.6, sp);
    else if (lure.s.jig) targetDepth = sp > 0.5 ? bottom * 0.5 : bottom;
    else targetDepth = sp > 0.1 ? Math.max(0.2, lure.s.depth - sp * 0.6) : bottom;
    targetDepth = Math.min(targetDepth, bottom - 0.05);
    const curD = -r.pos.y;
    const rate = targetDepth > curD ? (lure.s.dive ? 0.6 : lure.s.sink + 0.05) : 0.6;
    r.pos.y = -(curD + U.clamp(targetDepth - curD, -rate * dt, rate * dt));
    // vlasec táhne nástrahu ke špičce
    const d = new V3().subVectors(tip, r.pos);
    const dist = d.length();
    if (dist > F.lineLen) {
      const ex = dist - F.lineLen;
      d.divideScalar(dist);
      r.pos.addScaledVector(d, Math.min(ex, 2.4 * dt + ex * 0.2));
      F.tension = Math.min(1.2, 0.08 + ex * 1.2);
    } else F.tension *= 1 - Math.min(1, dt * 4);
    if (F.lineLen > dist + 2.5) F.lineLen = dist + 2.5;
    if (r.pos.y > -0.04) r.pos.y = -0.04;
    const gh = W.heightAt(r.pos.x, r.pos.z);
    if (r.pos.y < gh + 0.03) r.pos.y = gh + 0.03;
    const moved = r.pos.distanceTo(before);
    const v = moved / Math.max(dt, 1e-4);
    F.lureSpeed += (v - F.lureSpeed) * Math.min(1, dt * 4);
    if (moved > 1e-4) F.lureDir.subVectors(r.pos, before).normalize();
    // akce prutem (trhnutí) láká dravce
    const tipSpeed = FS.Rod.tipVel.length();
    F.lureAction = Math.max(F.lureAction * (1 - dt * 0.6), U.clamp((tipSpeed - 1.5) / 4, 0, 1));
    F.baitPos = r.pos;
    if (gh > -0.05 || (reeling && nearShore())) { toIdle(); return; }
    if (F.snag && reeling && Math.random() < dt * 0.5) {
      F.snag = false;
      if (Math.random() < 0.35) { lose('Třpytka zůstala v rákosí.', true); return; }
    }
    updateBite(dt);
  }

  // ---------- záběry ----------
  F.nibble = function (fish) {
    if (F.state !== 'water' || F.mode() !== 'bait') return;
    const sens = g().float.s.sens;
    F.nibbleT = 0.25;
    F.nibbleAmp = 0.012 * sens * (0.5 + Math.min(1, fish.weight));
    FS.Water.addRipple(F.rig.pos.x, F.rig.pos.z, 0.25 * sens);
  };
  F.baitNibbledOff = function () {
    if (F.state !== 'water' || !F.hasBait) return;
    F.hasBait = false;
    F.refreshRig();
    FS.UI.toast('Ryby ti okousaly návnadu.', 2200);
  };

  F.startBite = function (fish) {
    if (F.bite || F.state !== 'water') return false;
    const G = g();
    const sens = (G.float.s.sens || 1) * (G.rod.s.sens || 1);
    const sp = fish.sp;
    const a = Math.random() * Math.PI * 2;
    F.bite = {
      fish, t: 0, phase: 'pre', pre: U.grr(0.3, 1.4),
      pattern: sp.pattern, dir: new V3(Math.cos(a), 0, Math.sin(a)),
      window: sp.window * Math.sqrt(sens) * U.grr(0.9, 1.15) + 0.5,
    };
    return true;
  };
  F.lureStrike = function (fish) {
    if (F.bite || F.state !== 'water') return false;
    F.bite = { fish, t: 0, phase: 'strike', window: 1.0, pattern: 'strike', dir: new V3() };
    FS.Audio.plop(0.25);
    FS.Water.addRipple(F.rig.pos.x, F.rig.pos.z, 0.6);
    if (FS.Rod.offVel) FS.Rod.offVel.addScaledVector(new V3().subVectors(F.rig.pos, FS.Rod.tip).normalize(), 3.5);
    F.tension = 1.5;
    return true;
  };

  function updateBite(dt) {
    const b = F.bite;
    F.floatDy *= 1 - Math.min(1, dt * 6);
    F.floatTilt += ((F.onBottom ? 1.25 : 0) - F.floatTilt) * Math.min(1, dt * 3);
    if (F.nibbleT > 0) {
      F.nibbleT -= dt;
      F.floatDy = -Math.abs(Math.sin(F.nibbleT * 40)) * F.nibbleAmp;
    }
    if (!b) return;
    b.t += dt;
    const f = b.fish, r = F.rig;
    // ryba drží nástrahu
    if (f.state === 'biting') {
      const mouth = F.baitPos || r.pos;
      f.pos.x += (mouth.x - Math.cos(f.yaw) * f.len * 0.45 - f.pos.x) * Math.min(1, dt * 4);
      f.pos.z += (mouth.z - Math.sin(f.yaw) * f.len * 0.45 - f.pos.z) * Math.min(1, dt * 4);
      f.pos.y += (mouth.y - f.pos.y) * Math.min(1, dt * 3);
      if (b.dir.lengthSq() > 0) f.yaw += U.angleDiff(f.yaw, Math.atan2(b.dir.z, b.dir.x)) * Math.min(1, dt * 2);
      f.speed = 0.2;
    }
    if (b.phase === 'pre') {
      F.floatDy = -Math.abs(Math.sin(b.t * 22)) * 0.018 * (1 + Math.sin(b.t * 3));
      if (b.t > b.pre) { b.phase = 'take'; b.t = 0; FS.Water.addRipple(r.pos.x, r.pos.z, 0.6); FS.Audio.plop(0.08); }
    } else if (b.phase === 'take') {
      const k = Math.min(1, b.t / 0.4);
      let mv = 0;
      if (b.pattern === 'dip') { F.floatDy = -0.16 * k; mv = 0.28; }
      else if (b.pattern === 'slow') { F.floatDy = -0.12 * Math.min(1, b.t / 1.2); mv = 0.18; }
      else if (b.pattern === 'lift') { F.floatDy = 0.035 * k; F.floatTilt = Math.min(1.45, F.floatTilt + dt * 2); mv = 0.07; }
      else if (b.pattern === 'run') { F.floatDy = -0.2 * k; mv = 0.7; }
      if (b.t > 0.15) {
        r.pos.addScaledVector(b.dir, mv * dt);
        if (F.baitPos) F.baitPos.addScaledVector(b.dir, mv * dt);
        if (F.tension > 0.3 && Math.random() < dt * 1.5) { endBite('drop'); return; }
      }
      if (b.t > 0.2 && Math.random() < dt * 4) FS.Water.addRipple(r.pos.x, r.pos.z, 0.3);
      if (b.t > b.window) endBite('stolen');
    } else if (b.phase === 'strike') {
      F.lureSpeed *= 0.5;
      if (b.t > b.window) {
        const self = f.sp.id === 'stika' ? 0.55 : 0.42;
        const hf = FS.FishAI.hookFactors(f, 3);
        if (Math.random() < self * hf.hold) { FS.UI.toast('Ryba se zasekla sama!'); startFight(f); }
        else endBite('miss');
      }
    }
  }

  function endBite(kind) {
    const b = F.bite;
    if (!b) return;
    const f = b.fish;
    F.bite = null;
    if (f.state === 'biting') { f.state = 'flee'; f.timer = 2.5; f.cooldown = U.grr(15, 30); f.fleeYaw = Math.random() * 6.28; }
    if (kind === 'stolen') {
      if (F.mode() === 'bait') { F.hasBait = false; F.refreshRig(); }
      FS.UI.toast('Nestihl jsi zaseknout – ryba sežrala návnadu.', 2500);
    } else if (kind === 'drop') {
      FS.UI.toast('Ryba ucítila odpor a pustila návnadu.', 2200);
    } else if (kind === 'early') {
      FS.UI.toast('Zasekl jsi moc brzy!', 2000);
      if (F.mode() === 'bait' && Math.random() < 0.4) { F.hasBait = false; F.refreshRig(); }
    } else if (kind === 'miss') {
      FS.UI.toast('Dravec se nezasekl.', 1800);
    }
  }

  function strike() {
    const b = F.bite;
    FS.Audio.whoosh(0.4);
    if (b) {
      if (b.phase === 'pre') {
        // ťukání: pozdní zásek ještě může vyjít, brzký rybu vyplaší
        if (b.t > b.pre * 0.6 && Math.random() < 0.4) { startFight(b.fish); return; }
        endBite('early'); return;
      }
      const G = g();
      const hf = FS.FishAI.hookFactors(b.fish, F.mode() === 'lure' ? 3.2 : G.hook.s.size);
      const p = (b.phase === 'strike' ? 0.93 : 0.9) * (0.35 + 0.65 * hf.hold);
      if (Math.random() < p) startFight(b.fish);
      else { endBite('miss'); FS.UI.toast('Zásek nesedl – ryba se nezasekla.', 2000); }
      return;
    }
    if (F.state === 'water') {
      // zásek naprázdno – škubnutí montáží
      F.lineLen = Math.max(0.5, F.lineLen - 0.6);
      if (F.mode() === 'lure') F.lureAction = 1; // u přívlače je to cuknutí nástrahou – láká dravce
      else FS.FishAI.disturb(F.rig.pos, 1.5, 0.4);
    }
  }

  // ---------- zdolávání ----------
  function startFight(f) {
    const G = g();
    F.bite = null;
    F.state = 'fight';
    F.fish = f;
    f.state = 'hooked';
    const w = f.weight, sp = f.sp;
    const hold = FS.FishAI.hookFactors(f, F.mode() === 'lure' ? 3.2 : G.hook.s.size).hold;
    const L = f.legend;
    F.fight = {
      maxF: L ? L.maxF : sp.power * w + 0.15, maxSpeed: sp.speed * (0.75 + 0.25 * Math.min(2, Math.sqrt(w / Math.max(0.05, sp.wRef)))),
      E: sp.endurance * (0.6 + 0.4 * Math.pow(w / sp.wRef, 0.3)) * (L ? L.endurance : 1), stamina: 1, phase: 'run', phaseT: 0, hAng: f.yaw, vy: 0,
      t: 0, sumRatio: 0, maxRatio: 0, slack: 0, snagT: 0, hold: L ? Math.max(hold, 0.75) : hold, dragged: 0, vel: new V3(),
      jumps: 0, rage: 0, lure: F.mode() === 'lure', depth: -F.rig.pos.y,
      hookDist: Math.hypot(f.pos.x - FS.Player.pos.x, f.pos.z - FS.Player.pos.z),
    };
    // po záseku ryba vyrazí pryč od rybáře
    f.yaw = Math.atan2(f.pos.z - FS.Player.pos.z, f.pos.x - FS.Player.pos.x) + U.grr(-0.5, 0.5);
    newPhase(true);
    if (L) { FS.UI.boss(L.name); FS.UI.stylePop(L.name.toUpperCase() + '!', '#ffcf5a'); }
    else if (f.variant) FS.UI.stylePop('Vzácná ryba: ' + FS.Variants[f.variant].label + '!', FS.Variants[f.variant].color);
    // počáteční napětí v rozumných mezích (vlasec po záseku není přepnutý)
    const D0 = FS.Rod.tip.distanceTo(f.pos);
    F.lineLen = Math.max(F.lineLen, D0 - 0.15);
    FS.Audio.splash(0.3 + Math.min(1, w / 4));
    FS.UI.toast('Zaseknuto! Pravé tlačítko navíjí, levé + myš vede prut, kolečko = brzda.', 3000);
    FS.UI.fight(true);
    if (FS.Game.state.tut < 3) FS.Game.state.tut = 3;
  }

  function newPhase(first) {
    const Fi = F.fight, f = F.fish, P = FS.Player.pos;
    const away = Math.atan2(f.pos.z - P.z, f.pos.x - P.x);
    const r = Math.random();
    if (Fi.stamina < 0.18) { Fi.phase = 'tired'; Fi.phaseT = U.grr(2, 4); Fi.hDes = away + U.grr(-0.6, 0.6); Fi.yDes = -0.15; return; }
    // legenda se dvakrát rozzuří
    if (f.legend && ((Fi.rage === 0 && Fi.stamina < 0.66) || (Fi.rage === 1 && Fi.stamina < 0.33))) {
      Fi.rage++; Fi.phase = 'rage'; Fi.phaseT = 3.5; Fi.hDes = away + U.grr(-0.5, 0.5); Fi.yDes = -W.waterDepth(f.pos.x, f.pos.z) + 0.2;
      Fi.stamina = Math.min(1, Fi.stamina + 0.06);
      FS.UI.stylePop(f.legend.name + ' zuří!', '#ff6a3d');
      return;
    }
    // výskok nad hladinu
    const jumpy = JUMPY[f.sp.id] || 0;
    if (!first && f.pos.y > -0.9 && Fi.stamina > 0.3 && Math.random() < jumpy * (f.legend ? 1.3 : 1)) {
      Fi.phase = 'jump'; Fi.phaseT = 4; Fi.air = false; Fi.airSlack = 0;
      const hgt = Math.max(0.25, 0.75 / Math.sqrt(Math.max(1, f.weight / 2)));
      Fi.vel.y = Math.sqrt(2 * 9.81 * (-f.pos.y + hgt));
      Fi.vel.x += Math.cos(f.yaw) * 1.2; Fi.vel.z += Math.sin(f.yaw) * 1.2;
      return;
    }
    if (first || r < 0.38) {
      Fi.phase = 'run'; Fi.phaseT = U.grr(1.8, 5);
      let ang = away + U.grr(-0.9, 0.9);
      if (f.sp.habitat === 'reeds' && FS.Veg.reedPoints && Math.random() < 0.45) {
        let best = null, bd = 1e9;
        for (let i = 0; i < FS.Veg.reedPoints.length; i += 7) { const q = FS.Veg.reedPoints[i]; const d = Math.hypot(q[0] - f.pos.x, q[1] - f.pos.z); if (d < bd && d > 2) { bd = d; best = q; } }
        if (best && bd < 20) ang = Math.atan2(best[1] - f.pos.z, best[0] - f.pos.x);
      }
      Fi.hDes = ang; Fi.yDes = f.sp.zone === 'surface' ? -0.3 : -W.waterDepth(f.pos.x, f.pos.z) * 0.7;
    } else if (r < 0.58) {
      Fi.phase = 'shake'; Fi.phaseT = U.grr(0.8, 2.2); Fi.hDes = f.yaw; Fi.yDes = f.pos.y;
    } else if (r < 0.75) {
      Fi.phase = 'dive'; Fi.phaseT = U.grr(1.5, 3.5); Fi.hDes = away + U.grr(-1.5, 1.5); Fi.yDes = -W.waterDepth(f.pos.x, f.pos.z) + 0.15;
    } else if (r < 0.9) {
      Fi.phase = 'circle'; Fi.phaseT = U.grr(2, 4.5); Fi.hDes = away + (Math.random() < 0.5 ? 1.5 : -1.5); Fi.yDes = f.pos.y;
    } else {
      Fi.phase = 'rest'; Fi.phaseT = U.grr(1, 2.5); Fi.hDes = f.yaw; Fi.yDes = f.pos.y;
    }
  }
  const POWER = { run: 1, shake: 0.65, dive: 0.85, circle: 0.55, rest: 0.22, tired: 0.07, rage: 1.45, jump: 0.3 };
  const JUMPY = { stika: 0.22, okoun: 0.12, kapr: 0.1, lysec: 0.08, amur: 0.16, perlin: 0.14, plotice: 0.1, ouklej: 0.12, candat: 0.06, karas: 0.06 };

  function updateFight(dt, inp) {
    const G = g(), Fi = F.fight, f = F.fish, sp = f.sp, tip = FS.Rod.tip;
    Fi.t += dt;
    Fi.phaseT -= dt;
    if (Fi.phaseT <= 0) newPhase(false);
    // kolečko = brzda (obsluha v onWheel)
    const kRod = G.rod.s.load / (0.5 * G.rod.s.len / 3);
    const braid = G.line.id.startsWith('snura');
    const kLine = G.line.s.str / ((braid ? 0.025 : 0.1) * Math.max(3, F.lineLen));
    const k = 1 / (1 / kRod + 1 / kLine);
    const sub = 5, h = dt / sub;
    const reeling = inp.rmb;
    let slipTotal = 0;
    const pull = new V3(), head = new V3();
    for (let s = 0; s < sub; s++) {
      const D = tip.distanceTo(f.pos);
      let T = Math.max(0, (D - F.lineLen) * k);
      if (reeling && T < F.drag * 0.97) F.lineLen = Math.max(0.3, F.lineLen - F.reelSpeed() * h);
      if (T > F.drag) {
        const slip = Math.min((T - F.drag) / k, 60 * h);
        F.lineLen += slip; slipTotal += slip;
        T = Math.max(0, (D - F.lineLen) * k);
      }
      F.tension = T;
      // praskne až při přetížení trvajícím déle než okamžik (krátký cuk vlasec vydrží)
      if (T > G.line.s.str) Fi.over = (Fi.over || 0) + h; else Fi.over = Math.max(0, (Fi.over || 0) - h * 0.5);
      if (Fi.over > 0.07 || T > G.line.s.str * 1.35) { lose('Prásk! Vlasec praskl.', true); FS.Audio.snap(); return; }
      // síly na rybu
      pull.subVectors(tip, f.pos).normalize();
      // natáčení hlavy
      const pullAng = Math.atan2(pull.z, pull.x);
      let des = Fi.hDes;
      if (Fi.phase === 'shake') des = Fi.hDes + Math.sin(Fi.t * 30) * 0.9;
      f.yaw += U.clamp(U.angleDiff(f.yaw, des), -2.8 * h, 2.8 * h);
      f.yaw += U.clamp(U.angleDiff(f.yaw, pullAng), -1, 1) * U.clamp(T / Fi.maxF, 0, 2) * 1.3 * h;
      if (Fi.phase === 'jump') {
        // let vzduchem – gravitace a tah vlasce
        const mJ = f.weight * 1.2 + 0.03;
        Fi.vel.y -= 9.81 * h;
        Fi.vel.addScaledVector(pull.subVectors(tip, f.pos).normalize(), T * 9.81 / mJ * h * 0.5);
        f.pos.addScaledVector(Fi.vel, h);
        if (f.pos.y > 0.02 && !Fi.air) { Fi.air = true; FS.FX.splash(f.pos.x, f.pos.z, Math.min(1.3, 0.4 + f.weight * 0.1)); FS.Audio.splash(0.6); }
        if (Fi.air && T < G.line.s.str * 0.04) Fi.airSlack += h;
        f.roll = Math.sin(Fi.t * 14) * 0.9;
        F.tension = T;
        if (Fi.air && f.pos.y < -0.05 && Fi.vel.y < 0) {
          f.roll = 0;
          FS.FX.splash(f.pos.x, f.pos.z, Math.min(1.5, 0.6 + f.weight * 0.12)); FS.Water.addRipple(f.pos.x, f.pos.z, 1.2); FS.Audio.splash(0.9);
          if (Fi.airSlack > 0.25 && Math.random() < 0.55) { lose('Ryba ve skoku setřásla háček – vlasec byl povolený!', false); return; }
          Fi.jumps++;
          FS.UI.stylePop('SKOK UDRŽEN! +15 %', '#7fe0ff');
          Fi.vel.y = -1; Fi.phase = 'run'; Fi.phaseT = U.grr(1, 2.5);
        }
        continue;
      }
      const pw = POWER[Fi.phase] * (0.22 + 0.78 * Fi.stamina);
      const swim = Fi.maxF * pw * 9.81;
      const dyDes = U.clamp((Fi.yDes - f.pos.y) * 2, -1, 1);
      head.set(Math.cos(f.yaw), dyDes * 0.5, Math.sin(f.yaw)).normalize();
      const Cd = Fi.maxF * 9.81 / (Fi.maxSpeed * Fi.maxSpeed);
      const m = f.weight * 1.6 + 0.03;
      const v = Fi.vel, vl = v.length();
      v.x += ((head.x * swim + pull.x * T * 9.81 - Cd * v.x * vl) / m) * h;
      v.y += ((head.y * swim + pull.y * T * 9.81 * 0.6 - Cd * v.y * vl * 2) / m) * h;
      v.z += ((head.z * swim + pull.z * T * 9.81 - Cd * v.z * vl) / m) * h;
      f.pos.addScaledVector(v, h);
      const dep = W.waterDepth(f.pos.x, f.pos.z);
      if (dep < 0.03) {
        // na suchu nemůže – zastavit na okraji
        f.pos.addScaledVector(v, -h); v.multiplyScalar(0.2);
      } else if (dep < 0.3 && Fi.stamina > 0.3) {
        // čilá ryba se z mělčiny stáčí pryč
        const away = Math.atan2(f.pos.z - FS.Player.pos.z, f.pos.x - FS.Player.pos.x);
        Fi.hDes = away + Math.PI * (Math.random() < 0.5 ? 0.5 : -0.5);
      }
      f.pos.y = U.clamp(f.pos.y, -Math.max(0.1, dep) + 0.06, -0.04);
      // únava
      const headH = new V3(Math.cos(f.yaw), 0, Math.sin(f.yaw));
      const side = 1 - Math.abs(headH.dot(new V3(-pull.x, 0, -pull.z).normalize()));
      Fi.stamina -= (Math.min(1.3, T / Fi.maxF) * 0.55 * (1 + side * 0.6) + pw * 0.45) * h / Fi.E;
      if (T < 0.15 * Fi.maxF) Fi.stamina += 0.02 * h;
      Fi.stamina = U.clamp(Fi.stamina, 0, 1);
      Fi.sumRatio += (T / G.line.s.str) * h;
      Fi.maxRatio = Math.max(Fi.maxRatio, T / G.line.s.str);
      // povolený vlasec
      if (T < 0.06 * Fi.maxF + 0.03) Fi.slack += h; else Fi.slack = Math.max(0, Fi.slack - h * 2);
    }
    f.speed = Fi.vel.length();
    f.fightPower = POWER[Fi.phase] * Fi.stamina;
    Fi.dragged += slipTotal;
    FS.Audio.dragRate = slipTotal / dt * 40;
    if (reeling) { FS.Audio.reelRate = F.tension < F.drag * 0.97 ? 6 + F.reelSpeed() * 12 : 4; FS.Rod.setReeling(F.reelSpeed(), dt); }
    if (Fi.stamina < 0.18 && Fi.phase !== 'tired') newPhase(false);
    // vyháčkování
    if (Fi.t > 3 && Fi.slack > 2 && Math.random() < dt * 0.4 * (1.15 - Fi.hold)) { lose('Povolil jsi vlasec a ryba se vyháčkovala.', false); return; }
    if (Fi.phase === 'shake' && F.tension > F.drag * 0.6 && Math.random() < dt * 0.06 * (1.1 - Fi.hold)) { lose('Ryba se vytřepala z háčku.', false); return; }
    // rákosí
    if (W.reedDensity(f.pos.x, f.pos.z) > 0.35) {
      Fi.snagT += dt;
      if (Fi.snagT > 1.2 && F.tension > G.line.s.str * 0.3 && Math.random() < dt * 0.35) { lose('Ryba tě zamotala v rákosí a vlasec praskl.', true); FS.Audio.snap(); return; }
      if (Fi.snagT > 0.2 && Fi.snagT < 0.25) FS.UI.toast('Pozor, ryba táhne do rákosí!', 1500);
    } else Fi.snagT = 0;
    // šplouchání u hladiny
    if (f.pos.y > -0.35 && f.fightPower > 0.3 && Math.random() < dt * 2.5) {
      const sz = Math.min(1.2, 0.2 + f.weight * 0.15) * f.fightPower;
      FS.FX.splash(f.pos.x, f.pos.z, sz); FS.Water.addRipple(f.pos.x, f.pos.z, 0.8); FS.Audio.splash(sz * 0.8);
    }
    if (Math.random() < dt * 3) FS.Water.addRipple(f.pos.x, f.pos.z, 0.25);
    // pohyb rigu = ústa ryby
    F.rig.pos.copy(f.pos).add(new V3(Math.cos(f.yaw), 0, Math.sin(f.yaw)).multiplyScalar(f.len * 0.42));
    f.pitch = U.clamp(Fi.vel.y * 0.4, -0.5, 0.5);
    FS.FishAI.animate(f, dt);
    // podebrání
    const P = FS.Player.pos;
    const hd = Math.hypot(f.pos.x - P.x, f.pos.z - P.z);
    const reach = G.rod.s.len * 0.55 + 1.3;
    const small = f.weight < 0.25;
    const ready = Fi.stamina < 0.3 || (small && F.lineLen < G.rod.s.len + 1);
    const fdep = W.waterDepth(f.pos.x, f.pos.z);
    if (ready && f.pos.y > -0.7 && hd < reach) { land(); return; }
    if (ready && fdep < 0.4) {
      if ((f.weight < 0.6 && hd < 14) || hd < 6) { FS.UI.toast('Vytáhl jsi rybu po mělčině na břeh.', 1800); land(); return; }
      if (!Fi.shoreHint) { Fi.shoreHint = true; FS.UI.toast('Ryba je unavená u břehu – dojdi k ní (WASD) a podeber ji.', 3500); }
    }
    FS.UI.fightUpdate({
      tension: F.tension, str: G.line.s.str, drag: F.drag, stamina: Fi.stamina, lineLen: F.lineLen,
      dist: hd, depth: -f.pos.y, overload: F.tension > G.rod.s.load,
    });
  }

  function land() {
    const f = F.fish, Fi = F.fight, G = g();
    if (f.legend && !FS.Game.has('podberak')) {
      lose(`${f.legend.name} se u břehu vysmekla! Na legendu potřebuješ podběrák.`, false);
      return;
    }
    if (f.weight > 2.5 && !FS.Game.has('podberak') && Math.random() < 0.5) {
      lose(`U břehu se ryba (${U.fmtKg(f.weight)}) vysmekla! Na větší ryby potřebuješ podběrák.`, false);
      return;
    }
    const sp = f.sp;
    const powerRatio = Fi.maxF / G.line.s.str;
    const avg = Fi.sumRatio / Math.max(1, Fi.t);
    let diff = 0.55 * Math.min(2, powerRatio) + 0.9 * avg + 0.45 * Fi.maxRatio + 0.5 * Math.min(1, Fi.t / 90) + (sp.predator ? 0.15 : 0) + Math.min(0.3, Fi.dragged / 60);
    diff = U.clamp(diff, 0, 3);
    const baseVal = sp.base + sp.perKg * f.weight;
    const mult = 1 + 0.5 * diff;
    // bonus za styl
    const streak = (FS.Game.state.streak || 0) + 1;
    const bonuses = [];
    if (Fi.jumps) bonuses.push({ label: `Udržené skoky ×${Fi.jumps}`, v: 0.15 * Math.min(4, Fi.jumps), key: 'jump' });
    if (Fi.hookDist > 22) bonuses.push({ label: 'Dalekonosný hod', v: 0.2, key: 'far' });
    if (Fi.maxRatio > 0.85) bonuses.push({ label: 'Na hraně vlasce', v: 0.25, key: 'edge' });
    if (f.weight > 1 && Fi.dragged < 0.5) bonuses.push({ label: 'Pevná ruka', v: 0.15, key: 'steady' });
    if (f.weight > 1.2 && Fi.t < 15) bonuses.push({ label: 'Bleskové zdolání', v: 0.2, key: 'quick' });
    if (streak >= 2) bonuses.push({ label: `Série ${streak} úlovků`, v: Math.min(0.5, 0.1 * (streak - 1)), key: 'streak' });
    const styleSum = bonuses.reduce((a, b) => a + b.v, 0);
    const vmult = f.variant ? FS.Variants[f.variant].mult : 1;
    const value = Math.round(baseVal * mult * (1 + styleSum) * vmult);
    const stars = U.clamp(Math.round((diff / 3) * 5 + 0.5), 1, 5);
    const tokens = f.legend ? f.legend.tokens : f.variant ? 1 : 0;
    FS.UI.fight(false);
    FS.UI.boss(null);
    FS.Audio.splash(0.4);
    if (F.mode() === 'bait') F.hasBait = false;
    FS.FishAI.fish = FS.FishAI.fish.filter((o) => o !== f);
    if (!f.legend) FS.FishAI.respawnQueue.push(FS.uniforms.uTime.value + 30 + Math.random() * 30);
    F.fish = null;
    f.roll = 0;
    const data = {
      sp, weight: f.weight, length: f.len * 100, value, baseVal, mult, diff, stars, time: Fi.t,
      bonuses, styleSum, vmult, variant: f.variant, legend: f.legend, tokens, streak,
      lure: Fi.lure, depth: Fi.depth,
      onDone: () => { F.state = 'idle'; toIdle(); },
      model: f.model,
    };
    // ryba se chvíli plácá na břehu
    const P = FS.Player;
    const fwd = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    const pos = P.pos.clone().addScaledVector(fwd, 1.4);
    pos.y = Math.max(W.heightAt(pos.x, pos.z), 0) + 0.4;
    F.state = 'flop';
    F.flop = { t: 0, f, data, pos, vel: new V3(U.grr(-0.4, 0.4), 1.5, U.grr(-0.4, 0.4)), yaw: f.yaw, spinV: U.grr(-4, 4), side: Math.random() < 0.5 ? 1 : -1 };
    f.model.group.visible = true;
    f.model.group.rotation.order = 'YXZ';
  }

  function updateFlop(dt) {
    const fl = F.flop, f = fl.f, g = f.model.group;
    fl.t += dt;
    if (fl.stolen) {
      // racek odnáší rybu
      if (fl.stolen.done) { F.flop = null; FS.UI.toast('Racek ti ukradl rybu! Příště ji rychleji schovej.', 3500); F.state = 'idle'; toIdle(); }
      return;
    }
    if (!fl.checked && fl.t > 0.3) {
      fl.checked = true;
      if (f.weight < 0.3 && FS.Birds && Math.random() < 0.12) { fl.stolen = FS.Birds.steal(g); if (fl.stolen) return; }
    }
    fl.vel.y -= 9.81 * dt;
    fl.pos.addScaledVector(fl.vel, dt);
    const gh = Math.max(W.heightAt(fl.pos.x, fl.pos.z), 0) + Math.max(0.02, f.len * 0.09);
    if (fl.pos.y < gh) {
      fl.pos.y = gh;
      if (fl.t < 1.4) {
        const k = 1 - fl.t / 1.7;
        fl.vel.set(U.grr(-0.7, 0.7) * k, U.grr(1.1, 2.0) * k / Math.sqrt(Math.max(1, f.weight / 2)), U.grr(-0.7, 0.7) * k);
        fl.spinV = U.grr(-7, 7);
        fl.side = -fl.side;
        FS.Audio.plop(0.18);
        if (Math.random() < 0.5) FS.FX.splash(fl.pos.x, fl.pos.z, 0.15);
      } else fl.vel.set(0, 0, 0);
    }
    fl.yaw += fl.spinV * dt;
    fl.spinV *= 1 - Math.min(1, dt * 2);
    g.position.copy(fl.pos);
    g.rotation.set(fl.side * Math.PI / 2, -fl.yaw, 0);
    // plácání na břehu: tělo se prohýbá do „C" střídavě na obě strany
    // ryba leží na boku: ohyb těla míří vždy vzhůru od země (jinak by ocas zajížděl pod dlažbu)
    const decay = Math.max(0.12, 1 - fl.t / 2);
    f.model.u.uCurve.value = -fl.side * 0.24 * (0.5 + 0.5 * Math.sin(fl.t * 15)) * decay;
    f.model.u.uAmp.value = 0;
    F.rig.pos.copy(fl.pos);
    if (fl.t > 1.8) {
      F.flop = null;
      F.state = 'landed';
      FS.FishAI.scene.remove(g);
      g.rotation.order = 'XYZ';
      g.rotation.set(0, 0, 0);
      f.model.u.uCurve.value = 0;
      afterCatch(fl.data);
      FS.UI.showCatch(fl.data);
    }
  }

  // úlovek je jistý – série, žetony, legendy, úkoly
  function afterCatch(d) {
    const S = FS.Game.state;
    S.streak = d.streak;
    if (d.tokens) S.tokens = (S.tokens || 0) + d.tokens;
    if (d.legend) { S.legends = S.legends || {}; S.legends[d.legend.id] = 'caught'; }
    if (d.variant) { S.variants = S.variants || {}; (S.variants[d.sp.id] = S.variants[d.sp.id] || {})[d.variant] = 1; }
    FS.Game.save();
    if (FS.Quests) FS.Quests.onCatch(d);
  }

  function lose(msg, broke) {
    const G = g();
    FS.UI.toast(msg, 3200);
    FS.UI.fight(false);
    FS.UI.boss(null);
    if (F.fish) {
      if ((FS.Game.state.streak || 0) > 1) FS.UI.toast(`Série ${FS.Game.state.streak} úlovků přerušena.`, 2500);
      FS.Game.state.streak = 0;
      F.fish.roll = 0;
      const f = F.fish;
      f.state = 'flee'; f.timer = 4; f.cooldown = 40; f.fleeYaw = f.yaw; f.fightPower = 0;
      f.speed = 0.5;
    }
    if (F.bite) { const f = F.bite.fish; if (f.state === 'biting') { f.state = 'flee'; f.timer = 3; f.cooldown = 30; f.fleeYaw = f.yaw; } F.bite = null; }
    F.fish = null;
    if (broke) {
      if (F.mode() === 'lure') {
        FS.Game.removeItem(G.lure.id);
        FS.UI.toast(`Přišel jsi o nástrahu: ${G.lure.name}`, 3000);
      } else {
        FS.Game.consume(G.hook.id, 1);
        FS.Game.consume(G.float.id, 1);
      }
      F.hasBait = false;
    } else if (F.mode() === 'bait' && Math.random() < 0.6) F.hasBait = false;
    F.state = 'idle';
    F.rig.pos.copy(FS.Rod.tip).add(new V3(0, -0.5, 0));
    F.rig.vel.set(0, 0, 0);
    FS.Rod.ropeInit = false;
    toIdle();
  }

  // ---------- kolečko, krmení ----------
  F.onWheel = function (delta) {
    const G = g();
    if (FS.Player.input.rmb) { F.setReelLevel(F.reelLevel + (delta < 0 ? 1 : -1)); return; }
    if (F.state === 'fight') {
      F.drag = U.clamp(F.drag + (delta < 0 ? 0.25 : -0.25) * Math.max(1, G.reel.s.drag / 8), 0.3, G.reel.s.drag);
      FS.UI.toast(`Brzda: ${U.fmt1(F.drag)} kg`, 900);
    } else if (F.mode() === 'bait') {
      F.depthSet = U.clamp(Math.round((F.depthSet + (delta < 0 ? 0.1 : -0.1)) * 10) / 10, 0.2, 4.5);
    } else {
      F.drag = U.clamp(F.drag + (delta < 0 ? 0.25 : -0.25), 0.3, G.reel.s.drag);
      FS.UI.toast(`Brzda: ${U.fmt1(F.drag)} kg`, 900);
    }
  };

  F.throwGroundbait = function () {
    const G = g();
    if (!G.gb) { FS.UI.toast('Nemáš vybraný příkrm [Tab].'); return; }
    if (FS.Game.count(G.gb.id) <= 0) { FS.UI.toast('Příkrm došel – dokup ho ve stánku.'); return; }
    let target;
    if (F.state === 'water' || F.state === 'fight') target = F.rig.pos.clone();
    else {
      const cam = FS.Player.camera;
      const dir = new V3(); cam.getWorldDirection(dir);
      if (dir.y > -0.02) dir.y = -0.06;
      const tt = -cam.position.y / dir.y;
      target = cam.position.clone().addScaledVector(dir, Math.min(tt, 22));
      if (Math.hypot(target.x - cam.position.x, target.z - cam.position.z) > 22) {
        const hd = new V3(dir.x, 0, dir.z).normalize();
        target = cam.position.clone().addScaledVector(hd, 22);
      }
    }
    if (W.waterDepth(target.x, target.z) < 0.3) { FS.UI.toast('Tam není voda.'); return; }
    FS.Game.consume(G.gb.id, 1);
    const from = FS.Player.camera.position.clone().add(new V3(0, -0.2, 0));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...G.gb.col), roughness: 1 }));
    FS.scene.add(ball);
    const dur = 0.5 + from.distanceTo(target) / 25;
    let t = 0;
    F.balls = F.balls || [];
    F.balls.push({ ball, from, target, dur, t, type: G.gb.id, col: G.gb.col });
    FS.Audio.whoosh(0.3);
  };
  function updateBalls(dt) {
    if (!F.balls) return;
    F.balls = F.balls.filter((b) => {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.ball.position.lerpVectors(b.from, b.target, k);
      b.ball.position.y += Math.sin(k * Math.PI) * (2 + b.dur * 2);
      if (k >= 1) {
        FS.scene.remove(b.ball);
        FS.FX.splash(b.target.x, b.target.z, 0.5);
        FS.FX.cloud(b.target.x, b.target.z, b.col);
        FS.Water.addRipple(b.target.x, b.target.z, 0.9);
        FS.Audio.splash(0.5);
        FS.FishAI.addFeed(b.target.x, b.target.z, b.type);
        FS.UI.toast('Zakrmeno – ryby se začnou stahovat.', 1800);
        return false;
      }
      return true;
    });
  }

  // ---------- vizuál montáže ----------
  const _q = new THREE.Quaternion();
  function updateVisuals(dt) {
    const R = FS.Rod, r = F.rig, t = FS.uniforms.uTime.value;
    updateBalls(dt);
    const lureMode = F.mode() === 'lure';
    let end = _end.copy(r.pos);
    R.floatObj.visible = !lureMode;
    R.lureObj.visible = lureMode;
    R.baitObj.visible = !lureMode;
    R.shots.visible = !lureMode;
    if (!lureMode) {
      const fpos = _fpos.copy(r.pos);
      let tilt = 0;
      // splávek ve vodě zvětšený se vzdáleností, aby zůstal čitelný na obrazovce
      const camD = FS.Player.camera.position.distanceTo(r.pos);
      const fs = F.state === 'water' || F.state === 'fight' ? Math.max(2.4, camD * 0.65) : 2.4;
      if (R.floatObj.children[0]) R.floatObj.children[0].scale.setScalar(fs);
      if (F.state === 'water') {
        fpos.y = FS.Water.surfaceY(r.pos.x, r.pos.z, t) + (F.floatDy - 0.012) * fs / 2.4;
        tilt = F.floatTilt;
      } else if (F.state === 'fight' && F.fish) {
        const fd = -F.fish.pos.y;
        const under = Math.max(0, fd - F.depthSet);
        fpos.copy(F.fish.pos).add(_tmp.subVectors(FS.Rod.tip, F.fish.pos).normalize().multiplyScalar(Math.min(F.depthSet, fd) + 0.1));
        fpos.y = -Math.min(1.2, under) + FS.Water.surfaceY(fpos.x, fpos.z, t);
        tilt = 0.6;
      }
      R.floatObj.position.copy(fpos);
      const sway = F.state === 'water' ? Math.sin(t * 1.3) * 0.05 : 0;
      R.floatObj.rotation.set(tilt * 0.8 + sway, 0, tilt * 0.6);
      end.copy(fpos); end.y += 0.035 * fs;
      // nástraha pod splávkem
      const bpos = _bpos;
      if (F.state === 'water') { if (F.baitPos) bpos.copy(F.baitPos); else { bpos.copy(fpos); bpos.y -= 0.3; } }
      else if (F.state === 'fight' && F.fish) bpos.copy(F.rig.pos);
      else { bpos.copy(fpos); bpos.y -= 0.32; }
      R.baitObj.position.copy(bpos);
      R.baitObj.rotation.set(0, t * 0.3, Math.sin(t * 2) * 0.1);
      R.shots.position.copy(fpos).lerp(bpos, 0.55);
      R.setLeader(fpos, bpos);
      if (R.baitFish) { R.baitFish.u.uPhase.value += dt * 8; }
    } else {
      R.lureObj.position.copy(r.pos);
      const dirToTip = _tmp.subVectors(FS.Rod.tip, r.pos).normalize();
      _q.setFromUnitVectors(_yAxis, dirToTip);
      R.lureObj.quaternion.copy(_q);
      if (R.lureSpin) R.lureSpin.rotation.y += dt * (F.state === 'water' ? 6 + F.lureSpeed * 40 : 2);
      if (R.lureWobble) R.lureWobble.rotation.z = Math.sin(t * (10 + F.lureSpeed * 20)) * (0.1 + Math.min(0.4, F.lureSpeed * 0.5));
      R.setLeader(null);
    }
    const taut = F.state === 'fight' || (F.state === 'flying' && !F.brake) || F.tension > 0.12;
    R.updateLine(dt, F.lineLen, end, taut);
  }
})(window.FS);
