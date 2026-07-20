(function (NS) {
  'use strict';

  const VEC2 = {
    add(a, b) {
      return [a[0] + b[0], a[1] + b[1]];
    },
    sub(a, b) {
      return [a[0] - b[0], a[1] - b[1]];
    },
    scale(a, s) {
      return [a[0] * s, a[1] * s];
    },
    dot(a, b) {
      return a[0] * b[0] + a[1] * b[1];
    },
    len(a) {
      return Math.hypot(a[0], a[1]);
    },
    lenSq(a) {
      return a[0] * a[0] + a[1] * a[1];
    },
    norm(a) {
      const l = Math.hypot(a[0], a[1]);
      if (l < 1e-12) return [0, 0];
      return [a[0] / l, a[1] / l];
    },
    clone(a) {
      return [a[0], a[1]];
    },
    zero() {
      return [0, 0];
    },
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  NS.Math = { VEC2, clamp, lerp };
})(window.SPH);
