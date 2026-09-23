// Present-day countries (Natural Earth 1:50m) with Czech names – shared by
// several layers.

import { loadJSON, URLS } from './data.js';
import { rewind, geoArea } from './canvasMap.js';

const regionNames = new Intl.DisplayNames(['cs'], { type: 'region' });

export const CONTINENTS_CS = {
  Africa: 'Afrika',
  Asia: 'Asie',
  Europe: 'Evropa',
  'North America': 'Severní Amerika',
  'South America': 'Jižní Amerika',
  Oceania: 'Austrálie a Oceánie',
  Antarctica: 'Antarktida',
  'Seven seas (open ocean)': 'Ostrovy v oceánech',
};

export function czechName(props) {
  const code = props.ISO_A2_EH && props.ISO_A2_EH !== '-99' ? props.ISO_A2_EH : props.ISO_A2;
  if (code && code !== '-99') {
    try {
      const n = regionNames.of(code);
      if (n && n !== code) return n;
    } catch { /* invalid code */ }
  }
  return props.NAME_LONG || props.NAME;
}

let promise = null;

/** GeoJSON FeatureCollection; each feature gets props.nameCs and props.areaKm2. */
export function loadCountries() {
  promise ??= loadJSON(URLS.countries).then((fc) => {
    rewind(fc);
    for (const f of fc.features) {
      f.properties.nameCs = czechName(f.properties);
      f.properties.areaKm2 = geoArea(f) * 6371 * 6371;
    }
    return fc;
  });
  promise.catch(() => { promise = null; });
  return promise;
}
