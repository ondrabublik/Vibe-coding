(function (NS) {
  'use strict';

  // Pseudocolor field rendering for body-fitted (C-mesh) structured grids.
  //
  // Strategy: precompute a per-pixel cell-index lookup table (built once per
  // grid/canvas-resize), then use it to fill an ImageData buffer in O(W×H).
  //
  // For each pixel: look up which cell (i,j) contains it, sample the scalar
  // field at that cell, map to color via a LUT.

  const Colormap = NS.Colormap;
  NS.Pcolor = {};

  const BG = [15, 15, 24];  // background color (outside grid)

  // ── Transform ───────────────────────────────────────────────────────────────
  // View extent: airfoil + wake cut + nearby η-layers (C-mesh topology visible).
  NS.Pcolor.worldExtent = function (grid, zoom) {
    const { ni, nj, nodeX, nodeY, nodeIdx } = grid;
    const z = Math.max(0.1, zoom ?? 1);

    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    const include = (x, y) => {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    };

    const jLayers = Math.max(6, Math.round(nj * 0.28));
    for (let j = 0; j <= jLayers; j++) {
      for (let i = 0; i <= ni; i++) {
        const k = nodeIdx(i, j);
        include(nodeX[k], nodeY[k]);
      }
    }

    const cx = 0.5 * (xMin + xMax);
    const cy = 0.5 * (yMin + yMax);
    const halfW = Math.max(xMax - xMin, 0.35) * 0.5 / z;
    const halfH = Math.max(yMax - yMin, 0.12) * 0.5 / z;
    const padX = 0.12 * halfW * 2;
    const padY = 0.18 * halfH * 2;
    return {
      wXmin: cx - halfW - padX,
      wXmax: cx + halfW + padX,
      wYmin: cy - halfH - padY,
      wYmax: cy + halfH + padY,
    };
  };

  NS.Pcolor.makeTransform = function (W, H, ext, pixelMargin) {
    pixelMargin = pixelMargin ?? 14;
    const drawW = W - 2 * pixelMargin;
    const drawH = H - 2 * pixelMargin;
    const worldW = ext.wXmax - ext.wXmin;
    const worldH = ext.wYmax - ext.wYmin;
    const scale = Math.max(worldW / drawW, worldH / drawH);
    const usedW = worldW / scale, usedH = worldH / scale;
    const offsetX = pixelMargin + (drawW - usedW) / 2;
    const offsetY = pixelMargin + (drawH - usedH) / 2;
    return {
      worldToScreen: (x, y) => ({
        px: offsetX + (x - ext.wXmin) / scale,
        py: H - offsetY - (y - ext.wYmin) / scale,
      }),
      screenToWorld: (px, py) => ({
        x: ext.wXmin + (px - offsetX) * scale,
        y: ext.wYmin + (H - offsetY - py) * scale,
      }),
      scale, offsetX, offsetY, W, H, ...ext,
    };
  };

  // ── Per-pixel cell lookup table ──────────────────────────────────────────────
  // Returns Int32Array[W*H] where each entry is cellIdx(i,j) or -1.
  function cross(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  }
  function inQuad(px, py, p00, p10, p11, p01) {
    const s0 = cross(p00.px, p00.py, p10.px, p10.py, px, py) >= 0;
    const s1 = cross(p10.px, p10.py, p11.px, p11.py, px, py) >= 0;
    const s2 = cross(p11.px, p11.py, p01.px, p01.py, px, py) >= 0;
    const s3 = cross(p01.px, p01.py, p00.px, p00.py, px, py) >= 0;
    return s0 === s1 && s1 === s2 && s2 === s3;
  }

  NS.Pcolor.buildLookup = function (W, H, grid, transform) {
    const { ni, nj, nodeX, nodeY, nodeIdx, cellIdx } = grid;
    const { worldToScreen } = transform;
    const lookup = new Int32Array(W * H).fill(-1);

    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const p00 = worldToScreen(nodeX[nodeIdx(i,   j  )], nodeY[nodeIdx(i,   j  )]);
        const p10 = worldToScreen(nodeX[nodeIdx(i+1, j  )], nodeY[nodeIdx(i+1, j  )]);
        const p11 = worldToScreen(nodeX[nodeIdx(i+1, j+1)], nodeY[nodeIdx(i+1, j+1)]);
        const p01 = worldToScreen(nodeX[nodeIdx(i,   j+1)], nodeY[nodeIdx(i,   j+1)]);

        const minPx = Math.max(0,   Math.floor(Math.min(p00.px, p10.px, p11.px, p01.px)));
        const maxPx = Math.min(W-1, Math.ceil (Math.max(p00.px, p10.px, p11.px, p01.px)));
        const minPy = Math.max(0,   Math.floor(Math.min(p00.py, p10.py, p11.py, p01.py)));
        const maxPy = Math.min(H-1, Math.ceil (Math.max(p00.py, p10.py, p11.py, p01.py)));

        const ck = cellIdx(i, j);
        for (let py = minPy; py <= maxPy; py++) {
          for (let px = minPx; px <= maxPx; px++) {
            if (inQuad(px + 0.5, py + 0.5, p00, p10, p11, p01)) {
              lookup[py * W + px] = ck;
            }
          }
        }
      }
    }
    return lookup;
  };

  // Build node scalar values (cell average → corners) for smooth shading / contours
  NS.Pcolor.buildNodeVals = function (grid, scalar) {
    const { ni, nj } = grid;
    const niP1 = ni + 1;
    const vals = new Float64Array(niP1 * (nj + 1));
    const cnt  = new Float64Array(niP1 * (nj + 1));
    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const v   = scalar[grid.cellIdx(i, j)];
        const n00 =     j * niP1 + i;
        const n10 =     j * niP1 + i + 1;
        const n01 = (j+1) * niP1 + i;
        const n11 = (j+1) * niP1 + i + 1;
        vals[n00] += v; cnt[n00]++;
        vals[n10] += v; cnt[n10]++;
        vals[n01] += v; cnt[n01]++;
        vals[n11] += v; cnt[n11]++;
      }
    }
    for (let k = 0; k < vals.length; k++) if (cnt[k] > 0) vals[k] /= cnt[k];
    return vals;
  };

  // Inverse bilinear: screen point → (u,v) in unit square of quad p00-p10-p11-p01
  // (Inigo Quilez formulation; a=p00, b=p10, c=p11, d=p01)
  function invBilinear(px, py, p00, p10, p11, p01) {
    const ax = p00.px, ay = p00.py;
    const ex = p10.px - ax, ey = p10.py - ay;
    const fx = p01.px - ax, fy = p01.py - ay;
    const gx = ax - p10.px + p11.px - p01.px;
    const gy = ay - p10.py + p11.py - p01.py;
    const hx = px - ax, hy = py - ay;

    const k2 = gx * fy - gy * fx;
    const k1 = ex * fy - ey * fx + hx * gy - hy * gx;
    const k0 = hx * ey - hy * ex;

    let u, v;
    if (Math.abs(k2) < 1e-10) {
      if (Math.abs(k1) < 1e-14) return null;
      v = -k0 / k1;
    } else {
      const disc = k1 * k1 - 4 * k2 * k0;
      if (disc < 0) return null;
      const s = Math.sqrt(disc);
      const v1 = (-k1 - s) / (2 * k2);
      const v2 = (-k1 + s) / (2 * k2);
      v = (Math.abs(v1 - 0.5) < Math.abs(v2 - 0.5)) ? v1 : v2;
    }
    const denomX = ex + v * gx;
    const denomY = ey + v * gy;
    if (Math.abs(denomX) > Math.abs(denomY)) {
      if (Math.abs(denomX) < 1e-14) return null;
      u = (hx - v * fx) / denomX;
    } else {
      if (Math.abs(denomY) < 1e-14) return null;
      u = (hy - v * fy) / denomY;
    }
    if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) return null;
    return {
      u: Math.max(0, Math.min(1, u)),
      v: Math.max(0, Math.min(1, v)),
    };
  }

  function drawSmooth(data, W, H, grid, scalar, lut, transform) {
    const { ni, nj, nodeX, nodeY, nodeIdx } = grid;
    const { worldToScreen } = transform;
    const niP1 = ni + 1;
    const nodeVals = NS.Pcolor.buildNodeVals(grid, scalar);

    for (let k = 0; k < W * H; k++) {
      const b = k * 4;
      data[b] = BG[0]; data[b + 1] = BG[1]; data[b + 2] = BG[2]; data[b + 3] = 255;
    }

    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const p00 = worldToScreen(nodeX[nodeIdx(i,   j  )], nodeY[nodeIdx(i,   j  )]);
        const p10 = worldToScreen(nodeX[nodeIdx(i+1, j  )], nodeY[nodeIdx(i+1, j  )]);
        const p11 = worldToScreen(nodeX[nodeIdx(i+1, j+1)], nodeY[nodeIdx(i+1, j+1)]);
        const p01 = worldToScreen(nodeX[nodeIdx(i,   j+1)], nodeY[nodeIdx(i,   j+1)]);

        const v00 = nodeVals[    j * niP1 + i    ];
        const v10 = nodeVals[    j * niP1 + i + 1];
        const v01 = nodeVals[(j+1) * niP1 + i    ];
        const v11 = nodeVals[(j+1) * niP1 + i + 1];

        const minPx = Math.max(0,   Math.floor(Math.min(p00.px, p10.px, p11.px, p01.px)));
        const maxPx = Math.min(W-1, Math.ceil (Math.max(p00.px, p10.px, p11.px, p01.px)));
        const minPy = Math.max(0,   Math.floor(Math.min(p00.py, p10.py, p11.py, p01.py)));
        const maxPy = Math.min(H-1, Math.ceil (Math.max(p00.py, p10.py, p11.py, p01.py)));

        for (let py = minPy; py <= maxPy; py++) {
          for (let px = minPx; px <= maxPx; px++) {
            const sx = px + 0.5, sy = py + 0.5;
            if (!inQuad(sx, sy, p00, p10, p11, p01)) continue;
            const uv = invBilinear(sx, sy, p00, p10, p11, p01);
            let val;
            if (uv) {
              const { u, v } = uv;
              val = (1 - u) * (1 - v) * v00 + u * (1 - v) * v10 + u * v * v11 + (1 - u) * v * v01;
            } else {
              val = 0.25 * (v00 + v10 + v11 + v01);
            }
            const [r, g, b] = Colormap.lutLookup(val, lut);
            const base = (py * W + px) * 4;
            data[base] = r; data[base + 1] = g; data[base + 2] = b; data[base + 3] = 255;
          }
        }
      }
    }
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  // opts.smooth — bilinear interpolation of node values (shading interp)
  NS.Pcolor.draw = function (ctx, canvas, grid, scalar, vmin, vmax, colormapName, lookup, opts) {
    const W = canvas.width, H = canvas.height;
    const lut = Colormap.buildLUT(colormapName || 'turbo', vmin, vmax);
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;
    const smooth = opts && opts.smooth;

    if (smooth && opts.transform) {
      drawSmooth(data, W, H, grid, scalar, lut, opts.transform);
    } else {
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const base = (py * W + px) * 4;
          const ck = lookup[py * W + px];
          if (ck < 0) {
            data[base] = BG[0]; data[base + 1] = BG[1]; data[base + 2] = BG[2]; data[base + 3] = 255;
          } else {
            const [r, g, b] = Colormap.lutLookup(scalar[ck], lut);
            data[base] = r; data[base + 1] = g; data[base + 2] = b; data[base + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // Draw airfoil outline (inner boundary of grid, j=0 nodes)
  NS.Pcolor.drawAirfoil = function (ctx, grid, transform) {
    const { ni, nj, nodeX, nodeY, nodeIdx } = grid;
    const { worldToScreen } = transform;
    const { surfaceStart, surfaceEnd } = grid;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let first = true;
    for (let i = surfaceStart; i <= surfaceEnd; i++) {
      const { px, py } = worldToScreen(nodeX[nodeIdx(i, 0)], nodeY[nodeIdx(i, 0)]);
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  // Draw grid lines
  NS.Pcolor.drawGrid = function (ctx, grid, transform) {
    const { ni, nj, nodeX, nodeY, nodeIdx } = grid;
    const { worldToScreen } = transform;
    ctx.save();
    ctx.strokeStyle = 'rgba(230,245,255,0.52)';
    ctx.lineWidth = 0.75;
    for (let j = 0; j <= nj; j++) {
      ctx.beginPath();
      for (let i = 0; i <= ni; i++) {
        const { px, py } = worldToScreen(nodeX[nodeIdx(i, j)], nodeY[nodeIdx(i, j)]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      // Closed O-topology: connect last node back to first (MATLAB: [X(:,j); X(1,j)])
      const { px, py } = worldToScreen(nodeX[nodeIdx(0, j)], nodeY[nodeIdx(0, j)]);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    for (let i = 0; i <= ni; i++) {
      ctx.beginPath();
      for (let j = 0; j <= nj; j++) {
        const { px, py } = worldToScreen(nodeX[nodeIdx(i, j)], nodeY[nodeIdx(i, j)]);
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  };
})(window.AFL);
