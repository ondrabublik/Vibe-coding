(function (NS) {
  'use strict';

  const Flux = NS.Flux;

  function mPlus(M)  { return Math.abs(M) >= 1 ? 0.5 * (M + Math.abs(M)) : 0.25 * (M + 1.0) * (M + 1.0); }
  function mMinus(M) { return Math.abs(M) >= 1 ? 0.5 * (M - Math.abs(M)) : -0.25 * (M - 1.0) * (M - 1.0); }
  function pPlus(M)  { return Math.abs(M) >= 1 ? (M > 0 ? 1.0 : 0.0) : 0.25 * (M + 1.0) * (M + 1.0) * (2.0 - M); }
  function pMinus(M) { return Math.abs(M) >= 1 ? (M < 0 ? 1.0 : 0.0) : 0.25 * (M - 1.0) * (M - 1.0) * (2.0 + M); }

  function ausm(ext, idxL, idxR, nx, ny, gamma, fOut) {
    const L = Flux.prims(ext, idxL, gamma);
    const R = Flux.prims(ext, idxR, gamma);

    const unL = L.u * nx + L.v * ny;
    const unR = R.u * nx + R.v * ny;

    const cHalf = 0.5 * (L.c + R.c);

    const MnL = unL / cHalf;
    const MnR = unR / cHalf;

    const Mhalf = mPlus(MnL) + mMinus(MnR);
    const unHalf = Mhalf * cHalf;

    const pHalf = pPlus(MnL) * L.p + pMinus(MnR) * R.p;

    // Upwind convective quantities
    let rhoUp, rhouUp, rhovUp, EpUp;
    if (unHalf >= 0.0) {
      rhoUp  = L.rho;
      rhouUp = L.rho * L.u;
      rhovUp = L.rho * L.v;
      EpUp   = L.E + L.p;
    } else {
      rhoUp  = R.rho;
      rhouUp = R.rho * R.u;
      rhovUp = R.rho * R.v;
      EpUp   = R.E + R.p;
    }

    fOut[0] = unHalf * rhoUp;
    fOut[1] = unHalf * rhouUp + pHalf * nx;
    fOut[2] = unHalf * rhovUp + pHalf * ny;
    fOut[3] = unHalf * EpUp;
  }

  Flux.registry.ausm = ausm;
})(window.FVM);
