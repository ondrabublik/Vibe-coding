(function (NS) {
  'use strict';

  const Nurbs = NS.Nurbs = {};

  Nurbs.clampedKnots = function (n, p) {
    const knots = new Float64Array(n + p + 2);
    for (let i = 0; i <= n + p + 1; i++) {
      if (i <= p) knots[i] = 0;
      else if (i >= n + 1) knots[i] = 1;
      else knots[i] = (i - p) / (n - p + 1);
    }
    return knots;
  };

  function findSpan(n, p, u, knots) {
    if (u >= knots[n + 1]) return n;
    if (u <= knots[p]) return p;
    let lo = p;
    let hi = n + 1;
    let mid = (lo + hi) >> 1;
    while (u < knots[mid] || u >= knots[mid + 1]) {
      if (u < knots[mid]) hi = mid;
      else lo = mid;
      mid = (lo + hi) >> 1;
    }
    return mid;
  }

  function basisFuns(span, u, p, knots, N) {
    const left = new Float64Array(p + 1);
    const right = new Float64Array(p + 1);
    N[0] = 1;
    for (let j = 1; j <= p; j++) {
      left[j] = u - knots[span + 1 - j];
      right[j] = knots[span + j] - u;
      let saved = 0;
      for (let r = 0; r < j; r++) {
        const den = right[r + 1] + left[j - r];
        const temp = den > 0 ? N[r] / den : 0;
        N[r] = saved + right[r + 1] * temp;
        saved = left[j - r] * temp;
      }
      N[j] = saved;
    }
  }

  Nurbs.buildControlPolygon = function (wallCurve) {
    const pts = wallCurve.points;
    if (pts.length < 2) return pts.slice();
    return [pts[0], wallCurve.startTan, ...pts.slice(1, -1), wallCurve.endTan, pts[pts.length - 1]];
  };

  Nurbs.buildWeights = function (wallCurve) {
    const pts = wallCurve.points;
    const w = wallCurve.weights || pts.map(() => 1);
    if (pts.length < 2) return w.slice();
    const wStart = w[0] ?? 1;
    const wEnd = w[pts.length - 1] ?? 1;
    return [wStart, wStart, ...w.slice(1, -1), wEnd, wEnd];
  };

  Nurbs.invalidateCache = function (wallCurve) {
    if (wallCurve) delete wallCurve._nurbsCache;
  };

  function getCache(wallCurve) {
    if (!wallCurve._nurbsCache) {
      const cp = Nurbs.buildControlPolygon(wallCurve);
      const degree = wallCurve.degree ?? 3;
      const n = cp.length - 1;
      wallCurve._nurbsCache = {
        cp,
        weights: Nurbs.buildWeights(wallCurve),
        degree,
        knots: n >= degree ? Nurbs.clampedKnots(n, degree) : null,
        basis: new Float64Array(degree + 1),
      };
    }
    return wallCurve._nurbsCache;
  }

  Nurbs.evalCached = function (cache, u) {
    const { cp, weights, degree, knots, basis } = cache;
    const n = cp.length - 1;
    if (!knots) {
      const pt = cp[Math.min(n, Math.max(0, Math.round(u * n)))];
      return { x: pt.x, y: pt.y };
    }
    const uu = u <= 0 ? 0 : u >= 1 ? 1 : u;
    const span = findSpan(n, degree, uu, knots);
    basisFuns(span, uu, degree, knots, basis);
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    for (let j = 0; j <= degree; j++) {
      const idx = span - degree + j;
      const nw = basis[j] * (weights[idx] ?? 1);
      wx += nw * cp[idx].x;
      wy += nw * cp[idx].y;
      wsum += nw;
    }
    if (wsum <= 0) return { x: cp[0].x, y: cp[0].y };
    return { x: wx / wsum, y: wy / wsum };
  };

  Nurbs.eval = function (controlPoints, weights, degree, u) {
    const n = controlPoints.length - 1;
    if (n < degree) {
      const pt = controlPoints[Math.min(n, Math.max(0, Math.round(u * n)))];
      return { x: pt.x, y: pt.y };
    }
    const knots = Nurbs.clampedKnots(n, degree);
    const basis = new Float64Array(degree + 1);
    const uu = u <= 0 ? 0 : u >= 1 ? 1 : u;
    const span = findSpan(n, degree, uu, knots);
    basisFuns(span, uu, degree, knots, basis);
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    for (let j = 0; j <= degree; j++) {
      const idx = span - degree + j;
      const nw = basis[j] * (weights[idx] ?? 1);
      wx += nw * controlPoints[idx].x;
      wy += nw * controlPoints[idx].y;
      wsum += nw;
    }
    if (wsum <= 0) return { x: controlPoints[0].x, y: controlPoints[0].y };
    return { x: wx / wsum, y: wy / wsum };
  };

  Nurbs.sample = function (wallCurve, nSamples) {
    const cache = getCache(wallCurve);
    const out = new Array(nSamples + 1);
    for (let k = 0; k <= nSamples; k++) {
      out[k] = Nurbs.evalCached(cache, k / nSamples);
    }
    return out;
  };

  Nurbs.yAtX = function (wallCurve, x) {
    const cache = getCache(wallCurve);
    const cp = cache.cp;
    const x0 = cp[0].x;
    const x1 = cp[cp.length - 1].x;
    if (x <= x0) return cp[0].y;
    if (x >= x1) return cp[cp.length - 1].y;

    let lo = 0;
    let hi = 1;
    for (let iter = 0; iter < 30; iter++) {
      const mid = 0.5 * (lo + hi);
      if (Nurbs.evalCached(cache, mid).x < x) lo = mid;
      else hi = mid;
    }
    return Nurbs.evalCached(cache, 0.5 * (lo + hi)).y;
  };
})(window.FVM);
