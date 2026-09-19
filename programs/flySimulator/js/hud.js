import * as THREE from 'three';
import { clamp, DEG } from './util.js';

// Head-up display on a 2D canvas. Everything that must line up with the 3D
// world (pitch ladder, flight path marker, target box, gun pipper) is
// projected through the real camera, so it stays correct in both views.

const GREEN = '#6dff8a', AMBER = '#ffcf40', RED = '#ff3b30', WHITE = '#e8f4ff';
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _h = new THREE.Vector3();
const FONT = '"Consolas", "Lucida Console", monospace';

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.msgs = [];
    this.hitMark = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  message(text, color = GREEN, dur = 3) {
    this.msgs.push({ text, color, t: dur, dur });
    if (this.msgs.length > 4) this.msgs.shift();
  }

  clearMessages() {
    this.msgs.length = 0;
  }

  /** Screen position of a world point; `behind` when it is behind the camera. */
  project(cam, p) {
    _v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    const behind = _v.z > -0.1;
    _v.applyMatrix4(cam.projectionMatrix);
    return { x: (_v.x * 0.5 + 0.5) * this.w, y: (-_v.y * 0.5 + 0.5) * this.h, behind };
  }

  projectDir(cam, dir) {
    return this.project(cam, _v2.copy(cam.position).addScaledVector(dir, 5000));
  }

  draw(s, dt) {
    const g = this.ctx, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);
    this.hitMark = Math.max(0, this.hitMark - dt);
    for (const m of this.msgs) m.t -= dt;
    this.msgs = this.msgs.filter((m) => m.t > 0);
    if (!s) return;
    const p = s.player, cam = s.camera;
    g.lineWidth = 1.6;
    g.font = `15px ${FONT}`;
    g.textBaseline = 'middle';
    const col = GREEN;
    g.strokeStyle = col;
    g.fillStyle = col;

    if (p.alive) {
      const lookOk = s.lookOff < 12 * DEG;
      if (s.view === 'cockpit' && lookOk) this.drawLadder(s);
      if (lookOk || s.view === 'chase') this.drawReticles(s);
      this.drawTargets(s);
      if (s.home) this.drawHome(s);
      this.drawTapes(s);
      this.drawStatus(s);
      this.drawWarnings(s);
      this.drawRadar(g, W - 110, H - 110, 88, s, 10000);
    }
    this.drawScore(s);
    this.drawMessages();
  }

  // ------------------------------------------------------------------ ladder
  hudRect() {
    const w = clamp(this.w * 0.42, 320, 640), h = clamp(this.h * 0.44, 220, 480);
    return { x: (this.w - w) / 2, y: this.h * 0.43 - h / 2, w, h };
  }

  drawLadder(s) {
    const g = this.ctx, cam = s.camera, p = s.player;
    const r = this.hudRect();
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    _h.set(p.fwd.x, 0, p.fwd.z);
    if (_h.lengthSq() < 1e-4) _h.set(-p.up.x, 0, -p.up.z);
    _h.normalize();
    const hdg = Math.atan2(_h.x, -_h.z);
    const dirAt = (pitch, az, out) =>
      out.set(Math.sin(hdg + az) * Math.cos(pitch), Math.sin(pitch), -Math.cos(hdg + az) * Math.cos(pitch));
    const d0 = new THREE.Vector3(), d1 = new THREE.Vector3();
    for (let deg = -85; deg <= 85; deg += 5) {
      const pr = deg * DEG;
      const c = this.projectDir(cam, dirAt(pr, 0, d0));
      if (c.behind) continue;
      const a = this.projectDir(cam, dirAt(pr, -0.02, d1));
      const b = this.projectDir(cam, dirAt(pr, 0.02, d1));
      let ux = b.x - a.x, uy = b.y - a.y;
      const l = Math.hypot(ux, uy) || 1;
      ux /= l;
      uy /= l;
      const nx = uy, ny = -ux; // points "up" on screen towards positive pitch
      g.strokeStyle = GREEN;
      g.fillStyle = GREEN;
      if (deg === 0) {
        g.beginPath();
        g.moveTo(c.x - ux * 400, c.y - uy * 400);
        g.lineTo(c.x - ux * 40, c.y - uy * 40);
        g.moveTo(c.x + ux * 40, c.y + uy * 40);
        g.lineTo(c.x + ux * 400, c.y + uy * 400);
        g.stroke();
        continue;
      }
      if (deg % 10 !== 0 && Math.abs(deg) > 30) continue;
      const half = deg % 10 === 0 ? 80 : 50, gap = 28;
      const tick = deg > 0 ? -8 : 8;
      g.setLineDash(deg < 0 ? [8, 6] : []);
      g.beginPath();
      for (const sgn of [-1, 1]) {
        const x0 = c.x + ux * gap * sgn, y0 = c.y + uy * gap * sgn;
        const x1 = c.x + ux * half * sgn, y1 = c.y + uy * half * sgn;
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.lineTo(x1 + nx * tick, y1 + ny * tick);
      }
      g.stroke();
      g.setLineDash([]);
      if (deg % 10 === 0) {
        g.font = `13px ${FONT}`;
        g.textAlign = 'center';
        for (const sgn of [-1, 1]) g.fillText(String(Math.abs(deg)), c.x + ux * (half + 18) * sgn, c.y + uy * (half + 18) * sgn);
      }
    }
    g.restore();
  }

  // ------------------------------------------------------------------ boresight, FPM, pipper
  drawReticles(s) {
    const g = this.ctx, cam = s.camera, p = s.player;
    g.strokeStyle = GREEN;
    // boresight "W" / gun cross
    const b = this.projectDir(cam, p.fwd);
    if (!b.behind) {
      g.beginPath();
      if (s.view === 'cockpit') {
        g.moveTo(b.x - 22, b.y);
        g.lineTo(b.x - 11, b.y);
        g.lineTo(b.x - 5.5, b.y + 7);
        g.lineTo(b.x, b.y);
        g.lineTo(b.x + 5.5, b.y + 7);
        g.lineTo(b.x + 11, b.y);
        g.lineTo(b.x + 22, b.y);
      } else {
        g.moveTo(b.x - 14, b.y); g.lineTo(b.x - 4, b.y);
        g.moveTo(b.x + 4, b.y); g.lineTo(b.x + 14, b.y);
        g.moveTo(b.x, b.y - 14); g.lineTo(b.x, b.y - 4);
        g.moveTo(b.x, b.y + 4); g.lineTo(b.x, b.y + 14);
      }
      g.stroke();
      // missile seeker field of view
      if (p.missiles > 0 && s.view === 'cockpit') {
        const e = this.projectDir(cam, _h.copy(p.fwd).applyAxisAngle(p.right, s.seekerCone));
        const rr = Math.hypot(e.x - b.x, e.y - b.y);
        g.save();
        g.globalAlpha = 0.35;
        g.setLineDash([4, 8]);
        g.beginPath();
        g.arc(b.x, b.y, rr, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
    // flight path marker
    if (p.speed > 20) {
      const f = this.projectDir(cam, _h.copy(p.vel).normalize());
      if (!f.behind) {
        g.beginPath();
        g.arc(f.x, f.y, 7, 0, Math.PI * 2);
        g.moveTo(f.x - 7, f.y); g.lineTo(f.x - 18, f.y);
        g.moveTo(f.x + 7, f.y); g.lineTo(f.x + 18, f.y);
        g.moveTo(f.x, f.y - 7); g.lineTo(f.x, f.y - 14);
        g.stroke();
      }
    }
    // lead-computing gun pipper
    const pip = s.pipper;
    if (pip) {
      const q = this.project(cam, pip.point);
      if (!q.behind) {
        const c = pip.onTarget ? RED : GREEN;
        g.strokeStyle = c;
        g.fillStyle = c;
        g.lineWidth = pip.onTarget ? 2.4 : 1.6;
        g.beginPath();
        g.arc(q.x, q.y, 24, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
        g.fill();
        if (pip.range != null) {
          const frac = clamp(1 - pip.range / 2000, 0, 1);
          g.lineWidth = 4;
          g.beginPath();
          g.arc(q.x, q.y, 29, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          g.stroke();
        }
        g.lineWidth = 1.6;
        if (pip.onTarget) {
          g.font = `bold 14px ${FONT}`;
          g.textAlign = 'center';
          g.fillText('PAL!', q.x, q.y + 44);
        }
      }
    }
  }

  // ------------------------------------------------------------------ target boxes
  drawTargets(s) {
    const g = this.ctx, cam = s.camera, W = this.w, H = this.h;
    const p = s.player;
    g.font = `13px ${FONT}`;
    g.textAlign = 'center';
    for (const e of s.enemies) {
      if (e === s.target || !e.alive) continue;
      const q = this.project(cam, e.pos);
      if (q.behind || q.x < 0 || q.x > W || q.y < 0 || q.y > H) continue;
      const d = e.pos.distanceTo(p.pos);
      g.strokeStyle = e.dying ? 'rgba(255,160,80,0.7)' : 'rgba(109,255,138,0.75)';
      g.lineWidth = 1.4;
      const r = 9;
      g.beginPath();
      g.moveTo(q.x, q.y - r); g.lineTo(q.x + r, q.y); g.lineTo(q.x, q.y + r); g.lineTo(q.x - r, q.y); g.closePath();
      g.stroke();
      g.fillStyle = g.strokeStyle;
      g.fillText((d / 1000).toFixed(1), q.x, q.y + 20);
    }
    const t = s.target;
    if (!t || !t.alive) return;
    const lk = s.lock;
    const q = this.project(cam, t.pos);
    const d = t.pos.distanceTo(p.pos);
    const blink = (performance.now() / 120) % 2 < 1;
    const col = lk.locked ? RED : lk.progress > 0 ? AMBER : GREEN;
    const onScreen = !q.behind && q.x > 20 && q.x < W - 20 && q.y > 20 && q.y < H - 20;
    if (!onScreen) {
      // arrow at the edge pointing to the target
      let dx = q.x - W / 2, dy = q.y - H / 2;
      if (q.behind) {
        dx = -dx;
        dy = -dy;
      }
      const a = Math.atan2(dy, dx);
      const R = Math.min(W, H) * 0.36;
      const x = W / 2 + Math.cos(a) * R, y = H / 2 + Math.sin(a) * R;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(16, 0); g.lineTo(-8, -10); g.lineTo(-8, 10); g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = col;
      g.textAlign = 'center';
      g.fillText(`${(d / 1000).toFixed(1)} km`, x, y + 22);
      return;
    }
    const pxSize = (8 / Math.max(d, 1)) * (H / 2) / Math.tan((cam.fov * DEG) / 2);
    const half = clamp(pxSize + 8, 20, 120);
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = lk.locked ? 3 : 2;
    if (!lk.locked || blink || lk.lockedFor > 0.8) g.strokeRect(q.x - half, q.y - half, half * 2, half * 2);
    if (lk.locked) {
      // filled corner brackets and diamond
      const c = half + 7, L = 12;
      g.lineWidth = 3;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(q.x + sx * c, q.y + sy * (c - L));
        g.lineTo(q.x + sx * c, q.y + sy * c);
        g.lineTo(q.x + sx * (c - L), q.y + sy * c);
      }
      g.stroke();
      g.globalAlpha = 0.18;
      g.fillRect(q.x - half, q.y - half, half * 2, half * 2);
      g.globalAlpha = 1;
      g.font = `bold 15px ${FONT}`;
      g.fillText('ZAMČENO', q.x, q.y - half - 16);
    } else if (lk.progress > 0) {
      // shrinking seeker circle while the seeker is acquiring
      const rr = half + 30 * (1 - lk.progress);
      g.beginPath();
      g.arc(q.x, q.y, rr, 0, Math.PI * 2);
      g.stroke();
      g.font = `13px ${FONT}`;
      g.fillText('ZAMYKÁM', q.x, q.y - half - 14);
    }
    g.font = `13px ${FONT}`;
    const closing = -_h.subVectors(t.vel, p.vel).dot(_v2.subVectors(t.pos, p.pos).normalize());
    g.fillText(`${(d / 1000).toFixed(2)} km`, q.x, q.y + half + 14);
    g.fillText(`${closing >= 0 ? '+' : ''}${Math.round(closing * 3.6)} km/h`, q.x, q.y + half + 30);
    if (t.dying) g.fillText('ZASAŽEN', q.x, q.y + half + 46);
  }

  // ------------------------------------------------------------------ return-to-base marker
  drawHome(s) {
    const g = this.ctx, W = this.w, H = this.h, CYAN = '#5fd8ff';
    const q = this.project(s.camera, s.home);
    const d = s.home.distanceTo(s.player.pos);
    const label = `ZÁKLADNA ${(d / 1000).toFixed(1)} km`;
    g.font = `bold 13px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = g.strokeStyle = CYAN;
    g.lineWidth = 2;
    if (!q.behind && q.x > 30 && q.x < W - 30 && q.y > 30 && q.y < H - 30) {
      g.beginPath();
      g.moveTo(q.x, q.y - 12); g.lineTo(q.x + 12, q.y); g.lineTo(q.x, q.y + 12); g.lineTo(q.x - 12, q.y); g.closePath();
      g.stroke();
      g.fillRect(q.x - 2, q.y - 2, 4, 4);
      g.fillText(label, q.x, q.y - 22);
      return;
    }
    let dx = q.x - W / 2, dy = q.y - H / 2;
    if (q.behind) {
      dx = -dx;
      dy = -dy;
    }
    const a = Math.atan2(dy, dx), R = Math.min(W, H) * 0.3;
    const x = W / 2 + Math.cos(a) * R, y = H / 2 + Math.sin(a) * R;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(14, 0); g.lineTo(-7, -9); g.lineTo(-7, 9); g.closePath();
    g.stroke();
    g.restore();
    g.fillText(label, x, y + 22);
  }

  // ------------------------------------------------------------------ speed / altitude / heading
  drawTapes(s) {
    const g = this.ctx, p = s.player, W = this.w, H = this.h;
    const cx = W / 2, cy = H * 0.47;
    const off = clamp(W * 0.25, 190, 360);
    g.strokeStyle = GREEN;
    g.fillStyle = GREEN;
    g.lineWidth = 1.6;
    // speed (km/h) on the left
    const kmh = p.speed * 3.6;
    this.tape(cx - off, cy, kmh, 50, 10, true);
    // altitude (m) on the right
    this.tape(cx + off, cy, p.pos.y, 100, 20, false);
    g.font = `13px ${FONT}`;
    g.textAlign = 'right';
    g.fillText('KM/H', cx - off + 30, cy - 132);
    g.fillText(`M ${(p.speed / (340 - p.pos.y * 0.004)).toFixed(2)}`, cx - off + 30, cy + 132);
    g.fillText(`G ${p.gLoad.toFixed(1)}`, cx - off + 30, cy + 150);
    g.fillText(`α ${(p.alpha / DEG).toFixed(0)}°`, cx - off + 30, cy + 168);
    g.textAlign = 'left';
    g.fillText('M', cx + off - 30, cy - 132);
    const vs = p.vel.y;
    g.fillText(`VS ${vs >= 0 ? '+' : ''}${Math.round(vs)}`, cx + off - 30, cy + 132);
    if (p.agl < 1500) {
      g.fillStyle = p.agl < 150 && !p.onGround ? AMBER : GREEN;
      g.fillText(`R ${Math.max(0, Math.round(p.agl))}`, cx + off - 30, cy + 150);
      g.fillStyle = GREEN;
    }
    // heading tape
    const hdg = p.heading;
    const ty = Math.max(24, cy - clamp(H * 0.3, 150, 280));
    g.save();
    g.beginPath();
    g.rect(cx - 160, ty - 20, 320, 44);
    g.clip();
    g.textAlign = 'center';
    g.font = `13px ${FONT}`;
    const pxPerDeg = 6;
    for (let d = Math.floor((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
      const x = cx + (d - hdg) * pxPerDeg;
      const dd = ((d % 360) + 360) % 360;
      g.beginPath();
      g.moveTo(x, ty + 10);
      g.lineTo(x, ty + (dd % 10 === 0 ? 2 : 6));
      g.stroke();
      if (dd % 10 === 0) {
        const lbl = { 0: 'S', 90: 'V', 180: 'J', 270: 'Z' }[dd] ?? String(dd / 10).padStart(2, '0');
        g.fillText(lbl, x, ty - 8);
      }
    }
    g.restore();
    g.beginPath();
    g.moveTo(cx, ty + 12);
    g.lineTo(cx - 6, ty + 20);
    g.lineTo(cx + 6, ty + 20);
    g.closePath();
    g.fill();
    g.font = `14px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, ty + 32);
  }

  tape(x, y, value, major, minor, left) {
    const g = this.ctx, hgt = 220, pxPer = 100 / major * 0.9;
    g.save();
    g.beginPath();
    g.rect(x - 60, y - hgt / 2, 120, hgt);
    g.clip();
    g.font = `12px ${FONT}`;
    g.textAlign = left ? 'right' : 'left';
    const dir = left ? -1 : 1;
    const lo = Math.floor((value - (hgt / 2) / pxPer) / minor) * minor;
    for (let v = lo; v <= value + (hgt / 2) / pxPer; v += minor) {
      const yy = y - (v - value) * pxPer;
      const isMajor = Math.abs(v % major) < 1e-6;
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x + dir * (isMajor ? 12 : 6), yy);
      g.stroke();
      if (isMajor && Math.abs(yy - y) > 14 && (v >= 0 || !left)) g.fillText(String(v), x + dir * 16, yy);
    }
    g.restore();
    // value box
    g.fillStyle = 'rgba(0,20,0,0.55)';
    const bx = left ? x - 64 : x + 4;
    g.fillRect(bx, y - 13, 60, 26);
    g.strokeRect(bx, y - 13, 60, 26);
    g.fillStyle = GREEN;
    g.font = `bold 16px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(String(Math.round(value)), bx + 30, y + 1);
  }

  // ------------------------------------------------------------------ status panel
  drawStatus(s) {
    const g = this.ctx, p = s.player, W = this.w, H = this.h;
    // throttle bar
    const bx = 26, by = H - 200, bh = 150;
    g.strokeStyle = GREEN;
    g.fillStyle = 'rgba(0,20,0,0.45)';
    g.fillRect(bx, by, 18, bh);
    g.strokeRect(bx, by, 18, bh);
    const tf = p.input.throttle, ef = p.engine;
    g.fillStyle = ef > 0.9 ? '#ff9b40' : GREEN;
    g.fillRect(bx + 3, by + bh - ef * bh, 12, ef * bh);
    g.fillStyle = WHITE;
    g.fillRect(bx - 4, by + bh - tf * bh - 1, 26, 2);
    g.strokeStyle = '#ff9b40';
    g.beginPath();
    g.moveTo(bx, by + bh * 0.1);
    g.lineTo(bx + 18, by + bh * 0.1);
    g.stroke();
    g.fillStyle = GREEN;
    g.font = `12px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(ef > 0.9 ? 'FORSÁŽ' : `${Math.round(ef * 100)} %`, bx - 2, by - 12);
    g.fillText('PLYN', bx - 2, by + bh + 14);

    // systems column
    const x = 60, y0 = H - 196;
    const line = (i, txt, c = GREEN) => {
      g.fillStyle = c;
      g.fillText(txt, x, y0 + i * 19);
    };
    g.font = `14px ${FONT}`;
    const gearTxt = p.gearAnim >= 1 ? 'PODVOZEK ▼' : p.gearAnim <= 0 ? 'PODVOZEK ▲' : 'PODVOZEK …';
    line(0, gearTxt, p.gearAnim > 0 && p.gearAnim < 1 ? AMBER : p.gearAnim >= 1 ? GREEN : 'rgba(109,255,138,0.5)');
    line(1, p.input.brake ? (p.onGround ? 'BRZDY' : 'AEROBRZDA') : '', AMBER);
    line(2, `PALIVO ${Math.round(p.fuel * 100)} %`, p.fuel < 0.2 ? (Math.floor(performance.now() / 400) % 2 ? RED : AMBER) : GREEN);
    line(3, `DRAK ${Math.round(p.health)} %`, p.health < 35 ? RED : p.health < 70 ? AMBER : GREEN);
    line(5, `KANÓN  ${String(p.ammo).padStart(3, ' ')}`, p.ammo === 0 ? RED : GREEN);
    line(6, `RAKETY ${'■'.repeat(p.missiles)}${'□'.repeat(6 - p.missiles)}`, p.missiles === 0 ? RED : GREEN);
    line(7, `KLAMNÉ ${p.flares}`, p.flares === 0 ? RED : GREEN);
    if (s.rearm != null) {
      g.fillStyle = AMBER;
      g.font = `bold 16px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(`DOPLŇOVÁNÍ ${Math.round(s.rearm * 100)} %`, W / 2, H * 0.72);
    }
  }

  drawWarnings(s) {
    const g = this.ctx, W = this.w, H = this.h, w = s.warnings;
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    const list = [];
    if (w.missile) list.push(['RAKETA! — KLAMNÉ CÍLE (X)', RED]);
    if (w.pullUp) list.push(['PŘITÁHNI!', RED]);
    if (w.stall) list.push(['PŘETAŽENÍ', AMBER]);
    if (w.gear) list.push(['PODVOZEK! (G)', AMBER]);
    if (w.bounds) list.push(['OPOUŠTÍŠ OBLAST — VRAŤ SE', AMBER]);
    if (w.rwr && !w.missile) list.push(['RADAR ZAMĚŘUJE', AMBER]);
    if (w.fuel) list.push(['MÁLO PALIVA — PŘISTAŇ', AMBER]);
    g.textAlign = 'center';
    g.font = `bold 20px ${FONT}`;
    list.forEach(([t, c], i) => {
      if (!blink && c === RED) return;
      g.fillStyle = c;
      g.fillText(t, W / 2, H * 0.62 + i * 26);
    });
    if (this.hitMark > 0) {
      const cx = W / 2, cy = H * 0.47;
      g.strokeStyle = WHITE;
      g.lineWidth = 2;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(cx + sx * 8, cy + sy * 8);
        g.lineTo(cx + sx * 16, cy + sy * 16);
      }
      g.stroke();
    }
  }

  drawScore(s) {
    const g = this.ctx;
    g.textAlign = 'left';
    g.font = `bold 16px ${FONT}`;
    g.fillStyle = WHITE;
    g.fillText(`SKÓRE ${s.score}`, 18, 24);
    g.font = `14px ${FONT}`;
    g.fillText(`SESTŘELY ${s.kills}`, 18, 44);
    g.fillText(s.waveText, 18, 64);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(232,244,255,0.6)';
    g.font = `12px ${FONT}`;
    g.fillText(`${s.view === 'cockpit' ? 'KOKPIT' : 'ZEZADU'} · V přepnout · H nápověda`, this.w - 16, 22);
  }

  drawMessages() {
    const g = this.ctx;
    g.textAlign = 'center';
    g.font = `bold 22px ${FONT}`;
    this.msgs.forEach((m, i) => {
      g.globalAlpha = clamp(m.t / 0.5, 0, 1) * clamp((m.dur - m.t) / 0.2 + 0.2, 0, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      const y = this.h * 0.2 + i * 32;
      g.fillText(m.text, this.w / 2 + 1, y + 2);
      g.fillStyle = m.color;
      g.fillText(m.text, this.w / 2, y);
    });
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ radar (also used on the MFD)
  drawRadar(g, cx, cy, R, s, range) {
    const p = s.player;
    g.save();
    g.fillStyle = 'rgba(0,25,5,0.55)';
    g.strokeStyle = 'rgba(109,255,138,0.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(109,255,138,0.3)';
    g.beginPath();
    g.arc(cx, cy, R / 2, 0, Math.PI * 2);
    g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
    g.stroke();
    const hdg = p.heading * DEG;
    const cos = Math.cos(hdg), sin = Math.sin(hdg);
    const toScreen = (pos) => {
      const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
      // rotate so that the aircraft heading points up
      const rx = dx * cos + dz * sin;
      const ry = dx * sin - dz * cos;
      return [cx + (rx / range) * R, cy - (ry / range) * R, Math.hypot(rx, ry) / range];
    };
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    // runway
    const a = toScreen({ x: 0, z: -1500 }), b = toScreen({ x: 0, z: 1500 });
    g.strokeStyle = WHITE;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    g.lineWidth = 1.2;
    for (const m of s.missiles) {
      const [x, y] = toScreen(m.pos);
      g.fillStyle = m.owner === p ? AMBER : RED;
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const [x, y, d] = toScreen(e.pos);
      const ex = x, ey = y;
      const eh = e.heading * DEG - hdg;
      g.save();
      g.translate(clamp(ex, cx - R, cx + R), clamp(ey, cy - R, cy + R));
      g.rotate(eh);
      g.fillStyle = e.dying ? '#ff9b40' : RED;
      g.beginPath();
      g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath();
      g.fill();
      g.restore();
      if (e === s.target && d <= 1) {
        g.strokeStyle = s.lock.locked ? RED : GREEN;
        g.strokeRect(ex - 8, ey - 8, 16, 16);
      }
    }
    g.restore();
    // own aircraft
    g.fillStyle = GREEN;
    g.beginPath();
    g.moveTo(cx, cy - 6); g.lineTo(cx + 4, cy + 5); g.lineTo(cx - 4, cy + 5); g.closePath();
    g.fill();
    g.font = `11px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(109,255,138,0.8)';
    g.fillText(`${range / 1000} km`, cx, cy + R + 12);
  }
}
