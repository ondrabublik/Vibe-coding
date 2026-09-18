(function (NS) {
  'use strict';

  // Cp (pressure coefficient) distribution along the airfoil wall.
  // Drawn on a secondary canvas below the main simulation canvas.
  //
  // x-axis: x/c (chord fraction), y-axis: Cp (inverted — positive Cp downward,
  //   consistent with aerodynamics convention where suction peak points upward).

  NS.CpPlot = {};

  NS.CpPlot.draw = function (canvas, cpData, params) {
    if (!canvas || !cpData || !cpData.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#12121c';
    ctx.fillRect(0, 0, W, H);

    // Layout
    const padL = 46, padR = 12, padT = 14, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    if (plotW < 20 || plotH < 20) return;

    // Value ranges (Cp axis inverted: low Cp at top)
    const cpVals = cpData.map(d => d.Cp);
    const xVals  = cpData.map(d => d.x);
    let cpMin = Math.min(-1.5, ...cpVals);
    let cpMax = Math.max( 1.0, ...cpVals);
    let xMin  = Math.min(...xVals), xMax = Math.max(...xVals);
    // Pad slightly
    const dcP = 0.1 * (cpMax - cpMin);
    cpMin -= dcP; cpMax += dcP;
    const dxP = 0.02 * (xMax - xMin);
    xMin -= dxP; xMax += dxP;

    // Map world → screen.
    // Aerodynamic convention: suction (low/negative Cp) at TOP, pressure (positive Cp) at BOTTOM.
    //   tyAero(cpMin) = padT  (top of plot)
    //   tyAero(cpMax) = padT + plotH  (bottom of plot)
    const tx     = x  => padL + (x  - xMin)  / (xMax - xMin)  * plotW;
    const tyAero = cp => padT + (cp - cpMin) / (cpMax - cpMin) * plotH;

    // Background grid
    ctx.strokeStyle = '#2a2a3e'; ctx.lineWidth = 0.5;
    for (let k = 0; k <= 5; k++) {
      const cp = cpMin + k * (cpMax - cpMin) / 5;
      ctx.beginPath(); ctx.moveTo(padL, tyAero(cp)); ctx.lineTo(padL + plotW, tyAero(cp)); ctx.stroke();
    }

    // Cp = 0 reference line
    const y0 = tyAero(0);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + plotW, y0); ctx.stroke();

    // Cp = 1 reference (stagnation) — dashed
    const y1 = tyAero(1);
    ctx.strokeStyle = '#446'; ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, y1); ctx.lineTo(padL + plotW, y1); ctx.stroke();
    ctx.setLineDash([]);

    // Separate upper and lower branches
    const upper = cpData.filter(d => d.isUpper).sort((a, b) => a.x - b.x);
    const lower = cpData.filter(d => !d.isUpper).sort((a, b) => a.x - b.x);

    function drawBranch(pts, color) {
      if (!pts.length) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(tx(pts[0].x), tyAero(pts[0].Cp));
      for (let k = 1; k < pts.length; k++) ctx.lineTo(tx(pts[k].x), tyAero(pts[k].Cp));
      ctx.stroke();
    }

    drawBranch(upper, '#4a9eff');  // blue = suction side
    drawBranch(lower, '#f0a050');  // orange = pressure side

    // Axes
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

    // Labels
    ctx.fillStyle = '#888'; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'right';
    for (let k = 0; k <= 5; k++) {
      const cp = cpMin + k * (cpMax - cpMin) / 5;
      ctx.fillText(cp.toFixed(1), padL - 3, tyAero(cp) + 4);
    }
    ctx.textAlign = 'center';
    for (let k = 0; k <= 4; k++) {
      const x = xMin + k * (xMax - xMin) / 4;
      ctx.fillText(x.toFixed(2), tx(x), padT + plotH + 16);
    }

    // Axis titles
    ctx.fillStyle = '#7878a0'; ctx.font = '10px DM Sans,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('x/c', padL + plotW / 2, H - 4);
    ctx.save(); ctx.translate(10, padT + plotH / 2); ctx.rotate(-Math.PI/2);
    ctx.fillText('Cp', 0, 0); ctx.restore();

    // Legend
    ctx.textAlign = 'left'; ctx.font = '9px DM Sans,sans-serif';
    ctx.fillStyle = '#4a9eff'; ctx.fillRect(padL + 4, padT + 4, 14, 2);
    ctx.fillStyle = '#888'; ctx.fillText('horní povrch', padL + 20, padT + 10);
    ctx.fillStyle = '#f0a050'; ctx.fillRect(padL + 4, padT + 14, 14, 2);
    ctx.fillStyle = '#888'; ctx.fillText('dolní povrch', padL + 20, padT + 20);
  };
})(window.AFL);
