(function (NS) {
  'use strict';

  // Common helpers for flux schemes.
  // All flux functions share the interface:
  //   computeFlux(extState, idxL, idxR, nx, ny, gamma, fOut)
  // where fOut[0..3] receives the area-un-weighted numerical flux.
  //
  // Normal direction: (nx, ny) points from left (L) to right (R) cell.

  NS.Flux = NS.Flux || {};

  const EPS = 1e-12;

  // Physical normal flux of a single state
  NS.Flux.physFlux = function (rho, u, v, E, p, nx, ny) {
    const un = u * nx + v * ny;
    return [
      rho * un,
      rho * un * u + p * nx,
      rho * un * v + p * ny,
      (E + p) * un,
    ];
  };

  // Decompose velocity into normal and tangential components
  // t = (-ny, nx)  → u_t = -u*ny + v*nx
  NS.Flux.decompose = function (u, v, nx, ny) {
    return {
      un: u * nx + v * ny,
      ut: -u * ny + v * nx,
    };
  };

  // Recompose: u = un*nx + ut*(-ny),  v = un*ny + ut*nx
  NS.Flux.recompose = function (un, ut, nx, ny) {
    return {
      u: un * nx - ut * ny,
      v: un * ny + ut * nx,
    };
  };

  // Extract primitives from extended state at index
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

  // Registry for flux schemes
  NS.Flux.registry = {};
})(window.FVM);
