(function (NS) {
  'use strict';

  const { TYPE } = NS.Particles;
  const { clamp, lerp } = NS.Math;

  const PALETTE = {
    solid: [
      [40, 70, 120],
      [70, 130, 200],
      [220, 180, 80],
      [230, 90, 60],
    ],
    fluid: [
      [20, 40, 90],
      [40, 120, 200],
      [120, 210, 255],
      [255, 255, 255],
    ],
    boundary: [90, 95, 105],
  };

  function samplePalette(palette, t) {
    const n = palette.length - 1;
    const x = clamp(t, 0, 1) * n;
    const i = Math.floor(x);
    const f = x - i;
    const a = palette[Math.min(i, n)];
    const b = palette[Math.min(i + 1, n)];
    return [
      Math.round(lerp(a[0], b[0], f)),
      Math.round(lerp(a[1], b[1], f)),
      Math.round(lerp(a[2], b[2], f)),
    ];
  }

  class CanvasRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.domain = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
      this.padding = 24;
      this.particleRadius = 0.45;
      this.showBounds = true;
      this.showGrid = false;
      this.fieldMin = 0;
      this.fieldMax = 1;
      this.mode = 'solid';
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.viewWidth = rect.width;
      this.viewHeight = rect.height;
    }

    setDomain(domain) {
      this.domain = domain;
    }

    worldToScreen(x, y) {
      const d = this.domain;
      const pad = this.padding;
      const w = this.viewWidth - 2 * pad;
      const h = this.viewHeight - 2 * pad;
      const sx = pad + ((x - d.xMin) / (d.xMax - d.xMin)) * w;
      const sy = pad + (1 - (y - d.yMin) / (d.yMax - d.yMin)) * h;
      return [sx, sy];
    }

    screenRadius(h, spacing) {
      const d = this.domain;
      const pad = this.padding;
      const scaleX = (this.viewWidth - 2 * pad) / (d.xMax - d.xMin);
      const scaleY = (this.viewHeight - 2 * pad) / (d.yMax - d.yMin);
      return Math.max(1.2, this.particleRadius * Math.min(scaleX, scaleY) * spacing);
    }

    clear() {
      const ctx = this.ctx;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    }

    drawGrid() {
      if (!this.showGrid) return;
      const ctx = this.ctx;
      const d = this.domain;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      const step = 0.1;

      for (let x = Math.ceil(d.xMin / step) * step; x <= d.xMax; x += step) {
        const a = this.worldToScreen(x, d.yMin);
        const b = this.worldToScreen(x, d.yMax);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }

      for (let y = Math.ceil(d.yMin / step) * step; y <= d.yMax; y += step) {
        const a = this.worldToScreen(d.xMin, y);
        const b = this.worldToScreen(d.xMax, y);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }

    drawBounds() {
      if (!this.showBounds) return;
      const ctx = this.ctx;
      const d = this.domain;
      const p0 = this.worldToScreen(d.xMin, d.yMin);
      const p1 = this.worldToScreen(d.xMax, d.yMax);
      ctx.strokeStyle = 'rgba(160, 180, 210, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p0[0], p1[1], p1[0] - p0[0], p0[1] - p1[1]);
    }

    updateFieldRange(particles, getScalarField) {
      let min = Infinity;
      let max = -Infinity;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.type === TYPE.BOUNDARY) continue;
        const v = getScalarField(p);
        if (v < min) min = v;
        if (v > max) max = v;
      }

      if (!isFinite(min) || !isFinite(max) || Math.abs(max - min) < 1e-9) {
        min = 0;
        max = 1;
      }

      this.fieldMin = min;
      this.fieldMax = max;
    }

    drawParticles(particles, getScalarField, spacing) {
      const ctx = this.ctx;
      const palette = this.mode === 'solid' ? PALETTE.solid : PALETTE.fluid;
      const r = this.screenRadius(this.particleRadius, spacing);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const [sx, sy] = this.worldToScreen(p.x[0], p.x[1]);

        let rgb;
        if (p.type === TYPE.BOUNDARY) {
          rgb = PALETTE.boundary;
        } else {
          const value = getScalarField(p);
          const t = (value - this.fieldMin) / (this.fieldMax - this.fieldMin);
          rgb = samplePalette(palette, t);
        }

        ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawHud(info) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(13, 17, 23, 0.72)';
      ctx.fillRect(8, 8, 220, 72);
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '12px "JetBrains Mono", Consolas, monospace';
      ctx.fillText('Částic: ' + info.count, 16, 28);
      ctx.fillText('Čas: ' + info.time.toFixed(3) + ' s', 16, 44);
      ctx.fillText('dt: ' + info.dt.toExponential(2) + ' s', 16, 60);
      if (info.paused) {
        ctx.fillStyle = '#f0ad4e';
        ctx.fillText('PAUZA', 150, 28);
      }
    }

    render(particles, getScalarField, spacing, info) {
      this.clear();
      this.drawGrid();
      this.drawBounds();
      this.updateFieldRange(particles, getScalarField);
      this.drawParticles(particles, getScalarField, spacing);
      this.drawHud(info);
    }
  }

  NS.CanvasRenderer = CanvasRenderer;
})(window.SPH);
