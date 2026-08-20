/*
 * app.js - propojení modelu, editoru, výpočtu a panelů.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD;
  var D = MBD.Dom;
  var Model = MBD.Model;
  var Sim = MBD.Simulation;

  var app = {
    model: null,
    vp: null,
    editor: null,
    selection: [],
    tool: 'select',
    mode: 'edit',
    options: { grid: true, snap: true, vel: true, acc: false, reac: true, trace: true },
    result: null,
    resultStale: false,
    frameIndex: 0,
    time: 0,
    playing: false,
    plotKeys: [],
    diag: null,
    messages: [],
    run: null,
    scales: {},
    traces: [],
    hintTimer: null
  };
  MBD.app = app;

  var ui = {};

  // -------------------------------------------------------------------- start

  function init() {
    ['tree', 'inspector', 'simsettings', 'status', 'view', 'hint', 'coords', 'signal-list',
      'charts', 'time-slider', 'time-label', 'progress', 'examples-menu'].forEach(function (id) {
        ui[id] = document.getElementById(id);
      });

    app.vp = MBD.Viewport.create(ui.view);
    ui.view.tabIndex = 0;
    app.editor = MBD.Editor.create(app);

    bindToolbar();
    bindPlayer();
    bindSplitter();
    bindKeys();
    buildExamplesMenu();

    var ro = new ResizeObserver(function () { app.vp.resize(); app.render(); });
    ro.observe(document.getElementById('canvas-wrap'));

    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { MBD.Plots.redrawAll(ui.charts); }, 120);
    });

    loadModel(MBD.Examples.build('fourbar'));
    setTool('select');
  }

  function bindToolbar() {
    document.querySelectorAll('#tools .tool').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });

    document.getElementById('btn-new').addEventListener('click', function () {
      if (app.model.bodies.length > 1 && !confirm('Zahodit současný model?')) return;
      loadModel(Model.create());
    });
    document.getElementById('btn-save').addEventListener('click', function () {
      D.download(sanitize(app.model.name) + '.json', MBD.Serialize.toJSON(app.model));
    });
    document.getElementById('btn-open').addEventListener('click', function () {
      document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          loadModel(MBD.Serialize.fromJSON(rd.result));
          setHint('Model načten: ' + app.model.name);
        } catch (e) {
          message('Soubor nelze načíst: ' + e.message, 'err');
        }
      };
      rd.readAsText(f);
      ev.target.value = '';
    });

    var exBtn = document.getElementById('btn-examples');
    exBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ui['examples-menu'].classList.toggle('open');
    });
    document.addEventListener('click', function () { ui['examples-menu'].classList.remove('open'); });

    document.getElementById('btn-assemble').addEventListener('click', assemble);
    document.getElementById('btn-kinematics').addEventListener('click', function () {
      setMode(app.mode === 'kinematics' ? 'edit' : 'kinematics');
    });
    document.getElementById('btn-run').addEventListener('click', runAnalysis);
    document.getElementById('btn-stop').addEventListener('click', stopAnalysis);
    document.getElementById('btn-fit').addEventListener('click', function () { fitView(); });

    [['opt-grid', 'grid'], ['opt-snap', 'snap'], ['opt-vel', 'vel'], ['opt-acc', 'acc'],
      ['opt-reac', 'reac'], ['opt-trace', 'trace']].forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        el.checked = app.options[pair[1]];
        el.addEventListener('change', function () {
          app.options[pair[1]] = el.checked;
          if (pair[1] === 'trace') computeTraces();
          app.render();
        });
      });

    document.getElementById('btn-csv').addEventListener('click', function () {
      if (!app.result) return;
      var keys = app.plotKeys.length ? app.plotKeys : null;
      D.download(sanitize(app.model.name) + '-vysledky.csv',
        MBD.Serialize.resultsToCSV(app.result, keys), 'text/csv');
    });
    document.getElementById('btn-clear-sig').addEventListener('click', function () {
      app.plotKeys = [];
      app.refreshPlots();
    });
  }

  function buildExamplesMenu() {
    var menu = ui['examples-menu'];
    D.clear(menu);
    MBD.Examples.list.forEach(function (e) {
      var b = D.el('button', {}, [
        D.el('span', { text: e.name }),
        D.el('small', { text: e.description })
      ]);
      b.addEventListener('click', function () {
        menu.classList.remove('open');
        loadModel(e.build());
        setHint(e.name + ': ' + e.description);
      });
      menu.appendChild(b);
    });
  }

  function bindPlayer() {
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-rewind').addEventListener('click', function () {
      app.playing = false;
      updatePlayBtn();
      app.seekIndex(0);
    });
    ui['time-slider'].addEventListener('input', function () {
      app.playing = false;
      updatePlayBtn();
      app.seekIndex(parseInt(ui['time-slider'].value, 10));
    });
  }

  function bindSplitter() {
    var sp = document.getElementById('splitter');
    var appEl = document.getElementById('app');
    var dragging = false;
    sp.addEventListener('pointerdown', function (ev) {
      dragging = true;
      sp.setPointerCapture(ev.pointerId);
    });
    sp.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var h = Math.max(140, window.innerHeight - ev.clientY - 3);
      appEl.style.setProperty('--results-h', h + 'px');
      app.vp.resize();
      app.render();
      MBD.Plots.redrawAll(ui.charts);
      // Když panel grafů naroste přes výšku okna, posuneme stránku tak,
      // aby zůstal rozdělovací pruh pod kurzorem – simulační okno sjede nahoru.
      var dy = sp.getBoundingClientRect().top - ev.clientY;
      if (Math.abs(dy) > 1) window.scrollBy(0, dy);
    });
    sp.addEventListener('pointerup', function () { dragging = false; });
  }

  function bindKeys() {
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      var map = { v: 'select', r: 'rod', o: 'slider', '1': 'revolute', '2': 'prismatic', m: 'torque', f: 'force' };
      var k = ev.key.toLowerCase();
      if (k === 'k') { setMode(app.mode === 'kinematics' ? 'edit' : 'kinematics'); ev.preventDefault(); return; }
      if (map[k]) { setTool(map[k]); ev.preventDefault(); return; }
      if (ev.key === 'Escape') {
        if (app.mode === 'kinematics') { setMode('edit'); ev.preventDefault(); return; }
        setTool('select'); app.setSelection([]); return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { app.deleteSelection(); ev.preventDefault(); return; }
      if (ev.key === ' ') {
        if (app.mode === 'kinematics') { ev.preventDefault(); return; }
        togglePlay(); ev.preventDefault(); return;
      }
      if (ev.key === 'ArrowRight' && app.result) { app.seekIndex(app.frameIndex + 1); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft' && app.result) { app.seekIndex(app.frameIndex - 1); ev.preventDefault(); }
    });
  }

  // --------------------------------------------------------------------- model

  function loadModel(model) {
    stopAnalysis();
    app.mode = 'edit';
    updateModeBtn();
    updateViewCursor();
    app.model = model;
    app.selection = [];
    app.result = null;
    app.resultStale = false;
    app.plotKeys = [];
    app.frameIndex = 0;
    app.time = 0;
    app.messages = [];
    app.traces = [];
    app.playing = false;
    updatePlayer();
    fitView();
    app.modelChanged();
    MBD.Plots.renderList(ui['signal-list'], app);
    MBD.Plots.renderCharts(ui.charts, app);
  }

  function setTool(tool) {
    if (app.mode === 'kinematics' && tool !== 'select') setMode('edit');
    app.tool = tool;
    document.querySelectorAll('#tools .tool').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    setHint(app.mode === 'kinematics' ? MBD.Editor.HINTS.kinematics : (MBD.Editor.HINTS[tool] || ''));
    updateViewCursor();
    app.render();
  }

  function updateViewCursor() {
    ui.view.style.cursor = app.mode === 'kinematics' ? 'grab'
      : (app.tool === 'select' ? 'default' : 'crosshair');
  }

  function setMode(mode) {
    if (mode === app.mode) return;
    app.mode = mode;
    updateModeBtn();
    if (mode === 'kinematics') {
      stopAnalysis();
      app.playing = false;
      updatePlayBtn();
      setTool('select');
      tryAssemble(true);
      setHint(MBD.Editor.HINTS.kinematics);
      updateViewCursor();
    } else {
      setHint(MBD.Editor.HINTS[app.tool] || '');
      updateViewCursor();
    }
    MBD.Inspector.renderStatus(ui.status, app);
    app.render();
  }

  function updateModeBtn() {
    var b = document.getElementById('btn-kinematics');
    if (!b) return;
    b.classList.toggle('kin-on', app.mode === 'kinematics');
    b.classList.toggle('active', app.mode === 'kinematics');
  }

  app.setSelection = function (ids) {
    app.selection = ids.slice();
    MBD.Tree.render(ui.tree, app);
    MBD.Inspector.renderProperties(ui.inspector, app);
    computeTraces();
    app.render();
  };

  app.modelChanged = function () {
    if (app.result) app.resultStale = true;
    updateDiagnostics();
    MBD.Tree.render(ui.tree, app);
    MBD.Inspector.renderProperties(ui.inspector, app);
    MBD.Inspector.renderSim(ui.simsettings, app);
    MBD.Inspector.renderStatus(ui.status, app);
    app.render();
  };

  /** Lehká varianta pro průběh tažení (bez přestavby panelů). */
  app.modelMoved = function () { app.render(); };

  app.deleteSelection = function () {
    if (!app.selection.length) return;
    var n = 0;
    app.selection.forEach(function (id) { if (Model.remove(app.model, id)) n++; });
    app.selection = [];
    if (n) setHint('Smazáno prvků: ' + n);
    app.modelChanged();
  };

  function updateDiagnostics() {
    app.messages = [];
    try {
      var sys = MBD.System.build(app.model);
      var st = MBD.System.stateFromModel(sys);
      app.diag = MBD.Analysis.dofAnalysis(sys, st.q, 0);
      MBD.System.scatter(sys, st.q, null);
      MBD.System.evaluateConstraints(sys, 0);
      app.diag.residual = MBD.Dynamics.violation(sys);
      sys.warnings.forEach(function (w) { app.messages.push({ text: w, level: 'warn' }); });
    } catch (e) {
      app.diag = null;
      app.messages.push({ text: 'Chyba modelu: ' + e.message, level: 'err' });
    }
    if (app.resultStale) {
      app.messages.push({ text: 'Grafy patří k předchozí verzi modelu – spusťte analýzu znovu.', level: 'warn' });
    }
  }

  // ------------------------------------------------------------------ zobrazení

  function modelBBox() {
    var pts = [];
    app.model.bodies.forEach(function (b) {
      if (b.type === 'ground') return;
      if (b.type === 'rod') {
        var e = app.editor.rodEndsGlobal(b);
        pts.push(e[0], e[1]);
      } else {
        pts.push([b.x - b.width, b.y - b.height], [b.x + b.width, b.y + b.height]);
      }
    });
    app.model.joints.forEach(function (j) { pts.push(Model.jointPoint(app.model, j)); });
    if (app.result && !app.resultStale) {
      app.result.frames.forEach(function (f) {
        for (var i = 0; i < app.result.nBodies; i++) pts.push([f.pose[3 * i], f.pose[3 * i + 1]]);
      });
    }
    if (!pts.length) return [-0.5, -0.5, 0.5, 0.5];
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (p) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    });
    return [x0, y0, x1, y1];
  }

  function fitView() {
    app.vp.resize();
    app.vp.fit(modelBBox());
    app.render();
  }

  app.currentFrame = function () {
    if (!app.result || app.resultStale) return null;
    return app.result.frames[Math.max(0, Math.min(app.result.frames.length - 1, app.frameIndex))] || null;
  };

  function animPoses() {
    var f = app.currentFrame();
    if (!f) return null;
    var poses = {};
    app.result.bodyIds.forEach(function (id, i) {
      poses[id] = [f.pose[3 * i], f.pose[3 * i + 1], f.pose[3 * i + 2]];
    });
    return poses;
  }

  app.render = function () {
    var kin = app.mode === 'kinematics';
    var f = kin ? null : app.currentFrame();
    MBD.Renderer.draw(app.vp, {
      model: app.model,
      poses: kin ? null : animPoses(),
      frame: f,
      result: (!kin && app.result && !app.resultStale) ? app.result : null,
      selection: app.selection,
      hover: app.editor.hoverId,
      preview: app.editor.previewScene(),
      options: app.options,
      scales: app.scales,
      traces: kin ? [] : app.traces,
      time: f ? f.t : 0
    });
  };

  app.setHint = function (text, warn) { setHint(text, warn); };

  function setHint(text, warn) {
    clearTimeout(app.hintTimer);
    ui.hint.textContent = text || '';
    ui.hint.style.color = warn ? '#f0b350' : '';
    ui.hint.style.display = text ? '' : 'none';
    if (warn) {
      app.hintTimer = setTimeout(function () {
        setHint(app.mode === 'kinematics' ? MBD.Editor.HINTS.kinematics : (MBD.Editor.HINTS[app.tool] || ''));
      }, 3500);
    }
  }

  app.showCoords = function (p) {
    ui.coords.textContent = 'x = ' + p[0].toFixed(4) + ' m   y = ' + p[1].toFixed(4) + ' m';
  };

  // -------------------------------------------------------- sestavení mechanismu

  function assemble() {
    tryAssemble(false);
  }

  function tryAssemble(quiet) {
    try {
      var sys = MBD.System.build(app.model);
      var st = MBD.System.stateFromModel(sys);
      var r = MBD.Analysis.assemble(sys, st.q, 0);
      MBD.Analysis.velocity(sys, st.q, st.qd, 0);
      MBD.System.stateToModel(sys, st.q, st.qd);
      app.modelChanged();
      if (quiet) return r;
      if (r.converged) setHint('Mechanismus sestaven (' + r.iterations + ' iterací, zbytek ' +
        r.residual.toExponential(1) + ').');
      else setHint('Sestavení nekonvergovalo (zbytek ' + r.residual.toExponential(1) +
        '). Zkontrolujte polohy vazeb.', true);
      return r;
    } catch (e) {
      message('Sestavení selhalo: ' + e.message, 'err');
      return null;
    }
  }

  // ------------------------------------------------------------------- analýza

  function runAnalysis() {
    if (app.mode === 'kinematics') setMode('edit');
    stopAnalysis();
    if (app.model.bodies.length < 2) {
      setHint('Model neobsahuje žádné pohyblivé těleso.', true);
      return;
    }
    var run;
    try {
      run = Sim.prepare(app.model);
    } catch (e) {
      message('Analýzu nelze spustit: ' + e.message, 'err');
      return;
    }
    if (run.error) { message(run.error, 'err'); return; }

    app.run = run;
    app.result = null;
    app.resultStale = false;
    app.playing = false;
    document.getElementById('btn-run').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    showProgress(0, 'Výpočet…');

    var chunk = 120;
    function step() {
      if (!app.run) return;
      var t0 = performance.now();
      Sim.advance(run, chunk);
      var dt = performance.now() - t0;
      if (dt < 20) chunk = Math.min(20000, Math.round(chunk * 1.6));
      else if (dt > 45) chunk = Math.max(10, Math.round(chunk * 0.6));
      showProgress(Sim.progress(run), 'Výpočet… ' + Math.round(100 * Sim.progress(run)) + ' %');
      if (run.done) finish(run);
      else setTimeout(step, 0);
    }
    setTimeout(step, 0);
  }

  function stopAnalysis() {
    if (app.run && !app.run.done) {
      app.run.done = true;
      finish(app.run);
    }
    app.run = null;
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    hideProgress();
  }

  function finish(run) {
    app.run = null;
    hideProgress();
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-stop').disabled = true;

    app.setResult(run.result);
    updateDiagnostics();
    (run.warnings || []).forEach(function (w) { app.messages.push({ text: w, level: 'warn' }); });
    if (run.error) app.messages.push({ text: run.error, level: 'err' });

    MBD.Inspector.renderStatus(ui.status, app);
    MBD.Inspector.renderProperties(ui.inspector, app);
    MBD.Plots.renderList(ui['signal-list'], app);
    MBD.Plots.renderCharts(ui.charts, app);
    updatePlayer();
    document.getElementById('btn-csv').disabled = false;
    if (!run.error) {
      setHint('Analýza dokončena: ' + app.result.frames.length + ' snímků, ' +
        'konec t = ' + D.fmt(app.result.times[app.result.times.length - 1], 3) + ' s. ' +
        'Mezerníkem spustíte animaci.');
      app.playing = true;
      updatePlayBtn();
      lastTick = performance.now();
      requestAnimationFrame(tick);
    }
    app.render();
  }

  /** Převezme výsledek analýzy: měřítka vektorů, trajektorie, předvolba grafů. */
  app.setResult = function (result) {
    app.result = result;
    app.resultStale = false;
    app.frameIndex = 0;
    app.time = result.times[0] || 0;
    computeScales();
    computeTraces();
    autoSelectPlots();
  };

  function computeScales() {
    var res = app.result;
    var mv = 0, ma = 0, mf = 0;
    res.frames.forEach(function (f) {
      for (var i = 0; i < res.nBodies; i++) {
        mv = Math.max(mv, Math.hypot(f.vel[3 * i], f.vel[3 * i + 1]));
        ma = Math.max(ma, Math.hypot(f.acc[3 * i], f.acc[3 * i + 1]));
      }
      for (var k = 0; k < res.jointOrder.length; k++) {
        mf = Math.max(mf, Math.hypot(f.reac[3 * k], f.reac[3 * k + 1]));
      }
    });
    app.scales = { vel: mv, acc: ma, reac: mf };
  }

  function computeTraces() {
    app.traces = [];
    if (!app.result || app.resultStale || !app.options.trace) return;
    var res = app.result;
    var ids = app.selection.filter(function (id) {
      var b = Model.bodyById(app.model, id);
      return b && b.type !== 'ground';
    });
    if (!ids.length) {
      ids = app.model.bodies.filter(function (b) { return b.type !== 'ground'; })
        .map(function (b) { return b.id; });
    }
    ids.forEach(function (id, n) {
      var i = res.bodyIds.indexOf(id);
      if (i < 0) return;
      var pts = res.frames.map(function (f) { return [f.pose[3 * i], f.pose[3 * i + 1]]; });
      app.traces.push({ points: pts, color: n === 0 ? 'rgba(78,161,255,.6)' : 'rgba(120,140,170,.35)' });
    });
  }

  /** Po analýze předvybere užitečné výstupy (pohon nebo kinematika). */
  function autoSelectPlots() {
    if (app.plotKeys.length) return;
    var res = app.result;
    var keys = [];
    res.signals.forEach(function (s) {
      if (s.key.indexOf('D:') === 0 && (s.key.slice(-3) === '/Md' || s.key.slice(-3) === '/Fd')) keys.push(s.key);
    });
    if (!keys.length) {
      var firstBody = res.signalGroups.filter(function (g) { return g.kind === 'body'; })[0];
      if (firstBody) {
        ['/phi', '/omega'].forEach(function (suf) {
          res.signals.forEach(function (s) {
            if (s.group === firstBody.id && s.key.slice(-suf.length) === suf) keys.push(s.key);
          });
        });
      }
    }
    var reac = res.signalGroups.filter(function (g) { return g.kind === 'reaction'; })[0];
    if (reac) {
      res.signals.forEach(function (s) {
        if (s.group === reac.id && s.key.slice(-2) === '/F') keys.push(s.key);
      });
    }
    app.plotKeys = keys;
  }

  app.togglePlot = function (key, on) {
    var i = app.plotKeys.indexOf(key);
    if (on && i < 0) app.plotKeys.push(key);
    if (!on && i >= 0) app.plotKeys.splice(i, 1);
  };

  app.refreshPlots = function () {
    MBD.Plots.renderList(ui['signal-list'], app);
    MBD.Plots.renderCharts(ui.charts, app);
  };

  // ------------------------------------------------------------------- animace

  var lastTick = 0;

  function togglePlay() {
    if (!app.result || app.resultStale) return;
    app.playing = !app.playing;
    updatePlayBtn();
    if (app.playing) {
      if (app.frameIndex >= app.result.frames.length - 1) app.frameIndex = 0;
      lastTick = performance.now();
      requestAnimationFrame(tick);
    }
  }

  function updatePlayBtn() {
    document.getElementById('btn-play').textContent = app.playing ? '❚❚' : '▶';
  }

  function tick(now) {
    if (!app.playing || !app.result || app.resultStale) return;
    var speed = parseFloat(document.getElementById('speed').value) || 1;
    var dt = Math.min(0.1, (now - lastTick) / 1000) * speed;
    lastTick = now;
    var times = app.result.times;
    var t = (times[app.frameIndex] || 0) + dt;
    if (t >= times[times.length - 1]) {
      app.seekIndex(times.length - 1);
      app.playing = false;
      updatePlayBtn();
      return;
    }
    var i = app.frameIndex;
    while (i < times.length - 1 && times[i] < t) i++;
    app.seekIndex(i, true);
    requestAnimationFrame(tick);
  }

  var lastPanels = 0;

  app.seekIndex = function (i, keepPlaying) {
    if (!app.result) return;
    var n = app.result.frames.length;
    app.frameIndex = Math.max(0, Math.min(n - 1, i));
    app.time = app.result.times[app.frameIndex];
    ui['time-slider'].value = app.frameIndex;
    ui['time-label'].textContent = 't = ' + app.time.toFixed(4) + ' s';
    if (!keepPlaying) { app.playing = false; updatePlayBtn(); }
    // během přehrávání se panely a grafy obnovují méně často (výkon)
    var now = performance.now();
    if (!keepPlaying || now - lastPanels > 90) {
      lastPanels = now;
      MBD.Inspector.renderProperties(ui.inspector, app);
      MBD.Plots.redrawAll(ui.charts);
    }
    app.render();
  };

  function updatePlayer() {
    var has = !!(app.result && app.result.frames.length > 1);
    ui['time-slider'].disabled = !has;
    ui['time-slider'].max = has ? app.result.frames.length - 1 : 0;
    ui['time-slider'].value = 0;
    document.getElementById('btn-play').disabled = !has;
    document.getElementById('btn-rewind').disabled = !has;
    document.getElementById('btn-csv').disabled = !app.result;
    ui['time-label'].textContent = 't = ' + (app.result ? app.result.times[0] : 0).toFixed(4) + ' s';
    updatePlayBtn();
  }

  // ------------------------------------------------------------------- pomocné

  function showProgress(frac, text) {
    ui.progress.classList.remove('hidden');
    ui.progress.querySelector('.bar').style.width = Math.round(frac * 100) + '%';
    ui.progress.querySelector('span').textContent = text || '';
  }
  function hideProgress() { ui.progress.classList.add('hidden'); }

  function message(text, level) {
    app.messages.push({ text: text, level: level || 'warn' });
    MBD.Inspector.renderStatus(ui.status, app);
    setHint(text, true);
  }

  function sanitize(s) {
    return String(s || 'model').replace(/[^\w\-. ]+/g, '_').trim() || 'model';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
