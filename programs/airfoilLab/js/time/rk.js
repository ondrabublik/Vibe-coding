(function (NS) {
  'use strict';

  // Runge-Kutta time integrators.
  // advance(state, dt, n, computeResidual, scratch)

  const RK = NS.RK = {};
  const Math_ = NS.Math_;

  RK.makeScratch = function (n) {
    return {
      U0: Math_.makeState(n),
      U1: Math_.makeState(n),
      R0: Math_.makeState(n),
      R1: Math_.makeState(n),
    };
  };

  // RK2 — Heun (explicit trapezoidal). Default for AirfoilLab.
  function rk2(state, dt, n, computeResidual, sc) {
    Math_.copyState(sc.U0, state, n);

    computeResidual(state, sc.R0);
    for (let k = 0; k < n; k++) {
      sc.U1.rho[k]  = sc.U0.rho[k]  + dt * sc.R0.rho[k];
      sc.U1.rhou[k] = sc.U0.rhou[k] + dt * sc.R0.rhou[k];
      sc.U1.rhov[k] = sc.U0.rhov[k] + dt * sc.R0.rhov[k];
      sc.U1.E[k]    = sc.U0.E[k]    + dt * sc.R0.E[k];
    }

    computeResidual(sc.U1, sc.R1);
    for (let k = 0; k < n; k++) {
      state.rho[k]  = sc.U0.rho[k]  + 0.5 * dt * (sc.R0.rho[k]  + sc.R1.rho[k]);
      state.rhou[k] = sc.U0.rhou[k] + 0.5 * dt * (sc.R0.rhou[k] + sc.R1.rhou[k]);
      state.rhov[k] = sc.U0.rhov[k] + 0.5 * dt * (sc.R0.rhov[k] + sc.R1.rhov[k]);
      state.E[k]    = sc.U0.E[k]    + 0.5 * dt * (sc.R0.E[k]    + sc.R1.E[k]);
    }
  }

  RK.advance = rk2;
})(window.AFL);
