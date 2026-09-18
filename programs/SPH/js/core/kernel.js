(function (NS) {
  'use strict';

  /**
   * Wendland C2 kernel in 2D (normalized).
   * W(r,h) = (21 / 16πh²) · (1 - q/2)⁴ · (2q + 1),  q = r/h < 2
   */
  const Kernel = {
    supportRadius(h) {
      return 2 * h;
    },

    W(r, h) {
      if (r >= 2 * h) return 0;
      const q = r / h;
      const t = 1 - 0.5 * q;
      const coeff = 21 / (16 * Math.PI * h * h);
      return coeff * t * t * t * t * (2 * q + 1);
    },

    gradW(dx, dy, h) {
      const r = Math.hypot(dx, dy);
      if (r < 1e-12 || r >= 2 * h) return [0, 0];

      const q = r / h;
      const t = 1 - 0.5 * q;
      const coeff = 21 / (16 * Math.PI * h * h);
      const dWdq = coeff * (-2 * t * t * t * (2 * q + 1) + 2 * t * t * t * t);
      const dWdr = dWdq / h;
      return [(dWdr * dx) / r, (dWdr * dy) / r];
    },
  };

  NS.Kernel = Kernel;
})(window.SPH);
