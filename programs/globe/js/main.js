// Application bootstrap: wires the registry of layers to the globe and the UI,
// handles switching of surfaces, toggling of overlays and the URL state.

import * as THREE from 'three';
import { Globe } from './core/globe.js';
import { surfaces, overlays } from './registry.js';
import { formatLatLon } from './core/geo.js';
import {
  renderSurfaceList, setActiveChoice, renderOptions, renderOverlayList,
  renderLegend, renderDescribe, el,
} from './core/ui.js';

const $ = (id) => document.getElementById(id);
const globe = new Globe($('viewport'), $('labels'));

// ------------------------------------------------------------------ state

const defaults = (defs = []) => Object.fromEntries(defs.map((d) => [d.id, d.default]));

const settingsDefs = [
  { id: 'autoRotate', label: 'Automatické otáčení', type: 'checkbox', default: false },
  { id: 'atmosphere', label: 'Atmosféra', type: 'checkbox', default: true },
  { id: 'stars', label: 'Hvězdy', type: 'checkbox', default: true },
  { id: 'hiRes', label: 'Vysoké rozlišení map (8K, náročnější)', type: 'checkbox', default: false },
];

const state = {
  surface: surfaces[0].id,
  surfaceOptions: Object.fromEntries(surfaces.map((s) => [s.id, defaults(s.options)])),
  overlays: Object.fromEntries(overlays.map((o) => [o.id, { enabled: !!o.enabledByDefault, options: defaults(o.options) }])),
  settings: defaults(settingsDefs),
};

readHash();

// ------------------------------------------------------------------ layer context

function makeContext({ withProgress = false } = {}) {
  return {
    THREE,
    globe,
    /** Width of canvas textures the layers should draw (height = width / 2). */
    textureWidth: Math.min(state.settings.hiRes ? 8192 : 4096, globe.maxTextureSize),
    progress: withProgress ? (msg) => showLoading(msg) : () => {},
  };
}

// ------------------------------------------------------------------ surfaces

let surfaceToken = 0;
let active = null; // { def, instance, offFrame }

async function activateSurface(id) {
  const def = surfaces.find((s) => s.id === id) || surfaces[0];
  state.surface = def.id;
  setActiveChoice($('surfaceList'), def.id);
  renderOptions($('surfaceOptions'), def.options, state.surfaceOptions[def.id], onSurfaceOption);
  writeHash();

  const token = ++surfaceToken;
  showLoading(`Načítám: ${def.name}…`);
  try {
    const instance = await def.build(makeContext({ withProgress: true }), { ...state.surfaceOptions[def.id] });
    if (token !== surfaceToken) { instance.dispose?.(); return; }
    const switched = active?.def.id !== def.id;
    teardownSurface();
    globe.setSurface(instance);
    // a surface may suggest where to look (e.g. Pangea) – only when switching to it
    if (switched && instance.view) globe.flyTo(instance.view.lat, instance.view.lon, globe.cameraDistance);
    globe.labels.set('surface', instance.labels);
    const offFrame = instance.update ? globe.onFrame((dt, now) => instance.update(dt, now)) : null;
    active = { def, instance, offFrame };
    $('surfaceInfo').textContent = instance.info || '';
    renderLegend($('legend'), instance.legend);
    updateAttribution();
    hideError();
  } catch (err) {
    if (token === surfaceToken) showError(`${def.name}: ${err.message}`);
    console.error(err);
  } finally {
    if (token === surfaceToken) hideLoading();
  }
}

function teardownSurface() {
  if (!active) return;
  active.offFrame?.();
  active.instance.dispose?.();
  globe.labels.clear('surface');
  active = null;
}

function onSurfaceOption(optId, value, meta = {}) {
  const id = state.surface;
  state.surfaceOptions[id][optId] = value;
  // A layer can apply some options instantly via setOption(); otherwise it is rebuilt.
  if (active?.def.id === id && active.instance.setOption?.(optId, value, state.surfaceOptions[id])) {
    if (!meta.live) writeHash();
    return;
  }
  if (meta.live) return;
  activateSurface(id);
}

// ------------------------------------------------------------------ overlays

