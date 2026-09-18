(function (NS) {
  'use strict';

  // NACA 4-digit airfoil geometry (chord = 1, LE at origin).
  // Adapted from airfoil_profile project.

  NS.Naca4 = {};

  NS.Naca4.parse = function (code) {
    const s = String(code).padStart(4, '0').slice(0, 4);
    if (!/^\d{4}$/.test(s)) return { ok: false, error: 'NACA kód musí být 4 číslice.' };
    const m = parseInt(s[0], 10) / 100;
    const p = parseInt(s[1], 10) / 10;
    const t = parseInt(s.slice(2), 10) / 100;
    if (m > 0 && p <= 0) return { ok: false, error: 'Při vyboulění > 0 musí být p > 0.' };
    if (t <= 0 || t >= 1) return { ok: false, error: 'Tloušťka musí být 1–99 %.' };
    return { ok: true, m, p, t };
  };

  function thicknessYt(x, t) {
    return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  }

  function camberYc(x, m, p) {
    if (m === 0) return 0;
    if (x < p) return (m / (p * p)) * (2 * p * x - x * x);
    return (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x);
  }

  function camberDyc(x, m, p) {
    if (m === 0) return 0;
    if (x < p) return (2 * m / (p * p)) * (p - x);
    return (2 * m / ((1 - p) * (1 - p))) * (p - x);
  }

  NS.Naca4.compute = function ({ m, p, t, pointCount = 200 }) {
    const n = Math.max(50, Math.floor(pointCount));
    const upper = [], lower = [];
    for (let i = 0; i < n; i++) {
      const x = 0.5 * (1 - Math.cos(Math.PI * i / (n - 1)));
      const yc = camberYc(x, m, p);
      const dyc = camberDyc(x, m, p);
      const theta = Math.atan(dyc);
      const yt = thicknessYt(x, t);
      upper.push({ x: x - yt * Math.sin(theta), y: yc + yt * Math.cos(theta) });
      lower.push({ x: x + yt * Math.sin(theta), y: yc - yt * Math.cos(theta) });
    }
    // lower goes from LE to TE → reverse so it goes TE to LE
    lower.reverse();
    return { upper, lower };
  };
})(window.AFL);
