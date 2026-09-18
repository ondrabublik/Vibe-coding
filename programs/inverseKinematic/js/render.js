'use strict';

// Canvas renderer. World coordinates are y-up; the view maps them to screen pixels.
const COLORS = {
  bg: '#0b1020',
  text: '#e8ecf1',
  muted: '#9fb0c3',
  accent: '#7cc4ff',
  accent2: '#9ef0b8',
  crank: '#ffb454',
  crank2: '#ffcb6b',
  pin: '#e8ecf1',
  palette: ['#7cc4ff', '#9ef0b8', '#c792ea', '#f78c6c', '#ffcb6b', '#82aaff', '#f07178', '#89ddff', '#c3e88d'],
};

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { ox: 0, oy: 0, scale: 1 };
    this.w = 1; this.h = 1; this.dpr = 1;
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  sx(x) { return this.view.ox + x * this.view.scale; }
  sy(y) { return this.view.oy - y * this.view.scale; }
  S(p) { return [this.sx(p.x), this.sy(p.y)]; }
  toWorld(px, py) { return { x: (px - this.view.ox) / this.view.scale, y: (this.view.oy - py) / this.view.scale }; }

  fit(pts, margin = 70) {
    const b = G.bbox(pts);
    if (!isFinite(b.w)) return;
    const scale = Math.min((this.w - 2 * margin) / Math.max(b.w, 1), (this.h - 2 * margin) / Math.max(b.h, 1));
    this.view.scale = Math.max(0.02, scale);
    this.view.ox = this.w / 2 - b.cx * this.view.scale;
    this.view.oy = this.h / 2 + b.cy * this.view.scale;
  }

  zoomAt(px, py, factor) {
    const w = this.toWorld(px, py);
    this.view.scale *= factor;
    this.view.ox = px - w.x * this.view.scale;
    this.view.oy = py + w.y * this.view.scale;
  }

  begin() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, this.w, this.h);
    const g = c.createRadialGradient(this.w * 0.15, -this.h * 0.1, 0, this.w * 0.15, -this.h * 0.1, this.w);
    g.addColorStop(0, 'rgba(124,196,255,0.10)');
    g.addColorStop(1, 'rgba(124,196,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
    this.grid();
  }

  grid() {
    const c = this.ctx, sc = this.view.scale;
    const raw = 40 / sc, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw);
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    c.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) {
      const st = pass === 0 ? step : step * 5;
      c.strokeStyle = pass === 0 ? 'rgba(124,196,255,0.04)' : 'rgba(124,196,255,0.08)';
      c.beginPath();
      for (let x = Math.ceil(tl.x / st) * st; x <= br.x; x += st) { const X = Math.round(this.sx(x)) + 0.5; c.moveTo(X, 0); c.lineTo(X, this.h); }
      for (let y = Math.ceil(br.y / st) * st; y <= tl.y; y += st) { const Y = Math.round(this.sy(y)) + 0.5; c.moveTo(0, Y); c.lineTo(this.w, Y); }
      c.stroke();
    }
  }

  polyline(pts, closed) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => { const [x, y] = this.S(p); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    if (closed) c.closePath();
  }

  curve(pts, color, width, dash) {
    const c = this.ctx;
    c.save();
    c.setLineDash(dash || []);
    c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round';
    this.polyline(pts, true);
    c.stroke();
    c.restore();
  }

  // ---------- editor ----------
  controlNet(ctrl, sel, hover) {
    const c = this.ctx;
    c.save();
    c.setLineDash([4, 5]);
    c.strokeStyle = 'rgba(159,176,195,0.35)'; c.lineWidth = 1;
    this.polyline(ctrl, true); c.stroke();
    c.setLineDash([]);
    ctrl.forEach((p, i) => {
      const [x, y] = this.S(p);
      const r = 5 + 2.2 * Math.log2(Math.max(0.1, p.w)) * (p.w >= 1 ? 1 : 0.6);
      c.beginPath(); c.arc(x, y, Math.max(3, r), 0, 2 * Math.PI);
      c.fillStyle = i === sel ? COLORS.crank : i === hover ? '#ffffff' : COLORS.bg;
      c.strokeStyle = i === sel ? COLORS.crank : COLORS.accent;
      c.lineWidth = 2; c.fill(); c.stroke();
      if (p.w !== 1) {
        c.fillStyle = COLORS.muted; c.font = '11px system-ui';
        c.fillText('w=' + p.w.toFixed(2), x + 9, y - 9);
      }
    });
    c.restore();
  }

  // ---------- mechanism primitives (screen px) ----------
  bar(a, b, w, color) {
    const c = this.ctx, [x1, y1] = this.S(a), [x2, y2] = this.S(b);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = w + 4;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = color; c.lineWidth = w;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    if (w > 5) {
      c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = Math.max(1, w * 0.22);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
  }

  plate(pts, color) {
    const c = this.ctx;
    c.save();
    c.lineJoin = 'round';
    this.polyline(pts, true);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 14; c.stroke();
    c.strokeStyle = color; c.lineWidth = 10; c.stroke();
    c.globalAlpha = 0.28; c.fillStyle = color; c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.stroke();
    c.restore();
  }

  pin(p, r = 4.5) {
    const c = this.ctx, [x, y] = this.S(p);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI);
    c.fillStyle = COLORS.bg; c.fill();
    c.strokeStyle = COLORS.pin; c.lineWidth = 2; c.stroke();
  }

  ground(p) {
    const c = this.ctx, [x, y] = this.S(p);
    c.save();
    c.strokeStyle = COLORS.muted; c.fillStyle = 'rgba(159,176,195,0.15)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - 11, y + 18); c.lineTo(x + 11, y + 18); c.closePath();
    c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 17, y + 18); c.lineTo(x + 17, y + 18); c.stroke();
    c.lineWidth = 1;
    for (let i = -16; i <= 12; i += 5) { c.beginPath(); c.moveTo(x + i, y + 25); c.lineTo(x + i + 5, y + 19); c.stroke(); }
    c.restore();
  }

  motor(p, th) {
    const c = this.ctx, [x, y] = this.S(p), R = 24;
    c.save();
    c.strokeStyle = COLORS.crank; c.lineWidth = 2.5; c.lineCap = 'round';
    const a0 = -th, a1 = a0 - 1.5 * Math.PI;
    c.beginPath(); c.arc(x, y, R, a1, a0); c.stroke();
    // arrowhead pointing in the direction of positive (CCW in world) rotation
    const hx = x + R * Math.cos(a1), hy = y + R * Math.sin(a1);
    const tx = Math.sin(a1), ty = -Math.cos(a1);
    c.fillStyle = COLORS.crank;
    c.beginPath();
    c.moveTo(hx - tx * 8, hy - ty * 8);
    c.lineTo(hx + Math.cos(a1) * 5, hy + Math.sin(a1) * 5);
    c.lineTo(hx - Math.cos(a1) * 5, hy - Math.sin(a1) * 5);
    c.closePath(); c.fill();
    c.fillStyle = COLORS.crank; c.font = 'bold 11px system-ui';
    c.fillText('M', x + R * 0.75, y - R * 0.75);
    c.restore();
  }

  pen(p, color = COLORS.accent2) {
    const c = this.ctx, [x, y] = this.S(p);
    const g = c.createRadialGradient(x, y, 0, x, y, 22);
    g.addColorStop(0, 'rgba(158,240,184,0.55)');
    g.addColorStop(1, 'rgba(158,240,184,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 22, 0, 2 * Math.PI); c.fill();
    c.beginPath(); c.arc(x, y, 5.5, 0, 2 * Math.PI);
    c.fillStyle = color; c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke();
  }

  // Fading trail behind the pen: traced[] covers one revolution; the head is at index `head`.
  trail(traced, head) {
    const c = this.ctx, N = traced.length, buckets = 36, per = Math.ceil(N / buckets);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let b = 0; b < buckets; b++) {
      const t = (b + 1) / buckets;
      c.strokeStyle = `rgba(158,240,184,${(0.08 + 0.85 * Math.pow(t, 1.6)).toFixed(3)})`;
      c.lineWidth = 1.5 + 2 * t;
      if (b === buckets - 1) { c.shadowColor = 'rgba(158,240,184,0.9)'; c.shadowBlur = 10; }
      c.beginPath();
      for (let k = 0; k <= per; k++) {
        const i = head - N + 1 + b * per + k;
        if (i > head) break;
        const p = traced[((i % N) + N) % N];
        const [x, y] = this.S(p);
        k ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.restore();
  }

  // ---------- whole mechanism ----------
  // Moving bodies are drawn as bars (2 joints) or plates (convex hull of 3+ joints).
  mechanism(sol, th, opt) {
    const q = sol.pose(th);
    if (!q) return;
    const c = this.ctx;
    if (opt.paths) {
      c.save(); c.lineWidth = 1; c.setLineDash([3, 4]);
      sol.jointPaths().forEach(pa => {
        c.strokeStyle = 'rgba(159,176,195,0.28)';
        this.polyline(pa.pts, true); c.stroke();
      });
      c.restore();
    }
    if (opt.deco) sol.grounds.forEach(j => this.ground(q.pts[j]));
    const order = [3, 5, 7, 2, 4, 6, 1].filter(b => sol.bodies[b]);
    for (const b of order) {
      const pts = hull([...new Set(sol.bodies[b])].map(j => q.pts[j]));
      const col = BODY_COLORS[b];
      if (pts.length >= 3) this.plate(pts, col);
      else if (pts.length === 2) this.bar(pts[0], pts[1], b === 1 ? 11 : 9, col);
    }
    const drawn = [];
    q.pts.forEach((p, j) => {
      if (j === sol.penIdx) return;
      if (drawn.some(d => Math.hypot(d.x - p.x, d.y - p.y) * this.view.scale < 2)) return;
      drawn.push(p);
      this.pin(p);
    });
    if (opt.labels) {
      c.save(); c.font = '11px system-ui'; c.fillStyle = COLORS.muted;
      q.pts.forEach((p, j) => { const [x, y] = this.S(p); c.fillText(sol.labels[j], x + 8, y - 8); });
      c.restore();
    }
    if (opt.deco) this.motor(q.pts[0], th);
    this.pen(q.P);
  }
}

const BODY_COLORS = [COLORS.muted, COLORS.crank, '#c792ea', '#7cc4ff', '#9ef0b8', '#89ddff', '#f78c6c', '#ffcb6b'];

// Convex hull (monotone chain) of a few world points; collinear points collapse to the extremes.
function hull(pts) {
  if (pts.length < 3) return pts;
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
