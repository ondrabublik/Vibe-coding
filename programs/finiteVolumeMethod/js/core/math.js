(function (NS) {
  'use strict';

  // Low-level operations on conserved state U = [rho, rho*u, rho*v, E]
  const Math_ = NS.Math_ = {};

  const EPS = 1e-12;

  Math_.pressure = function (rho, rhou, rhov, E, gamma) {
    const irho = 1.0 / Math.max(rho, EPS);
    const ke = 0.5 * (rhou * rhou + rhov * rhov) * irho;
    return Math.max((gamma - 1.0) * (E - ke), EPS);
  };

  Math_.soundSpeed = function (rho, p, gamma) {
    return Math.sqrt(gamma * Math.max(p, EPS) / Math.max(rho, EPS));
  };

  Math_.primitives = function (rho, rhou, rhov, E, gamma) {
    rho = Math.max(rho, EPS);
    const irho = 1.0 / rho;
    const u = rhou * irho;
    const v = rhov * irho;
    const p = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u * u + v * v)), EPS);
    const c = Math.sqrt(gamma * p * irho);
    const M = Math.sqrt(u * u + v * v) / c;
    const H = (E + p) * irho;
    return { rho, u, v, p, c, M, H };
  };

  Math_.conserved = function (rho, u, v, p, gamma) {
    const E = p / (gamma - 1.0) + 0.5 * rho * (u * u + v * v);
    return { rho, rhou: rho * u, rhov: rho * v, E };
  };

  // Isentropic inlet state from total conditions
  Math_.inletState = function (M, p0, T0, gamma) {
    const factor = 1.0 + 0.5 * (gamma - 1.0) * M * M;
    const T   = T0 / factor;
    const p   = p0 * Math.pow(factor, -gamma / (gamma - 1.0));
    const rho = p / T;                // ideal gas with R=1
    const c   = Math.sqrt(gamma * p / rho);
    const u   = M * c;
    return Math_.conserved(rho, u, 0.0, p, gamma);
  };

  // Entropy s = p / rho^gamma
  Math_.entropy = function (rho, p, gamma) {
    return p / Math.pow(Math.max(rho, EPS), gamma);
  };

  // Fill a physical Float64Array with a uniform state
  Math_.fillUniform = function (state, ni, nj, rho, rhou, rhov, E) {
    const n = ni * nj;
    state.rho.fill(rho, 0, n);
    state.rhou.fill(rhou, 0, n);
    state.rhov.fill(rhov, 0, n);
    state.E.fill(E, 0, n);
  };

  // Copy from one physical state to another
  Math_.copyState = function (dst, src, n) {
    dst.rho.set(src.rho.subarray(0, n));
    dst.rhou.set(src.rhou.subarray(0, n));
    dst.rhov.set(src.rhov.subarray(0, n));
    dst.E.set(src.E.subarray(0, n));
  };

  // dst = a*A + b*B  (in-place linear combination of state arrays)
  Math_.linComb = function (dst, a, A, b, B, n) {
    for (let k = 0; k < n; k++) {
      dst.rho[k]  = a * A.rho[k]  + b * B.rho[k];
      dst.rhou[k] = a * A.rhou[k] + b * B.rhou[k];
      dst.rhov[k] = a * A.rhov[k] + b * B.rhov[k];
      dst.E[k]    = a * A.E[k]    + b * B.E[k];
    }
  };

  // Physical normal flux F*nx + G*ny
  Math_.physicalFlux = function (rho, rhou, rhov, E, p, nx, ny) {
    const un = (rhou * nx + rhov * ny) / Math.max(rho, EPS);
    return [
      rho * un,
      rhou * un + p * nx,
      rhov * un + p * ny,
      (E + p) * un,
    ];
  };

  // Allocate state buffers
  Math_.makeState = function (n) {
    return {
      rho:  new Float64Array(n),
      rhou: new Float64Array(n),
      rhov: new Float64Array(n),
      E:    new Float64Array(n),
    };
  };
})(window.FVM);
