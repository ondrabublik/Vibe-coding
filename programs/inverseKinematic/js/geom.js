'use strict';

// Small 2D geometry helpers shared by the whole app.
const G = {
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },

  signedArea(pts) {
    let s = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  },

  bbox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (!p) continue;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX, h = maxY - minY;
    return { minX, minY, maxX, maxY, w, h, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, diag: Math.hypot(w, h) };
  },

  centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  },

  // Resample a closed polyline into M points equally spaced by arc length.
  resampleClosed(pts, M) {
    const n = pts.length, cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + G.dist(pts[i], pts[(i + 1) % n]);
    const L = cum[n], out = [];
    let j = 0;
    for (let m = 0; m < M; m++) {
      const s = L * m / M;
      while (j < n - 1 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j], t = seg > 0 ? (s - cum[j]) / seg : 0;
      const a = pts[j], b = pts[(j + 1) % n];
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  },

  segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  },

  // Distance from every point of A to the closed polyline B.
  _toPolyline(A, B) {
    const out = new Float64Array(A.length), n = B.length;
    for (let i = 0; i < A.length; i++) {
      const p = A[i];
      let best = Infinity;
      for (let j = 0; j < n; j++) {
        const a = B[j], b = B[(j + 1) % n];
        const d = G.segDist2(p.x, p.y, a.x, a.y, b.x, b.y);
        if (d < best) best = d;
      }
      out[i] = Math.sqrt(best);
    }
    return out;
  },

  // Symmetric shape deviation between two closed curves, relative to the target's bbox diagonal.
  shapeDeviation(target, traced) {
    const diag = G.bbox(target).diag || 1;
    const d1 = G._toPolyline(target, traced), d2 = G._toPolyline(traced, target);
    let sum = 0, max = 0;
    for (const d of d1) { sum += d; if (d > max) max = d; }
    for (const d of d2) { sum += d; if (d > max) max = d; }
    return { mean: sum / (d1.length + d2.length) / diag, max: max / diag };
  },
};
