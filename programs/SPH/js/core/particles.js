(function (NS) {
  'use strict';

  const TYPE = {
    FLUID: 'fluid',
    SOLID: 'solid',
    BOUNDARY: 'boundary',
  };

  function createParticle(options) {
    return {
      x: options.x.slice(),
      v: options.v ? options.v.slice() : [0, 0],
      a: [0, 0],
      mass: options.mass,
      rho: options.rho != null ? options.rho : options.rho0,
      rho0: options.rho0,
      p: 0,
      h: options.h,
      type: options.type || TYPE.FLUID,
      // Solid stress tensor components (deviatoric + pressure handled separately)
      sxx: 0,
      syy: 0,
      sxy: 0,
      color: options.color || null,
    };
  }

  function resetDynamics(particles) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.a[0] = 0;
      p.a[1] = 0;
      if (p.type !== TYPE.BOUNDARY) {
        // keep boundary velocities zero
      }
    }
  }

  NS.Particles = {
    TYPE,
    createParticle,
    resetDynamics,
  };
})(window.SPH);
