(function (NS) {
  'use strict';

  // Build a structured body-fitted grid for a channel with given wall profiles.
  // Returns a grid object with node coords, face data, cell volumes and centers.
  //
  // Indexing conventions (all 0-based):
  //   Nodes:    nodeIdx(I,J) = J*(ni+1)+I,  I in [0,ni], J in [0,nj]
  //   Cells:    cellIdx(i,j) = j*ni+i,      i in [0,ni-1], j in [0,nj-1]
  //   I-faces:  ifaceIdx(I,j)= j*(ni+1)+I,  I in [0,ni], j in [0,nj-1]
  //   J-faces:  jfaceIdx(i,J)= J*ni+i,      i in [0,ni-1], J in [0,nj]
  //   Extended: extIdx(i,j) = j*(ni+2)+i,   i,j include ghost layers
  //             Physical cells: extIdx(i+1, j+1) for i in [0,ni-1], j in [0,nj-1]
  //
  NS.Grid = {};

  NS.Grid.build = function (params, profile) {
    const { ni, nj, xMin = 0.0, xMax = 1.0 } = params;
    const { ybot, ytop } = profile;

    const nnodes = (ni + 1) * (nj + 1);
    const nodeX = new Float64Array(nnodes);
    const nodeY = new Float64Array(nnodes);

    const nodeIdx = (I, J) => J * (ni + 1) + I;

    // Generate nodes
    for (let I = 0; I <= ni; I++) {
      const x = xMin + I * (xMax - xMin) / ni;
      const yb = ybot(x);
      const yt = ytop(x);
      const H  = yt - yb;
      for (let J = 0; J <= nj; J++) {
        const eta = J / nj;
        const k = nodeIdx(I, J);
        nodeX[k] = x;
        nodeY[k] = yb + eta * H;
      }
    }

    // I-faces: (ni+1)*nj
    const niFaces = (ni + 1) * nj;
    const iFaceNx   = new Float64Array(niFaces);
    const iFaceNy   = new Float64Array(niFaces);
    const iFaceArea = new Float64Array(niFaces);
    const ifaceIdx  = (I, j) => j * (ni + 1) + I;

    for (let j = 0; j < nj; j++) {
      for (let I = 0; I <= ni; I++) {
        const n0 = nodeIdx(I, j);
        const n1 = nodeIdx(I, j + 1);
        const dX = nodeX[n1] - nodeX[n0];
        const dY = nodeY[n1] - nodeY[n0];
        const len = Math.sqrt(dX * dX + dY * dY);
        const k = ifaceIdx(I, j);
        iFaceNx[k]   =  dY / len;   // right-pointing normal
        iFaceNy[k]   = -dX / len;
        iFaceArea[k] = len;
      }
    }

    // J-faces: ni*(nj+1)
    const njFaces = ni * (nj + 1);
    const jFaceNx   = new Float64Array(njFaces);
    const jFaceNy   = new Float64Array(njFaces);
    const jFaceArea = new Float64Array(njFaces);
    const jfaceIdx  = (i, J) => J * ni + i;

    for (let J = 0; J <= nj; J++) {
      for (let i = 0; i < ni; i++) {
        const n0 = nodeIdx(i, J);
        const n1 = nodeIdx(i + 1, J);
        const dX = nodeX[n1] - nodeX[n0];
        const dY = nodeY[n1] - nodeY[n0];
        const len = Math.sqrt(dX * dX + dY * dY);
        const k = jfaceIdx(i, J);
        jFaceNx[k]   = -dY / len;   // upward-pointing normal
        jFaceNy[k]   =  dX / len;
        jFaceArea[k] = len;
      }
    }

    // Cell volumes and centers: ni*nj
    const ncells = ni * nj;
    const cellVol = new Float64Array(ncells);
    const cellCx  = new Float64Array(ncells);
    const cellCy  = new Float64Array(ncells);
    const cellIdx = (i, j) => j * ni + i;

    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const n00 = nodeIdx(i,     j);
        const n10 = nodeIdx(i + 1, j);
        const n11 = nodeIdx(i + 1, j + 1);
        const n01 = nodeIdx(i,     j + 1);
        const x0 = nodeX[n00], y0 = nodeY[n00];
        const x1 = nodeX[n10], y1 = nodeY[n10];
        const x2 = nodeX[n11], y2 = nodeY[n11];
        const x3 = nodeX[n01], y3 = nodeY[n01];
        // Shoelace for quad (counterclockwise: 00,10,11,01)
        const vol = 0.5 * Math.abs(
          (x0 - x2) * (y1 - y3) - (x1 - x3) * (y0 - y2)
        );
        const k = cellIdx(i, j);
        cellVol[k] = Math.max(vol, 1e-20);
        cellCx[k]  = 0.25 * (x0 + x1 + x2 + x3);
        cellCy[k]  = 0.25 * (y0 + y1 + y2 + y3);
      }
    }

    return {
      ni, nj,
      xMin, xMax,
      ybot, ytop,
      nodeX, nodeY,
      nodeIdx,
      iFaceNx, iFaceNy, iFaceArea,
      ifaceIdx,
      jFaceNx, jFaceNy, jFaceArea,
      jfaceIdx,
      cellVol, cellCx, cellCy,
      cellIdx,
      extIdx: (i, j) => j * (ni + 2) + i,
      extStride: ni + 2,
    };
  };
})(window.FVM);
