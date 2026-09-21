'use strict';
// HTML/canvas overlay: instruments, target markers, radar, messages.
(function (BW) {
  const V3 = BABYLON.Vector3;
  const $ = (id) => document.getElementById(id);
  const CARD = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  const tA = new V3();

  class HUD {
    constructor(game) {
      this.g = game;
      this.el = {};
      ['hud', 'hSpeed', 'hAlt', 'hVario', 'hHdg', 'hThr', 'hThrBar', 'hHpBar', 'hHp', 'hBrake', 'enemyCount', 'allyCount',
        'killCount', 'missionTime', 'objective', 'messages', 'warnStall', 'warnBounds', 'warnLow', 'crosshair', 'lead',
        'hitmarker', 'damageFlash', 'markers', 'stick', 'aim', 'viewName', 'instruments', 'enemyLabel', 'extraRow', 'extraLabel', 'extraVal'].forEach((id) => (this.el[id] = $(id)));
      this.radar = $('radar').getContext('2d');
      this.markers = [];
      this.textT = 0;
      this.radarT = 0;
      this.hitT = 0;
      this.flashT = 0;
    }

    show(v) { this.el.hud.classList.toggle('hidden', !v); }
    reset() {
      this.el.messages.innerHTML = '';
      this.markers.forEach((m) => m.remove());
      this.markers = [];
    }

    message(text, dur, cls) {
      dur = dur || 4;
      const d = document.createElement('div');
      d.className = 'msg ' + (cls || '');
      d.textContent = text;
      const box = this.el.messages;
      box.appendChild(d);
      while (box.children.length > 5) box.firstChild.remove();
      setTimeout(() => d.classList.add('fade'), dur * 1000);
      setTimeout(() => d.remove(), dur * 1000 + 700);
    }
    hitMarker() { this.hitT = 0.12; }
    damageFlash() { this.flashT = 0.3; }

    marker(i) {
      if (!this.markers[i]) {
        const d = document.createElement('div');
        d.className = 'marker';
        d.innerHTML = '<span></span>';
        this.el.markers.appendChild(d);
        this.markers[i] = d;
      }
      return this.markers[i];
    }

    placeMarker(i, world, kind, label, w, h, noEdge) {
      const g = this.g, m = this.marker(i);
      const s = g.project(world);
      const margin = 30;
      const onScreen = s.front && s.x > margin && s.x < w - margin && s.y > margin && s.y < h - margin;
      if (!onScreen && (kind === 'ally' || noEdge)) { m.style.display = 'none'; return false; }
      if (onScreen) {
        m.className = 'marker ' + kind;
        m.style.transform = `translate(${s.x}px, ${s.y}px)`;
        m.firstChild.textContent = label;
      } else {
        // Edge arrow pointing toward the off-screen object
        let dx = s.x - w / 2, dy = s.y - h / 2;
        if (!s.front) { dx = -dx; dy = -dy; if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1; }
        const ang = Math.atan2(dy, dx);
        const rx = w / 2 - margin, ry = h / 2 - margin;
        const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
        const x = w / 2 + Math.cos(ang) * k, y = h / 2 + Math.sin(ang) * k;
        m.className = 'marker edge ' + kind;
        m.style.transform = `translate(${x}px, ${y}px) rotate(${ang}rad)`;
        m.firstChild.textContent = '';
      }
      m.style.display = '';
      return onScreen;
    }

    update(dt) {
      const g = this.g, pl = g.player, el = this.el;
      if (!pl || g.state === 'menu') return;
      const w = g.canvas.clientWidth, h = g.canvas.clientHeight;
      const alive = pl.alive && !pl.destroyed;
      el.instruments.style.visibility = pl.bailedOut ? 'hidden' : '';

      // Gun sight
      if (alive) {
        pl.localToWorld(new V3(0, 0.62, 400), tA);
        const s = g.project(tA);
        el.crosshair.style.display = s.front ? '' : 'none';
        el.crosshair.style.transform = `translate(${s.x}px, ${s.y}px)`;
      } else el.crosshair.style.display = 'none';

      // Lead indicator (easy/normal)
      let leadShown = false;
      if (alive && g.diff.leadMarker) {
        let best = null, bestAng = 0.45;
        for (const o of g.planes) {
          if (o.faction !== 'enemy' || !o.alive) continue;
          tA.copyFrom(o.pos).subtractInPlace(pl.pos);
          const d = tA.length();
          if (d > 800) continue;
          const ang = Math.acos(BW.clamp(V3.Dot(tA, pl.f) / d, -1, 1));
          if (ang < bestAng) { bestAng = ang; best = o; }
        }
        if (best) {
          const d = V3.Distance(best.pos, pl.pos), tof = d / BW.PHYS.bulletSpeed;
          tA.copyFrom(best.vel).subtractInPlace(pl.vel).scaleInPlace(tof).addInPlace(best.pos);
          const s = g.project(tA);
          if (s.front) {
            leadShown = true;
            el.lead.style.transform = `translate(${s.x}px, ${s.y}px)`;
          }
        }
      }
      el.lead.style.display = leadShown ? '' : 'none';

      // Plane markers
      let mi = 0;
      const fmt = (d) => (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km');
      for (const o of g.planes) {
        if (o === pl || !o.alive) continue;
        const d = V3.Distance(o.pos, pl.pos);
        if (o.faction === 'ally' && d > 2500) continue;
        if (o.bomber) this.placeMarker(mi++, o.pos, 'bomber', fmt(d), w, h);
        else this.placeMarker(mi++, o.pos, o.faction === 'enemy' ? 'enemy' : 'ally', o.faction === 'enemy' ? fmt(d) : '', w, h);
      }
      // Ground targets: markers on screen; one edge arrow toward the depot while none is visible.
      if (g.targets.length && g.phase === 'combat') {
        let seen = false;
        for (const t of g.targets) {
          if (!t.alive) continue;
          const d = V3.Distance(t.center, pl.pos);
          if (t.primary) seen = this.placeMarker(mi++, t.center, 'target', d < 2500 ? t.name + ' ' + fmt(d) : '', w, h, true) || seen;
          else if (d < 2500) this.placeMarker(mi++, t.center, 'aa', d < 1200 ? 'KULOMET' : '', w, h, true);
        }
        if (!seen) this.placeMarker(mi++, g.site, 'target', 'SKLAD ' + fmt(V3.Distance(g.site, pl.pos)), w, h);
      }
      if (g.phase === 'rtb' || (g.phase === 'combat' && pl.hp < pl.maxHp * 0.35)) {
        const d = Math.hypot(pl.pos.x, pl.pos.z + 100);
        this.placeMarker(mi++, new V3(0, 0, -100), 'home', 'LETIŠTĚ ' + (d / 1000).toFixed(1) + ' km', w, h);
      }
      for (let i = mi; i < this.markers.length; i++) this.markers[i].style.display = 'none';

      // Hit marker / damage flash
      this.hitT -= dt; this.flashT -= dt;
      el.hitmarker.style.opacity = this.hitT > 0 ? 1 : 0;
      el.damageFlash.style.opacity = this.flashT > 0 ? Math.min(0.6, this.flashT * 2) : 0;

      // Mouse stick indicator
      if (!g.touchUI && g.options.mouseMode === 'stick' && alive) {
        el.stick.style.display = '';
        el.stick.style.transform = `translate(${g.mouse.x}px, ${g.mouse.y}px)`;
      } else el.stick.style.display = 'none';

      // Mouse-aim point
      let aimShown = false;
      if (g.aimMode() && alive && g.aimTouched) {
        tA.copyFrom(g.aimDir).scaleInPlace(400).addInPlace(pl.pos);
        const s = g.project(tA);
        if (s.front) { aimShown = true; el.aim.style.transform = `translate(${s.x}px, ${s.y}px)`; }
      }
      el.aim.style.display = aimShown ? '' : 'none';

      el.warnStall.style.display = alive && pl.stalled ? '' : 'none';
      el.warnBounds.style.display = alive && Math.hypot(pl.pos.x, pl.pos.z) > BW.BATTLE_RADIUS ? '' : 'none';
      el.warnLow.style.display = alive && !pl.onGround && pl.vel.y < -12 && pl.agl < 150 ? '' : 'none';

      this.textT -= dt;
      if (this.textT <= 0) {
        this.textT = 0.1;
        el.hSpeed.textContent = Math.round(pl.V * 3.6);
        el.hAlt.textContent = Math.round(Math.max(0, pl.pos.y));
        el.hVario.textContent = (pl.vel.y >= 0 ? '+' : '') + pl.vel.y.toFixed(1);
        let hdg = (Math.atan2(pl.f.x, pl.f.z) * 180) / Math.PI;
        if (hdg < 0) hdg += 360;
        el.hHdg.textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '° ' + CARD[Math.round(hdg / 45) % 8];
        const thr = Math.round(pl.throttle * 100);
        el.hThr.textContent = thr + ' %';
        el.hThrBar.style.width = thr + '%';
        const hp = Math.max(0, pl.hp / pl.maxHp);
        el.hHpBar.style.width = hp * 100 + '%';
        el.hHpBar.style.background = hp > 0.6 ? '#7cc36a' : hp > 0.3 ? '#e0b030' : '#e04a3a';
        el.hHp.textContent = Math.round(hp * 100) + ' %';
        el.hBrake.style.visibility = pl.input.brake ? 'visible' : 'hidden';
        const allies = g.planes.filter((p) => p.faction === 'ally' && !p.isPlayer && p.alive).length;
        const st = g.mission.status(g);
        el.enemyLabel.textContent = st.label;
        el.enemyCount.textContent = st.value;
        el.extraRow.style.display = st.extra ? '' : 'none';
        if (st.extra) { el.extraLabel.textContent = st.extra[0]; el.extraVal.textContent = st.extra[1]; }
        el.allyCount.textContent = allies;
        el.killCount.textContent = pl.kills;
        const t = Math.floor(g.missionTime);
        el.missionTime.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
        el.objective.textContent = g.objectiveText();
        el.viewName.textContent = g.camMode === 'cockpit' ? 'kokpit' : 'za letadlem';
      }

      this.radarT -= dt;
      if (this.radarT <= 0) { this.radarT = 0.05; this.drawRadar(); }
    }

    drawRadar() {
      const g = this.g, pl = g.player, c = this.radar;
      const S = 200, cx = 100, cy = 100, R = 92, range = 3000, k = R / range;
      c.clearRect(0, 0, S, S);
      c.fillStyle = 'rgba(20,24,16,0.62)';
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(200,210,170,0.25)';
      c.lineWidth = 1;
      for (const rr of [1000, 2000]) { c.beginPath(); c.arc(cx, cy, rr * k, 0, Math.PI * 2); c.stroke(); }
      const hd = Math.atan2(pl.f.x, pl.f.z), sh = Math.sin(hd), ch = Math.cos(hd);
      const toR = (x, z) => {
        const dx = x - pl.pos.x, dz = z - pl.pos.z;
        let fr = dx * sh + dz * ch, rt = dx * ch - dz * sh;
        let px = rt * k, py = -fr * k;
        const l = Math.hypot(px, py), edge = l > R - 4;
        if (edge) { px *= (R - 4) / l; py *= (R - 4) / l; }
        return [cx + px, cy + py, edge];
      };
      // Airfield
      const [ax, ay] = toR(0, -575), [bx, by] = toR(0, 575);
      c.strokeStyle = '#d8d0a8'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      // North marker
      c.fillStyle = '#e8e2c8'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('S', cx + -sh * (R - 9), cy - ch * (R - 9));
      // Ground targets: squares (depot yellow, machine-gun nests red)
      for (const t of g.targets) {
        if (!t.alive) continue;
        const [x, y, edge] = toR(t.center.x, t.center.z);
        if (edge && !t.primary) continue;
        c.fillStyle = t.primary ? '#ffb040' : '#ff5040';
        const r = t.primary ? 3 : 2;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (const o of g.planes) {
        if (o === pl || !o.alive) continue;
        const [x, y, edge] = toR(o.pos.x, o.pos.z);
        c.fillStyle = o.bomber ? '#ffaa28' : o.faction === 'enemy' ? '#ff5040' : '#6ab8ff';
        c.beginPath(); c.arc(x, y, (edge ? 2.5 : 3.5) * (o.bomber ? 1.5 : 1), 0, Math.PI * 2); c.fill();
        if (!edge && o.faction === 'enemy') {
          const dh = o.pos.y - pl.pos.y;
          if (Math.abs(dh) > 100) { c.font = '10px sans-serif'; c.fillText(dh > 0 ? '▲' : '▼', x + 8, y); }
        }
      }
      // Own plane
      c.fillStyle = '#f4f0dc';
      c.beginPath(); c.moveTo(cx, cy - 7); c.lineTo(cx - 5, cy + 5); c.lineTo(cx + 5, cy + 5); c.closePath(); c.fill();
    }
  }
  BW.HUD = HUD;
})(window.BW);
