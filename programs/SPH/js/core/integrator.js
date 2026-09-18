(function (NS) {
  'use strict';

  const { TYPE } = NS.Particles;
  const { clamp } = NS.Math;

  function integrate(particles, dt, bounds) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type === TYPE.BOUNDARY) {
        p.v[0] = 0;
        p.v[1] = 0;
        continue;
      }

      p.v[0] += dt * p.a[0];
      p.v[1] += dt * p.a[1];
      p.x[0] += dt * p.v[0];
      p.x[1] += dt * p.v[1];

      if (bounds) {
        if (p.x[0] < bounds.xMin) {
          p.x[0] = bounds.xMin;
          p.v[0] = 0;
        } else if (p.x[0] > bounds.xMax) {
          p.x[0] = bounds.xMax;
          p.v[0] = 0;
        }

        if (p.x[1] < bounds.yMin) {
          p.x[1] = bounds.yMin;
          if (p.v[1] < 0) p.v[1] = 0;
        } else if (p.x[1] > bounds.yMax) {
          p.x[1] = bounds.yMax;
          if (p.v[1] > 0) p.v[1] = 0;
        }
      }
    }
  }

  function adaptiveDt(requestedDt, params) {
    const cfl = params.cfl != null ? params.cfl : 0.25;
    const h = params.h;
    const vmax = Math.max(params.vMax || 0, Math.sqrt(Math.abs(params.gy || 0) * h));
    const c0 = params.c0 || 10;
    const dtMax = cfl * h / (c0 + vmax + 1e-6);
    return clamp(requestedDt, 1e-6, dtMax);
  }

  NS.Integrator = { integrate, adaptiveDt };
})(window.SPH);
