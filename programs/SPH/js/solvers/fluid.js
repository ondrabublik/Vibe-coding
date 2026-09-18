(function (NS) {
  'use strict';

  const { TYPE } = NS.Particles;
  const Kernel = NS.Kernel;
  const SpatialHash = NS.SpatialHash;
  const { integrate, adaptiveDt } = NS.Integrator;
  const { clamp } = NS.Math;
  const { applyDensityStep } = NS.Density;

  class FluidSolver {
    constructor(params) {
      this.params = Object.assign({}, params);
      this.hash = new SpatialHash(Kernel.supportRadius(params.h));
      this.vMax = 0;
      this.B = (params.speedOfSound * params.speedOfSound * params.rho0) / params.gamma;
    }

    setParams(params) {
      Object.assign(this.params, params);
      this.hash.cellSize = Kernel.supportRadius(this.params.h);
      this.hash.invCellSize = 1 / this.hash.cellSize;
      this.B =
        (this.params.speedOfSound * this.params.speedOfSound * this.params.rho0) /
        this.params.gamma;
    }

    pressure(rho) {
      const rho0 = this.params.rho0;
      const ratio = clamp(rho / rho0, 0.96, 1.04);
      return this.B * (Math.pow(ratio, this.params.gamma) - 1);
    }

    computeDensityAndPressure(particles) {
      const h = this.params.h;
      const rho0 = this.params.rho0;

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type === TYPE.BOUNDARY) {
          pi.rho = rho0;
          pi.p = 0;
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
        rhoMin: 0.96,
        rhoMax: 1.04,
      });

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type !== TYPE.BOUNDARY) {
          pi.p = this.pressure(pi.rho);
        }
      }
    }

    computeForces(particles) {
      const h = this.params.h;
      const gx = this.params.gravity[0];
      const gy = this.params.gravity[1];
      const alpha = this.params.artificialViscosityAlpha;
      const beta = this.params.artificialViscosityBeta;
      const c0 = this.params.speedOfSound;
      const rho0 = this.params.rho0;
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
          if (pj.type === TYPE.BOUNDARY) {
            rhoJ = rho0;
            pJ = pi.p;
          }

          const invRhoJ2 = 1 / (rhoJ * rhoJ);

          let piVis = 0;
          const rv = (pi.v[0] - pj.v[0]) * dx + (pi.v[1] - pj.v[1]) * dy;
          if (rv < 0) {
            const r2 = dx * dx + dy * dy + 0.01 * h * h;
            const mu = h * rv / r2;
            const rhoBar = 0.5 * (pi.rho + rhoJ);
            piVis = (-alpha * c0 * mu + beta * mu * mu) / rhoBar;
          }

          const pTerm = pi.p * invRhoI2 + pJ * invRhoJ2 + piVis;
          fx += -pj.mass * pTerm * grad[0];
          fy += -pj.mass * pTerm * grad[1];
        });

        pi.a[0] = fx / pi.mass;
        pi.a[1] = fy / pi.mass;
        vMax = Math.max(vMax, Math.hypot(pi.v[0], pi.v[1]));
      }

      this.vMax = vMax;
    }

    applyXsph(particles, dt) {
      const h = this.params.h;
      const eps = this.params.xsph;
      if (eps <= 0) return;

      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        if (pi.type !== TYPE.FLUID) continue;

        let corrVx = 0;
        let corrVy = 0;
        let wSum = 0;

        this.hash.forEachNeighbor(particles, i, 2 * h, function (j, dx, dy) {
          const pj = particles[j];
          const w = Kernel.W(Math.hypot(dx, dy), h);
          corrVx += (pj.v[0] - pi.v[0]) * w;
          corrVy += (pj.v[1] - pi.v[1]) * w;
          wSum += w;
        });

        if (wSum > 0) {
          pi.v[0] += eps * dt * (corrVx / wSum);
          pi.v[1] += eps * dt * (corrVy / wSum);
        }
      }
    }

    step(particles) {
      const dt = adaptiveDt(this.params.dt, {
        h: this.params.h,
        c0: this.params.speedOfSound,
        gy: this.params.gravity[1],
        vMax: this.vMax,
        cfl: this.params.cfl,
      });

      this.hash.build(particles);
      this.computeDensityAndPressure(particles);
      this.computeForces(particles);
      integrate(particles, dt, null);
      this.applyXsph(particles, dt);
      return dt;
    }

    getScalarField(p) {
      return Math.hypot(p.v[0], p.v[1]);
    }
  }

  NS.FluidSolver = FluidSolver;
})(window.SPH);
