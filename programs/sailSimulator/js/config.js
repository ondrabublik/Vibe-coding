import { sailCoef, foilCoef } from './physics.js';

// ---------------- LODĚ ----------------
// Geometrie: x = podélně (+ příď), výšky nad hladinou. Plachty: tack = dolní přední roh,
// head = vrchol, foot = délka spodního lemu (otáčí se kolem tack podle úhlu otěže).
export const BOATS = {
  skiff: {
    id: 'skiff', name: 'Sportovní skif', length: '4,5 m', crewText: '2 jachtaři na trapézu',
    desc: 'Lehký závodní skif s gennakerem. Při čerstvém větru se dostane do skluzu (planing) a jede 15–20 uzlů. Pozor – snadno se převrhne!',
    stats: { speed: 5, stability: 1, handling: 5 },
    L: 4.5, LWL: 4.3, B: 1.75, deck: 0.38, draftHull: 0.15, color: 0xf2f2f2, stripe: 0xff4d2e, deckColor: 0xcfd6dc,
    mass: 240, crewMass: 150, crewN: 2, sitArm: 0.8, trapArm: 2.1, crewRate: 2.5, hikeLabel: 'Trapéz',
    Ix: 450, rollDamp: 1500, Iz: 520, S: 3.4, Cf: 0.0045, GM: 0.3, gzType: 'dinghy', capsize: 62, planing: true,
    keel: { area: 0.3, x: 0.85, depth: 0.55, coef: foilCoef(4), retract: true, type: 'board', chord: 0.32, span: 1.0 },
    rudder: { area: 0.13, x: -2.3, max: 35, coef: foilCoef(3), chord: 0.24, span: 0.75 },
    windage: 0.8, windX: 0.3, latArea: 0.35, yawDamp: 120,
    steering: 'tiller', motor: null, spinReplacesJib: true, spinName: 'Gennaker',
    mast: { x: 0.55, top: 7.9, r: 0.045 }, bowsprit: 1.35,
    sails: [
      { key: 'main', kind: 'main', ctrl: 'main', area: 10.5, tack: [0.55, 1.15], head: [0.55, 7.75], foot: 2.6, roach: 0.35,
        hce: 3.6, ceX: 0.55, ceChord: 0.85, min: 2, max: 85, byLee: 12, aOpt: 17, coef: sailCoef(1.45, 22, 0.05), color: 0xf6f3ea },
      { key: 'jib', kind: 'jib', ctrl: 'head', area: 4.8, tack: [2.05, 0.55], head: [0.62, 5.6], foot: 1.7,
        hce: 2.3, ceX: 1.54, ceChord: 0.6, min: 8, max: 60, byLee: 45, aOpt: 16, coef: sailCoef(1.4, 21, 0.05), color: 0xf6f3ea },
      { key: 'spin', kind: 'spin', ctrl: 'head', area: 17, tack: [3.6, 0.6], head: [0.66, 7.1], foot: 3.6,
        hce: 3.0, ceX: 2.42, ceChord: 1.4, min: 18, max: 105, byLee: 25, aOpt: 24, coef: sailCoef(1.75, 30, 0.08), color: 0xff3b5c },
    ],
  },
  cruiser: {
    id: 'cruiser', name: 'Kajutová plachetnice', length: '9 m', crewText: '4 členové posádky',
    desc: 'Univerzální kýlová jachta pro závody i výlety. Stabilní, s janovkou (genoou) a asymetrickým spinakrem. Rychlost omezuje trupová rychlost ~7–8 uzlů.',
    stats: { speed: 3, stability: 4, handling: 4 },
    L: 9.0, LWL: 8.0, B: 3.0, deck: 0.95, draftHull: 0.5, color: 0x1d3557, stripe: 0xe9c46a, deckColor: 0xb08d63,
    mass: 3600, crewMass: 320, crewN: 4, sitArm: 0.5, trapArm: 1.4, crewRate: 1.0, hikeLabel: 'Posádka na hranu',
    Ix: 9200, rollDamp: 11000, Iz: 27600, S: 17, Cf: 0.004, GM: 1.0, gzType: 'keel', capsize: 0, planing: false,
    keel: { area: 1.15, x: 1.65, depth: 1.1, coef: foilCoef(2.4), retract: false, type: 'fin', chord: 0.95, span: 1.35 },
    rudder: { area: 0.42, x: -3.7, max: 35, coef: foilCoef(2.5), chord: 0.42, span: 1.05 },
    windage: 3.5, windX: 0.6, latArea: 2.0, yawDamp: 5000,
    steering: 'tiller', motor: { thrust: 950, wash: 1.6 }, spinReplacesJib: true, spinName: 'Spinakr',
    mast: { x: 1.0, top: 14.0, r: 0.08 }, bowsprit: 0.9,
    sails: [
      { key: 'main', kind: 'main', ctrl: 'main', area: 23, tack: [1.0, 2.2], head: [1.0, 13.6], foot: 3.6, roach: 0.3,
        hce: 6.5, ceX: 1.0, ceChord: 1.15, min: 2, max: 80, byLee: 12, aOpt: 17, coef: sailCoef(1.45, 22, 0.05), color: 0xf4f1e8 },
      { key: 'jib', kind: 'jib', ctrl: 'head', area: 25, tack: [4.3, 1.05], head: [1.05, 12.8], foot: 4.6,
        hce: 5.25, ceX: 3.13, ceChord: 1.6, min: 8, max: 60, byLee: 45, aOpt: 16, coef: sailCoef(1.45, 21, 0.05), color: 0xf4f1e8 },
      { key: 'spin', kind: 'spin', ctrl: 'head', area: 62, tack: [5.4, 1.15], head: [1.1, 13.4], foot: 6.5,
        hce: 5.6, ceX: 3.77, ceChord: 2.6, min: 20, max: 105, byLee: 25, aOpt: 24, coef: sailCoef(1.75, 30, 0.08), color: 0x2a9df4 },
    ],
  },
  ocean: {
    id: 'ocean', name: 'Zaoceánská jachta', length: '16 m', crewText: '8 členů posádky, kormidelní kolo',
    desc: 'Velká a těžká jachta pro dálkovou plavbu. Velmi stabilní, reaguje pomalu, vyniká v silném větru a vlnách. Kormidluje se kolem, má motor.',
    stats: { speed: 4, stability: 5, handling: 2 },
    L: 16, LWL: 14.5, B: 4.6, deck: 1.45, draftHull: 0.8, color: 0xfafafa, stripe: 0x0b6e4f, deckColor: 0xc19a6b,
    mass: 18000, crewMass: 640, crewN: 6, sitArm: 0.6, trapArm: 2.0, crewRate: 0.6, hikeLabel: 'Posádka na hranu',
    Ix: 136000, rollDamp: 115000, Iz: 437000, S: 48, Cf: 0.0037, GM: 1.5, gzType: 'keel', capsize: 0, planing: false,
    keel: { area: 3.2, x: 2.9, depth: 2.0, coef: foilCoef(2.8), retract: false, type: 'bulb', chord: 1.6, span: 2.6 },
    rudder: { area: 1.2, x: -6.5, max: 35, coef: foilCoef(2.5), chord: 0.75, span: 1.7 },
    windage: 12, windX: 1.0, latArea: 6, yawDamp: 60000,
    steering: 'wheel', motor: { thrust: 4800, wash: 2.0 }, spinReplacesJib: true, spinName: 'Spinakr',
    mast: { x: 1.6, top: 25, r: 0.14 }, bowsprit: 1.5,
    sails: [
      { key: 'main', kind: 'main', ctrl: 'main', area: 74, tack: [1.6, 3.2], head: [1.6, 24.2], foot: 6.2, roach: 0.3,
        hce: 11.1, ceX: 1.6, ceChord: 2.0, min: 2, max: 80, byLee: 12, aOpt: 17, coef: sailCoef(1.45, 22, 0.05), color: 0xefe9da },
      { key: 'jib', kind: 'jib', ctrl: 'head', area: 74, tack: [7.7, 1.55], head: [1.7, 22.5], foot: 7.8,
        hce: 9.1, ceX: 5.54, ceChord: 2.8, min: 8, max: 60, byLee: 45, aOpt: 16, coef: sailCoef(1.45, 21, 0.05), color: 0xefe9da },
      { key: 'spin', kind: 'spin', ctrl: 'head', area: 200, tack: [9.4, 1.6], head: [1.7, 24.2], foot: 11,
        hce: 9.7, ceX: 6.35, ceChord: 4.4, min: 20, max: 105, byLee: 25, aOpt: 24, coef: sailCoef(1.75, 30, 0.08), color: 0xe63946 },
    ],
  },
};

