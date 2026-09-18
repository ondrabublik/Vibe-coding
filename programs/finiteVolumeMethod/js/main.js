(function (NS) {
  'use strict';

  const Defaults = NS.Defaults;
  const Profiles  = NS.Profiles;
  const Grid      = NS.Grid;
  const Solver    = NS.Solver;
  const CanvasRenderer = NS.CanvasRenderer;
  const Controls  = NS.Controls;
  const ViewportGeometryEditor = NS.ViewportGeometryEditor;

  class App {
    constructor() {
      this.canvas = document.getElementById('simCanvas');
      this.colorbarCanvas = document.getElementById('colorbarCanvas');
      this.renderer = CanvasRenderer.create(this.canvas, this.colorbarCanvas);
      this.params = Object.assign({}, Defaults);

      this.grid    = null;
      this.solver  = null;
      this.controls = null;

      this.geoState = { botWall: null, topWall: null };
      this.geoEditor = null;

      this._frameId = null;
    }

    init() {
      const firstCase = NS.Cases[0];
      if (firstCase) Object.assign(this.params, firstCase.params);

      this.geoEditor = ViewportGeometryEditor.create(this.canvas, (st, finalize) => {
        Object.assign(this.geoState, st);
        if (finalize) this.rebuildGeometry();
      });
      this.geoEditor.initDefault(this.params.botControlPoints, this.params.topControlPoints);
      Object.assign(this.geoState, this.geoEditor.state);

      this.rebuild();
      this.controls = Controls.create(this);

      window.addEventListener('resize', () => this.resize());
      this.resize();
      this._frameId = requestAnimationFrame(this._loop.bind(this));
    }

    rebuild() {
      const profile = Profiles.build(this.params, this.geoState);
      this.profile = profile;
      this.grid    = Grid.build(this.params, profile);
      this.solver  = Solver.create(this.grid, this.params);
      if (this.params.paused) {
        const btn = document.getElementById('btnPlay');
        if (btn) btn.textContent = 'Spustit';
      }
    }

    rebuildGeometry() {
      const profile = Profiles.build(this.params, this.geoState);
      this.profile = profile;
      const newGrid = Grid.build(this.params, profile);
      if (this.solver && this.solver.setGrid(newGrid)) {
        this.grid = newGrid;
        return;
      }
      this.grid = newGrid;
      this.solver = Solver.create(this.grid, this.params);
    }

    resetGeometry(useFlat) {
      const { botControlPoints: nBot, topControlPoints: nTop } = this.params;
      if (useFlat) this.geoEditor?.initFlat(nBot, nTop);
      else this.geoEditor?.initDefault(nBot, nTop);
      Object.assign(this.geoState, this.geoEditor.state);
      this.rebuild();
    }

    resampleControlPoints() {
      const { botControlPoints: nBot, topControlPoints: nTop } = this.params;
      this.geoEditor?.resampleFromCurrent(nBot, nTop);
      Object.assign(this.geoState, this.geoEditor.state);
      this.rebuildGeometry();
    }

    resize() {
      const vp = document.querySelector('.viewport');
      if (!vp) return;
      const cbW = this.colorbarCanvas ? this.colorbarCanvas.offsetWidth || 90 : 0;
      const vpH = Math.floor(vp.clientHeight);
      const vpW = Math.floor(vp.clientWidth);
      this.canvas.width  = Math.max(100, vpW - cbW);
      this.canvas.height = vpH;
      if (this.colorbarCanvas) {
        this.colorbarCanvas.height = vpH;
      }
    }

    _loop() {
      if (!this.params.paused && this.solver) {
        const steps = Math.max(1, Math.min(50, this.params.substeps || 1));
        for (let s = 0; s < steps; s++) {
          this.solver.step();
        }
      }

      if (this.grid && this.solver) {
        const scalar = this.solver.getScalar(this.params.vizField || 'mach');
        const stats  = this.solver.getStats();
        this.renderer.render(this.grid, scalar, this.params, stats, this.geoEditor);
      }

      this._frameId = requestAnimationFrame(this._loop.bind(this));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
    window.FVMApp = app;
  });
})(window.FVM);
