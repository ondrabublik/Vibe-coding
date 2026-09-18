(function (NS) {
  'use strict';

  const { TYPE } = NS.Particles;
  const Kernel = NS.Kernel;
  const SpatialHash = NS.SpatialHash;
  const { integrate, adaptiveDt } = NS.Integrator;
  const { clamp } = NS.Math;
  const { applyDensityStep } = NS.Density;

  function vonMises2D(sxx, syy, sxy) {
    return Math.sqrt(Math.max(0, sxx * sxx + syy * syy - sxx * syy + 3 * sxy * sxy));
  }

  function plasticReturn(sxx, syy, sxy, yieldStress) {
    const vm = vonMises2D(sxx, syy, sxy);
    if (vm <= yieldStress || vm < 1e-9) return [sxx, syy, sxy];
    const scale = yieldStress / vm;
    return [sxx * scale, syy * scale, sxy * scale];
  }

  class SolidSolver {
    constructor(params) {
      this.params = Object.assign({}, params);
      this.hash = new SpatialHash(Kernel.supportRadius(params.h));
      this.vMax = 0;
    }

    setParams(params) {
      Object.assign(this.params, params);
      this.hash.cellSize = Kernel.supportRadius(this.params.h);
      this.hash.invCellSize = 1 / this.hash.cellSize;
    }

    pressure(rho, rho0) {
      const ratio = clamp(rho / rho0, 0.94, 1.06);
      return Math.max(0, this.params.bulkModulus * (ratio - 1));
    }

    computeDensity(particles) {
      const h = this.params.h;

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type === TYPE.BOUNDARY) {
          pi.rho = pi.rho0;
          continue;
        }

        let rho = pi.mass * Kernel.W(0, h);
        this.hash.forEachNeighbor(particles, i, 2 * h, function (j, dx, dy) {
          rho += particles[j].mass * Kernel.W(Math.hypot(dx, dy), h);
        });
        pi.rho = rho;
      }

      applyDensityStep(particles, this.hash, h, {
        delta: this.params.densityDiffusion,
        rhoMin: 0.94,
        rhoMax: 1.06,
      });

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type !== TYPE.SOLID) continue;
        pi.p = this.pressure(pi.rho, pi.rho0);
      }
    }

    updateStress(particles, dt) {
      const h = this.params.h;
      const G = this.params.shearModulus;

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type !== TYPE.SOLID) continue;

        let dvxdx = 0;
        let dvydy = 0;
        let dvxdy = 0;
        let dvydx = 0;

        this.hash.forEachNeighbor(particles, i, 2 * h, function (j, dx, dy) {
          const pj = particles[j];
          const grad = Kernel.gradW(dx, dy, h);
          const mjOverRhoj = pj.mass / pj.rho;
          dvxdx += (pj.v[0] - pi.v[0]) * grad[0] * mjOverRhoj;
          dvydy += (pj.v[1] - pi.v[1]) * grad[1] * mjOverRhoj;
          dvxdy += (pj.v[0] - pi.v[0]) * grad[1] * mjOverRhoj;
          dvydx += (pj.v[1] - pi.v[1]) * grad[0] * mjOverRhoj;
        });

        const trace = dvxdx + dvydy;
        pi.sxx += dt * 2 * G * (dvxdx - trace / 3);
        pi.syy += dt * 2 * G * (dvydy - trace / 3);
        pi.sxy += dt * G * (dvxdy + dvydx);

        const dev = plasticReturn(pi.sxx, pi.syy, pi.sxy, this.params.yieldStress);
        pi.sxx = dev[0];
        pi.syy = dev[1];
        pi.sxy = dev[2];
      }
    }

    computeForces(particles) {
      const h = this.params.h;
      const gx = this.params.gravity[0];
      const gy = this.params.gravity[1];
      const av = this.params.artificialViscosity;
      const rho0 = this.params.rho0;
      const bulk = this.params.bulkModulus;
      const c0 = Math.sqrt(bulk / rho0);
      let vMax = 0;

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type === TYPE.BOUNDARY) continue;

        let fx = pi.mass * gx;
        let fy = pi.mass * gy;
        const invRhoI2 = 1 / (pi.rho * pi.rho);

        this.hash.forEachNeighbor(particles, i, 2 * h, function (j, dx, dy) {
          const pj = particles[j];
          const grad = Kernel.gradW(dx, dy, h);

          let rhoJ = pj.rho;
          let pJ = pj.p;
          let sxxJ = pj.sxx;
          let syyJ = pj.syy;
          let sxyJ = pj.sxy;

          if (pj.type === TYPE.BOUNDARY) {
            rhoJ = rho0;
            pJ = pi.p;
            sxxJ = 0;
            syyJ = 0;
            sxyJ = 0;
          }

          const invRhoJ2 = 1 / (rhoJ * rhoJ);

          const sxxI = -pi.p + pi.sxx;
          const syyI = -pi.p + pi.syy;
          const sxxB = -pJ + sxxJ;
          const syyB = -pJ + syyJ;

          let piVis = 0;
          const rv = (pi.v[0] - pj.v[0]) * dx + (pi.v[1] - pj.v[1]) * dy;
          const r2 = dx * dx + dy * dy + 0.01 * h * h;
          piVis = (-av * c0 * h * rv / r2) * pj.mass;

          fx +=
            -pj.mass *
            ((sxxI * invRhoI2 + sxxB * invRhoJ2 + piVis) * grad[0] +
              (pi.sxy + sxyJ) * (invRhoI2 * grad[1] + invRhoJ2 * grad[1]));
          fy +=
            -pj.mass *
            ((syyI * invRhoI2 + syyB * invRhoJ2 + piVis) * grad[1] +
              (pi.sxy + sxyJ) * (invRhoI2 * grad[0] + invRhoJ2 * grad[0]));
        });

        pi.a[0] = fx / pi.mass;
        pi.a[1] = fy / pi.mass;
        vMax = Math.max(vMax, Math.hypot(pi.v[0], pi.v[1]));
      }

      this.vMax = vMax;
    }

    step(particles) {
      const dt = adaptiveDt(this.params.dt, {
        h: this.params.h,
        c0: Math.sqrt(this.params.bulkModulus / this.params.rho0),
        gy: this.params.gravity[1],
        vMax: this.vMax,
        cfl: this.params.cfl,
      });

      this.hash.build(particles);
      this.computeDensity(particles);
      this.updateStress(particles, dt);
      this.computeForces(particles);
      integrate(particles, dt, null);
      return dt;
    }

    getScalarField(p) {
      return vonMises2D(p.sxx, p.syy, p.sxy);
    }
  }

  NS.SolidSolver = SolidSolver;
})(window.SPH);
