(function (NS) {
  'use strict';

  const Defaults = NS.Defaults;
  const CMesh    = NS.CMesh;
  const Grid     = NS.Grid;
  const Solver   = NS.Solver;
  const Forces   = NS.Forces;
  const Naca4    = NS.Naca4;
  const Naca5    = NS.Naca5;
  const Math_    = NS.Math_;
  const CanvasRenderer = NS.CanvasRenderer;
  const CpPlot   = NS.CpPlot;
  const Controls = NS.Controls;

  class App {
    constructor() {
      this.canvas         = document.getElementById('simCanvas');
      this.colorbarCanvas = document.getElementById('colorbarCanvas');
      this.cpCanvas       = document.getElementById('cpCanvas');

      this.params   = Object.assign({}, Defaults);
      this.renderer = CanvasRenderer.create(this.canvas, this.colorbarCanvas);

      this.grid       = null;
      this.solver     = null;
      this.freeStream = null;
      this.forces     = null;
      this._frameId   = null;
    }

    // ── Geometry & solver setup ─────────────────────────────────────────────
    _buildNacaPts() {
      const { nacaType, nacaCode } = this.params;
      if (nacaType === '5') {
        const parsed = Naca5.parse(nacaCode);
        if (!parsed.ok) {
          console.warn('NACA 5 parse error:', parsed.error);
          // Fall back to NACA 0012
          const p4 = Naca4.parse('0012');
          return Naca4.compute(p4);
        }
        return Naca5.compute({ P: parsed.P, t: parsed.t, pointCount: 200 });
      } else {
        const parsed = Naca4.parse(nacaCode);
        if (!parsed.ok) {
          console.warn('NACA 4 parse error:', parsed.error);
          const p4 = Naca4.parse('0012');
          return Naca4.compute(p4);
        }
        return Naca4.compute({ m: parsed.m, p: parsed.p, t: parsed.t, pointCount: 200 });
      }
    }

    _buildFreestream() {
      const { gamma, mach, p0, T0 } = this.params;
      // p0, T0 are stagnation (total) conditions; compute static from isentropic
      const factor = 1.0 + 0.5 * (gamma - 1.0) * mach * mach;
      const T   = T0 / factor;
      const p   = p0 * Math.pow(factor, -gamma / (gamma - 1.0));
      const rho = p / T;   // ideal gas R=1
      const c   = Math.sqrt(gamma * p / rho);
      const V   = mach * c;
      const E   = p / (gamma - 1.0) + 0.5 * rho * V * V;
      const M   = mach;
      return { rho, u: V, v: 0.0, p, c, V, E, M, gamma };
    }

    rebuild() {
      const nacaPts   = this._buildNacaPts();
      const freeStream = this._buildFreestream();
      this.freeStream  = freeStream;

      const cmesh = CMesh.build(nacaPts, this.params);
      const grid  = Grid.build(cmesh);
      this.grid   = grid;

      // Invalidate pixel lookup so it gets rebuilt on next render
      this.renderer.invalidateLookup();

      this.solver = Solver.create(grid, this.params, freeStream);
      this.forces = null;
    }

    // ── Main animation loop ─────────────────────────────────────────────────
    renderFrame() {
      const { solver, grid, params, freeStream, renderer, cpCanvas } = this;
      if (!solver || !grid) return;

      const scalar = solver.getScalar(params.vizField);
      const stats  = {
        time:      solver.time,
        dt:        solver.dt,
        stepCount: solver.stepCount,
        maxMach:   solver.maxMach,
        minP:      solver.minP,
        maxP:      solver.maxP,
      };

      renderer.render(grid, scalar, params, stats, this.forces);

      // Cp plot
      if (this.forces) {
        CpPlot.draw(cpCanvas, this.forces.cpData, params);
      }

      // Update sidebar metrics
      if (NS.Controls.updateMetrics) NS.Controls.updateMetrics(this.forces);
    }

    _loop() {
      if (!this.params.paused && this.solver) {
        const n = Math.max(1, Math.round(this.params.substeps));
        for (let k = 0; k < n; k++) {
          this.solver.step();
        }
        // Recompute forces every substeps steps
        this.forces = Forces.compute(this.solver.state, this.grid, this.params, this.freeStream);
      }
      this.renderFrame();
      this._frameId = requestAnimationFrame(this._loop.bind(this));
    }

    // ── Resize handling ─────────────────────────────────────────────────────
    resize() {
      const viewport = document.querySelector('.viewport');
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const cbW  = this.colorbarCanvas ? this.colorbarCanvas.offsetWidth : 90;

      // Main canvas: fill viewport minus colorbar
      const cW = Math.max(200, rect.width - cbW);
      const cH = Math.max(100, rect.height);
      if (this.canvas.width !== cW || this.canvas.height !== cH) {
        this.canvas.width  = cW;
        this.canvas.height = cH;
        this.renderer.invalidateLookup();
      }
      if (this.colorbarCanvas) {
        this.colorbarCanvas.width  = cbW;
        this.colorbarCanvas.height = cH;
      }

      // Cp canvas: half of right-area width, taller plot
      if (this.cpCanvas) {
        const cpArea = this.cpCanvas.parentElement;
        const cpH = cpArea ? cpArea.clientHeight : 260;
        this.cpCanvas.width  = Math.max(160, Math.floor(rect.width * 0.5));
        if (this.cpCanvas.height !== cpH) this.cpCanvas.height = cpH;
      }
    }

    init() {
      this.rebuild();
      Controls.create(this);
      window.addEventListener('resize', () => { this.resize(); this.renderer.invalidateLookup(); });
      this.resize();
      this._frameId = requestAnimationFrame(this._loop.bind(this));
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    window._aflApp = app;  // expose for debugging
    app.init();
  });

})(window.AFL);