// ---------------- POČASÍ ----------------
// tws v uzlech, gust = relativní síla poryvů, shift = stáčení větru (°), waveH = výška vln (m)
export const WEATHER = {
  breeze: {
    id: 'breeze', name: 'Slunečný vánek', icon: '☀️', desc: 'Mírný stálý vítr, klidné moře. Ideální na učení.',
    tws: 8, gust: 0.15, shift: 5, waveH: 0.35, chop: 0.4,
    sky: { zenith: 0x2f6fbf, horizon: 0xbcd8f0, sun: 0xfff3d6, sunElev: 52, sunAz: 140, clouds: 0.22, cloudColor: 0xffffff, light: 1.25, ambient: 0.75 },
    fog: 0.00018, water: 0x0b4f7a, rain: 0, lightning: false,
  },
  fresh: {
    id: 'fresh', name: 'Svěží vítr', icon: '🌤️', desc: 'Čerstvý vítr 14 uzlů, první bílé hřebínky. Skif se dostane do skluzu.',
    tws: 14, gust: 0.2, shift: 8, waveH: 0.8, chop: 0.7,
    sky: { zenith: 0x2a63b0, horizon: 0xc6dcef, sun: 0xfff1d0, sunElev: 40, sunAz: 200, clouds: 0.45, cloudColor: 0xffffff, light: 1.15, ambient: 0.7 },
    fog: 0.0002, water: 0x0a4a73, rain: 0, lightning: false,
  },
  strong: {
    id: 'strong', name: 'Silný vítr', icon: '💨', desc: 'Vítr 22 uzlů, vysoké vlny a pěna. Zvažte refování.',
    tws: 22, gust: 0.25, shift: 10, waveH: 1.7, chop: 1.0,
    sky: { zenith: 0x4c6f93, horizon: 0xb4c4d2, sun: 0xf3f0e6, sunElev: 30, sunAz: 230, clouds: 0.65, cloudColor: 0xe8ecef, light: 0.95, ambient: 0.7 },
    fog: 0.00035, water: 0x0b3d5c, rain: 0, lightning: false,
  },
  storm: {
    id: 'storm', name: 'Bouře', icon: '⛈️', desc: 'Vichřice přes 30 uzlů, déšť, blesky a velké vlny. Jen pro odvážné.',
    tws: 32, gust: 0.3, shift: 14, waveH: 3.2, chop: 1.3,
    sky: { zenith: 0x1b2229, horizon: 0x4a5560, sun: 0x9aa4ad, sunElev: 25, sunAz: 250, clouds: 0.98, cloudColor: 0x3b434b, light: 0.45, ambient: 0.55 },
    fog: 0.0011, water: 0x0c2a35, rain: 1, lightning: true,
  },
  gusty: {
    id: 'gusty', name: 'Nárazovitý vítr', icon: '🌬️', desc: 'Průměrně 12 uzlů, ale prudké poryvy a stáčení až o 20°. Sledujte tmavé skvrny na vodě.',
    tws: 12, gust: 0.6, shift: 20, waveH: 0.6, chop: 0.8,
    sky: { zenith: 0x3569a8, horizon: 0xc4d4e2, sun: 0xfff2da, sunElev: 45, sunAz: 160, clouds: 0.55, cloudColor: 0xf7f7f7, light: 1.1, ambient: 0.72 },
    fog: 0.00022, water: 0x0b4970, rain: 0, lightning: false,
  },
  sunset: {
    id: 'sunset', name: 'Západ slunce', icon: '🌅', desc: 'Večerní vánek 10 uzlů, zlaté světlo a dlouhé stíny.',
    tws: 10, gust: 0.15, shift: 6, waveH: 0.5, chop: 0.5,
    sky: { zenith: 0x2b3a6b, horizon: 0xff9a5a, sun: 0xffb36b, sunElev: 5, sunAz: 270, clouds: 0.35, cloudColor: 0xffb98a, light: 1.0, ambient: 0.55 },
    fog: 0.00025, water: 0x123d5c, rain: 0, lightning: false,
  },
  fog: {
    id: 'fog', name: 'Mlha a slabý vítr', icon: '🌫️', desc: 'Jen 5 uzlů, hustá mlha. Plujte podle přístrojů a minimapy.',
    tws: 5, gust: 0.25, shift: 12, waveH: 0.25, chop: 0.3,
    sky: { zenith: 0x9aa6ae, horizon: 0xc9cfd2, sun: 0xf0eee8, sunElev: 35, sunAz: 180, clouds: 0.9, cloudColor: 0xd7dbde, light: 0.7, ambient: 0.85 },
    fog: 0.006, water: 0x2d4c58, rain: 0, lightning: false,
  },
};
