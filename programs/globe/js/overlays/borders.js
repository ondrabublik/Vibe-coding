// Today's state borders and coastlines as lines – useful on top of the
// satellite image or the night lights.

import * as THREE from 'three';
import { mesh } from 'topojson-client';
import { loadJSON, URLS } from '../core/data.js';
import { geometryToSegments } from '../core/geo.js';

function lineObject(geometry, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(geometryToSegments(geometry, 1.0012, 0.5), 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

export default {
  id: 'borders',
  name: 'Státní hranice',
  description: 'Hranice dnešních států a pobřeží.',
  options: [
    { id: 'coast', label: 'I pobřeží', type: 'checkbox', default: false },
    {
      id: 'color', label: 'Barva', type: 'select', default: '#ffe08a',
      choices: [{ value: '#ffe08a', label: 'žlutá' }, { value: '#ffffff', label: 'bílá' }, { value: '#ff5a5a', label: 'červená' }, { value: '#222222', label: 'černá' }],
    },
  ],

  async build(ctx, opts) {
    const topo = await loadJSON(URLS.countriesTopo);
    const group = new THREE.Group();
    group.add(lineObject(mesh(topo, topo.objects.countries, (a, b) => a !== b), opts.color, 0.85));
    if (opts.coast) group.add(lineObject(mesh(topo, topo.objects.countries, (a, b) => a === b), opts.color, 0.55));
    return {
      object: group,
      attribution: 'Hranice: Natural Earth',
      setOption(id, value) {
        if (id !== 'color') return false;
        group.children.forEach((l) => l.material.color.set(value));
        return true;
      },
    };
  },
};
