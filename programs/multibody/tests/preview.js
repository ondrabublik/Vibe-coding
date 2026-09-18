/*
 * Pomocný nástroj: vykreslí scénu aplikace do PNG (kontrola grafiky bez prohlížeče).
 * Spuštění: cd tests && node preview.js
 * Výstup:   tests/preview-<příklad>.png
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const W = 1000, H = 620;

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => console.error('jsdomError', e.message));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'),
  virtualConsole: vc,
  beforeParse(window) {
    window.Element.prototype.setPointerCapture = function () {};
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 };
    };
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get: () => W });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get: () => H });
    window.URL.createObjectURL = () => 'blob:x';
  }
});

const win = dom.window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  await new Promise((r) => win.addEventListener('load', r));
  await sleep(100);
  const MBD = win.MBD, app = MBD.app;
  const canvas = win.document.getElementById('view');

  for (const id of ['slider-crank', 'fourbar', 'yoke', 'double-pendulum']) {
    app.model = MBD.Examples.build(id);
    app.setSelection([]);
    app.modelChanged();
    app.vp.resize();
    app.vp.fit([-0.1, -0.4, 0.7, 0.4]);

    const run = MBD.Simulation.runSync(app.model);
    app.plotKeys = [];
    app.options.reac = true;
    app.options.vel = true;
    app.setResult(run.result);
    app.vp.fit(bbox(run.result), 0.3);
    app.seekIndex(Math.floor(run.result.frames.length * 0.35));
    app.render();

    const out = path.join(__dirname, 'preview-' + id + '.png');
    const data = canvas.toDataURL('image/png').split(',')[1];
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('zapsáno ' + out + '  (dof=' + run.dof.dof + ', snímků=' + run.result.frames.length + ')');
  }
  win.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

function bbox(res) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  res.frames.forEach((f) => {
    for (let i = 0; i < res.nBodies; i++) {
      x0 = Math.min(x0, f.pose[3 * i]); x1 = Math.max(x1, f.pose[3 * i]);
      y0 = Math.min(y0, f.pose[3 * i + 1]); y1 = Math.max(y1, f.pose[3 * i + 1]);
    }
  });
  return [x0, y0, x1, y1];
}
