(function (NS) {
  'use strict';

  // Explicit Runge-Kutta time integrators.
  // All share the signature:
  //   advance(state, dt, n, computeResidual, scratch)
  // where n = ni*nj, computeResidual(state, res) fills res in-place,
  // and scratch is a pre-allocated scratch object returned by makeScratch.

  const RK = NS.RK = {};
  const Math_ = NS.Math_;

  RK.makeScratch = function (n) {
    return {
      U0:  Math_.makeState(n),
      U1:  Math_.makeState(n),
      U2:  Math_.makeState(n),
      R0:  Math_.makeState(n),
      R1:  Math_.makeState(n),
      R2:  Math_.makeState(n),
      R3:  Math_.makeState(n),
    };
  };

  // RK1 — explicit Euler
  function rk1(state, dt, n, computeResidual, sc) {
    computeResidual(state, sc.R0);
    for (let k = 0; k < n; k++) {
      state.rho[k]  += dt * sc.R0.rho[k];
      state.rhou[k] += dt * sc.R0.rhou[k];
      state.rhov[k] += dt * sc.R0.rhov[k];
      state.E[k]    += dt * sc.R0.E[k];
    }
  }

  // RK2 — Heun (explicit trapezoidal)
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

  // RK3 — TVD Shu-Osher
  function rk3(state, dt, n, computeResidual, sc) {
    Math_.copyState(sc.U0, state, n);

    // Stage 1: U1 = U0 + dt*R(U0)
    computeResidual(state, sc.R0);
    for (let k = 0; k < n; k++) {
      sc.U1.rho[k]  = sc.U0.rho[k]  + dt * sc.R0.rho[k];
      sc.U1.rhou[k] = sc.U0.rhou[k] + dt * sc.R0.rhou[k];
      sc.U1.rhov[k] = sc.U0.rhov[k] + dt * sc.R0.rhov[k];
      sc.U1.E[k]    = sc.U0.E[k]    + dt * sc.R0.E[k];
    }

    // Stage 2: U2 = 3/4*U0 + 1/4*(U1 + dt*R(U1))
    computeResidual(sc.U1, sc.R1);
    for (let k = 0; k < n; k++) {
      sc.U2.rho[k]  = 0.75 * sc.U0.rho[k]  + 0.25 * (sc.U1.rho[k]  + dt * sc.R1.rho[k]);
      sc.U2.rhou[k] = 0.75 * sc.U0.rhou[k] + 0.25 * (sc.U1.rhou[k] + dt * sc.R1.rhou[k]);
      sc.U2.rhov[k] = 0.75 * sc.U0.rhov[k] + 0.25 * (sc.U1.rhov[k] + dt * sc.R1.rhov[k]);
      sc.U2.E[k]    = 0.75 * sc.U0.E[k]    + 0.25 * (sc.U1.E[k]    + dt * sc.R1.E[k]);
    }

    // Stage 3: U_new = 1/3*U0 + 2/3*(U2 + dt*R(U2))
    computeResidual(sc.U2, sc.R2);
    const t1 = 1.0 / 3.0, t2 = 2.0 / 3.0;
    for (let k = 0; k < n; k++) {
      state.rho[k]  = t1 * sc.U0.rho[k]  + t2 * (sc.U2.rho[k]  + dt * sc.R2.rho[k]);
      state.rhou[k] = t1 * sc.U0.rhou[k] + t2 * (sc.U2.rhou[k] + dt * sc.R2.rhou[k]);
      state.rhov[k] = t1 * sc.U0.rhov[k] + t2 * (sc.U2.rhov[k] + dt * sc.R2.rhov[k]);
      state.E[k]    = t1 * sc.U0.E[k]    + t2 * (sc.U2.E[k]    + dt * sc.R2.E[k]);
    }
  }

  // RK4 — classical 4-stage
  function rk4(state, dt, n, computeResidual, sc) {
    Math_.copyState(sc.U0, state, n);
    const hdt = 0.5 * dt;

    computeResidual(state, sc.R0);

    for (let k = 0; k < n; k++) {
      sc.U1.rho[k]  = sc.U0.rho[k]  + hdt * sc.R0.rho[k];
      sc.U1.rhou[k] = sc.U0.rhou[k] + hdt * sc.R0.rhou[k];
      sc.U1.rhov[k] = sc.U0.rhov[k] + hdt * sc.R0.rhov[k];
      sc.U1.E[k]    = sc.U0.E[k]    + hdt * sc.R0.E[k];
    }
    computeResidual(sc.U1, sc.R1);

    for (let k = 0; k < n; k++) {
      sc.U2.rho[k]  = sc.U0.rho[k]  + hdt * sc.R1.rho[k];
      sc.U2.rhou[k] = sc.U0.rhou[k] + hdt * sc.R1.rhou[k];
      sc.U2.rhov[k] = sc.U0.rhov[k] + hdt * sc.R1.rhov[k];
      sc.U2.E[k]    = sc.U0.E[k]    + hdt * sc.R1.E[k];
    }
    computeResidual(sc.U2, sc.R2);

    for (let k = 0; k < n; k++) {
      sc.U1.rho[k]  = sc.U0.rho[k]  + dt * sc.R2.rho[k];
      sc.U1.rhou[k] = sc.U0.rhou[k] + dt * sc.R2.rhou[k];
      sc.U1.rhov[k] = sc.U0.rhov[k] + dt * sc.R2.rhov[k];
      sc.U1.E[k]    = sc.U0.E[k]    + dt * sc.R2.E[k];
    }
    computeResidual(sc.U1, sc.R3);

    const s = dt / 6.0;
    for (let k = 0; k < n; k++) {
      state.rho[k]  = sc.U0.rho[k]  + s * (sc.R0.rho[k]  + 2 * sc.R1.rho[k]  + 2 * sc.R2.rho[k]  + sc.R3.rho[k]);
      state.rhou[k] = sc.U0.rhou[k] + s * (sc.R0.rhou[k] + 2 * sc.R1.rhou[k] + 2 * sc.R2.rhou[k] + sc.R3.rhou[k]);
      state.rhov[k] = sc.U0.rhov[k] + s * (sc.R0.rhov[k] + 2 * sc.R1.rhov[k] + 2 * sc.R2.rhov[k] + sc.R3.rhov[k]);
      state.E[k]    = sc.U0.E[k]    + s * (sc.R0.E[k]    + 2 * sc.R1.E[k]    + 2 * sc.R2.E[k]    + sc.R3.E[k]);
    }
  }

  RK.schemes = { 1: rk1, 2: rk2, 3: rk3, 4: rk4 };
})(window.FVM);
