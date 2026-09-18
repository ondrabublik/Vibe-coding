/**
 * 2D plane-stress Q4 finite element helpers for topology optimization.
 */
const FEM = (() => {
  /**
   * Element stiffness for E=1, plane stress, unit square.
   * Matches Sigmund / Andreassen topology optimization codes.
   */
  function elementStiffness(nu = 0.3) {
    const k = [
      1 / 2 - nu / 6,
      1 / 8 + nu / 8,
      -1 / 4 - nu / 12,
      -1 / 8 + (3 * nu) / 8,
      -1 / 4 + nu / 12,
      -1 / 8 - nu / 8,
      nu / 6,
      1 / 8 - (3 * nu) / 8,
    ];
    const scale = 1 / (1 - nu * nu);
    const pattern = [
      [0, 1, 2, 3, 4, 5, 6, 7],
      [1, 0, 7, 6, 5, 4, 3, 2],
      [2, 7, 0, 5, 6, 3, 4, 1],
      [3, 6, 5, 0, 7, 2, 1, 4],
      [4, 5, 6, 7, 0, 1, 2, 3],
      [5, 4, 3, 2, 1, 0, 7, 6],
      [6, 3, 4, 1, 2, 7, 0, 5],
      [7, 2, 1, 4, 3, 6, 5, 0],
    ];
    const KE = new Float64Array(64);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        KE[i * 8 + j] = scale * k[pattern[i][j]];
      }
    }
    return KE;
  }

  function edof(nelx, nely, elx, ely) {
    const n1 = (nely + 1) * elx + ely;
    const n2 = (nely + 1) * (elx + 1) + ely;
    return [
      2 * n1,
      2 * n1 + 1,
      2 * n2,
      2 * n2 + 1,
      2 * n2 + 2,
      2 * n2 + 3,
      2 * n1 + 2,
      2 * n1 + 3,
    ];
  }

  function nodeIndex(nelx, nely, ix, iy) {
    return (nely + 1) * ix + iy;
  }

  function assembleFree(nelx, nely, x, penal, KE, free, freeMap) {
    const nf = free.length;
    const A = new Linalg.SparseCSR(nf);
    const Emin = 1e-9;
    const E0 = 1.0;

    for (let elx = 0; elx < nelx; elx++) {
      for (let ely = 0; ely < nely; ely++) {
        const e = ely + elx * nely;
        const E = Emin + Math.pow(x[e], penal) * (E0 - Emin);
        const ed = edof(nelx, nely, elx, ely);
        for (let i = 0; i < 8; i++) {
          const gi = freeMap[ed[i]];
          if (gi < 0) continue;
          for (let j = 0; j < 8; j++) {
            const gj = freeMap[ed[j]];
            if (gj < 0) continue;
            A.add(gi, gj, E * KE[i * 8 + j]);
          }
        }
      }
    }
    return A;
  }

  return { elementStiffness, edof, nodeIndex, assembleFree };
})();
