(function (NS) {
  'use strict';

  // Periodic circumferential BC for closed O-mesh (TE seam: i=0 ≡ i=ni).

  NS.BC = NS.BC || {};

  function copyExt(ext, dst, src) {
    ext.rho[dst] = ext.rho[src];
    ext.rhou[dst] = ext.rhou[src];
    ext.rhov[dst] = ext.rhov[src];
    ext.E[dst] = ext.E[src];
  }

  NS.BC.applyPeriodicSeam = function (ext, grid) {
    const { ni, nj, extIdx } = grid;

    for (let j = 0; j <= nj + 1; j++) {
      const cell0 = extIdx(1, j);
      const cellNm1 = extIdx(ni, j);
      copyExt(ext, extIdx(0, j), cellNm1);
      copyExt(ext, extIdx(ni + 1, j), cell0);
    }
  };
})(window.AFL);
