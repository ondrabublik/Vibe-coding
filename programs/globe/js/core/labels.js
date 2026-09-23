// HTML labels pinned to points on the globe. Labels stay crisp at any zoom,
// hide on the far side of the Earth, appear gradually as the camera gets
// closer (by rank) and never overlap each other.

import * as THREE from 'three';
import { latLonToVector3 } from './geo.js';

/**
 * A label: { lat, lon, text | html, rank = 0 (0 = most important, 10 = only when
 * zoomed in close), className = '' }.
 */
export class LabelLayer {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.groups = new Map();
    this.dirty = true;
    this.lastMatrix = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
  }

  /** Replaces all labels of one group (e.g. one layer). */
  set(key, labels = []) {
    this.clear(key);
    const items = labels.map((l) => {
      const el = document.createElement('div');
      el.className = `label hidden ${l.className || ''}`;
      if (l.html != null) el.innerHTML = l.html; else el.textContent = l.text;
      this.container.appendChild(el);
      return { ...l, rank: l.rank ?? 0, el, pos: latLonToVector3(l.lat, l.lon, 1.0), w: 0, h: 0 };
    });
    this.groups.set(key, items);
    this.dirty = true;
    return items;
  }

  /** Changes the text of existing labels (e.g. clocks) without recreating them. */
  updateText(key, fn) {
    const items = this.groups.get(key);
    if (!items) return;
    for (const it of items) {
      const html = fn(it);
      if (html != null && html !== it._html) {
        it.el.innerHTML = html;
        it._html = html;
        it.w = 0;
      }
    }
    this.dirty = true;
  }

  clear(key) {
    const items = this.groups.get(key);
    if (!items) return;
    items.forEach((it) => it.el.remove());
    this.groups.delete(key);
    this.dirty = true;
  }

  /** Called every frame; does real work only when the camera moved or labels changed. */
  update(width, height) {
    const cam = this.camera;
    if (!this.dirty && cam.matrixWorld.equals(this.lastMatrix)) return;
    this.lastMatrix.copy(cam.matrixWorld);
    this.dirty = false;

    const dist = cam.position.length();
    // zoom level 0 at far view … ~10 very close
    const zoom = Math.log2(3 / Math.max(0.02, dist - 1)) * 2.2 + 1.6;
    this._camDir.copy(cam.position).normalize();

    const all = [];
    for (const items of this.groups.values()) all.push(...items);
    all.sort((a, b) => a.rank - b.rank);

    const placed = [];
    const v = this._v;
    for (const it of all) {
      let visible = it.rank <= zoom;
      if (visible) {
        // facing the camera? (angle between surface normal and camera direction)
        const facing = it.pos.dot(this._camDir) - 1 / dist;
        visible = facing > 0.1;
      }
      if (visible) {
        v.copy(it.pos).project(cam);
        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-v.y * 0.5 + 0.5) * height;
        if (!it.w) {
          it.el.classList.remove('hidden'); // must be displayed to be measured
          it.shown = true;
          it.w = it.el.offsetWidth;
          it.h = it.el.offsetHeight;
        }
        const isPoint = it.className?.includes('city');
        const left = isPoint ? x - 4 : x - it.w / 2;
        const top = y - it.h / 2;
        const box = [left - 2, top - 1, left + it.w + 2, top + it.h + 1];
        if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) {
          visible = false;
        } else {
          placed.push(box);
          it.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
        }
      }
      if (visible !== it.shown) {
        it.el.classList.toggle('hidden', !visible);
        it.shown = visible;
      }
    }
  }

  markDirty() { this.dirty = true; }
}