const overlayInstances = new Map(); // id -> { instance, offFrame, token }
let overlayItems;

async function enableOverlay(id) {
  const def = overlays.find((o) => o.id === id);
  const st = state.overlays[id];
  st.enabled = true;
  disableOverlay(id, { keepState: true });
  const token = {};
  overlayInstances.set(id, { token });
  overlayItems.get(id)?.classList.add('loading');
  try {
    const instance = await def.build(makeContext(), { ...st.options });
    if (overlayInstances.get(id)?.token !== token) { instance.dispose?.(); return; }
    if (instance.object) globe.overlayRoot.add(instance.object);
    globe.labels.set(`overlay:${id}`, instance.labels);
    const offFrame = instance.update ? globe.onFrame((dt, now) => instance.update(dt, now)) : null;
    overlayInstances.set(id, { token, instance, offFrame });
    updateAttribution();
  } catch (err) {
    showError(`${def.name}: ${err.message}`);
    console.error(err);
  } finally {
    overlayItems.get(id)?.classList.remove('loading');
  }
}

function disableOverlay(id, { keepState = false } = {}) {
  if (!keepState) state.overlays[id].enabled = false;
  const entry = overlayInstances.get(id);
  overlayInstances.delete(id);
  if (entry?.instance) {
    entry.offFrame?.();
    if (entry.instance.object) {
      globe.overlayRoot.remove(entry.instance.object);
      disposeObject(entry.instance.object);
    }
    entry.instance.dispose?.();
  }
  globe.labels.clear(`overlay:${id}`);
  updateAttribution();
}

function onOverlayOption(id, optId, value, meta = {}) {
  const st = state.overlays[id];
  st.options[optId] = value;
  const inst = overlayInstances.get(id)?.instance;
  if (inst?.setOption?.(optId, value, st.options)) {
    if (!meta.live) writeHash();
    return;
  }
  if (meta.live) return;
  writeHash();
  enableOverlay(id);
}

function disposeObject(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture) u.value.dispose();
      m.dispose();
    }
  });
}

// ------------------------------------------------------------------ settings

function applySetting(id, value) {
  state.settings[id] = value;
  if (id === 'autoRotate') globe.controls.autoRotate = value;
  if (id === 'atmosphere') globe.atmosphere.visible = value;
  if (id === 'stars') globe.stars.visible = value;
  if (id === 'hiRes') {
    activateSurface(state.surface);
    for (const [oid, st] of Object.entries(state.overlays)) if (st.enabled) enableOverlay(oid);
  }
  writeHash();
}

// ------------------------------------------------------------------ status bar

let pointer = null;
let describeTimer = 0;
globe.renderer.domElement.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  if (!describeTimer) describeTimer = setTimeout(updateStatus, 60);
});
globe.renderer.domElement.addEventListener('pointerleave', () => { pointer = null; updateStatus(); });
globe.controls.addEventListener('change', () => { if (pointer && !describeTimer) describeTimer = setTimeout(updateStatus, 120); });

function updateStatus() {
  describeTimer = 0;
  const hit = pointer && globe.pick(pointer.x, pointer.y);
  if (!hit) {
    $('coords').textContent = '—';
    renderDescribe($('describe'), []);
    return;
  }
  $('coords').textContent = formatLatLon(hit.lat, hit.lon);
  const blocks = [];
  const add = (r) => { if (r) blocks.push(...(Array.isArray(r) ? r : [r])); };
  try {
    add(active?.instance.describe?.(hit.lat, hit.lon));
    for (const { instance } of overlayInstances.values()) add(instance?.describe?.(hit.lat, hit.lon));
  } catch (err) { console.error(err); }
  renderDescribe($('describe'), blocks);
}

globe.renderer.domElement.addEventListener('dblclick', (e) => {
  const hit = globe.pick(e.clientX, e.clientY);
  if (hit) globe.flyTo(hit.lat, hit.lon, Math.max(1.15, 1 + (globe.cameraDistance - 1) * 0.55));
});

function updateAttribution() {
  const parts = [];
  if (active?.instance.attribution) parts.push(active.instance.attribution);
  for (const { instance } of overlayInstances.values()) if (instance?.attribution) parts.push(instance.attribution);
  $('attribution').textContent = [...new Set(parts)].join(' · ');
}

