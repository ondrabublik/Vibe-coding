(function (NS) {
  'use strict';

  const Colormap = NS.Colormap;

  NS.Pcolor = {};

  // Compute the padded world bounding box from the grid's wall profiles.
  NS.Pcolor.worldExtent = function (grid, padFrac) {
    const { ni, xMin, xMax, ybot, ytop } = grid;
    padFrac = padFrac ?? 0.05;

    let yWorldMin = Infinity, yWorldMax = -Infinity;
    const nSample = Math.max(ni * 2, 200);
    for (let k = 0; k <= nSample; k++) {
      const x = xMin + k * (xMax - xMin) / nSample;
      const yb = ybot(x), yt = ytop(x);
      if (yb < yWorldMin) yWorldMin = yb;
      if (yt > yWorldMax) yWorldMax = yt;
    }

    const pX = padFrac * (xMax - xMin);
    const pY = padFrac * Math.max(yWorldMax - yWorldMin, 1e-6);
    return {
      wXmin: xMin - pX,
      wXmax: xMax + pX,
      wYmin: yWorldMin - pY,
      wYmax: yWorldMax + pY,
    };
  };

  // Build a reusable world↔screen transform for a given canvas size and world extent.
  // Uses equal aspect ratio: one world unit maps to the same pixel size on both axes.
  NS.Pcolor.makeTransform = function (W, H, ext, pixelMargin) {
    pixelMargin = pixelMargin ?? 12;
    const drawW = W - 2 * pixelMargin;
    const drawH = H - 2 * pixelMargin;
    const worldW = ext.wXmax - ext.wXmin;
    const worldH = ext.wYmax - ext.wYmin;
    const scale = Math.max(worldW / drawW, worldH / drawH);
    const usedW = worldW / scale;
    const usedH = worldH / scale;
    const offsetX = pixelMargin + (drawW - usedW) / 2;
    const offsetY = pixelMargin + (drawH - usedH) / 2;
    const m = pixelMargin;

    return {
      worldToScreen: (x, y) => ({
        px: offsetX + (x - ext.wXmin) / scale,
        py: H - offsetY - (y - ext.wYmin) / scale,
      }),
      screenToWorld: (px, py) => ({
        x: ext.wXmin + (px - offsetX) * scale,
        y: ext.wYmin + (H - offsetY - py) * scale,
      }),
      scaleX: scale, scaleY: scale, scale, offsetX, offsetY, usedW, usedH,
      ...ext, pixelMargin: m, drawW, drawH, W, H,
    };
  };

  // Precompute node (corner) scalar values by averaging surrounding cell values.
  // Node (I,J) is the corner shared by cells (I-1,J-1),(I,J-1),(I-1,J),(I,J).
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
    for (let k = 0; k < vals.length; k++) {
      if (cnt[k] > 0) vals[k] /= cnt[k];
    }
    return vals;
  };

  // Pixel-fill helpers
  const bgR = 15, bgG = 15, bgB = 24;   // outside channel / canvas background

  function fillBg(data, base) {
    data[base] = bgR; data[base+1] = bgG; data[base+2] = bgB; data[base+3] = 255;
  }

  // ── Main pcolor render ──────────────────────────────────────────────────────
  // opts.smooth  — bilinear interpolation between cell values (shading interp)
  NS.Pcolor.draw = function (ctx, canvas, grid, scalar, vmin, vmax, colormapName, opts) {
    const W = canvas.width;
    const H = canvas.height;
    const { ni, nj, xMin, xMax, ybot, ytop } = grid;
    const smooth = opts && opts.smooth;

    const lut = Colormap.buildLUT(colormapName || 'jet', vmin, vmax);
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    const ext = NS.Pcolor.worldExtent(grid);
    const transform = NS.Pcolor.makeTransform(W, H, ext);
    const { scale, wXmin, wYmin, offsetX, offsetY } = transform;

    // Precompute node values for smooth shading
    const niP1 = ni + 1;
    const nodeVals = smooth ? NS.Pcolor.buildNodeVals(grid, scalar) : null;

    for (let py = 0; py < H; py++) {
      const y_world = wYmin + (H - offsetY - py - 0.5) * scale;
      for (let px = 0; px < W; px++) {
        const x_world = wXmin + (px - offsetX + 0.5) * scale;
        const base = (py * W + px) * 4;

        if (x_world < xMin || x_world > xMax) { fillBg(data, base); continue; }

        const yb = ybot(x_world);
        const yt = ytop(x_world);
        const H_ch = yt - yb;
        if (y_world < yb || y_world > yt || H_ch <= 0) { fillBg(data, base); continue; }

        // O(1) cell lookup
        const tX  = (x_world - xMin) / (xMax - xMin);
        const i   = Math.min(ni - 1, Math.max(0, Math.floor(tX * ni)));
        const eta = (y_world - yb) / H_ch;
        const j   = Math.min(nj - 1, Math.max(0, Math.floor(eta * nj)));

        let r, g, b;
        if (smooth) {
          // Bilinear interpolation of node values
          const alpha = tX * ni - i;
          const beta  = eta * nj - j;
          const i1 = Math.min(ni, i + 1);
          const j1 = Math.min(nj, j + 1);
          const v =
            (1-alpha)*(1-beta)*nodeVals[ j * niP1 + i ] +
             alpha   *(1-beta)*nodeVals[ j * niP1 + i1] +
            (1-alpha)* beta   *nodeVals[j1 * niP1 + i ] +
             alpha   * beta   *nodeVals[j1 * niP1 + i1];
          [r, g, b] = Colormap.lutLookup(v, lut);
        } else {
          [r, g, b] = Colormap.lutLookup(scalar[grid.cellIdx(i, j)], lut);
        }

        data[base] = r; data[base+1] = g; data[base+2] = b; data[base+3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return transform;
  };

  // ── Dark channel background (for contour-only mode) ─────────────────────────
  // Fills pixels inside the channel with a dark navy, outside with near-black.
  NS.Pcolor.drawChannelBackground = function (ctx, canvas, grid) {
    const W = canvas.width;
    const H = canvas.height;
    const { xMin, xMax, ybot, ytop } = grid;

    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    const ext = NS.Pcolor.worldExtent(grid);
    const transform = NS.Pcolor.makeTransform(W, H, ext);
    const { scale, wXmin, wYmin, offsetX, offsetY } = transform;

    // Interior: slightly lighter dark blue-grey
    const chR = 22, chG = 22, chB = 38;

    for (let py = 0; py < H; py++) {
      const y_world = wYmin + (H - offsetY - py - 0.5) * scale;
      for (let px = 0; px < W; px++) {
        const x_world = wXmin + (px - offsetX + 0.5) * scale;
        const base = (py * W + px) * 4;

        if (x_world >= xMin && x_world <= xMax) {
          const yb = ybot(x_world);
          const yt = ytop(x_world);
          if (y_world >= yb && y_world <= yt && yt > yb) {
            data[base] = chR; data[base+1] = chG; data[base+2] = chB; data[base+3] = 255;
            continue;
          }
        }
        fillBg(data, base);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return transform;
  };

  // ── Wall outlines ────────────────────────────────────────────────────────────
  NS.Pcolor.drawWalls = function (ctx, grid, transform) {
    const { ni, xMin, xMax, ybot, ytop } = grid;
    const { worldToScreen } = transform;
    const nSeg = ni * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    function drawProfile(fn) {
      ctx.beginPath();
      for (let k = 0; k <= nSeg; k++) {
        const x = xMin + k * (xMax - xMin) / nSeg;
        const { px, py } = worldToScreen(x, fn(x));
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    drawProfile(ybot);
    drawProfile(ytop);
    ctx.restore();
  };
})(window.FVM);
