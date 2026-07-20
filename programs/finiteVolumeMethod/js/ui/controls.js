(function (NS) {
  'use strict';

  NS.Controls = {};

  NS.Controls.create = function (app) {
    // --- Helpers ---
    function el(id) { return document.getElementById(id); }
    function val(id) { return el(id) ? el(id).value : null; }
    function numVal(id) { return parseFloat(val(id)); }

    function slider(id, valId, decimals) {
      const inp = el(id);
      const lab = el(valId);
      if (!inp) return;
      const update = () => {
        if (lab) lab.textContent = parseFloat(inp.value).toFixed(decimals ?? 2);
      };
      inp.addEventListener('input', update);
      update();
    }

    function bindSlider(id, valId, key, decimals, transform) {
      const inp = el(id);
      const lab = el(valId);
      if (!inp) return;
      const update = () => {
        const v = parseFloat(inp.value);
        if (lab) lab.textContent = v.toFixed(decimals ?? 2);
        app.params[key] = transform ? transform(v) : v;
      };
      inp.addEventListener('input', update);
      // Note: syncUI() is called first to set correct slider value from params;
      // update() is NOT called here to avoid overriding case preset values.
    }

    function bindSelect(id, key) {
      const s = el(id);
      if (!s) return;
      s.addEventListener('change', () => { app.params[key] = s.value; });
    }

    function bindNumber(id, key) {
      const inp = el(id);
      if (!inp) return;
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) app.params[key] = v;
      });
    }

    function bindInt(id, key) {
      const inp = el(id);
      if (!inp) return;
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value, 10);
        if (!isNaN(v)) app.params[key] = v;
      });
    }

    function bindCheck(id, key) {
      const inp = el(id);
      if (!inp) return;
      inp.addEventListener('change', () => { app.params[key] = inp.checked; });
    }

    // Sync UI first so sliders reflect params (not HTML attribute defaults)
    syncUI();

    // --- Case selector ---
    const caseSelect = el('caseSelect');
    if (caseSelect) {
      NS.Cases.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.label;
        caseSelect.appendChild(opt);
      });
      caseSelect.addEventListener('change', () => {
        const found = NS.Cases.find(c => c.id === caseSelect.value);
        if (found) {
          Object.assign(app.params, NS.Defaults, found.params);
          syncUI();
          app.resetGeometry(!!found.params.flatGeometry);
        }
        const hint = el('caseHint');
        if (hint && found) hint.textContent = found.hint || '';
      });
    }

    // --- Sim controls ---
    el('btnPlay')  ?.addEventListener('click', () => {
      app.params.paused = !app.params.paused;
      el('btnPlay').textContent = app.params.paused ? 'Spustit' : 'Pauza';
    });
    el('btnStep')  ?.addEventListener('click', () => { app.solver?.step(); });
    el('btnReset') ?.addEventListener('click', () => { app.rebuild(); });
    el('btnRebuildGrid')?.addEventListener('click', () => { app.rebuild(); });

    // --- Substeps ---
    bindSlider('substepsRange', 'substepsVal', 'substeps', 0);

    // --- Grid ---
    bindInt('niInput', 'ni');
    bindInt('njInput', 'nj');

    // --- Physics ---
    bindSlider('gammaRange', 'gammaVal', 'gamma', 2);

    // --- Inlet/Outlet ---
    bindNumber('inletMachInput', 'inletMach');
    bindNumber('inletP0Input',   'inletP0');
    bindNumber('inletT0Input',   'inletT0');
    bindNumber('outletPbackInput', 'outletPback');

    el('inletMode')?.addEventListener('change', () => {
      app.params.inletMode = el('inletMode').value;
    });
    el('outletMode')?.addEventListener('change', () => {
      app.params.outletMode = el('outletMode').value;
    });

    function bindControlPoints(id, key) {
      const inp = el(id);
      if (!inp) return;
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value, 10);
        if (!isNaN(v)) {
          app.params[key] = Math.max(2, Math.min(15, v));
          inp.value = app.params[key];
          app.resampleControlPoints();
        }
      });
    }
    bindControlPoints('botPointsInput', 'botControlPoints');
    bindControlPoints('topPointsInput', 'topControlPoints');

    // --- Solver ---
    el('fluxScheme')?.addEventListener('change', () => {
      app.params.fluxScheme = el('fluxScheme').value;
    });
    el('rkOrder')?.addEventListener('change', () => {
      app.params.rkOrder = parseInt(el('rkOrder').value, 10);
    });
    bindSlider('cflRange', 'cflVal', 'cfl', 2);

    // --- Visualization ---
    el('vizField')?.addEventListener('change', () => {
      app.params.vizField = el('vizField').value;
    });
    el('vizMode')?.addEventListener('change', () => {
      app.params.vizMode = el('vizMode').value;
    });
    el('colormapSel')?.addEventListener('change', () => {
      app.params.colormap = el('colormapSel').value;
    });
    bindInt('contourLevelsInput', 'contourLevels');
    bindCheck('autoRangeCheck', 'autoRange');

    el('autoRangeCheck')?.addEventListener('change', () => {
      const auto = el('autoRangeCheck').checked;
      el('manualRangeRow')?.classList.toggle('hidden', auto);
    });
    bindNumber('vizMinInput', 'vizMin');
    bindNumber('vizMaxInput', 'vizMax');
    bindCheck('smoothShadingCheck', 'smoothShading');
    bindCheck('showGridCheck', 'showGrid');

    // --- Sync UI to current params ---
    function syncUI() {
      const p = app.params;

      if (el('niInput'))  el('niInput').value  = p.ni;
      if (el('njInput'))  el('njInput').value  = p.nj;
      if (el('gammaRange'))  { el('gammaRange').value = p.gamma; el('gammaVal').textContent = p.gamma.toFixed(2); }
      if (el('inletMachInput'))    el('inletMachInput').value    = p.inletMach;
      if (el('inletP0Input'))      el('inletP0Input').value      = p.inletP0;
      if (el('inletT0Input'))      el('inletT0Input').value      = p.inletT0;
      if (el('outletPbackInput'))  el('outletPbackInput').value  = p.outletPback;
      if (el('inletMode'))   el('inletMode').value   = p.inletMode;
      if (el('outletMode'))  el('outletMode').value  = p.outletMode;
      if (el('botPointsInput')) el('botPointsInput').value = p.botControlPoints;
      if (el('topPointsInput')) el('topPointsInput').value = p.topControlPoints;
      if (el('fluxScheme'))  el('fluxScheme').value  = p.fluxScheme;
      if (el('rkOrder'))     el('rkOrder').value     = p.rkOrder;
      if (el('cflRange'))    { el('cflRange').value = p.cfl; el('cflVal').textContent = p.cfl.toFixed(2); }
      if (el('substepsRange')){ el('substepsRange').value = p.substeps; el('substepsVal').textContent = p.substeps; }
      if (el('vizField'))    el('vizField').value    = p.vizField;
      if (el('vizMode'))     el('vizMode').value     = p.vizMode;
      if (el('colormapSel')) el('colormapSel').value = p.colormap;
      if (el('contourLevelsInput')) el('contourLevelsInput').value = p.contourLevels;
      if (el('autoRangeCheck'))     el('autoRangeCheck').checked     = p.autoRange;
      if (el('smoothShadingCheck')) el('smoothShadingCheck').checked = p.smoothShading;
      if (el('showGridCheck'))      el('showGridCheck').checked      = p.showGrid;
    }

    return { syncUI };
  };
})(window.FVM);
