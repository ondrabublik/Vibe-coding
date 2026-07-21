(function (NS) {
  'use strict';

  // Mesh smoothers for structured grids. Boundary nodes stay fixed.

  NS.MeshSmooth = {};

  const idx = (i, j, n1) => j * n1 + i;

  // Stable Laplace smoother with under-relaxation (robust fallback).
  NS.MeshSmooth.laplace = function (nodeX, nodeY, ni, nj, iterations, omega) {
    const n1 = ni + 1;
    const w = omega ?? 0.35;
    const iters = Math.max(0, iterations | 0);
    const tmpX = new Float64Array(nodeX.length);
    const tmpY = new Float64Array(nodeY.length);

    for (let op = 0; op < iters; op++) {
      for (let i = 1; i < ni; i++) {
        for (let j = 1; j < nj; j++) {
          const k = idx(i, j, n1);
          tmpX[k] = 0.25 * (nodeX[idx(i + 1, j, n1)] + nodeX[idx(i - 1, j, n1)]
                           + nodeX[idx(i, j + 1, n1)] + nodeX[idx(i, j - 1, n1)]);
          tmpY[k] = 0.25 * (nodeY[idx(i + 1, j, n1)] + nodeY[idx(i - 1, j, n1)]
                           + nodeY[idx(i, j + 1, n1)] + nodeY[idx(i, j - 1, n1)]);
        }
      }
      for (let i = 1; i < ni; i++) {
        for (let j = 1; j < nj; j++) {
          const k = idx(i, j, n1);
          nodeX[k] += w * (tmpX[k] - nodeX[k]);
          nodeY[k] += w * (tmpY[k] - nodeY[k]);
        }
      }
    }
  };

  // Thomas–Middlecoff elliptic smoother (from profile.html), with reduced control
  // strength and under-relaxation for stability on O-meshes.
  NS.MeshSmooth.elliptic = function (nodeX, nodeY, ni, nj, iterations, omega) {
    const n1 = ni + 1;
    const n2 = nj + 1;
    const n = n1 * n2;
    const w = omega ?? 0.18;
    const aCtrl = 80.0;
    const cCtrl = 0.3;

    const xeta = new Float64Array(n);
    const yeta = new Float64Array(n);
    const xxi  = new Float64Array(n);
    const yxi  = new Float64Array(n);
    const Jac  = new Float64Array(n);
    const g11  = new Float64Array(n);
    const g22  = new Float64Array(n);
    const g12  = new Float64Array(n);
    const xtmp = new Float64Array(n);
    const ytmp = new Float64Array(n);
    const QQ   = new Float64Array(n);

    for (let j = 1; j < n2 - 1; j++) {
      const q = -aCtrl * Math.sign(j) * Math.exp(-cCtrl * Math.abs(j))
              - aCtrl * Math.sign(j - (n2 - 1)) * Math.exp(-cCtrl * Math.abs(j - (n2 - 1)));
      for (let i = 0; i < n1; i++) {
        QQ[idx(i, j, n1)] = q;
      }
    }

    const iters = Math.max(0, iterations | 0);
    for (let op = 0; op < iters; op++) {
      for (let i = 1; i < n1 - 1; i++) {
        for (let j = 1; j < n2 - 1; j++) {
          const k = idx(i, j, n1);
          xeta[k] = (nodeX[idx(i, j + 1, n1)] - nodeX[idx(i, j - 1, n1)]) * 0.5;
          yeta[k] = (nodeY[idx(i, j + 1, n1)] - nodeY[idx(i, j - 1, n1)]) * 0.5;
          xxi[k]  = (nodeX[idx(i + 1, j, n1)] - nodeX[idx(i - 1, j, n1)]) * 0.5;
          yxi[k]  = (nodeY[idx(i + 1, j, n1)] - nodeY[idx(i - 1, j, n1)]) * 0.5;
          Jac[k]  = xxi[k] * yeta[k] - xeta[k] * yxi[k];
        }
      }

      for (let i = 1; i < n1 - 1; i++) {
        for (let j = 1; j < n2 - 1; j++) {
          const k = idx(i, j, n1);
          g11[k] = ((nodeX[idx(i + 1, j, n1)] - nodeX[idx(i - 1, j, n1)]) ** 2
                  + (nodeY[idx(i + 1, j, n1)] - nodeY[idx(i - 1, j, n1)]) ** 2) * 0.25;
          g22[k] = ((nodeX[idx(i, j + 1, n1)] - nodeX[idx(i, j - 1, n1)]) ** 2
                  + (nodeY[idx(i, j + 1, n1)] - nodeY[idx(i, j - 1, n1)]) ** 2) * 0.25;
          g12[k] = ((nodeX[idx(i + 1, j, n1)] - nodeX[idx(i - 1, j, n1)]) * (nodeX[idx(i, j + 1, n1)] - nodeX[idx(i, j - 1, n1)])
                  + (nodeY[idx(i + 1, j, n1)] - nodeY[idx(i - 1, j, n1)]) * (nodeY[idx(i, j + 1, n1)] - nodeY[idx(i, j - 1, n1)])) * 0.25;

          const denom = 2 * (g11[k] + g22[k]);
          if (denom < 1e-20) continue;

          const termX = g22[k] * nodeX[idx(i + 1, j, n1)]
            - 0.5 * g12[k] * nodeX[idx(i + 1, j + 1, n1)] + 0.5 * g12[k] * nodeX[idx(i + 1, j - 1, n1)]
            + g11[k] * nodeX[idx(i, j + 1, n1)] + g11[k] * nodeX[idx(i, j - 1, n1)]
            + g22[k] * nodeX[idx(i - 1, j, n1)]
            - 0.5 * g12[k] * nodeX[idx(i - 1, j - 1, n1)] + 0.5 * g12[k] * nodeX[idx(i - 1, j + 1, n1)];

          const termY = g22[k] * nodeY[idx(i + 1, j, n1)]
            - 0.5 * g12[k] * nodeY[idx(i + 1, j + 1, n1)] + 0.5 * g12[k] * nodeY[idx(i + 1, j - 1, n1)]
            + g11[k] * nodeY[idx(i, j + 1, n1)] + g11[k] * nodeY[idx(i, j - 1, n1)]
            + g22[k] * nodeY[idx(i - 1, j, n1)]
            - 0.5 * g12[k] * nodeY[idx(i - 1, j - 1, n1)] + 0.5 * g12[k] * nodeY[idx(i - 1, j + 1, n1)];

          const jac2 = Jac[k] * Jac[k];
          const targetX = termX / denom + jac2 * xeta[k] * QQ[k];
          const targetY = termY / denom + jac2 * yeta[k] * QQ[k];
          if (!isFinite(targetX) || !isFinite(targetY)) continue;
          xtmp[k] = targetX;
          ytmp[k] = targetY;
        }
      }

      for (let i = 1; i < n1 - 1; i++) {
        for (let j = 1; j < n2 - 1; j++) {
          const k = idx(i, j, n1);
          nodeX[k] += w * (xtmp[k] - nodeX[k]);
          nodeY[k] += w * (ytmp[k] - nodeY[k]);
        }
      }
    }
  };

  // Smooth only the airfoil block (leave wake columns unchanged).
  NS.MeshSmooth.smoothSurface = function (nodeX, nodeY, ni, nj, iStart, iEnd, iterations, omega) {
    const n1 = ni + 1;
    const w = omega ?? 0.2;
    const iters = Math.max(0, iterations | 0);
    const tmpX = new Float64Array(nodeX.length);
    const tmpY = new Float64Array(nodeY.length);
    const idx = (i, j) => j * n1 + i;
    const i0 = Math.max(1, iStart);
    const i1 = Math.min(ni - 1, iEnd);

    for (let op = 0; op < iters; op++) {
      for (let i = i0; i <= i1; i++) {
        for (let j = 1; j < nj; j++) {
          const k = idx(i, j);
          tmpX[k] = 0.25 * (nodeX[idx(i + 1, j)] + nodeX[idx(i - 1, j)]
                           + nodeX[idx(i, j + 1)] + nodeX[idx(i, j - 1)]);
          tmpY[k] = 0.25 * (nodeY[idx(i + 1, j)] + nodeY[idx(i - 1, j)]
                           + nodeY[idx(i, j + 1)] + nodeY[idx(i, j - 1)]);
        }
      }
      for (let i = i0; i <= i1; i++) {
        for (let j = 1; j < nj; j++) {
          const k = idx(i, j);
          nodeX[k] += w * (tmpX[k] - nodeX[k]);
          nodeY[k] += w * (tmpY[k] - nodeY[k]);
        }
      }
    }
  };

  // Default: smooth airfoil region; optional full-grid Laplace via .laplace().
  NS.MeshSmooth.smooth = function (nodeX, nodeY, ni, nj, iterations, iStart, iEnd) {
    const n = Math.max(0, iterations | 0);
    if (n === 0) return;
    if (iStart != null && iEnd != null) {
      NS.MeshSmooth.smoothSurface(nodeX, nodeY, ni, nj, iStart, iEnd, n, 0.2);
    } else {
      NS.MeshSmooth.laplace(nodeX, nodeY, ni, nj, n, 0.1);
    }
  };
})(window.AFL);
