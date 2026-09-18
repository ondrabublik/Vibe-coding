(function (NS) {
  'use strict';

  const Pcolor   = NS.Pcolor;
  const Contours = NS.Contours;
  const Colormap = NS.Colormap;

  NS.CanvasRenderer = {};

  NS.CanvasRenderer.create = function (canvas, colorbarCanvas) {
    const ctx = canvas.getContext('2d');
    let lastTransform = null;

    function getRange(scalar, params) {
      if (!params.autoRange) return [params.vizMin, params.vizMax];
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < scalar.length; k++) {
        if (scalar[k] < mn) mn = scalar[k];
        if (scalar[k] > mx) mx = scalar[k];
      }
      if (mn === mx) { mn -= 0.5; mx += 0.5; }
      return [mn, mx];
    }

    // Draw colorbar on external canvas element (outside the sim canvas)
    function renderColorbar(vmin, vmax, colormapName, fieldLabel) {
      if (!colorbarCanvas) return;
      const W = colorbarCanvas.width;
      const H = colorbarCanvas.height;
      const cb = colorbarCanvas.getContext('2d');

      cb.clearRect(0, 0, W, H);
      cb.fillStyle = '#12121c';
      cb.fillRect(0, 0, W, H);

      const barX = 28;
      const barW = 18;
      const barY = 30;
      const barH = Math.max(40, H - 70);
      const steps = Math.ceil(barH);

      // Gradient bar
      for (let s = 0; s < steps; s++) {
        const t = 1 - s / steps;
        const [r, g, b] = Colormap.map(vmin + t * (vmax - vmin), vmin, vmax, colormapName);
        cb.fillStyle = `rgb(${r},${g},${b})`;
        const y = barY + s * barH / steps;
        cb.fillRect(barX, y, barW, barH / steps + 1);
      }

      // Border
      cb.strokeStyle = '#666';
      cb.lineWidth = 0.75;
      cb.strokeRect(barX, barY, barW, barH);

      // Tick labels
      cb.fillStyle = '#bbb';
      cb.font = '10px JetBrains Mono, monospace';
      const nTicks = 5;
      for (let k = 0; k <= nTicks; k++) {
        const frac = k / nTicks;
        const val  = vmax - frac * (vmax - vmin);
        const y    = barY + frac * barH;

        cb.textAlign = 'left';
        cb.fillText(formatVal(val), barX + barW + 4, y + 4);

        cb.strokeStyle = '#666';
        cb.beginPath();
        cb.moveTo(barX + barW, y);
        cb.lineTo(barX + barW + 3, y);
        cb.stroke();
      }

      // Field label (rotated, left of bar)
      if (fieldLabel) {
        cb.save();
        cb.fillStyle = '#888';
        cb.font = '10px DM Sans, sans-serif';
        cb.textAlign = 'center';
        cb.translate(12, barY + barH / 2);
        cb.rotate(-Math.PI / 2);
        cb.fillText(fieldLabel, 0, 0);
        cb.restore();
      }
    }

    function formatVal(v) {
      const a = Math.abs(v);
      if (a === 0) return '0';
      if (a >= 1000 || (a < 0.01 && a > 0)) return v.toExponential(2);
      return v.toPrecision(4);
    }

    function drawInfo(stats, params) {
      const lines = [
        `t = ${stats.time.toFixed(4)}`,
        `dt = ${stats.dt.toExponential(2)}`,
        `krok = ${stats.stepCount}`,
        `M_max = ${stats.maxMach.toFixed(3)}`,
        `p_min = ${stats.minP.toFixed(3)}`,
        `p_max = ${stats.maxP.toFixed(3)}`,
      ];
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, 8, 148, lines.length * 16 + 10);
      ctx.fillStyle = '#ccc';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      lines.forEach((l, i) => ctx.fillText(l, 14, 22 + i * 16));
      ctx.restore();
    }

    function drawGrid(grid, worldToScreen) {
      const { ni, nj, nodeIdx, nodeX, nodeY } = grid;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      const step = Math.max(1, Math.floor(Math.min(ni, nj) / 20));
      for (let j = 0; j <= nj; j += step) {
        ctx.beginPath();
        for (let i = 0; i <= ni; i++) {
          const { px, py } = worldToScreen(nodeX[nodeIdx(i, j)], nodeY[nodeIdx(i, j)]);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      for (let i = 0; i <= ni; i += step) {
        ctx.beginPath();
        for (let j = 0; j <= nj; j++) {
          const { px, py } = worldToScreen(nodeX[nodeIdx(i, j)], nodeY[nodeIdx(i, j)]);
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    const FIELD_LABELS = {
      mach: 'Mach M',
      pressure: 'Tlak p',
      density: 'Hustota ρ',
      velocity: '|u| m/s',
      u: 'u m/s',
      v: 'v m/s',
    };

    return {
      render(grid, scalar, params, stats, geoEditor) {
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#12121c';
        ctx.fillRect(0, 0, W, H);

        const [vmin, vmax] = getRange(scalar, params);
        const cm = params.colormap || 'jet';
        const mode = params.vizMode || 'pcolor';

        let transform;

        if (mode === 'pcolor' || mode === 'both') {
          transform = Pcolor.draw(ctx, canvas, grid, scalar, vmin, vmax, cm,
            { smooth: params.smoothShading });
        } else {
          // Contour-only: dark channel background (no scalar coloring)
          transform = Pcolor.drawChannelBackground(ctx, canvas, grid);
        }

        lastTransform = transform;

        if (mode === 'contour' || mode === 'both') {
          const nLvl = params.contourLevels || 15;
          const cData = Contours.compute(grid, scalar, nLvl, vmin, vmax);
          // 'both' mode: black lines to contrast with the colored field
          // 'contour' mode: colored lines, thicker, on dark background
          const contourOpts = (mode === 'both')
            ? { color: 'rgba(0,0,0,0.82)', lineWidth: 1.4 }
            : { lineWidth: 2.2 };
          Contours.draw(ctx, cData, transform.worldToScreen, vmin, vmax, cm, contourOpts);
        }

        Pcolor.drawWalls(ctx, grid, transform);

        if (params.showGrid) {
          drawGrid(grid, transform.worldToScreen);
        }

        if (geoEditor) {
          geoEditor.drawOverlay(ctx, transform);
        }

        if (stats) {
          drawInfo(stats, params);
        }

        // Draw colorbar on external canvas (outside sim canvas)
        const label = FIELD_LABELS[params.vizField] || params.vizField;
        renderColorbar(vmin, vmax, cm, label);
      },

      get lastTransform() { return lastTransform; },
    };
  };
})(window.FVM);
