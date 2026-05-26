(function (global) {
  "use strict";

  function clonePoint(p) {
    return { x: p.x, y: p.y };
  }

  function pointsEqual(a, b, eps) {
    const e = eps || 1e-9;
    return Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e;
  }

  function buildClosedProfile(upper, lower) {
    const result = [];
    function pushIfDistinct(p) {
      const last = result[result.length - 1];
      if (last && pointsEqual(last, p)) return;
      result.push(clonePoint(p));
    }
    for (let i = 0; i < upper.length; i++) pushIfDistinct(upper[i]);
    for (let i = 0; i < lower.length - 1; i++) pushIfDistinct(lower[i]);
    if (result.length >= 2 && pointsEqual(result[0], result[result.length - 1])) {
      result.pop();
    }
    return result;
  }

  function polygonArea(points) {
    let a = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return a / 2;
  }

  function ensureCcw(points) {
    return polygonArea(points) < 0 ? [...points].reverse() : points.slice();
  }

  function ensureCw(points) {
    return polygonArea(points) > 0 ? [...points].reverse() : points.slice();
  }

  function segmentsIntersect(a, b, c, d) {
    function cross(p1, p2, p3) {
      return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    }
    const d1 = cross(c, d, a);
    const d2 = cross(c, d, b);
    const d3 = cross(a, b, c);
    const d4 = cross(a, b, d);
    if (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    ) {
      return true;
    }
    return false;
  }

  function polygonSelfIntersects(points) {
    const n = points.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = points[j];
        const d = points[(j + 1) % n];
        if (segmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function segmentIntersectionPoint(a, b, c, d) {
    const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(denom) < 1e-15) return null;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;
    const s = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denom;
    if (t < -1e-9 || t > 1 + 1e-9) return null;
    if (s < -1e-9 || s > 1 + 1e-9) return null;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }

  function findFirstIntersection(points) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = points[j];
        const d = points[(j + 1) % n];
        const pt = segmentIntersectionPoint(a, b, c, d);
        if (pt) return { i, j, point: pt };
      }
    }
    return null;
  }

  function trimSelfIntersections(points) {
    let current = points.slice();
    for (let iter = 0; iter < 50; iter++) {
      const hit = findFirstIntersection(current);
      if (!hit) return current;
      const next = current
        .slice(0, hit.i + 1)
        .concat([hit.point])
        .concat(current.slice(hit.j + 1));
      if (next.length < 3) return null;
      current = next;
    }
    return null;
  }

  function lineIntersect(p1, d1, p2, d2) {
    const det = d1.x * -d2.y - -d2.x * d1.y;
    if (Math.abs(det) < 1e-12) return null;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const t = (dx * -d2.y - -d2.x * dy) / det;
    return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
  }

  function offsetPolygonInward(points, distance) {
    if (!Number.isFinite(distance) || distance <= 0) return null;
    const ccw = ensureCcw(points);
    const n = ccw.length;
    if (n < 3) return null;

    const miterLimit = distance * 4;
    const offset = [];

    for (let i = 0; i < n; i++) {
      const prev = ccw[(i - 1 + n) % n];
      const curr = ccw[i];
      const next = ccw[(i + 1) % n];

      const d1x = curr.x - prev.x;
      const d1y = curr.y - prev.y;
      const d1len = Math.hypot(d1x, d1y);
      const d2x = next.x - curr.x;
      const d2y = next.y - curr.y;
      const d2len = Math.hypot(d2x, d2y);

      if (d1len < 1e-12 && d2len < 1e-12) {
        offset.push({ x: curr.x, y: curr.y });
        continue;
      }
      if (d1len < 1e-12) {
        const nx = -d2y / d2len;
        const ny = d2x / d2len;
        offset.push({ x: curr.x + distance * nx, y: curr.y + distance * ny });
        continue;
      }
      if (d2len < 1e-12) {
        const nx = -d1y / d1len;
        const ny = d1x / d1len;
        offset.push({ x: curr.x + distance * nx, y: curr.y + distance * ny });
        continue;
      }

      const n1x = -d1y / d1len;
      const n1y = d1x / d1len;
      const n2x = -d2y / d2len;
      const n2y = d2x / d2len;

      const off1 = { x: curr.x + distance * n1x, y: curr.y + distance * n1y };
      const off2 = { x: curr.x + distance * n2x, y: curr.y + distance * n2y };

      const dir1 = { x: d1x / d1len, y: d1y / d1len };
      const dir2 = { x: d2x / d2len, y: d2y / d2len };

      const inter = lineIntersect(off1, dir1, off2, dir2);
      if (!inter) {
        offset.push(off1);
        continue;
      }

      const cornerDist = Math.hypot(inter.x - curr.x, inter.y - curr.y);
      if (cornerDist > miterLimit) {
        offset.push(off1);
        offset.push(off2);
      } else {
        offset.push(inter);
      }
    }

    let result = offset;
    if (polygonSelfIntersects(result)) {
      const trimmed = trimSelfIntersections(result);
      if (!trimmed) return null;
      result = trimmed;
    }

    const origArea = polygonArea(ccw);
    const offArea = polygonArea(result);
    if (Math.sign(offArea) !== Math.sign(origArea)) return null;
    if (Math.abs(offArea) >= Math.abs(origArea)) return null;
    if (Math.abs(offArea) < 1e-6) return null;

    return result;
  }

  global.ClosedCurve = {
    buildClosedProfile,
    polygonArea,
    ensureCcw,
    ensureCw,
    offsetPolygonInward,
    polygonSelfIntersects,
  };
})(typeof window !== "undefined" ? window : globalThis);