// ------------------------------------------------------------------ loading / errors

function showLoading(msg) {
  $('loadingText').textContent = msg;
  $('loading').classList.remove('hidden');
}
function hideLoading() { $('loading').classList.add('hidden'); }
function showError(msg) {
  $('error').textContent = `⚠ ${msg}`;
  $('error').classList.remove('hidden');
  clearTimeout(showError.t);
  showError.t = setTimeout(hideError, 8000);
}
function hideError() { $('error').classList.add('hidden'); }

// ------------------------------------------------------------------ URL hash
// #surface=historical&year=1492&layers=graticule,cities&cities.capitals=1

function encode(v) { return typeof v === 'boolean' ? (v ? '1' : '0') : String(v); }
function decode(raw, def) {
  if (def === undefined) return raw;
  if (typeof def === 'boolean') return raw === '1';
  if (typeof def === 'number') return Number(raw);
  return raw;
}

function writeHash() {
  const p = new URLSearchParams();
  p.set('surface', state.surface);
  const s = surfaces.find((x) => x.id === state.surface);
  for (const d of s?.options || []) {
    const v = state.surfaceOptions[s.id][d.id];
    if (v !== d.default) p.set(d.id, encode(v));
  }
  const on = overlays.filter((o) => state.overlays[o.id].enabled);
  if (on.length) p.set('layers', on.map((o) => o.id).join(','));
  for (const o of on) {
    for (const d of o.options || []) {
      const v = state.overlays[o.id].options[d.id];
      if (v !== d.default) p.set(`${o.id}.${d.id}`, encode(v));
    }
  }
  for (const d of settingsDefs) if (state.settings[d.id] !== d.default) p.set(`view.${d.id}`, encode(state.settings[d.id]));
  history.replaceState(null, '', `#${p.toString()}`);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const s = surfaces.find((x) => x.id === p.get('surface'));
  if (s) {
    state.surface = s.id;
    for (const d of s.options || []) if (p.has(d.id)) state.surfaceOptions[s.id][d.id] = decode(p.get(d.id), d.default);
  }
  if (p.has('layers')) {
    const ids = p.get('layers').split(',');
    for (const o of overlays) {
      state.overlays[o.id].enabled = ids.includes(o.id);
      for (const d of o.options || []) {
        const key = `${o.id}.${d.id}`;
        if (p.has(key)) state.overlays[o.id].options[d.id] = decode(p.get(key), d.default);
      }
    }
  }
  for (const d of settingsDefs) if (p.has(`view.${d.id}`)) state.settings[d.id] = decode(p.get(`view.${d.id}`), d.default);
}

// ------------------------------------------------------------------ start

renderSurfaceList($('surfaceList'), surfaces, state.surface, activateSurface);
overlayItems = renderOverlayList($('overlayList'), overlays, state.overlays, {
  onToggle: (id, on) => { on ? enableOverlay(id) : disableOverlay(id); writeHash(); },
  onOption: onOverlayOption,
});
renderOptions($('settings'), settingsDefs, state.settings, applySetting);
for (const d of settingsDefs) if (d.id !== 'hiRes') applySetting(d.id, state.settings[d.id]);

// keep the globe centred in the free area next to the panel
function updateViewShift() {
  const panel = $('panel');
  const open = !panel.classList.contains('collapsed');
  if (window.innerWidth > 700) globe.setViewShift(open ? (panel.offsetWidth + 12) / 2 : 0, 0);
  else globe.setViewShift(0, open ? -panel.offsetHeight / 2 : 0);
}
$('panelToggle').addEventListener('click', () => {
  $('panel').classList.toggle('collapsed');
  updateViewShift();
});
window.addEventListener('resize', updateViewShift);
updateViewShift();
$('btnReset').addEventListener('click', () => globe.resetView());
$('btnShot').addEventListener('click', () => {
  const a = el('a');
  a.href = globe.screenshot();
  a.download = `globus-${state.surface}.png`;
  a.click();
});

activateSurface(state.surface);
for (const [id, st] of Object.entries(state.overlays)) if (st.enabled) enableOverlay(id);
