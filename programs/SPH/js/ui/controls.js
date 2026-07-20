(function (NS) {
  'use strict';

  const SCENES = {
    ring: {
      id: 'ring',
      label: 'Pevný prstenec',
      defaultsKey: 'solid',
      create: NS.Scenes.createRingScene,
      Solver: NS.SolidSolver,
      mode: 'solid',
    },
    damBreak: {
      id: 'damBreak',
      label: 'Dam break',
      defaultsKey: 'fluid',
      create: NS.Scenes.createDamBreakScene,
      Solver: NS.FluidSolver,
      mode: 'fluid',
    },
  };

  function bindRange(id, valueId, onChange) {
    const input = document.getElementById(id);
    const label = document.getElementById(valueId);
    if (!input || !label) return null;

    const update = function () {
      label.textContent = formatValue(input.value, input.step);
      onChange(parseFloat(input.value));
    };

    input.addEventListener('input', update);
    update();
    return input;
  }

  function formatValue(value, step) {
    const v = parseFloat(value);
    const s = parseFloat(step);
    if (s >= 1) return v.toFixed(0);
    if (s >= 0.1) return v.toFixed(1);
    if (s >= 0.01) return v.toFixed(2);
    if (s >= 0.001) return v.toFixed(3);
    return v.toExponential(0);
  }

  function setSectionVisible(sectionId, visible) {
    const el = document.getElementById(sectionId);
    if (el) el.hidden = !visible;
  }

  class Controls {
    constructor(app) {
      this.app = app;
      this.sceneSelect = document.getElementById('sceneSelect');
      this.bindCommon();
      this.bindSolid();
      this.bindFluid();
      this.bindButtons();
      this.onSceneChange(this.app.sceneId);
    }

    bindCommon() {
      const app = this.app;

      bindRange('speed', 'speedVal', function (v) {
        app.common.speed = v;
      });

      bindRange('substeps', 'substepsVal', function (v) {
        app.common.substeps = v;
      });

      document.getElementById('showBounds').addEventListener('change', function (e) {
        app.common.showBounds = e.target.checked;
        app.renderer.showBounds = e.target.checked;
      });

      document.getElementById('showGrid').addEventListener('change', function (e) {
        app.common.showGrid = e.target.checked;
        app.renderer.showGrid = e.target.checked;
      });

      this.sceneSelect.addEventListener('change', function (e) {
        app.loadScene(e.target.value);
        app.onSceneChange(e.target.value);
      });
    }

    bindSolid() {
      const app = this.app;
      const p = function () {
        return app.solver ? app.solver.params : app.params;
      };

      bindRange('solidSpacing', 'solidSpacingVal', function (v) {
        p().spacing = v;
        p().h = v;
      });
      bindRange('solidBulk', 'solidBulkVal', function (v) {
        p().bulkModulus = v * 1000;
      });
      bindRange('solidShear', 'solidShearVal', function (v) {
        p().shearModulus = v * 1000;
      });
      bindRange('solidYield', 'solidYieldVal', function (v) {
        p().yieldStress = v * 100;
      });
      bindRange('solidGravity', 'solidGravityVal', function (v) {
        p().gravity[1] = -v;
      });
      bindRange('solidDt', 'solidDtVal', function (v) {
        p().dt = v;
      });
      bindRange('solidInnerR', 'solidInnerRVal', function (v) {
        p().innerRadius = v;
      });
      bindRange('solidOuterR', 'solidOuterRVal', function (v) {
        p().outerRadius = v;
      });
    }

    bindFluid() {
      const app = this.app;
      const p = function () {
        return app.solver ? app.solver.params : app.params;
      };

      bindRange('fluidSpacing', 'fluidSpacingVal', function (v) {
        p().spacing = v;
        p().h = v;
      });
      bindRange('fluidSound', 'fluidSoundVal', function (v) {
        p().speedOfSound = v;
        if (app.solver && app.solver.setParams) {
          app.solver.setParams({ speedOfSound: v });
        }
      });
      bindRange('fluidViscAlpha', 'fluidViscAlphaVal', function (v) {
        p().artificialViscosityAlpha = v;
      });
      bindRange('fluidGravity', 'fluidGravityVal', function (v) {
        p().gravity[1] = -v;
      });
      bindRange('fluidDt', 'fluidDtVal', function (v) {
        p().dt = v;
      });
      bindRange('fluidColumnW', 'fluidColumnWVal', function (v) {
        p().columnWidth = v;
      });
      bindRange('fluidColumnH', 'fluidColumnHVal', function (v) {
        p().columnHeight = v;
      });
    }

    bindButtons() {
      const app = this.app;
      document.getElementById('btnPlayPause').addEventListener('click', function () {
        app.togglePause();
      });
      document.getElementById('btnStep').addEventListener('click', function () {
        app.stepOnce();
      });
      document.getElementById('btnReset').addEventListener('click', function () {
        app.resetScene();
      });
    }

    onSceneChange(sceneId) {
      setSectionVisible('solidParams', sceneId === 'ring');
      setSectionVisible('fluidParams', sceneId === 'damBreak');

      const hint = document.getElementById('sceneHint');
      if (hint) {
        hint.textContent =
          sceneId === 'ring'
            ? 'Prstenec z SPH částic padá v gravitačním poli na podložku a plasticky se deformuje.'
            : 'Sloupec vody se uvolní v nádrži — klasická dam break úloha (WCSPH).';
      }
    }

    syncFromParams(sceneId, params, common) {
      const set = function (id, value) {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };

      document.getElementById('speed').value = common.speed;
      document.getElementById('substeps').value = common.substeps;
      document.getElementById('showBounds').checked = common.showBounds;
      document.getElementById('showGrid').checked = common.showGrid;

      if (sceneId === 'ring') {
        set('solidSpacing', params.spacing);
        set('solidBulk', params.bulkModulus / 1000);
        set('solidShear', params.shearModulus / 1000);
        set('solidYield', params.yieldStress / 100);
        set('solidGravity', -params.gravity[1]);
        set('solidDt', params.dt);
        set('solidInnerR', params.innerRadius);
        set('solidOuterR', params.outerRadius);
      } else {
        set('fluidSpacing', params.spacing);
        set('fluidSound', params.speedOfSound);
        set('fluidViscAlpha', params.artificialViscosityAlpha);
        set('fluidGravity', -params.gravity[1]);
        set('fluidDt', params.dt);
        set('fluidColumnW', params.columnWidth);
        set('fluidColumnH', params.columnHeight);
      }
    }
  }

  NS.Controls = Controls;
  NS.SceneRegistry = SCENES;
})(window.SPH);
