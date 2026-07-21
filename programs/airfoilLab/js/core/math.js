(function (NS) {
  'use strict';

  // Low-level operations on conserved state U = [rho, rho*u, rho*v, E].
  // Adapted from finiteVolumeMethod/js/core/math.js.

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
    return { rho, u, v, p, c, M: Math.sqrt(u * u + v * v) / c, H: (E + p) * irho };
  };

  Math_.conserved = function (rho, u, v, p, gamma) {
    return { rho, rhou: rho * u, rhov: rho * v, E: p / (gamma - 1.0) + 0.5 * rho * (u * u + v * v) };
  };

  // Free-stream state from Mach, total conditions (non-dimensional, ideal gas R=1)
  Math_.freestreamState = function (mach, p0, T0, gamma) {
    const factor = 1.0 + 0.5 * (gamma - 1.0) * mach * mach;
    const T   = T0 / factor;
    const p   = p0 * Math.pow(factor, -gamma / (gamma - 1.0));
    const rho = p / T;
    const c   = Math.sqrt(gamma * p / rho);
    const V   = mach * c;
    return { rho, u: V, v: 0.0, p, c, V, E: p / (gamma - 1.0) + 0.5 * rho * V * V };
  };

  Math_.entropy = function (rho, p, gamma) {
    return p / Math.pow(Math.max(rho, EPS), gamma);
  };

  Math_.fillUniform = function (state, ni, nj, rho, rhou, rhov, E) {
    const n = ni * nj;
    state.rho.fill(rho, 0, n);
    state.rhou.fill(rhou, 0, n);
    state.rhov.fill(rhov, 0, n);
    state.E.fill(E, 0, n);
  };

  Math_.copyState = function (dst, src, n) {
    dst.rho.set(src.rho.subarray(0, n));
    dst.rhou.set(src.rhou.subarray(0, n));
    dst.rhov.set(src.rhov.subarray(0, n));
    dst.E.set(src.E.subarray(0, n));
  };

  Math_.makeState = function (n) {
    return { rho: new Float64Array(n), rhou: new Float64Array(n), rhov: new Float64Array(n), E: new Float64Array(n) };
  };
})(window.AFL);
