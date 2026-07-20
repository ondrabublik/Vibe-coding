(function (NS) {
  'use strict';

  const Defaults = NS.Defaults;
  const SceneRegistry = NS.SceneRegistry;

  class App {
    constructor() {
      this.canvas = document.getElementById('simCanvas');
      this.renderer = new NS.CanvasRenderer(this.canvas);
      this.common = Object.assign({}, Defaults.common);
      this.sceneId = 'ring';
      this.params = null;
      this.solver = null;
      this.particles = [];
      this.time = 0;
      this.lastDt = 0;
      this.paused = false;
      this.controls = null;
    }

    init() {
      this.renderer.particleRadius = this.common.particleRadius;
      this.renderer.showBounds = this.common.showBounds;
      this.renderer.showGrid = this.common.showGrid;
      this.loadScene(this.sceneId);
      this.controls = new NS.Controls(this);
      window.addEventListener('resize', this.onResize.bind(this));
      this.onResize();
      requestAnimationFrame(this.loop.bind(this));
    }

    onResize() {
      this.renderer.resize();
    }

    loadScene(sceneId) {
      const scene = SceneRegistry[sceneId];
      if (!scene) return;

      this.sceneId = sceneId;
      this.params = Object.assign({}, Defaults[scene.defaultsKey]);
      this.particles = scene.create(this.params);
      this.solver = new scene.Solver(this.params);
      this.renderer.setDomain(this.params.domain);
      this.renderer.mode = scene.mode;
      this.time = 0;
      this.lastDt = this.params.dt;
      this.paused = false;
      this.updatePlayButton();

      if (this.controls) {
        this.controls.syncFromParams(sceneId, this.params, this.common);
        this.controls.onSceneChange(sceneId);
      }
    }

    resetScene() {
      this.loadScene(this.sceneId);
    }

    togglePause() {
      this.paused = !this.paused;
      this.updatePlayButton();
    }

    updatePlayButton() {
      const btn = document.getElementById('btnPlayPause');
      if (btn) btn.textContent = this.paused ? 'Spustit' : 'Pauza';
    }

    stepOnce() {
      this.lastDt = this.solver.step(this.particles);
      this.time += this.lastDt;
    }

    simulateFrame() {
      if (this.paused) return;

      const steps = Math.max(1, Math.round(this.common.substeps * this.common.speed));
      for (let i = 0; i < steps; i++) {
        this.lastDt = this.solver.step(this.particles);
        this.time += this.lastDt;
      }
    }

    loop() {
      this.simulateFrame();
      this.renderer.render(this.particles, this.solver.getScalarField.bind(this.solver), this.params.spacing, {
        count: this.particles.length,
        time: this.time,
        dt: this.lastDt,
        paused: this.paused,
      });
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const app = new App();
    app.init();
    window.SPHApp = app;
  });
})(window.SPH);
