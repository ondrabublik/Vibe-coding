(function (NS) {
  'use strict';

  const Kernel = NS.Kernel;

  /**
   * Shepard renormalizace hustoty – stabilizuje volný povrch.
   */
  function shepardDensity(particles, hash, i, h) {
    const pi = particles[i];
    let rho = pi.mass * Kernel.W(0, h);
    let norm = Kernel.W(0, h);

    hash.forEachNeighbor(particles, i, 2 * h, function (j, dx, dy) {
      const r = Math.hypot(dx, dy);
      const w = Kernel.W(r, h);
      rho += particles[j].mass * w;
      norm += w;
    });

    if (norm < 1e-9) return pi.rho0;
    return (rho / norm) * pi.rho0;
  }

  /**
   * delta-SPH difuze hustoty (Antuono et al.).
   */
  function deltaCorrection(particles, hash, i, h, delta) {
    const pi = particles[i];
    let corr = 0;
    const eta2 = 0.01 * h * h;

    hash.forEachNeighbor(particles, i, 2 * h, function (j, dx, dy) {
      const pj = particles[j];
      const r2 = dx * dx + dy * dy + eta2;
      const grad = Kernel.gradW(dx, dy, h);
      const diff = (pj.rho - pi.rho) / r2;
      corr += (pj.mass / pj.rho) * diff * (dx * grad[0] + dy * grad[1]);
    });

    return delta * corr;
  }

  function applyDensityStep(particles, hash, h, options) {
    const delta = options.delta != null ? options.delta : 0.1;
    const useShepard = options.useShepard !== false;
    const rhoMin = options.rhoMin != null ? options.rhoMin : 0.94;
    const rhoMax = options.rhoMax != null ? options.rhoMax : 1.06;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type === 'boundary') {
        p.rho = p.rho0;
        continue;
      }

      let rho = useShepard ? shepardDensity(particles, hash, i, h) : p.rho;
      rho += deltaCorrection(particles, hash, i, h, delta);
      p.rho = NS.Math.clamp(rho, p.rho0 * rhoMin, p.rho0 * rhoMax);
    }
  }

  NS.Density = {
    shepardDensity,
    deltaCorrection,
    applyDensityStep,
  };
})(window.SPH);
