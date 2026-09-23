// Latitude/longitude grid with the equator, tropics and polar circles highlighted.

import * as THREE from 'three';
import { geometryToSegments } from '../core/geo.js';

const TROPIC = 23.44;
const POLAR = 66.56;

function lines(coordsList, color, opacity) {
  const pos = [];
  for (const coords of coordsList) geometryToSegments({ type: 'LineString', coordinates: coords }, 1.0015, 1, pos);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

const parallel = (lat) => Array.from({ length: 361 }, (_, i) => [i - 180, lat]);
const meridian = (lon) => Array.from({ length: 179 }, (_, i) => [lon, i - 89]);

export default {
  id: 'graticule',
  name: 'Zeměpisná síť',
  description: 'Rovnoběžky a poledníky, rovník, obratníky a polární kruhy.',
  options: [
    {
      id: 'step', label: 'Hustota', type: 'select', default: 15,
      choices: [{ value: 5, label: 'po 5°' }, { value: 10, label: 'po 10°' }, { value: 15, label: 'po 15°' }, { value: 30, label: 'po 30°' }],
    },
    { id: 'special', label: 'Rovník, obratníky, polární kruhy', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    const group = new THREE.Group();
    const grid = [];
    for (let lat = -90 + opts.step; lat < 90; lat += opts.step) grid.push(parallel(lat));
    for (let lon = -180; lon < 180; lon += opts.step) grid.push(meridian(lon));
    group.add(lines(grid, 0xffffff, 0.28));

    const labels = [];
    if (opts.special) {
      group.add(lines([parallel(0)], 0xffd54a, 0.9));
      group.add(lines([parallel(TROPIC), parallel(-TROPIC)], 0xff8a50, 0.8));
      group.add(lines([parallel(POLAR), parallel(-POLAR)], 0x7fd4ff, 0.8));
      group.add(lines([meridian(0)], 0xffd54a, 0.7));
      const add = (text, lat) => [-150, -30, 90].forEach((lon) => labels.push({ lat: lat + 1.2, lon, text, rank: 3, className: 'sea' }));
      add('rovník', 0);
      add('obratník Raka', TROPIC);
      add('obratník Kozoroha', -TROPIC);
      add('severní polární kruh', POLAR);
      add('jižní polární kruh', -POLAR);
    }
    return { object: group, labels };
  },
};
