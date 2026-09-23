// Slowly drifting cloud layer.

import * as THREE from 'three';
import { loadImage, URLS } from '../core/data.js';

export default {
  id: 'clouds',
  name: 'Oblačnost',
  description: 'Vrstva mraků nad povrchem (ilustrační snímek).',
  options: [
    { id: 'opacity', label: 'Hustota', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.8, live: true, format: (v) => `${Math.round(v * 100)} %` },
    { id: 'speed', label: 'Pohyb', type: 'range', min: 0, max: 1, step: 0.05, default: 0.3, live: true, format: (v) => (v ? `${Math.round(v * 100)} %` : 'stojí') },
  ],

  async build(ctx, opts) {
    const img = await loadImage(URLS.clouds);
    const map = ctx.globe.toTexture(img);
    const material = new THREE.MeshLambertMaterial({ map, transparent: true, opacity: opts.opacity, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.006, 192, 96), material);
    let speed = opts.speed;
    return {
      object: mesh,
      update(dt) { mesh.rotation.y += dt * speed * 0.01; },
      setOption(id, value) {
        if (id === 'opacity') material.opacity = value;
        else if (id === 'speed') speed = value;
        else return false;
        return true;
      },
    };
  },
};
