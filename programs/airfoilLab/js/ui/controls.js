(function (NS) {
  'use strict';

  NS.Controls = {};

  NS.Controls.create = function (app) {
    // ── Helpers ───────────────────────────────────────────────────────────────
    function el(id) { return document.getElementById(id); }

    function bindSlider(rangeId, valId, paramKey, digits) {
      const range = el(rangeId), valEl = el(valId);
      if (!range) return;
      range.value = app.params[paramKey];
      valEl.textContent = Number(app.params[paramKey]).toFixed(digits ?? 2);
      range.addEventListener('input', () => {
        app.params[paramKey] = parseFloat(range.value);
        valEl.textContent = Number(range.value).toFixed(digits ?? 2);
      });
    }

    function bindSelect(selectId, paramKey, onChange) {
      const sel = el(selectId);
      if (!sel) return;
      sel.value = app.params[paramKey];
      sel.addEventListener('change', () => {
        app.params[paramKey] = sel.value;
        if (onChange) onChange(sel.value);
      });
    }

    function bindCheck(checkId, paramKey, onChange) {
      const cb = el(checkId);
      if (!cb) return;
      cb.checked = !!app.params[paramKey];
      cb.addEventListener('change', () => {
        app.params[paramKey] = cb.checked;
        if (onChange) onChange(cb.checked);
      });
    }

    function bindNumber(inputId, paramKey) {
      const inp = el(inputId);
      if (!inp) return;
      inp.value = app.params[paramKey];
      inp.addEventListener('change', () => {
        app.params[paramKey] = parseFloat(inp.value);
      });
    }

    // ── Profile section ───────────────────────────────────────────────────────
    const nacaTypeRadios = document.querySelectorAll('input[name="nacaType"]');
    nacaTypeRadios.forEach(r => {
      r.checked = r.value === app.params.nacaType;
      r.addEventListener('change', () => {
        if (r.checked) app.params.nacaType = r.value;
        updateNacaHint();
      });
    });

    const nacaCodeInput = el('nacaCodeInput');
    if (nacaCodeInput) {
      nacaCodeInput.value = app.params.nacaCode;
      nacaCodeInput.addEventListener('change', () => {
        app.params.nacaCode = nacaCodeInput.value.trim();
        updateNacaHint();
      });
    }

    function updateNacaHint() {
      const hint = el('nacaHint');
      if (!hint) return;
      const type = app.params.nacaType;
      const code = app.params.nacaCode;
      if (type === '4') {
        const parsed = NS.Naca4.parse(code);
        hint.textContent = parsed.ok
          ? `NACA ${code}: m=${(parsed.m*100).toFixed(0)}%, p=${(parsed.p*100).toFixed(0)}%, t=${(parsed.t*100).toFixed(0)}%`
          : `Chyba: ${parsed.error}`;
        hint.style.color = parsed.ok ? '' : '#f05050';
      } else {
        const parsed = NS.Naca5.parse(code);
        hint.textContent = parsed.ok
          ? `NACA ${code}: CL≈${parsed.clDesign.toFixed(2)}, t=${(parsed.t*100).toFixed(0)}%`
          : `Chyba: ${parsed.error}`;
        hint.style.color = parsed.ok ? '' : '#f05050';
      }
    }

    bindSlider('alphaRange', 'alphaVal', 'alpha', 1);
    el('alphaRange')?.addEventListener('input', () => { /* rebuild on mouseup */ });
    el('alphaRange')?.addEventListener('change', () => app.rebuild());

    el('btnApplyProfile')?.addEventListener('click', () => {
      app.params.nacaCode = nacaCodeInput?.value.trim() || app.params.nacaCode;
      updateNacaHint();
      app.rebuild();
    });

    // ── Physics section ────────────────────────────────────────────────────────
    // Gamma and Mach require a full solver rebuild when changed
    bindSlider('gammaRange', 'gammaVal', 'gamma', 2);
    el('gammaRange')?.addEventListener('change', () => app.rebuild());
    bindSlider('machRange', 'machVal', 'mach', 2);
    el('machRange')?.addEventListener('change', () => app.rebuild());

    // ── Grid section ───────────────────────────────────────────────────────────
    bindNumber('niInput', 'ni');
    bindNumber('njInput', 'nj');
    el('niInput')?.addEventListener('change', () => app.rebuild());
    el('njInput')?.addEventListener('change', () => app.rebuild());

    bindSlider('teClusterRange', 'teClusterVal', 'teCluster', 1);
    el('teClusterRange')?.addEventListener('change', () => app.rebuild());

    bindSlider('leClusterRange', 'leClusterVal', 'leCluster', 1);
    el('leClusterRange')?.addEventListener('change', () => app.rebuild());

    el('btnRebuildGrid')?.addEventListener('click', () => app.rebuild());

    // ── Solver section ─────────────────────────────────────────────────────────
    bindSelect('fluxSelect', 'fluxScheme');
    bindSlider('cflRange', 'cflVal', 'cfl', 2);
    bindSlider('substepsRange', 'substepsVal', 'substeps', 0);

    const btnPlay = el('btnPlay');
    if (btnPlay) {
      btnPlay.textContent = app.params.paused ? 'Spustit' : 'Pauza';
      btnPlay.addEventListener('click', () => {
        app.params.paused = !app.params.paused;
        btnPlay.textContent = app.params.paused ? 'Spustit' : 'Pauza';
      });
    }

    el('btnStep')?.addEventListener('click', () => {
      app.params.paused = true;
      if (btnPlay) btnPlay.textContent = 'Spustit';
      app.solver?.step();
      app.renderFrame();
    });

    el('btnReset')?.addEventListener('click', () => {
      app.solver?.reset();
      app.renderFrame();
    });

    // ── Visualization section ──────────────────────────────────────────────────
    bindSelect('vizFieldSelect', 'vizField');
    bindSelect('vizModeSelect',  'vizMode');
    bindSelect('colormapSelect', 'colormap');
    bindSlider('contourRange', 'contourVal', 'contourLevels', 0);
    bindCheck('autoRangeCheck',  'autoRange');
    bindCheck('showGridCheck',   'showGrid', () => app.renderFrame());
    bindCheck('smoothShadingCheck', 'smoothShading');

    bindSlider('viewZoomRange', 'viewZoomVal', 'viewZoom', 2);
    el('viewZoomRange')?.addEventListener('input', () => {
      app.renderer?.invalidateLookup();
      app.renderFrame();
    });

    const simCanvas = app.canvas;
    simCanvas?.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      app.params.viewZoom = Math.min(6, Math.max(0.1, app.params.viewZoom * factor));
      const zoomEl = el('viewZoomRange');
      const zoomVal = el('viewZoomVal');
      if (zoomEl) zoomEl.value = app.params.viewZoom;
      if (zoomVal) zoomVal.textContent = app.params.viewZoom.toFixed(2);
      app.renderer?.invalidateLookup();
      app.renderFrame();
    }, { passive: false });

    // ── Metrics display (live, updated by main loop) ──────────────────────────
    NS.Controls.updateMetrics = function (forces) {
      if (!forces) return;
      const cl = el('metricCl'), cd = el('metricCd');
      if (cl) cl.textContent = forces.Cl.toFixed(4);
      if (cd) cd.textContent = forces.Cd.toFixed(4);
    };

    updateNacaHint();
  };
})(window.AFL);
