(function (NS) {
  'use strict';

  NS.Flux = NS.Flux || {};

  const EPS = 1e-12;

  // Extract primitive variables from extended-state array at given index.
  NS.Flux.prims = function (ext, idx, gamma) {
    const rho  = Math.max(ext.rho[idx], EPS);
    const irho = 1.0 / rho;
    const u    = ext.rhou[idx] * irho;
    const v    = ext.rhov[idx] * irho;
    const E    = ext.E[idx];
    const p    = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u * u + v * v)), EPS);
    const c    = Math.sqrt(gamma * p * irho);
    return { rho, u, v, E, p, c, H: (E + p) * irho };
  };

  // Flux function registry — populated by individual flux scheme files.
  // Registered functions have signature: (L, R, nx, ny, gamma, fOut)
  // where L and R are prim objects {rho, u, v, p, E, c, H}.
  NS.Flux.registry = {};
})(window.AFL);
