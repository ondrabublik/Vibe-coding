(function (NS) {
  'use strict';

  // Marching-squares contour extraction on the structured grid node values.
  // Endpoints are keyed by grid-edge indices so adjacent cells join exactly —
  // no floating-point gaps in the iso-lines.

  const Pcolor = NS.Pcolor;
  NS.Contours = {};

  function lerp(lv, xa, ya, va, xb, yb, vb) {
    const d = vb - va;
    const t = Math.abs(d) < 1e-14 ? 0.5 : (lv - va) / d;
    return [xa + t * (xb - xa), ya + t * (yb - ya)];
  }

  // Edge ids: H = horizontal edge (I,J) → J*(ni)+I
  //           V = vertical edge   (I,J) → (nj+1)*ni + J*(ni+1)+I
  function hEdgeId(I, J, ni) { return J * ni + I; }
  function vEdgeId(I, J, ni, nj) { return (nj + 1) * ni + J * (ni + 1) + I; }

  function addSegments(code, lv, v00, v10, v01, v11, eB, eR, eT, eL, idB, idR, idT, idL, seg) {
    const center = (v00 + v10 + v01 + v11) * 0.25;

    function push(a, idA, b, idB_) {
      if (a && b) seg.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], e0: idA, e1: idB_ });
    }

    switch (code) {
      case 1: case 14: push(eB, idB, eL, idL); break;
      case 2: case 13: push(eB, idB, eR, idR); break;
      case 3: case 12: push(eL, idL, eR, idR); break;
      case 4: case 11: push(eT, idT, eL, idL); break;
      case 5: case 10: push(eB, idB, eT, idT); break;
      case 7: case 8:  push(eT, idT, eR, idR); break;
      // Saddle cases (diagonal corners) — resolve by cell-centre value
      case 6:
        if (center >= lv) {
          push(eB, idB, eR, idR);
          push(eT, idT, eL, idL);
        } else {
          push(eB, idB, eL, idL);
          push(eT, idT, eR, idR);
        }
        break;
      case 9:
        if (center >= lv) {
          push(eB, idB, eL, idL);
          push(eT, idT, eR, idR);
        } else {
          push(eB, idB, eR, idR);
          push(eT, idT, eL, idL);
        }
        break;
    }
  }

  // Chain segments that share the same grid-edge id into continuous polylines.
  function chainSegments(segs) {
    const n = segs.length;
    if (!n) return [];

    // edgeId → [{ seg, end }]  end 0 = start, 1 = finish
    const onEdge = new Map();
    function addEnd(edgeId, seg, end) {
      let list = onEdge.get(edgeId);
      if (!list) { list = []; onEdge.set(edgeId, list); }
      list.push({ seg, end });
    }

    for (let i = 0; i < n; i++) {
      addEnd(segs[i].e0, i, 0);
      addEnd(segs[i].e1, i, 1);
    }

    // For each edge with exactly 2 endpoints, link the two segments
    // link[seg][end] = { seg, end } of the neighbour
    const link = Array.from({ length: n }, () => [null, null]);

    for (const list of onEdge.values()) {
      if (list.length !== 2) continue;
      const a = list[0], b = list[1];
      if (a.seg === b.seg) continue;
      link[a.seg][a.end] = b;
      link[b.seg][b.end] = a;
    }

    // Average coordinates on shared edges so the polyline is pixel-continuous
    for (const list of onEdge.values()) {
      if (list.length !== 2) continue;
      const a = list[0], b = list[1];
      const sa = segs[a.seg], sb = segs[b.seg];
      const ax = a.end === 0 ? sa.x0 : sa.x1;
      const ay = a.end === 0 ? sa.y0 : sa.y1;
      const bx = b.end === 0 ? sb.x0 : sb.x1;
      const by = b.end === 0 ? sb.y0 : sb.y1;
      const mx = 0.5 * (ax + bx), my = 0.5 * (ay + by);
      if (a.end === 0) { sa.x0 = mx; sa.y0 = my; } else { sa.x1 = mx; sa.y1 = my; }
      if (b.end === 0) { sb.x0 = mx; sb.y0 = my; } else { sb.x1 = mx; sb.y1 = my; }
    }

    const used = new Uint8Array(n);
    const chains = [];

    function pt(seg, end) {
      const s = segs[seg];
      return end === 0 ? [s.x0, s.y0] : [s.x1, s.y1];
    }

    function walk(startSeg, startEnd) {
      const chain = [];
      let seg = startSeg;
      let enterEnd = startEnd; // endpoint we arrive at / start from

      for (;;) {
        if (used[seg]) break;
        used[seg] = 1;

        const [x, y] = pt(seg, enterEnd);
        chain.push(x, y);

        const leaveEnd = 1 - enterEnd;
        const [x2, y2] = pt(seg, leaveEnd);
        chain.push(x2, y2);

        const nxt = link[seg][leaveEnd];
        if (!nxt || used[nxt.seg]) break;
        seg = nxt.seg;
        enterEnd = nxt.end;
      }
      return chain;
    }

    for (let i = 0; i < n; i++) {
      if (used[i]) continue;

      // Prefer an unmatched endpoint so open chains start at a free end
      let startEnd = 0;
      if (link[i][0] && !link[i][1]) startEnd = 1;
      else if (!link[i][0] && link[i][1]) startEnd = 0;
      else startEnd = 0;

      const chain = walk(i, startEnd);
      if (chain.length >= 4) chains.push(chain);
    }

    return chains;
  }

  NS.Contours.compute = function (grid, scalar, nLevels, vmin, vmax) {
    const { ni, nj, nodeX, nodeY, nodeIdx } = grid;
    const nodeVals = Pcolor.buildNodeVals(grid, scalar);

    // O-mesh seam: keep I=0 and I=ni consistent (same physical nodes)
    for (let j = 0; j <= nj; j++) {
      const a = nodeIdx(0, j), b = nodeIdx(ni, j);
      const avg = 0.5 * (nodeVals[a] + nodeVals[b]);
      nodeVals[a] = nodeVals[b] = avg;
    }

    const levels = [];
    for (let l = 0; l < nLevels; l++) {
      levels.push(vmin + (l + 0.5) * (vmax - vmin) / nLevels);
    }
    const results = levels.map(lv => ({ level: lv, segs: [] }));

    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const n00 = nodeIdx(i, j), n10 = nodeIdx(i + 1, j);
        const n01 = nodeIdx(i, j + 1), n11 = nodeIdx(i + 1, j + 1);
        const v00 = nodeVals[n00], v10 = nodeVals[n10];
        const v01 = nodeVals[n01], v11 = nodeVals[n11];
        const x00 = nodeX[n00], y00 = nodeY[n00];
        const x10 = nodeX[n10], y10 = nodeY[n10];
        const x01 = nodeX[n01], y01 = nodeY[n01];
        const x11 = nodeX[n11], y11 = nodeY[n11];

        const idB = hEdgeId(i, j, ni);
        const idT = hEdgeId(i, j + 1, ni);
        const idL = vEdgeId(i, j, ni, nj);
        // O-mesh: I=0 ≡ I=ni (periodic seam) — same vertical edge id
        const idR = vEdgeId(i + 1 === ni ? 0 : i + 1, j, ni, nj);

        for (let li = 0; li < levels.length; li++) {
          const lv = levels[li];
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

          addSegments(code, lv, v00, v10, v01, v11, eB, eR, eT, eL,
            idB, idR, idT, idL, results[li].segs);
        }
      }
    }

    for (const r of results) {
      r.chains = chainSegments(r.segs);
    }
    return results;
  };

  NS.Contours.draw = function (ctx, contourData, worldToScreen, vmin, vmax, colormapName, opts) {
    const fixedColor = opts && opts.color ? opts.color : null;
    const lw = (opts && opts.lineWidth) ? opts.lineWidth : 1.8;

    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    for (const { level, chains, segs } of contourData) {
      if (fixedColor) {
        ctx.strokeStyle = fixedColor;
      } else {
        const [r, g, b] = NS.Colormap.map(level, vmin, vmax, colormapName || 'turbo');
        ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
      }

      const paths = (chains && chains.length)
        ? chains
        : (segs || []).map(s => [s.x0, s.y0, s.x1, s.y1]);

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
})(window.AFL);
