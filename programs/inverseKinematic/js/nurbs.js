'use strict';

// Closed (periodic) NURBS curve with a uniform knot vector.
// Control points are {x, y, w}; the first `degree` points are wrapped to close the curve.
const NURBS = {
  effectiveDegree(ctrl, degree) { return Math.max(1, Math.min(degree, ctrl.length - 1)); },

  // u in [0, 1) -> point on the curve (de Boor on homogeneous coordinates).
  evalClosed(ctrl, degree, u) {
    const n = ctrl.length, p = NURBS.effectiveDegree(ctrl, degree);
    const t = p + (((u % 1) + 1) % 1) * n;
    let s = Math.floor(t);
    if (s > n + p - 1) s = n + p - 1;
    const dx = new Float64Array(p + 1), dy = new Float64Array(p + 1), dw = new Float64Array(p + 1);
    for (let j = 0; j <= p; j++) {
      const c = ctrl[(j + s - p) % n];
      dx[j] = c.x * c.w; dy[j] = c.y * c.w; dw[j] = c.w;
    }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const a = (t - (j + s - p)) / (p + 1 - r);
        dx[j] = (1 - a) * dx[j - 1] + a * dx[j];
        dy[j] = (1 - a) * dy[j - 1] + a * dy[j];
        dw[j] = (1 - a) * dw[j - 1] + a * dw[j];
      }
    }
    return { x: dx[p] / dw[p], y: dy[p] / dw[p] };
  },

  sample(ctrl, degree, count) {
    const out = [];
    if (ctrl.length < 3) return out;
    for (let i = 0; i < count; i++) out.push(NURBS.evalClosed(ctrl, degree, i / count));
    return out;
  },

  // Index of the control-polygon edge (i -> i+1) closest to point q.
  closestEdge(ctrl, q) {
    let best = Infinity, idx = ctrl.length - 1;
    for (let i = 0, n = ctrl.length; i < n; i++) {
      const a = ctrl[i], b = ctrl[(i + 1) % n];
      const d = G.segDist2(q.x, q.y, a.x, a.y, b.x, b.y);
      if (d < best) { best = d; idx = i; }
    }
    return idx;
  },
};
