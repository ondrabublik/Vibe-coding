/**
 * NACA 4-digit airfoil geometry (normalized chord = 1, LE at origin).
 */
(function (global) {
  "use strict";

  function parseNacaCode(code) {
  const s = String(code).padStart(4, "0").slice(0, 4);
  if (!/^\d{4}$/.test(s)) {
    return { ok: false, error: "NACA kód musí být 4 číslice." };
  }
  const a = parseInt(s[0], 10);
  const b = parseInt(s[1], 10);
  const cd = parseInt(s.slice(2), 10);
  const m = a / 100;
  const p = b / 10;
  const t = cd / 100;
  if (m > 0 && p <= 0) {
    return { ok: false, error: "Při vyboulění > 0 musí být poloha max. vyboulění > 0." };
  }
  if (t <= 0 || t >= 1) {
    return { ok: false, error: "Tloušťka musí být mezi 1 % a 99 %." };
  }
  return { ok: true, code: s, m, p, t, thicknessPercent: cd };
}

  function thicknessYt(x, t) {
    return (
      5 *
      t *
      (0.2969 * Math.sqrt(x) -
        0.126 * x -
        0.3516 * x * x +
        0.2843 * x * x * x -
        0.1036 * x * x * x * x)
    );
  }

function camberYc(x, m, p) {
  if (m === 0) return 0;
  if (x < p) {
    return ((m / (p * p)) * (2 * p * x - x * x));
  }
  return (
    (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x)
  );
}

function camberDycDx(x, m, p) {
  if (m === 0) return 0;
  if (x < p) {
    return ((2 * m) / (p * p)) * (p - x);
  }
  return ((2 * m) / ((1 - p) * (1 - p))) * (p - x);
}

function sampleXValues(pointCount) {
  const n = Math.max(50, Math.floor(pointCount));
  const xs = [];
  for (let i = 0; i < n; i++) {
    const tParam = i / (n - 1);
    xs.push(0.5 * (1 - Math.cos(Math.PI * tParam)));
  }
  return xs;
}

  function computeNaca4({ m, p, t, pointCount = 150 }) {
  const xs = sampleXValues(pointCount);
  const upper = [];
  const lower = [];

  for (const x of xs) {
    const yc = camberYc(x, m, p);
    const dyc = camberDycDx(x, m, p);
    const theta = Math.atan(dyc);
    const yt = thicknessYt(x, t);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    upper.push({ x: x - yt * sinT, y: yc + yt * cosT });
    lower.push({ x: x + yt * sinT, y: yc - yt * cosT });
  }

  const lowerReversed = [...lower].reverse();
  return { upper, lower: lowerReversed };
}

  function transformPoint(x, y, scaleMm, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const xs = x * scaleMm;
  const ys = y * scaleMm;
  return {
    x: xs * Math.cos(rad) - ys * Math.sin(rad),
    y: xs * Math.sin(rad) + ys * Math.cos(rad),
  };
}

  function transformCurve(points, scaleMm, angleDeg) {
  return points.map(({ x, y }) => transformPoint(x, y, scaleMm, angleDeg));
}

  function updateCodeThickness(code, thicknessPercent) {
    const s = String(code).padStart(4, "0").slice(0, 4);
    const pct = Math.min(99, Math.max(1, Math.round(thicknessPercent)));
    return s.slice(0, 2) + String(pct).padStart(2, "0");
  }

  global.Naca4 = {
    parseNacaCode,
    thicknessYt,
    computeNaca4,
    transformPoint,
    transformCurve,
    updateCodeThickness,
  };
})(window);
