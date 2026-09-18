(function (NS) {
  'use strict';

  const Pcolor   = NS.Pcolor;
  const Contours = NS.Contours;
  const Colormap = NS.Colormap;

  NS.CanvasRenderer = {};

  NS.CanvasRenderer.create = function (canvas, colorbarCanvas) {
    const ctx = canvas.getContext('2d');
    let lastTransform = null;
    let lastLookup    = null;
    let lookupW = 0, lookupH = 0;
    let lastGridId = null;

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

    function renderColorbar(vmin, vmax, colormapName, fieldLabel) {
      if (!colorbarCanvas) return;
      const W = colorbarCanvas.width, H = colorbarCanvas.height;
      const cb = colorbarCanvas.getContext('2d');
      cb.clearRect(0, 0, W, H);
      cb.fillStyle = '#12121c'; cb.fillRect(0, 0, W, H);
      const barX=28, barW=18, barY=30, barH=Math.max(40, H-70), steps=Math.ceil(barH);
      for (let s=0;s<steps;s++) {
        const t = 1-s/steps;
        const [r,g,b] = Colormap.map(vmin+t*(vmax-vmin), vmin, vmax, colormapName);
        cb.fillStyle = `rgb(${r},${g},${b})`;
        cb.fillRect(barX, barY+s*barH/steps, barW, barH/steps+1);
      }
      cb.strokeStyle = '#666'; cb.lineWidth = 0.75;
      cb.strokeRect(barX, barY, barW, barH);
      cb.fillStyle = '#bbb'; cb.font = '10px JetBrains Mono, monospace';
      for (let k=0;k<=5;k++) {
        const frac=k/5, val=vmax-frac*(vmax-vmin), y=barY+frac*barH;
        cb.textAlign='left'; cb.fillText(formatVal(val), barX+barW+4, y+4);
        cb.strokeStyle='#666'; cb.beginPath(); cb.moveTo(barX+barW,y); cb.lineTo(barX+barW+3,y); cb.stroke();
      }
      if (fieldLabel) {
        cb.save(); cb.fillStyle='#888'; cb.font='10px DM Sans,sans-serif';
        cb.textAlign='center'; cb.translate(12, barY+barH/2); cb.rotate(-Math.PI/2);
        cb.fillText(fieldLabel, 0, 0); cb.restore();
      }
    }

    function formatVal(v) {
      const a = Math.abs(v);
      if (a===0) return '0';
      if (a>=1000||(a<0.01&&a>0)) return v.toExponential(2);
      return v.toPrecision(4);
    }

    function drawHUD(stats, forces, params) {
      const lines = [
        `t = ${stats.time.toFixed(4)}`,
        `dt = ${stats.dt.toExponential(2)}`,
        `krok = ${stats.stepCount}`,
        `M_max = ${stats.maxMach.toFixed(3)}`,
        `p_min = ${stats.minP.toFixed(3)}`,
        `p_max = ${stats.maxP.toFixed(3)}`,
      ];
      if (forces) {
        lines.push(`Cl = ${forces.Cl.toFixed(4)}`);
        lines.push(`Cd = ${forces.Cd.toFixed(4)}`);
      }
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, 8, 150, lines.length*16+10);
      ctx.fillStyle = '#ccc'; ctx.font = '11px JetBrains Mono,monospace'; ctx.textAlign='left';
      lines.forEach((l, i) => ctx.fillText(l, 14, 22+i*16));
      ctx.restore();
    }

    const FIELD_LABELS = {
      mach: 'Mach M', pressure: 'Tlak p', density: 'Hustota ρ',
      velocity: '|u|', u: 'u', v: 'v',
    };

    return {
      render(grid, scalar, params, stats, forces) {
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#0f0f18'; ctx.fillRect(0, 0, W, H);

        // Build / reuse world-extent and transform
        const ext = Pcolor.worldExtent(grid, params.viewZoom);
        const transform = Pcolor.makeTransform(W, H, ext);
        lastTransform = transform;

        // Rebuild pixel→cell lookup table when grid or canvas changes
        if (!lastLookup || lookupW !== W || lookupH !== H || lastGridId !== grid) {
          lastLookup = Pcolor.buildLookup(W, H, grid, transform);
          lookupW = W; lookupH = H; lastGridId = grid;
        }

        const [vmin, vmax] = getRange(scalar, params);
        const cm = params.colormap || 'turbo';
        const mode = params.vizMode || 'pcolor';

        if (mode === 'pcolor' || mode === 'both') {
          Pcolor.draw(ctx, canvas, grid, scalar, vmin, vmax, cm, lastLookup, {
            smooth: !!params.smoothShading,
            transform,
          });
        } else {
          // Contour-only: dark background
          ctx.fillStyle = '#16162a'; ctx.fillRect(0, 0, W, H);
          // Fill grid interior darker
          const imgData = ctx.createImageData(W, H);
          const data = imgData.data;
          for (let k = 0; k < lastLookup.length; k++) {
            const b = k * 4;
            if (lastLookup[k] >= 0) {
              data[b]=22; data[b+1]=22; data[b+2]=38; data[b+3]=255;
            } else {
              data[b]=15; data[b+1]=15; data[b+2]=24; data[b+3]=255;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        if (mode === 'contour' || mode === 'both') {
          const nLvl = params.contourLevels || 15;
          const cData = Contours.compute(grid, scalar, nLvl, vmin, vmax);
          const cOpts = mode === 'both'
            ? { color: 'rgba(0,0,0,0.82)', lineWidth: 1.4 }
            : { lineWidth: 2.2 };
          Contours.draw(ctx, cData, transform.worldToScreen, vmin, vmax, cm, cOpts);
        }

        Pcolor.drawAirfoil(ctx, grid, transform);
        if (params.showGrid) Pcolor.drawGrid(ctx, grid, transform);
        drawHUD(stats, forces, params);

        const label = FIELD_LABELS[params.vizField] || params.vizField;
        renderColorbar(vmin, vmax, cm, label);
      },

      invalidateLookup() { lastLookup = null; },
      get lastTransform() { return lastTransform; },
    };
  };
})(window.AFL);
