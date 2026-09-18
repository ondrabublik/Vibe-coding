(function (NS) {
  'use strict';

  const Pcolor = NS.Pcolor;

  NS.Contours = {};

  function lerp(lv, xa, ya, va, xb, yb, vb) {
    const d = vb - va;
    const t = Math.abs(d) < 1e-14 ? 0.5 : (lv - va) / d;
    return [xa + t * (xb - xa), ya + t * (yb - ya)];
  }

  // Resolve ambiguous saddle cases (6, 9) using the cell-center average.
  function addSegments(code, lv, v00, v10, v01, v11, eB, eR, eT, eL, seg) {
    const center = (v00 + v10 + v01 + v11) * 0.25;

    switch (code) {
      case 1: case 14: if (eB && eL) seg.push([eB[0], eB[1], eL[0], eL[1]]); break;
      case 2: case 13: if (eB && eR) seg.push([eB[0], eB[1], eR[0], eR[1]]); break;
      case 3: case 12: if (eL && eR) seg.push([eL[0], eL[1], eR[0], eR[1]]); break;
      case 4: case 11: if (eT && eL) seg.push([eT[0], eT[1], eL[0], eL[1]]); break;
      case 5: case 10: if (eB && eT) seg.push([eB[0], eB[1], eT[0], eT[1]]); break;
      case 7: case 8:  if (eT && eR) seg.push([eT[0], eT[1], eR[0], eR[1]]); break;
      case 6:
        if (center >= lv) {
          if (eB && eR) seg.push([eB[0], eB[1], eR[0], eR[1]]);
          if (eT && eL) seg.push([eT[0], eT[1], eL[0], eL[1]]);
        } else {
          if (eB && eL) seg.push([eB[0], eB[1], eL[0], eL[1]]);
          if (eT && eR) seg.push([eT[0], eT[1], eR[0], eR[1]]);
        }
        break;
      case 9:
        if (center >= lv) {
          if (eB && eL) seg.push([eB[0], eB[1], eL[0], eL[1]]);
          if (eT && eR) seg.push([eT[0], eT[1], eR[0], eR[1]]);
        } else {
          if (eB && eR) seg.push([eB[0], eB[1], eR[0], eR[1]]);
          if (eT && eL) seg.push([eT[0], eT[1], eL[0], eL[1]]);
        }
        break;
    }
  }

  // Chain segment endpoints into continuous polylines (avoids sub-pixel gaps).
  function chainSegments(segs, tol) {
    if (segs.length === 0) return [];

    const ptsEq = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
    const used = new Uint8Array(segs.length);
    const chains = [];

    for (let si = 0; si < segs.length; si++) {
      if (used[si]) continue;
      used[si] = 1;

      let ax = segs[si][0], ay = segs[si][1];
      let bx = segs[si][2], by = segs[si][3];
      const chain = [ax, ay, bx, by];

      let extended = true;
      while (extended) {
        extended = false;
        const tail = [chain[chain.length - 2], chain[chain.length - 1]];
        const head = [chain[0], chain[1]];

        for (let sj = 0; sj < segs.length; sj++) {
          if (used[sj]) continue;
          const [x0, y0, x1, y1] = segs[sj];

          if (ptsEq([x0, y0], tail)) {
            chain.push(x1, y1); used[sj] = 1; extended = true; break;
          }
          if (ptsEq([x1, y1], tail)) {
            chain.push(x0, y0); used[sj] = 1; extended = true; break;
          }
          if (ptsEq([x1, y1], head)) {
            chain.unshift(x0, y0); used[sj] = 1; extended = true; break;
          }
          if (ptsEq([x0, y0], head)) {
            chain.unshift(x1, y1); used[sj] = 1; extended = true; break;
          }
        }
      }

      chains.push(chain);
    }

    return chains;
  }

  // Marching squares on the node grid (consistent with pcolor smooth shading).
  NS.Contours.compute = function (grid, scalar, nLevels, vmin, vmax) {
    const { ni, nj, nodeX, nodeY, nodeIdx } = grid;
    const nodeVals = Pcolor.buildNodeVals(grid, scalar);

    const levels = [];
    for (let l = 0; l < nLevels; l++) {
      levels.push(vmin + (l + 0.5) * (vmax - vmin) / nLevels);
    }

    const results = levels.map(lv => ({ level: lv, segs: [] }));

    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const n00 = nodeIdx(i,     j);
        const n10 = nodeIdx(i + 1, j);
        const n01 = nodeIdx(i,     j + 1);
        const n11 = nodeIdx(i + 1, j + 1);

        const v00 = nodeVals[n00];
        const v10 = nodeVals[n10];
        const v01 = nodeVals[n01];
        const v11 = nodeVals[n11];

        const x00 = nodeX[n00], y00 = nodeY[n00];
        const x10 = nodeX[n10], y10 = nodeY[n10];
        const x01 = nodeX[n01], y01 = nodeY[n01];
        const x11 = nodeX[n11], y11 = nodeY[n11];

        for (let li = 0; li < levels.length; li++) {
          const lv  = levels[li];
          const c00 = v00 >= lv ? 1 : 0;
          const c10 = v10 >= lv ? 1 : 0;
          const c01 = v01 >= lv ? 1 : 0;
          const c11 = v11 >= lv ? 1 : 0;
          const code = c00 | (c10 << 1) | (c01 << 2) | (c11 << 3);
          if (code === 0 || code === 15) continue;

          const eB = (c00 !== c10) ? lerp(lv, x00, y00, v00, x10, y10, v10) : null;
          const eR = (c10 !== c11) ? lerp(lv, x10, y10, v10, x11, y11, v11) : null;
          const eT = (c01 !== c11) ? lerp(lv, x01, y01, v01, x11, y11, v11) : null;
          const eL = (c00 !== c01) ? lerp(lv, x00, y00, v00, x01, y01, v01) : null;

          addSegments(code, lv, v00, v10, v01, v11, eB, eR, eT, eL, results[li].segs);
        }
      }
    }

    // Estimate chaining tolerance from typical cell size
    const tol = Math.max(
      Math.abs(nodeX[nodeIdx(1, 0)] - nodeX[nodeIdx(0, 0)]),
      Math.abs(nodeY[nodeIdx(0, 1)] - nodeY[nodeIdx(0, 0)]),
      1e-10,
    ) * 1e-4;

    for (const result of results) {
      result.chains = chainSegments(result.segs, tol);
    }

    return results;
  };

  NS.Contours.draw = function (ctx, contourData, worldToScreen, vmin, vmax, colormapName, opts) {
    const Colormap = NS.Colormap;
    const fixedColor = opts && opts.color ? opts.color : null;
    const lw = (opts && opts.lineWidth) ? opts.lineWidth : 1.8;

    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    for (const { level, chains, segs } of contourData) {
      if (fixedColor) {
        ctx.strokeStyle = fixedColor;
      } else {
        const [r, g, b] = Colormap.map(level, vmin, vmax, colormapName || 'jet');
        ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
      }

      const paths = chains && chains.length ? chains : segs.map(s => [s[0], s[1], s[2], s[3]]);

      for (const chain of paths) {
        if (chain.length < 4) continue;
        ctx.beginPath();
        const p0 = worldToScreen(chain[0], chain[1]);
        ctx.moveTo(p0.px, p0.py);
        for (let k = 2; k < chain.length; k += 2) {
          const p = worldToScreen(chain[k], chain[k + 1]);
          ctx.lineTo(p.px, p.py);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  };
})(window.FVM);
