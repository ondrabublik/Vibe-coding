(function (global) {
  "use strict";

  function curveBounds(curves) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of curves) {
      if (!c) continue;
      for (const { x, y } of c) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }
    return { minX, maxX, minY, maxY };
  }

  function drawGrid(ctx, width, height) {
    ctx.strokeStyle = "#eef0f3";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawAxes(ctx, worldToScreen) {
    const o = worldToScreen(0, 0);
    const xEnd = worldToScreen(1, 0);
    const yEnd = worldToScreen(0, 1);
    ctx.strokeStyle = "#bdc1c6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.sx, o.sy);
    ctx.lineTo(xEnd.sx, xEnd.sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o.sx, o.sy);
    ctx.lineTo(yEnd.sx, yEnd.sy);
    ctx.stroke();
  }

  function drawClosedCurve(ctx, points, color, lineWidth, dashed) {
    if (!points || points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(points[0].sx, points[0].sy);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].sx, points[i].sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function renderProfile(canvas, outerClosed, innerClosed, options) {
    const opts = options || {};
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = 40;
    const b = curveBounds([outerClosed, innerClosed]);
    const rangeX = b.maxX - b.minX || 1;
    const rangeY = b.maxY - b.minY || 1;
    const margin = 0.12;
    const dataW = rangeX * (1 + 2 * margin);
    const dataH = rangeY * (1 + 2 * margin);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;

    const scale = Math.min(
      (width - 2 * pad) / dataW,
      (height - 2 * pad) / dataH
    );

    const worldToScreen = (wx, wy) => {
      const sx = width / 2 + (wx - cx) * scale;
      const sy = height / 2 - (wy - cy) * scale;
      return { sx, sy };
    };

    drawGrid(ctx, width, height);
    drawAxes(ctx, worldToScreen);

    if (outerClosed && outerClosed.length) {
      const screen = outerClosed.map((p) => worldToScreen(p.x, p.y));
      drawClosedCurve(ctx, screen, "#1a73e8", 2, false);
    }
    if (innerClosed && innerClosed.length) {
      const screen = innerClosed.map((p) => worldToScreen(p.x, p.y));
      drawClosedCurve(ctx, screen, "#0f9d58", 1.5, true);
    }

    if (opts.label) {
      ctx.fillStyle = "#3c4043";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(opts.label, 12, 22);
    }
  }

  global.CanvasView = { renderProfile };
})(typeof window !== "undefined" ? window : globalThis);
