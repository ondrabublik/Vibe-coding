(function (NS) {
  'use strict';

  // Wall BC on the closed O-mesh inner boundary (j=0, entire profile is wall).

  NS.BC = NS.BC || {};

  function applySlipWall(ext, ghostIdx, physIdx, nx, ny) {
    const rho  = ext.rho[physIdx];
    const rhou = ext.rhou[physIdx];
    const rhov = ext.rhov[physIdx];
    const E    = ext.E[physIdx];
    const irho = 1.0 / Math.max(rho, 1e-12);
    const u = rhou * irho;
    const v = rhov * irho;
    const un = u * nx + v * ny;
    ext.rho[ghostIdx]  = rho;
    ext.rhou[ghostIdx] = rho * (u - 2.0 * un * nx);
    ext.rhov[ghostIdx] = rho * (v - 2.0 * un * ny);
    ext.E[ghostIdx]    = E;
  }

  NS.BC.applyWall = function (ext, grid, params) {
    const { ni, nj, extIdx, jfaceIdx, jFaceNx, jFaceNy, isWallCell } = grid;

    for (let i = 0; i < ni; i++) {
      const ghostI = extIdx(i + 1, 0);
      const physI  = extIdx(i + 1, 1);

      if (isWallCell[i]) {
        // Slip wall (Euler): reflect normal velocity
        const fi = jfaceIdx(i, 0);
        applySlipWall(ext, ghostI, physI, jFaceNx[fi], jFaceNy[fi]);
      } else {
        // Wake cut / side boundaries: zero-gradient
        ext.rho[ghostI]  = ext.rho[physI];
        ext.rhou[ghostI] = ext.rhou[physI];
        ext.rhov[ghostI] = ext.rhov[physI];
        ext.E[ghostI]    = ext.E[physI];
      }
    }

    // Periodic TE seam corners (i=0 ≡ i=ni)
    function copyExt(dst, src) {
      ext.rho[dst] = ext.rho[src]; ext.rhou[dst] = ext.rhou[src];
      ext.rhov[dst] = ext.rhov[src]; ext.E[dst] = ext.E[src];
    }
    copyExt(extIdx(0, 0), extIdx(ni, 0));
    copyExt(extIdx(ni + 1, 0), extIdx(1, 0));
  };
})(window.AFL);
