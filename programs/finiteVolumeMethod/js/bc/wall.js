(function (NS) {
  'use strict';

  // Slip-wall BC: reflect normal velocity, copy rho and pressure.
  // nWall = unit normal pointing FROM wall INTO domain.
  function applySlipWall(ext, ghostIdx, physIdx, nx, ny) {
    const rho  = ext.rho[physIdx];
    const rhou = ext.rhou[physIdx];
    const rhov = ext.rhov[physIdx];
    const E    = ext.E[physIdx];

    const irho = 1.0 / Math.max(rho, 1e-12);
    const u = rhou * irho;
    const v = rhov * irho;

    // reflect: u_g = u - 2*(u·n)*n
    const un = u * nx + v * ny;
    const ug = u - 2.0 * un * nx;
    const vg = v - 2.0 * un * ny;

    ext.rho[ghostIdx]  = rho;
    ext.rhou[ghostIdx] = rho * ug;
    ext.rhov[ghostIdx] = rho * vg;
    ext.E[ghostIdx]    = E;   // same total energy (pressure unchanged)
  }

  NS.BC = NS.BC || {};

  NS.BC.applyWalls = function (ext, grid) {
    const { ni, nj, jfaceIdx, jFaceNx, jFaceNy, extIdx } = grid;

    // Bottom wall: ghost row j=0 in extended coords
    for (let i = 0; i < ni; i++) {
      const ghostI = extIdx(i + 1, 0);
      const physI  = extIdx(i + 1, 1);
      const fi = jfaceIdx(i, 0);
      // J-face at J=0: normal points upward INTO domain
      applySlipWall(ext, ghostI, physI, jFaceNx[fi], jFaceNy[fi]);
    }

    // Top wall: ghost row j=nj+1 in extended coords
    for (let i = 0; i < ni; i++) {
      const ghostI = extIdx(i + 1, nj + 1);
      const physI  = extIdx(i + 1, nj);
      const fi = jfaceIdx(i, nj);
      // J-face at J=nj: normal points upward (AWAY from domain for top ghost)
      // → inward normal = flipped
      applySlipWall(ext, ghostI, physI, -jFaceNx[fi], -jFaceNy[fi]);
    }

    // Fill corner ghost cells (copy from nearest ghost)
    ext.rho[extIdx(0, 0)]         = ext.rho[extIdx(1, 0)];
    ext.rhou[extIdx(0, 0)]        = ext.rhou[extIdx(1, 0)];
    ext.rhov[extIdx(0, 0)]        = ext.rhov[extIdx(1, 0)];
    ext.E[extIdx(0, 0)]           = ext.E[extIdx(1, 0)];

    ext.rho[extIdx(ni + 1, 0)]    = ext.rho[extIdx(ni, 0)];
    ext.rhou[extIdx(ni + 1, 0)]   = ext.rhou[extIdx(ni, 0)];
    ext.rhov[extIdx(ni + 1, 0)]   = ext.rhov[extIdx(ni, 0)];
    ext.E[extIdx(ni + 1, 0)]      = ext.E[extIdx(ni, 0)];

    ext.rho[extIdx(0, nj + 1)]    = ext.rho[extIdx(1, nj + 1)];
    ext.rhou[extIdx(0, nj + 1)]   = ext.rhou[extIdx(1, nj + 1)];
    ext.rhov[extIdx(0, nj + 1)]   = ext.rhov[extIdx(1, nj + 1)];
    ext.E[extIdx(0, nj + 1)]      = ext.E[extIdx(1, nj + 1)];

    ext.rho[extIdx(ni + 1, nj + 1)]  = ext.rho[extIdx(ni, nj + 1)];
    ext.rhou[extIdx(ni + 1, nj + 1)] = ext.rhou[extIdx(ni, nj + 1)];
    ext.rhov[extIdx(ni + 1, nj + 1)] = ext.rhov[extIdx(ni, nj + 1)];
    ext.E[extIdx(ni + 1, nj + 1)]    = ext.E[extIdx(ni, nj + 1)];
  };
})(window.FVM);
