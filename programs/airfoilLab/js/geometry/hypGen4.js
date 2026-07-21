(function (NS) {
  'use strict';

  // Hyperbolic O-mesh generator — Hyp_gen4 from MATLAB Omesh.m
  // Two explicit layers, then implicit marching with a 2×2 block system per point.

  NS.HypGen4 = {};

  function solveDense(A, b, n) {
    // Gaussian elimination with partial pivoting; A is row-major n×n, destroyed in place.
    const x = new Float64Array(n);
    const aug = new Float64Array(n * (n + 1));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) aug[i * (n + 1) + j] = A[i * n + j];
      aug[i * (n + 1) + n] = b[i];
    }

    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxVal = Math.abs(aug[col * (n + 1) + col]);
      for (let row = col + 1; row < n; row++) {
        const val = Math.abs(aug[row * (n + 1) + col]);
        if (val > maxVal) { maxVal = val; pivot = row; }
      }
      if (maxVal < 1e-30) return null;

      if (pivot !== col) {
        for (let j = col; j <= n; j++) {
          const tmp = aug[col * (n + 1) + j];
          aug[col * (n + 1) + j] = aug[pivot * (n + 1) + j];
          aug[pivot * (n + 1) + j] = tmp;
        }
      }

      const invP = 1 / aug[col * (n + 1) + col];
      for (let j = col; j <= n; j++) aug[col * (n + 1) + j] *= invP;

      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const f = aug[row * (n + 1) + col];
        if (Math.abs(f) < 1e-30) continue;
        for (let j = col; j <= n; j++) {
          aug[row * (n + 1) + j] -= f * aug[col * (n + 1) + j];
        }
      }
    }

    for (let i = 0; i < n; i++) x[i] = aug[i * (n + 1) + n];
    return x;
  }

  function addBlock2(A, N, row, col, a00, a01, a10, a11) {
    A[(row + 0) * N + (col + 0)] += a00;
    A[(row + 0) * N + (col + 1)] += a01;
    A[(row + 1) * N + (col + 0)] += a10;
    A[(row + 1) * N + (col + 1)] += a11;
  }

  // X, Y: n1×n2 arrays (column j = radial layer, row i = circumferential, periodic in i).
  NS.HypGen4.generate = function (X, Y, opts) {
    const n1 = X.length;
    const n2 = X[0].length;
    const K = opts?.K ?? 5;
    const lambda = opts?.lambda ?? 3;
    const de = 1 / n1;
    const dn = (opts?.dnScale ?? 1) / n2;

    // Explicit: MATLAB for j = 1:2
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < n1; i++) {
        const ip = (i + 1) % n1;
        const im = (i - 1 + n1) % n1;
        const dx = (X[ip][j] - X[im][j]) / (2 * de);
        const dy = (Y[ip][j] - Y[im][j]) / (2 * de);
        const g11 = dx * dx + dy * dy;
        const V = K * Math.sqrt(Math.max(g11, 1e-30)) * Math.exp(-lambda * (1 - (j + 1) / n2));
        const fac = dn * (V / Math.max(g11, 1e-30));
        X[i][j + 1] = X[i][j] - fac * dy;
        Y[i][j + 1] = Y[i][j] + fac * dx;
      }
    }

    // Implicit: MATLAB for j = 2:n2-1
    const N = 2 * n1;
    const A = new Float64Array(N * N);
    const b = new Float64Array(N);
    const koef = dn / (2 * de);

    for (let j = 1; j < n2 - 1; j++) {
      A.fill(0);
      b.fill(0);

      for (let i = 0; i < n1; i++) {
        const ip = (i + 1) % n1;
        const im = (i - 1 + n1) % n1;

        const dxde = (X[ip][j] - X[im][j]) / (2 * de);
        const dyde = (Y[ip][j] - Y[im][j]) / (2 * de);
        const g11 = dxde * dxde + dyde * dyde;
        if (g11 < 1e-30) continue;

        const V0 = K * Math.sqrt(g11) * Math.exp(-lambda * (1 - (j + 1) / n2));
        const dxdn = -dyde * V0 / g11;
        const dydn = dxde * V0 / g11;

        const ap = dxde * dxdn - dyde * dydn;
        const bp = dxde * dydn + dxdn * dyde;
        const cp = g11;
        const invCp = 1 / cp;

        const C00 = ap * invCp;
        const C01 = bp * invCp;
        const C10 = bp * invCp;
        const C11 = -ap * invCp;

        const tlum = -Math.sqrt((ap * ap + bp * bp) / (cp * cp));
        const V = K * Math.sqrt(g11) * Math.exp(-lambda * (1 - (j + 2) / n2));
        const Sx = (V + V0) / cp * (-dyde);
        const Sy = (V + V0) / cp * (dxde);

        const I = 2 * i;
        const Ip = 2 * ip;
        const Im = 2 * im;
        const diag = 1 - 2 * tlum;

        addBlock2(A, N, I, I,   diag, 0,    0,    diag);
        addBlock2(A, N, I, Ip,  koef * C00 + tlum, koef * C01, koef * C10, koef * C11 + tlum);
        addBlock2(A, N, I, Im, -koef * C00 + tlum, -koef * C01, -koef * C10, -koef * C11 + tlum);

        b[I + 0] = dn * Sx + X[i][j];
        b[I + 1] = dn * Sy + Y[i][j];
      }

      const R = solveDense(A, b, N);
      if (!R) throw new Error('HypGen4: singular system at layer ' + (j + 1));

      for (let i = 0; i < n1; i++) {
        X[i][j + 1] = R[2 * i];
        Y[i][j + 1] = R[2 * i + 1];
      }
    }

    return { X, Y };
  };
})(window.AFL);
