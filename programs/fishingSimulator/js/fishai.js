'use strict';
// Populace ryb v rybníce: putování podle druhu, reakce na návnady, krmení, plašení.
(function (FS) {
  const U = FS.U, W = FS.World;
  const AI = { fish: [], feeds: [], respawnQueue: [] };
  FS.FishAI = AI;
  const V3 = THREE.Vector3;
  const POP = 70;

  function pickSpecies() {
    const tot = FS.Species.reduce((a, s) => a + s.abundance, 0);
    let r = Math.random() * tot;
    for (const s of FS.Species) { r -= s.abundance; if (r <= 0) return s; }
    return FS.Species[0];
  }
  function randomWaterPoint(sp, minDepth = 0.5) {
    for (let k = 0; k < 60; k++) {
      const x = U.grr(-46, 22), z = U.grr(-41, -4.5);
      const d = W.waterDepth(x, z);
      if (d < minDepth) continue;
      if (sp) {
        if (sp.habitat === 'deep' && d < 1.8 && Math.random() < 0.75) continue;
        if (sp.habitat === 'reeds' && W.pondSD(x, z) < -8 && Math.random() < 0.7) continue;
      }
      return new V3(x, 0, z);
    }
    return new V3(-12, 0, -22);
  }
  AI.randomWaterPoint = randomWaterPoint;

  function zoneY(sp, x, z) {
    const d = W.waterDepth(x, z);
    if (sp.zone === 'bottom') return -Math.max(0.25, d - 0.18);
    if (sp.zone === 'surface') return -Math.min(d * 0.5, U.grr(0.12, 0.45));
    return -Math.max(0.25, d * U.grr(0.3, 0.6));
  }

  AI.spawn = function (sp, legend) {
    sp = sp || pickSpecies();
    const variant = legend ? null : FS.rollVariant(sp);
    const weight = legend ? legend.weight : sp.wMin + (sp.wMax - sp.wMin) * Math.pow(Math.random(), sp.skew);
    const len = FS.lengthFromWeight(sp, weight) / 100;
    const p = legend ? new V3(legend.zone[0], 0, legend.zone[1]) : randomWaterPoint(sp);
    p.y = zoneY(sp, p.x, p.z);
    const lookSp = legend ? FS.variantSpecies(sp, null, legend.look) : FS.variantSpecies(sp, variant);
    const model = FS.FishModel.create(sp.id, len, lookSp);
    const f = {
      sp, weight, len, pos: p, vel: new V3(), yaw: Math.random() * Math.PI * 2, pitch: 0, speed: 0,
      state: 'wander', timer: 0, target: null, cooldown: Math.random() * 5, hunger: Math.random(),
      hungerPh: Math.random() * 100, model, check: Math.random() * 0.3, id: Math.random().toString(36).slice(2),
      variant, legend: legend || null,
    };
    newTarget(f);
    AI.scene.add(model.group);
    AI.fish.push(f);
    return f;
  };

  AI.init = function (scene) {
    AI.scene = scene;
    for (let i = 0; i < POP; i++) AI.spawn();
    const L = FS.Game.state.legends || {};
    for (const id in L) if (L[id] === 'active') AI.spawnLegend(id);
  };
  AI.spawnLegend = function (id) {
    if (AI.fish.some((f) => f.legend && f.legend.id === id)) return;
    const def = FS.LegendById[id];
    AI.spawn(FS.SpeciesById[def.sp], def);
  };

  AI.remove = function (f) {
    AI.scene.remove(f.model.group);
    f.model.mats.forEach((m) => m.dispose());
    AI.fish = AI.fish.filter((o) => o !== f);
    if (!f.legend) AI.respawnQueue.push(FS.uniforms.uTime.value + 25 + Math.random() * 30);
  };

  function newTarget(f) {
    let p = null;
    if (f.legend) {
      // legenda se drží svého místa
      for (let k = 0; k < 20 && !p; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * f.legend.r;
        const q = new V3(f.legend.zone[0] + Math.cos(a) * r, 0, f.legend.zone[1] + Math.sin(a) * r);
        if (W.waterDepth(q.x, q.z) > 0.8) p = q;
      }
      p = p || new V3(f.legend.zone[0], 0, f.legend.zone[1]);
      p.y = zoneY(f.sp, p.x, p.z);
      f.target = p; f.cruise = f.sp.speed * 0.18;
      return;
    }
    // krmné místo láká
    for (const fd of AI.feeds) {
      const like = f.sp.gb[fd.type] || 0;
      if (like > 0 && Math.random() < like * 0.6) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * fd.r;
        p = new V3(fd.x + Math.cos(a) * r, 0, fd.z + Math.sin(a) * r);
        if (W.waterDepth(p.x, p.z) < 0.4) p = null;
        break;
      }
    }
    if (!p) {
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2, r = U.grr(3, 12);
        p = new V3(f.pos.x + Math.cos(a) * r, 0, f.pos.z + Math.sin(a) * r);
        if (W.waterDepth(p.x, p.z) < 0.5) p = randomWaterPoint(f.sp);
      } else p = randomWaterPoint(f.sp);
    }
    p.y = zoneY(f.sp, p.x, p.z);
    f.target = p;
    f.cruise = f.sp.speed * U.grr(0.12, 0.3) * (0.7 + 0.3 * Math.min(1.5, Math.sqrt(f.len / 0.3)));
  }

  // společné řízení pohybu k cíli
  function steer(f, target, speed, dt, turnRate = 1.6) {
    const dx = target.x - f.pos.x, dz = target.z - f.pos.z;
    const want = Math.atan2(dz, dx);
    const d = U.angleDiff(f.yaw, want);
    // úhlová rychlost se mění plynule – ryba se stáčí obloukem, ne jako otočná tyč
    f.yawVel = f.yawVel || 0;
    f.yawVel += (U.clamp(d * 2.2, -turnRate, turnRate) - f.yawVel) * Math.min(1, dt * 3);
    f.yaw += f.yawVel * dt;
    // pulzní plavání: zrychlení a klouzání, při zatáčení zpomalí
    const pulse = 0.78 + 0.32 * Math.max(0, Math.sin(FS.uniforms.uTime.value * 1.3 + f.hungerPh));
    const want_ = speed * pulse * (1 - Math.min(0.5, Math.abs(f.yawVel) * 0.25));
    f.speed += (want_ - f.speed) * Math.min(1, dt * (want_ > f.speed ? 2.2 : 0.9));
    const nx = f.pos.x + Math.cos(f.yaw) * f.speed * dt, nz = f.pos.z + Math.sin(f.yaw) * f.speed * dt;
    const depth = W.waterDepth(nx, nz);
    if (depth < 0.3) { f.yawVel += (f.yawVel >= 0 ? 1 : -1) * 3 * dt; f.speed *= 1 - Math.min(1, dt * 2); return false; }
    f.pos.x = nx; f.pos.z = nz;
    const ty = U.clamp(target.y, -depth + 0.12, -0.08);
    const dy = ty - f.pos.y;
    f.pos.y += U.clamp(dy, -0.25 * dt, 0.25 * dt);
    f.pitch += (U.clamp(dy * 2, -0.4, 0.4) - f.pitch) * Math.min(1, dt * 2);
    return true;
  }

  AI.hookFactors = function (f, hookSize) {
    const ideal = f.sp.mouth + 0.6 * Math.log2(Math.max(0.05, f.weight / f.sp.wRef));
    const bite = hookSize > ideal ? Math.exp(-((hookSize - ideal) ** 2) / 1.4) : 1;
    const hold = hookSize < ideal ? Math.exp(-((ideal - hookSize) ** 2) / 3.5) : 1;
    return { bite, hold };
  };

  function depthMatch(f, R) {
    const bottom = W.waterDepth(R.pos.x, R.pos.z);
    const d = -R.pos.y;
    if (f.sp.zone === 'bottom') return d > bottom - 0.35 ? 1 : 0.25 + 0.5 * U.clamp(d / bottom, 0, 1);
    if (f.sp.zone === 'surface') return d < 0.7 ? 1 : d < 1.4 ? 0.45 : 0.15;
    return d > 0.3 && d < bottom - 0.2 ? 1 : 0.55;
  }

  function feedBonus(f, pos) {
    let b = 0;
    for (const fd of AI.feeds) {
      const like = f.sp.gb[fd.type] || 0;
      if (!like) continue;
      const d = Math.hypot(pos.x - fd.x, pos.z - fd.z);
      if (d < fd.r + 4) b = Math.max(b, like * fd.strength);
    }
    return b;
  }

  AI.disturb = function (pos, radius, strength = 1) {
    for (const f of AI.fish) {
      if (f.state === 'hooked' || f.state === 'biting') continue;
      const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
      if (d < radius && Math.random() < strength) {
        f.state = 'flee'; f.timer = U.grr(2, 4); f.cooldown = U.grr(5, 12);
        f.fleeYaw = Math.atan2(f.pos.z - pos.z, f.pos.x - pos.x);
      }
    }
  };

  AI.addFeed = function (x, z, type) {
    AI.feeds.push({ x, z, type, r: 3.5, t0: FS.uniforms.uTime.value, dur: 300, strength: 1 });
    // přilákat ryby z okolí
    for (const f of AI.fish) {
      const like = f.sp.gb[type] || 0;
      if (like && f.state === 'wander' && Math.hypot(f.pos.x - x, f.pos.z - z) < 25 && Math.random() < like * 0.7) {
        f.target = new V3(x + U.grr(-2, 2), 0, z + U.grr(-2, 2));
        f.target.y = zoneY(f.sp, f.target.x, f.target.z);
        f.hunger = Math.min(1, f.hunger + 0.3);
      }
    }
  };

  AI.update = function (dt) {
    const t = FS.uniforms.uTime.value;
    const F = FS.Fishing;
    const R = F.rigInfo();
    // krmení vyprchává
    AI.feeds = AI.feeds.filter((fd) => { fd.strength = 1 - (t - fd.t0) / fd.dur; return fd.strength > 0; });
    // obnova populace
    AI.respawnQueue = AI.respawnQueue.filter((tt) => { if (t > tt) { AI.spawn(); return false; } return true; });
    let inspecting = AI.fish.some((f) => f.state === 'inspect' || f.state === 'biting');

    for (const f of AI.fish) {
      f.cooldown -= dt;
      f.hunger = U.clamp(0.45 + 0.55 * Math.sin(t * 0.013 + f.hungerPh) * 0.5 + 0.275 + feedBonus(f, f.pos) * 0.3, 0.1, 1);
      if (f.state === 'hooked') continue; // řídí zdolávání
      if (f.state === 'biting') {
        // ryba drží nástrahu, pohyb řídí Fishing
        animate(f, dt);
        continue;
      }
      f.check -= dt;
      const doCheck = f.check <= 0;
      if (doCheck) f.check = 0.3;

      if (f.state === 'wander') {
        if (!steer(f, f.target, f.cruise, dt) || Math.hypot(f.target.x - f.pos.x, f.target.z - f.pos.z) < 0.8) {
          if (Math.random() < 0.3) { f.state = 'rest'; f.timer = U.grr(1.5, 5); } else newTarget(f);
        }
        if (doCheck && R.active && f.cooldown <= 0) considerRig(f, R);
      } else if (f.state === 'rest') {
        f.speed *= 1 - Math.min(1, dt * 1.5);
        f.yaw += Math.sin(t * 0.7 + f.hungerPh) * dt * 0.2;
        f.timer -= dt;
        if (f.timer <= 0) { f.state = 'wander'; newTarget(f); }
        if (doCheck && R.active && f.cooldown <= 0) considerRig(f, R);
      } else if (f.state === 'flee') {
        const tg = new V3(f.pos.x + Math.cos(f.fleeYaw) * 5, f.pos.y - 0.3, f.pos.z + Math.sin(f.fleeYaw) * 5);
        if (!steer(f, tg, f.sp.speed * 0.8, dt, 4)) f.fleeYaw += 1.2;
        f.timer -= dt;
        if (f.timer <= 0) { f.state = 'wander'; newTarget(f); }
      } else if (f.state === 'approach') {
        if (!R.active || R.mode !== f.mode) { f.state = 'wander'; f.cooldown = 3; newTarget(f); continue; }
        const d = Math.hypot(R.pos.x - f.pos.x, R.pos.z - f.pos.z);
        const busy = inspecting && f.state !== 'inspect';
        const tg = busy && d < 1.5 ? new V3(R.pos.x + Math.cos(t + f.hungerPh) * 1.0, R.pos.y, R.pos.z + Math.sin(t + f.hungerPh) * 1.0) : R.pos;
        // ústa k nástraze – cíl kousek před tělem
        steer(f, tg, f.cruise * 1.7 + 0.08, dt, 2.2);
        if (!busy && d < 0.25 + f.len * 0.5) {
          f.state = 'inspect'; f.timer = U.grr(1.0, 4.0) / (0.6 + f.hunger * 0.6); inspecting = true; f.nib = 0.3;
        }
        if (d > 18) { f.state = 'wander'; newTarget(f); }
      } else if (f.state === 'inspect') {
        if (!R.active || R.mode !== 'bait') { f.state = 'wander'; f.cooldown = 4; newTarget(f); inspecting = false; continue; }
        // držet se u nástrahy, ústy k ní
        const mouth = new V3(R.pos.x - Math.cos(f.yaw) * f.len * 0.45, R.pos.y, R.pos.z - Math.sin(f.yaw) * f.len * 0.45);
        steer(f, mouth, 0.06, dt, 1.2);
        f.nib -= dt;
        if (f.nib <= 0) { f.nib = U.grr(0.35, 1.1); if (Math.random() < 0.6) F.nibble(f); }
        f.timer -= dt;
        if (f.timer <= 0) {
          inspecting = false;
          const hf = AI.hookFactors(f, R.hookSize);
          const lineF = 1 - f.sp.shy * U.clamp((R.lineD - 0.16) / 0.3, 0, 1) * 0.8;
          const idealG = 1 + f.weight * 3;
          const floatF = R.floatG <= idealG ? 1 : U.clamp(1 - (R.floatG - idealG) * 0.05, 0.5, 1);
          const pref = f.legend ? 0.75 : (f.sp.baits[R.baitId] || 0);
          const p = U.clamp(pref * hf.bite * lineF * floatF * (0.55 + 0.45 * f.hunger) * (1 + feedBonus(f, f.pos) * 0.4) + 0.08, 0, 0.96);
          if (Math.random() < p && F.startBite(f)) {
            f.state = 'biting';
          } else {
            f.state = 'wander'; f.cooldown = U.grr(8, 20); newTarget(f);
            if (Math.random() < 0.18 + (R.soft ? 0.2 : 0)) F.baitNibbledOff();
          }
        }
      } else if (f.state === 'chase') {
        if (!R.active || R.mode !== 'lure') { f.state = 'wander'; f.cooldown = 4; newTarget(f); continue; }
        const back = new V3(R.pos.x - R.dir.x * 0.5, R.pos.y, R.pos.z - R.dir.z * 0.5);
        steer(f, back, Math.max(R.speed * 1.15, 0.3), dt, 3.5);
        f.timer -= dt;
        if (doCheck) {
          const pref = f.legend ? 0.8 : (f.sp.lures[R.lureId] || 0) * (R.lureBonus || 1);
          const speedSuit = Math.exp(-(((R.speed - 0.55) / 0.45) ** 2));
          const near = Math.hypot(R.pos.x - f.pos.x, R.pos.z - f.pos.z) < 1.4;
          const p = pref * (0.25 + speedSuit * 0.5 + R.action * 0.5) * (0.5 + f.hunger * 0.5) * 0.45;
          if (near && Math.random() < p && F.lureStrike(f)) { f.state = 'biting'; continue; }
          if (R.speed < 0.08 && Math.random() < 0.15) { f.state = 'wander'; f.cooldown = U.grr(4, 10); newTarget(f); }
        }
        if (f.timer <= 0) { f.state = 'wander'; f.cooldown = U.grr(5, 15); newTarget(f); }
      }
      // nepovolit opuštění vody
      const dep = W.waterDepth(f.pos.x, f.pos.z);
      f.pos.y = U.clamp(f.pos.y, -dep + 0.08, -0.06);
      animate(f, dt);
    }
  };

  function considerRig(f, R) {
    const dx = R.pos.x - f.pos.x, dz = R.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz) + Math.abs(R.pos.y - f.pos.y) * 1.5;
    if (f.legend) {
      // legenda bere jen na své nástrahy, poblíž svého místa a opatrně
      const L = f.legend;
      const ok = R.mode === 'bait' ? L.baits.includes(R.baitId) : (L.lures.includes(R.lureId) && R.speed > 0.12);
      if (!ok || dist > 9 || Math.hypot(R.pos.x - L.zone[0], R.pos.z - L.zone[1]) > L.r + 5) return;
      if (Math.random() < 0.22 * (0.5 + f.hunger * 0.5)) {
        if (R.mode === 'bait') { f.state = 'approach'; f.mode = 'bait'; } else { f.state = 'chase'; f.mode = 'lure'; f.timer = U.grr(6, 12); }
      }
      return;
    }
    if (R.mode === 'bait') {
      const pref = f.sp.baits[R.baitId] || 0;
      if (!pref) return;
      const fb = feedBonus(f, R.pos);
      const Rdet = 2.5 + 6.5 * pref + fb * 6;
      if (dist > Rdet) return;
      const p = pref * depthMatch(f, R) * f.hunger * (0.45 + fb * 0.8) * 0.75;
      if (Math.random() < p) { f.state = 'approach'; f.mode = 'bait'; }
    } else {
      const pref = (f.sp.lures[R.lureId] || 0) * (R.lureBonus || 1);
      if (!pref || R.speed < 0.12) return;
      const Rdet = 4 + 7 * pref;
      if (dist > Rdet) return;
      const p = pref * f.hunger * 0.45 * (R.depthOk(f) ? 1 : 0.4);
      if (Math.random() < p) { f.state = 'chase'; f.mode = 'lure'; f.timer = U.grr(5, 12); }
    }
  }

  const _e = new THREE.Euler(0, 0, 0, 'YZX');
  function animate(f, dt) {
    const g = f.model.group;
    // hluboko v kalné vodě nebo daleko ryba stejně není vidět – nevykreslovat
    const cam = FS.Player.camera.position;
    const dd = (f.pos.x - cam.x) ** 2 + (f.pos.z - cam.z) ** 2;
    g.visible = f.state === 'hooked' || f.state === 'biting' || (f.pos.y > -1.4 && dd < 35 * 35);
    if (!g.visible) return;
    g.position.copy(f.pos);
    // zatáčení: oblouk těla a lehké naklonění
    const dy = dt > 0 ? U.angleDiff(f.prevYaw === undefined ? f.yaw : f.prevYaw, f.yaw) / dt : 0;
    f.prevYaw = f.yaw;
    f.turnS = (f.turnS || 0) + (U.clamp(dy, -4, 4) - (f.turnS || 0)) * Math.min(1, dt * 4);
    const bank = f.roll ? f.roll : -f.turnS * 0.08;
    _e.set(bank, -f.yaw, f.pitch);
    g.rotation.copy(_e);
    const rel = Math.min(4, f.speed / Math.max(0.05, f.len));
    const u = f.model.u;
    const fp = f.fightPower || 0;
    const eel = f.sp.swim === 'eel';
    // amplituda ocasu roste s rychlostí, frekvence úderů ocasu taky
    const ampT = (eel ? 0.045 : 0.022) + rel * (eel ? 0.012 : 0.018) + fp * 0.05;
    u.uAmp.value += (Math.min(eel ? 0.1 : 0.11, ampT) - u.uAmp.value) * Math.min(1, dt * 3);
    u.uPhase.value += dt * Math.PI * 2 * (0.55 + rel * 0.9 + fp * 2.2);
    u.uCurve.value += (U.clamp(f.turnS * 0.07, -0.2, 0.2) - u.uCurve.value) * Math.min(1, dt * 5);
  }
  AI.animate = animate;
})(window.FS);
