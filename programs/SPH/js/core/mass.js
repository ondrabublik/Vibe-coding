(function (NS) {
  'use strict';

  const Kernel = NS.Kernel;

  function kernelWeightSum(h, spacing) {
    const radius = Kernel.supportRadius(h);
    let sum = 0;

    for (let y = -radius; y <= radius + 1e-9; y += spacing) {
      for (let x = -radius; x <= radius + 1e-9; x += spacing) {
        const r = Math.hypot(x, y);
        if (r <= radius) sum += Kernel.W(r, h);
      }
    }

    return Math.max(sum, 1e-9);
  }

  function particleMass(rho0, h, spacing) {
    return rho0 / kernelWeightSum(h, spacing);
  }

  NS.Mass = {
    kernelWeightSum,
    particleMass,
  };
})(window.SPH);
