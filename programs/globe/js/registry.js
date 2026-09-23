// The list of available layers. To add a new one, create a module in
// js/surfaces or js/overlays (see README.md for the interface) and add it here.
// The order below is the order in the panel; surfaces are grouped by `category`.

import satellite from './surfaces/satellite.js';
import night from './surfaces/night.js';
import political from './surfaces/political.js';
import relief from './surfaces/relief.js';
import timezones from './surfaces/timezones.js';
import historical from './surfaces/historical.js';
import oldWorld from './surfaces/oldWorld.js';
import paleo from './surfaces/paleo.js';
import inverted from './surfaces/inverted.js';

import graticule from './overlays/graticule.js';
import borders from './overlays/borders.js';
import cities from './overlays/cities.js';
import clouds from './overlays/clouds.js';
import dayNight from './overlays/dayNight.js';
import tectonics from './overlays/tectonics.js';
import earthquakes from './overlays/earthquakes.js';

export const surfaces = [
  satellite,
  night,
  political,
  relief,
  timezones,
  historical,
  oldWorld,
  paleo,
  inverted,
];

export const overlays = [
  graticule,
  borders,
  cities,
  clouds,
  dayNight,
  tectonics,
  earthquakes,
];
