(function (NS) {
  'use strict';

  const Math_ = NS.Math_;
  NS.BC = NS.BC || {};

  NS.BC.applyOutlet = function (ext, grid, params) {
    const { ni, nj, extIdx } = grid;
    const { gamma, outletMode, outletPback } = params;

    for (let j = 0; j < nj; j++) {
      const ghostI = extIdx(ni + 1, j + 1);
      const physI  = extIdx(ni,     j + 1);

      const rho  = Math.max(ext.rho[physI], 1e-12);
      const rhou = ext.rhou[physI];
      const rhov = ext.rhov[physI];
      const E    = ext.E[physI];
      const irho = 1.0 / rho;
      const u    = rhou * irho;
      const v    = rhov * irho;
      const p    = Math_.pressure(rho, rhou, rhov, E, gamma);
      const c    = Math_.soundSpeed(rho, p, gamma);
      const un   = u;   // approx: outlet normal ~ x-axis
      const M    = Math.abs(un) / c;

      if (outletMode === 'supersonic' || M >= 1.0) {
        // Extrapolate everything
        ext.rho[ghostI]  = rho;
        ext.rhou[ghostI] = rhou;
        ext.rhov[ghostI] = rhov;
        ext.E[ghostI]    = E;
      } else {
        // Subsonic: fix back pressure, extrapolate rho, u, v
        const pb = Math.max(outletPback, 1e-6);
        ext.rho[ghostI]  = rho;
        ext.rhou[ghostI] = rhou;
        ext.rhov[ghostI] = rhov;
        ext.E[ghostI]    = pb / (gamma - 1.0) + 0.5 * rho * (u * u + v * v);
      }
    }
  };
})(window.FVM);
