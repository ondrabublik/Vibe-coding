/*
 * Headless test uživatelského rozhraní (jsdom).
 * Ověřuje, že se aplikace nastartuje, že jde modelovat myší a spustit analýzu.
 * Spuštění:  cd tests && npm install && node ui.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];

function assert(name, cond, info) {
  if (cond) { pass++; console.log('  OK   ' + name + (info ? '  ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? '  ' + info : '')); }
}

function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (prop in t) return t[prop];
      return () => {};
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.detail || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'),
  virtualConsole: vc,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = makeCtx;
    window.Element.prototype.setPointerCapture = function () {};
    window.Element.prototype.releasePointerCapture = function () {};
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 };
    };
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get: () => 800 });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get: () => 160 });
    window.addEventListener('error', (e) => errors.push('window.error: ' + (e.error ? e.error.stack : e.message)));
    window.URL.createObjectURL = () => 'blob:x';
    window.URL.revokeObjectURL = () => {};
    window.confirm = () => true;
  }
});

const win = dom.window;
const doc = win.document;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pointer(type, world, opts = {}) {
  const canvas = doc.getElementById('view');
  const app = win.MBD.app;
  const s = app.vp.toScreen(world);
  const ev = new win.MouseEvent(type, {
    bubbles: true, cancelable: true,
    clientX: s[0], clientY: s[1],
    button: opts.button || 0, ctrlKey: !!opts.ctrl, shiftKey: !!opts.shift
  });
  ev.pointerId = 1;
  canvas.dispatchEvent(ev);
}

function click(world, opts) {
  pointer('pointerdown', world, opts);
  pointer('pointermove', world, opts);
  pointer('pointerup', world, opts);
}

function drag(a, b, opts) {
  pointer('pointerdown', a, opts);
  pointer('pointermove', b, opts);
  pointer('pointerup', b, opts);
}

(async function main() {
  await new Promise((r) => win.addEventListener('load', r));
  await sleep(80);

  const MBD = win.MBD;
  console.log('\n[UI 1] Start aplikace');
  assert('MBD.app existuje', !!(MBD && MBD.app));
  const app = MBD.app;
  assert('výchozí model načten', app.model.bodies.length === 4, '(' + app.model.name + ')');
  assert('diagnostika spočtena', app.diag && app.diag.dof === 0,
    'dof=' + (app.diag && app.diag.dof));
  assert('strom modelu vykreslen', doc.querySelectorAll('#tree .tree-item').length === 8,
    doc.querySelectorAll('#tree .tree-item').length + ' položek');
  assert('bez chyb při startu', errors.length === 0, errors.join(' | '));

  console.log('\n[UI 2] Nástroje – tvorba tělesa a vazby');
  doc.querySelector('[data-tool="rod"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert('nástroj tyč aktivní', app.tool === 'rod');
  const nb0 = app.model.bodies.length;
  drag([0.2, -0.4], [0.6, -0.4]);
  assert('tyč vytvořena', app.model.bodies.length === nb0 + 1);
  const newRod = app.model.bodies[app.model.bodies.length - 1];
  assert('délka tyče = 0.4 m', Math.abs(newRod.L - 0.4) < 1e-9, 'L=' + newRod.L);
  assert('hmotnost z délky', Math.abs(MBD.Model.massOf(newRod) - 0.8) < 1e-9);

  doc.querySelector('[data-tool="revolute"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const nj0 = app.model.joints.length;
  click([0.2, -0.4]);
  assert('rotační vazba na rám vytvořena', app.model.joints.length === nj0 + 1);
  const nj = app.model.joints[app.model.joints.length - 1];
  assert('vazba spojuje rám a novou tyč', nj.bodyA === 'ground' && nj.bodyB === newRod.id);

  doc.querySelector('[data-tool="slider"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click([0.45, -0.4]);
  const collar = app.model.bodies[app.model.bodies.length - 1];
  assert('objímka vytvořena a srovnaná s tyčí', collar.type === 'slider' && Math.abs(collar.phi) < 1e-9);

  doc.querySelector('[data-tool="prismatic"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const njP = app.model.joints.length;
  click([0.45, -0.4]);
  assert('posuvná vazba vytvořena', app.model.joints.length === njP + 1);
  const jp = app.model.joints[app.model.joints.length - 1];
  assert('vodicí těleso je tyč, kluzné objímka',
    jp.bodyA === newRod.id && jp.bodyB === collar.id,
    jp.bodyA + '/' + jp.bodyB);

  doc.querySelector('[data-tool="torque"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const nl0 = app.model.loads.length;
  click([0.3, -0.4]);
  assert('moment přiřazen tělesu', app.model.loads.length === nl0 + 1);

  doc.querySelector('[data-tool="force"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  drag([0.45, -0.4], [0.55, -0.5]);
  assert('síla vytvořena', app.model.loads.length === nl0 + 2);

  console.log('\n[UI 3] Vazba mezi dvěma pohyblivými tělesy, vazba objímky s rámem');
  doc.querySelector('[data-tool="rod"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  drag([0.6, -0.4], [0.9, -0.7]);
  const rod2 = app.model.bodies[app.model.bodies.length - 1];
  doc.querySelector('[data-tool="revolute"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click([0.6, -0.4]);
  const j2 = app.model.joints[app.model.joints.length - 1];
  assert('rotační vazba spojila dvě tyče',
    (j2.bodyA === newRod.id && j2.bodyB === rod2.id) || (j2.bodyA === rod2.id && j2.bodyB === newRod.id),
    j2.bodyA + '/' + j2.bodyB);
  assert('vazbový bod je společný oběma tělesům',
    Math.hypot.apply(null, [0, 1].map(function (k) {
      return MBD.Model.toGlobal(MBD.Model.bodyById(app.model, j2.bodyA), j2.sA)[k] -
        MBD.Model.toGlobal(MBD.Model.bodyById(app.model, j2.bodyB), j2.sB)[k];
    })) < 1e-12);

  doc.querySelector('[data-tool="slider"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click([1.2, -0.2]);
  const free = app.model.bodies[app.model.bodies.length - 1];
  doc.querySelector('[data-tool="prismatic"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  drag([1.2, -0.2], [1.4, -0.2]);
  const jg = app.model.joints[app.model.joints.length - 1];
  assert('posuvná vazba objímka–rám', jg.bodyA === 'ground' && jg.bodyB === free.id);
  assert('osa vodorovná', Math.abs(MBD.Model.jointAxis(app.model, jg)[1]) < 1e-12);

  console.log('\n[UI 4] Výběr, přesun, mazání');
  doc.querySelector('[data-tool="select"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click([0.3, -0.4]);
  assert('kliknutím se vybere těleso', app.selection.length === 1, app.selection.join(','));
  assert('inspektor vykreslen', doc.querySelectorAll('#inspector .row').length > 5);

  const before = { x: newRod.x, y: newRod.y };
  app.setSelection([newRod.id]);
  app.options.snap = false;
  drag([0.3, -0.4], [0.35, -0.35]);
  assert('těleso se posunulo', Math.abs(newRod.x - before.x - 0.05) < 1e-6 &&
    Math.abs(newRod.y - before.y - 0.05) < 1e-6, 'dx=' + (newRod.x - before.x));
  app.options.snap = true;

  const nb1 = app.model.bodies.length;
  app.setSelection([free.id]);
  app.deleteSelection();
  assert('smazání tělesa i jeho vazeb', app.model.bodies.length === nb1 - 1 &&
    !app.model.joints.some(function (j) { return j.bodyA === free.id || j.bodyB === free.id; }));

  console.log('\n[UI 5] Sestavení a analýza');
  doc.getElementById('btn-assemble').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert('zbytek vazeb po sestavení < 1e-8', app.diag.residual < 1e-8,
    app.diag.residual.toExponential(2));

  // zpět na čistý příklad a spuštění analýzy
  win.MBD.app.setSelection([]);
  const model = MBD.Examples.build('slider-crank');
  model.sim.tEnd = 0.3;
  model.sim.h = 0.001;
  app.model = model;
  app.modelChanged();
  doc.getElementById('btn-run').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  let waited = 0;
  while (!app.result && waited < 15000) { await sleep(30); waited += 30; }
  assert('analýza dokončena', !!app.result, waited + ' ms');
  assert('snímky zaznamenány', app.result && app.result.frames.length > 50,
    app.result ? app.result.frames.length + ' snímků' : '');
  assert('grafy předvybrány', app.plotKeys.length > 0, app.plotKeys.join(', '));
  assert('canvas grafů vytvořen', doc.querySelectorAll('#charts canvas').length > 0,
    doc.querySelectorAll('#charts canvas').length + ' grafů');
  assert('seznam signálů vykreslen', doc.querySelectorAll('#signal-list .sig-item').length > 20,
    doc.querySelectorAll('#signal-list .sig-item').length + ' signálů');

  console.log('\n[UI 6] Animace, výsledky, export');
  app.seekIndex(10);
  assert('posun v čase funguje', app.frameIndex === 10 && app.time > 0,
    't=' + app.time.toFixed(4));
  assert('časový popisek aktualizován',
    doc.getElementById('time-label').textContent.indexOf('t =') === 0);

  const csv = MBD.Serialize.resultsToCSV(app.result, app.plotKeys);
  const lines = csv.split('\r\n');
  assert('CSV má hlavičku a data', lines.length === app.result.times.length + 1,
    lines.length + ' řádků');
  assert('CSV obsahuje hnací moment', csv.indexOf('Md') > 0);

  const json = MBD.Serialize.toJSON(app.model);
  const back = MBD.Serialize.fromJSON(json);
  assert('uložení a načtení modelu', back.bodies.length === app.model.bodies.length &&
    back.joints.length === app.model.joints.length);

  // ověření všech příkladů
  console.log('\n[UI 7] Načtení všech příkladů');
  for (const ex of MBD.Examples.list) {
    const m = ex.build();
    app.model = m;
    app.setSelection([]);
    app.modelChanged();
    const okDiag = app.diag && app.diag.residual < 1e-8 && app.diag.dof >= 0;
    assert('příklad „' + ex.name + '“ konzistentní', okDiag,
      'dof=' + app.diag.dof + ' res=' + app.diag.residual.toExponential(1));
  }

  console.log('\n[UI 8] Bez runtime chyb');
  assert('žádná zachycená výjimka', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n[UI 9] Režim kinematika – tažení podle vazeb');
  {
    const model = MBD.Examples.build('fourbar');
    app.model = model;
    app.setSelection([]);
    app.modelChanged();
    app.options.snap = false;
    doc.getElementById('btn-kinematics').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert('režim kinematika zapnut', app.mode === 'kinematics');
    assert('nástroj výběr', app.tool === 'select');

    const crank = model.bodies.find((b) => b.name === 'Klika');
    const coupler = model.bodies.find((b) => b.name === 'Spojovací tyč');
    const rocker = model.bodies.find((b) => b.name === 'Vahadlo');
    const phi0 = crank.phi;
    const c0 = { x: coupler.x, y: coupler.y };
    const r0 = { x: rocker.x, y: rocker.y };
    const grab = MBD.Model.toGlobal(crank, [crank.L / 2, 0]);
    drag(grab, [grab[0] + 0.1, grab[1] - 0.06]);

    assert('klika se pootočila', Math.abs(crank.phi - phi0) > 0.08,
      'Δφ=' + (crank.phi - phi0).toFixed(4));
    assert('ostatní členy se pohnuly s klikou',
      Math.hypot(coupler.x - c0.x, coupler.y - c0.y) > 0.01 &&
      Math.hypot(rocker.x - r0.x, rocker.y - r0.y) > 0.01);
    let maxJ = 0;
    model.joints.forEach((j) => {
      const A = MBD.Model.bodyById(model, j.bodyA);
      const B = MBD.Model.bodyById(model, j.bodyB);
      const pa = MBD.Model.toGlobal(A, j.sA);
      const pb = MBD.Model.toGlobal(B, j.sB);
      maxJ = Math.max(maxJ, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
    });
    assert('vazby zůstaly splněné', maxJ < 1e-6, 'max ' + maxJ.toExponential(2));

    doc.getElementById('btn-kinematics').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert('režim kinematika vypnut', app.mode === 'edit');
    app.options.snap = true;
  }

  console.log('\n=== ' + pass + ' OK, ' + fail + ' FAIL ===');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('Test selhal výjimkou:', e);
  process.exit(1);
});
