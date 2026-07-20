(function (NS) {
  'use strict';

  const Flux = NS.Flux;

  // Van Leer flux vector splitting.
  // Computes F+(stateL) + F-(stateR) in the normal direction.
  function splitFluxPlus(rho, u, v, p, c, nx, ny, gamma, fOut) {
    const un = u * nx + v * ny;
    const ut = -u * ny + v * nx;
    const Mn = un / c;

    if (Mn >= 1.0) {
      // Fully supersonic: all flux from this side
      const H = (p / (gamma - 1.0) + 0.5 * rho * (u * u + v * v) + p) / rho;
      const fun  = rho * un;
      const funx = fun * u + p * nx;
      const funy = fun * v + p * ny;
      const fE   = rho * un * H;
      fOut[0] += fun;
      fOut[1] += funx;
      fOut[2] += funy;
      fOut[3] += fE;
    } else if (Mn <= -1.0) {
      // Fully supersonic in opposite direction: contribute nothing
    } else {
      const fm  = 0.25 * rho * c * (Mn + 1.0) * (Mn + 1.0);
      const gm1 = gamma - 1.0;
      const fun_val = fm * ((gm1 * un + 2.0 * c) / gamma);  // normal momentum incl. p
      const E_val   = fm * (gm1 * un + 2.0 * c) * (gm1 * un + 2.0 * c) / (2.0 * (gamma * gamma - 1.0));
      // Transform momentum back: f_un -> x,y using rotational invariance
      // Pressure is already embedded in fun_val (for normal dir), tangential has no pressure
      fOut[0] += fm;
      fOut[1] += fun_val * nx - fm * ut * ny;
      fOut[2] += fun_val * ny + fm * ut * nx;
      fOut[3] += E_val;
    }
  }

  function splitFluxMinus(rho, u, v, p, c, nx, ny, gamma, fOut) {
    const un = u * nx + v * ny;
    const ut = -u * ny + v * nx;
    const Mn = un / c;

    if (Mn <= -1.0) {
      // Fully supersonic: all flux from this side (negative direction)
      const H = (p / (gamma - 1.0) + 0.5 * rho * (u * u + v * v) + p) / rho;
      const fun  = rho * un;
      const funx = fun * u + p * nx;
      const funy = fun * v + p * ny;
      const fE   = rho * un * H;
      fOut[0] += fun;
      fOut[1] += funx;
      fOut[2] += funy;
      fOut[3] += fE;
    } else if (Mn >= 1.0) {
      // Nothing from this side
    } else {
      const fm  = -0.25 * rho * c * (Mn - 1.0) * (Mn - 1.0);
      const gm1 = gamma - 1.0;
      const fun_val = fm * ((gm1 * un - 2.0 * c) / gamma);
      const E_val   = fm * (gm1 * un - 2.0 * c) * (gm1 * un - 2.0 * c) / (2.0 * (gamma * gamma - 1.0));
      fOut[0] += fm;
      fOut[1] += fun_val * nx - fm * ut * ny;
      fOut[2] += fun_val * ny + fm * ut * nx;
      fOut[3] += E_val;
    }
  }

  function vanLeer(ext, idxL, idxR, nx, ny, gamma, fOut) {
    const L = Flux.prims(ext, idxL, gamma);
    const R = Flux.prims(ext, idxR, gamma);

    fOut[0] = 0; fOut[1] = 0; fOut[2] = 0; fOut[3] = 0;
    splitFluxPlus( L.rho, L.u, L.v, L.p, L.c, nx, ny, gamma, fOut);
    splitFluxMinus(R.rho, R.u, R.v, R.p, R.c, nx, ny, gamma, fOut);
  }

  Flux.registry.vanLeer = vanLeer;
})(window.FVM);
