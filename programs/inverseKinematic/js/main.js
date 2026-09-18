'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const cv = $('cv');
  const R = new Renderer(cv);
  const STORE_KEY = 'mechSynth.curve.v1';

  const PRESETS = {
    heart: { degree: 3, pts: [[0, -170], [0, -170], [0, -170], [90, -90], [195, 20], [160, 150], [60, 170], [0, 95], [0, 95], [-60, 170], [-160, 150], [-195, 20], [-90, -90]] },
    egg: { degree: 3, pts: [[0, -140], [140, -110], [170, 40], [60, 160], [-80, 150], [-170, 20], [-130, -110]] },
    bean: { degree: 3, pts: [[-170, 0], [-130, 120], [0, 150], [130, 120], [170, 0], [110, -110], [0, -30], [-110, -110]] },
    dshape: { degree: 3, pts: [[-160, -80], [-60, -80], [60, -80], [160, -80], [190, 50], [0, 170], [-190, 50]] },
    drop: { degree: 3, pts: [[0, 190], [0, 190], [0, 190], [110, 40], [120, -110], [0, -170], [-120, -110], [-110, 40]] },
    star: { degree: 2, pts: Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 80 : 200, a = Math.PI / 2 + i * Math.PI / 5;
      return [r * Math.cos(a), r * Math.sin(a)];
    }) },
    eight: { degree: 3, pts: [[150, -100], [240, 0], [150, 100], [-150, -100], [-240, 0], [-150, 100]] },
  };

  const state = {
    ctrl: [], degree: 3, sel: -1, hover: -1,
    mode: 'edit',            // edit | solving | sim
    solution: null, target: null, traced: null, opt: null, stages: [], preview: null,
    theta: 0, playing: true, speed: 0.2,
    spaceDown: false,
  };

  // ---------------- curve management ----------------
  function setCurve(pts, degree) {
    state.ctrl = pts.map(p => Array.isArray(p) ? { x: p[0], y: p[1], w: 1 } : { x: p.x, y: p.y, w: p.w || 1 });
    state.degree = degree || 3;
    $('degree').value = String(state.degree);
    state.sel = -1;
    curveChanged();
    fitView();
  }

  function curveChanged() {
    invalidate();
    $('ptCount').textContent = state.ctrl.length + ' bodů';
    updateWeightUI();
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ degree: state.degree, ctrl: state.ctrl })); } catch (e) { /* ignore */ }
  }

  function invalidate() {
    if (state.opt) state.opt.cancel();
    state.opt = null;
    state.preview = null;
    state.solution = null;
    state.traced = null;
    if (state.mode !== 'edit') setMode('edit');
    $('tabSim').disabled = true;
    $('resultSec').hidden = true;
    $('progress').hidden = true;
    $('progText').textContent = '';
  }

  function curvePoints(n = 600) { return NURBS.sample(state.ctrl, state.degree, n); }

  function insertPoint(w) {
    const n = state.ctrl.length;
    if (n < 3) { state.ctrl.push({ x: w.x, y: w.y, w: 1 }); return n; }
    const i = NURBS.closestEdge(state.ctrl, w);
    state.ctrl.splice(i + 1, 0, { x: w.x, y: w.y, w: 1 });
    return i + 1;
  }

  function removePoint(i) {
    if (i < 0 || i >= state.ctrl.length) return;
    state.ctrl.splice(i, 1);
    state.sel = -1;
    curveChanged();
  }

  function updateWeightUI() {
    const p = state.ctrl[state.sel];
    $('weight').disabled = !p;
    $('weight').value = p ? Math.log10(p.w) : 0;
    $('weightVal').textContent = p ? p.w.toFixed(2) : '–';
  }

  // ---------------- modes & view ----------------
  function setMode(m) {
    state.mode = m;
    $('tabEdit').classList.toggle('active', m === 'edit');
    $('tabSim').classList.toggle('active', m !== 'edit');
    const hints = {
      edit: 'Klik = nový bod · tažení = posun · pravé tlačítko = smazat · Shift+kolečko = váha · kolečko = zoom',
      solving: 'Hledám rozměry mechanismu…',
      sim: 'Tažení = posun pohledu · kolečko = zoom · P = pauza',
    };
    $('hint').textContent = hints[m];
  }

  function fitView() {
    if (state.mode !== 'edit' && state.solution) {
      R.fit([...state.solution.extentPoints(), ...state.target]);
    } else if (state.ctrl.length) {
      R.fit([...state.ctrl, ...curvePoints(200)], 90);
    } else {
      R.view.scale = 1; R.view.ox = R.w / 2; R.view.oy = R.h / 2;
    }
  }

  // ---------------- solving ----------------
  function buildTarget() {
    let t = G.resampleClosed(curvePoints(3000), 512);
    if (G.signedArea(t) < 0) t = t.reverse();
    return t;
  }

  function solve() {
    if (state.ctrl.length < 3) { $('progText').textContent = 'Křivka potřebuje alespoň 3 řídicí body.'; return; }
    state.target = buildTarget();
    state.opt = new Linkage.Synthesis(state.target, +$('maxLevel').value, +$('budget').value);
    state.solution = null;
    state.stages = [];
    setMode('solving');
    $('progress').hidden = false;
    $('resultSec').hidden = true;
    $('btnSolve').textContent = 'Zastavit ■';
  }

  function stopSolving() {
    if (!state.opt) return;
    state.opt.cancel();
    finishSynthesis();
  }

  // Build world solutions for every finished stage and pick the default one:
  // the simplest mechanism whose mean deviation is within 15 % of the best.
  function finishSynthesis() {
    const syn = state.opt;
    state.opt = null;
    $('btnSolve').textContent = 'Solve ▶';
    $('progress').hidden = true;
    $('progText').textContent = '';
    if (!syn.results.length) { setMode('edit'); $('progText').textContent = 'Nepodařilo se najít sestavitelný mechanismus.'; return; }
    const tgt = state.target.filter((_, i) => i % 2 === 0);
    state.stages = syn.results.map(r => {
      const sol = Linkage.makeSolution(r.level, r.genome, syn.tf);
      sol.traced = traceOf(sol);
      sol.dev = G.shapeDeviation(tgt, sol.traced);
      return sol;
    });
    const bestMean = Math.min(...state.stages.map(s => s.dev.mean));
    const pick = state.stages.find(s => s.dev.mean <= bestMean * 1.15 + 0.001);
    showSolution(pick, true);
  }

  function traceOf(sol) {
    const N = 720, out = [];
    for (let i = 0; i < N; i++) out.push(sol.pen(2 * Math.PI * i / N) || out[i - 1]);
    return out;
  }

  function showSolution(sol, refit) {
    state.solution = sol;
    state.traced = sol.traced;
    $('tabSim').disabled = false;
    setMode('sim');
    if (refit) fitView();
    showResult();
  }

  function devClass(v) { return v < 0.015 ? 'good' : v < 0.04 ? 'warn' : 'bad'; }
  const fmt = (v, d = 1) => v.toFixed(d);
  const deg = a => ((a * 180 / Math.PI) % 360 + 360) % 360;

  function showResult() {
    const sol = state.solution, d = sol.dev;
    let html = `<div class="stats">
      <div class="stat ${devClass(d.mean)}"><b>${fmt(d.mean * 100, 2)} %</b><span>průměrná odchylka</span></div>
      <div class="stat ${devClass(d.max / 3)}"><b>${fmt(d.max * 100, 2)} %</b><span>max. odchylka</span></div>
    </div>`;
    if (state.stages.length > 1) {
      html += `<table class="params stages"><tr><th>varianta</th><th>průměr</th><th>max</th></tr>` +
        state.stages.map((s, i) => `<tr data-stage="${i}" class="${s === sol ? 'sel' : ''}"><td>${s.name}</td>
          <td>${fmt(s.dev.mean * 100, 2)} %</td><td>${fmt(s.dev.max * 100, 2)} %</td></tr>`).join('') +
        `</table><p class="note">Kliknutím na řádek zobrazíte jinou variantu.</p>`;
    }
    html += `<p class="note"><b>${sol.name}</b> (${sol.topology()}).<br>
      ${sol.nLinks} členů včetně rámu, ${sol.nJoints} rotačních kloubů,
      stupeň volnosti 3·(${sol.nLinks}−1) − 2·${sol.nJoints} = <b>1</b>. Hnací je klika A–B.</p>`;
    html += `<table class="params"><tr><th>člen</th><th>rozměry</th></tr>` +
      sol.dimensions().map(r => `<tr><td><span class="swatch" style="background:${BODY_COLORS[r.body]}"></span>${r.name}</td>
        <td>${r.sides.join('<br>')}</td></tr>`).join('') + `</table>`;
    html += `<p class="note">Pevné čepy: ${sol.groundPivots().map(g => `${g.label} [${fmt(g.p.x)}, ${fmt(g.p.y)}]`).join(', ')}</p>`;
    $('result').innerHTML = html;
    $('resultSec').hidden = false;
    $('result').querySelectorAll('tr[data-stage]').forEach(tr => tr.addEventListener('click', () => {
      showSolution(state.stages[+tr.dataset.stage], false);
    }));
  }

  // ---------------- input ----------------
  function localPos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  function hitTest(px, py) {
    let best = -1, bd = 12 * 12;
    state.ctrl.forEach((p, i) => {
      const dx = R.sx(p.x) - px, dy = R.sy(p.y) - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  let drag = null;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    const { x, y } = localPos(e);
    cv.setPointerCapture(e.pointerId);
    if (e.button === 1 || state.spaceDown || (e.button === 0 && state.mode !== 'edit')) {
      drag = { type: 'pan', x, y, ox: R.view.ox, oy: R.view.oy };
      cv.style.cursor = 'grabbing';
      return;
    }
    if (state.mode !== 'edit') return;
    const hit = hitTest(x, y);
    if (e.button === 2) { if (hit >= 0) removePoint(hit); return; }
    if (e.button !== 0) return;
    if (hit >= 0) state.sel = hit;
    else { state.sel = insertPoint(R.toWorld(x, y)); curveChanged(); }
    drag = { type: 'pt', idx: state.sel };
    updateWeightUI();
  });
  cv.addEventListener('pointermove', e => {
    const { x, y } = localPos(e);
    if (drag && drag.type === 'pan') {
      R.view.ox = drag.ox + x - drag.x; R.view.oy = drag.oy + y - drag.y;
    } else if (drag && drag.type === 'pt') {
      const w = R.toWorld(x, y), p = state.ctrl[drag.idx];
      p.x = w.x; p.y = w.y;
      curveChanged();
    } else if (state.mode === 'edit') {
      state.hover = hitTest(x, y);
      cv.style.cursor = state.spaceDown ? 'grab' : state.hover >= 0 ? 'move' : 'crosshair';
    } else {
      cv.style.cursor = 'grab';
    }
  });
  const endDrag = () => { drag = null; cv.style.cursor = ''; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const { x, y } = localPos(e);
    const dir = e.deltaY < 0 ? 1 : -1;
    if (e.shiftKey && state.mode === 'edit' && state.sel >= 0) {
      const p = state.ctrl[state.sel];
      p.w = Math.min(10, Math.max(0.1, p.w * Math.pow(1.12, dir)));
      curveChanged();
    } else {
      R.zoomAt(x, y, Math.pow(1.12, dir));
    }
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { state.spaceDown = true; e.preventDefault(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.mode === 'edit' && state.sel >= 0) removePoint(state.sel);
    if (e.key === 'p' || e.key === 'P') togglePlay();
    if (e.key === 'Enter') solve();
    if (e.key === 'Escape') { if (state.mode === 'solving') stopSolving(); else { state.sel = -1; updateWeightUI(); } }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') state.spaceDown = false; });

  // ---------------- panel wiring ----------------
  $('preset').addEventListener('change', e => {
    const p = PRESETS[e.target.value];
    if (p) setCurve(p.pts, p.degree);
    e.target.value = '';
  });
  $('btnClear').addEventListener('click', () => { state.ctrl = []; state.sel = -1; curveChanged(); fitView(); });
  $('degree').addEventListener('change', e => { state.degree = +e.target.value; curveChanged(); });
  $('weight').addEventListener('input', e => {
    const p = state.ctrl[state.sel];
    if (!p) return;
    p.w = Math.pow(10, +e.target.value);
    curveChanged();
  });
  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ degree: state.degree, ctrl: state.ctrl }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'krivka.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('btnImport').addEventListener('click', () => $('fileImport').click());
  $('fileImport').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.ctrl) || data.ctrl.length < 3) throw new Error('bad file');
      setCurve(data.ctrl, data.degree);
    } catch (err) { alert('Soubor se nepodařilo načíst.'); }
    e.target.value = '';
  });

  $('btnSolve').addEventListener('click', () => state.mode === 'solving' ? stopSolving() : solve());
  function togglePlay() {
    state.playing = !state.playing;
    $('btnPlay').textContent = state.playing ? '⏸ Pauza' : '▶ Přehrát';
  }
  $('btnPlay').addEventListener('click', togglePlay);
  $('btnFit').addEventListener('click', fitView);
  $('speed').addEventListener('input', e => {
    state.speed = +e.target.value;
    $('speedVal').textContent = state.speed.toFixed(2) + ' ot/s';
  });
  $('tabEdit').addEventListener('click', () => { if (state.mode === 'solving') stopSolving(); setMode('edit'); });
  $('tabSim').addEventListener('click', () => { if (state.solution) { setMode('sim'); } });

  // ---------------- main loop ----------------
  const opts = () => ({
    deco: $('showDeco').checked,
    paths: $('showPaths').checked,
    labels: $('showLabels').checked,
  });

  function drawMechanism(sol, th, o = opts()) { R.mechanism(sol, th, o); }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.playing && state.mode !== 'edit') state.theta = (state.theta + 2 * Math.PI * state.speed * dt) % (2 * Math.PI);

    if (state.mode === 'solving' && state.opt) {
      const syn = state.opt, cb = syn.currentBest();
      $('progBar').style.width = (syn.progress() * 100).toFixed(1) + '%';
      $('progText').textContent = `${syn.currentLevel()}členný mechanismus · ${syn.nIslands > 1 && syn.usingWorkers ? syn.nIslands + ' vláken · ' : ''}` +
        `${syn.evals().toLocaleString('cs')} návrhů` + (cb ? ` · cena ${cb.cost.toFixed(4)}` : '');
      if (syn.done) finishSynthesis();
    }

    R.begin();
    const c = R.ctx;
    if (state.mode === 'edit') {
      if (state.ctrl.length >= 3) {
        const pts = curvePoints();
        c.save(); c.shadowColor = 'rgba(124,196,255,0.6)'; c.shadowBlur = 8;
        R.curve(pts, COLORS.accent, 2.5);
        c.restore();
      }
      R.controlNet(state.ctrl, state.sel, state.hover);
      $('hud').textContent = state.ctrl.length < 3 ? 'Klikáním přidejte alespoň 3 řídicí body' : '';
    } else if (state.mode === 'solving') {
      R.curve(state.target, 'rgba(232,236,241,0.45)', 2, [7, 6]);
      const cb = state.opt && state.opt.currentBest();
      if (cb && (!state.preview || state.preview.genome !== cb.genome)) {
        state.preview = Linkage.makeSolution(cb.level, cb.genome, state.opt.tf);
        state.preview.traced = traceOf(state.preview);
      }
      if (cb && state.preview) {
        R.curve(state.preview.traced, 'rgba(158,240,184,0.8)', 2);
        c.save(); c.globalAlpha = 0.85; drawMechanism(state.preview, now / 1000 * 2, { deco: false }); c.restore();
      }
      $('hud').textContent = 'Optimalizace…';
    } else if (state.solution) {
      const sol = state.solution;
      {
        if ($('showTarget').checked) R.curve(state.target, 'rgba(232,236,241,0.42)', 2, [7, 6]);
        if ($('showTraced').checked) R.curve(state.traced, 'rgba(158,240,184,0.35)', 1.5);
        if ($('showTrail').checked) {
          const head = Math.floor(state.theta / (2 * Math.PI) * state.traced.length) % state.traced.length;
          R.trail(state.traced, head);
        }
        drawMechanism(sol, state.theta);
      }
      $('hud').innerHTML = `${sol.name}<br>θ = ${deg(state.theta).toFixed(0)}° · ω = ${(state.speed * 60).toFixed(1)} ot/min`;
    }
    requestAnimationFrame(frame);
  }

  // ---------------- init ----------------
  function init() {
    R.resize();
    window.addEventListener('resize', () => {
      const cx = R.w / 2, cy = R.h / 2, w = R.toWorld(cx, cy);
      R.resize();
      R.view.ox = R.w / 2 - w.x * R.view.scale; R.view.oy = R.h / 2 + w.y * R.view.scale;
    });
    setMode('edit');
    let loaded = false;
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && Array.isArray(s.ctrl) && s.ctrl.length >= 3) { setCurve(s.ctrl, s.degree); loaded = true; }
    } catch (e) { /* ignore */ }
    if (!loaded) setCurve(PRESETS.heart.pts, PRESETS.heart.degree);
    requestAnimationFrame(frame);
  }
  init();
})();
