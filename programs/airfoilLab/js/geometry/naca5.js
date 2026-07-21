(function (NS) {
  'use strict';

  // NACA 5-digit airfoil geometry (chord = 1, LE at origin).
  // Supports standard (non-reflexed) series like 23012, 23015, 24012, etc.
  // Reflexed mean line (3rd digit = 1) is not fully implemented — falls back to
  // the non-reflexed formula, which is acceptable for demo purposes.

  NS.Naca5 = {};

  // Standard-series table: key = 2nd digit of LLPTT (= P, chordwise position index)
  // m = chordwise position of max camber, k1 = camber scaling constant
  const STANDARD = {
    1: { m: 0.0580, k1: 361.4  },
    2: { m: 0.1260, k1:  51.64 },
    3: { m: 0.2025, k1:  15.957},
    4: { m: 0.2900, k1:   6.643},
    5: { m: 0.3910, k1:   3.230},
  };

  NS.Naca5.parse = function (code) {
    const s = String(code).padStart(5, '0').slice(0, 5);
    if (!/^\d{5}$/.test(s)) return { ok: false, error: 'NACA kód musí být 5 číslic.' };
    const L = parseInt(s[0], 10);
    const P = parseInt(s[1], 10);
    const S = parseInt(s[2], 10);
    const t = parseInt(s.slice(3), 10) / 100;
    if (!STANDARD[P]) return { ok: false, error: `Poloha vyboulění P=${P} není podporována (1–5).` };
    if (t <= 0 || t >= 1) return { ok: false, error: 'Tloušťka musí být 1–99 %.' };
    if (L < 1 || L > 9) return { ok: false, error: 'První číslice musí být 1–9.' };
    const clDesign = L * 3 / 20;
    return { ok: true, L, P, S, t, clDesign, reflexed: S === 1 };
  };

  function camberYc5(x, m, k1) {
    if (x < m) {
      return (k1 / 6) * (x * x * x - 3 * m * x * x + m * m * (3 - m) * x);
    }
    return (k1 * m * m * m / 6) * (1 - x);
  }

  function camberDyc5(x, m, k1) {
    if (x < m) {
      return (k1 / 6) * (3 * x * x - 6 * m * x + m * m * (3 - m));
    }
    return -(k1 * m * m * m / 6);
  }

  function thicknessYt(x, t) {
    return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  }

  NS.Naca5.compute = function ({ P, t, pointCount = 200 }) {
    const { m, k1 } = STANDARD[P];
    const n = Math.max(50, Math.floor(pointCount));
    const upper = [], lower = [];
    for (let i = 0; i < n; i++) {
      const x = 0.5 * (1 - Math.cos(Math.PI * i / (n - 1)));
      const yc = camberYc5(x, m, k1);
      const dyc = camberDyc5(x, m, k1);
      const theta = Math.atan(dyc);
      const yt = thicknessYt(x, t);
      upper.push({ x: x - yt * Math.sin(theta), y: yc + yt * Math.cos(theta) });
      lower.push({ x: x + yt * Math.sin(theta), y: yc - yt * Math.cos(theta) });
    }
    lower.reverse();
    return { upper, lower };
  };
})(window.AFL);
