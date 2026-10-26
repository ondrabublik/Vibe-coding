'use strict';
// Druhy ryb: tvar těla, zbarvení, chování a preference návnad.
(function (FS) {
  // pomocník pro profil těla (zlomky celkové délky)
  function prof(head, max, peak, ped, snout = 0.6) {
    return [[0, 0], [0.012, head * snout], [0.05, head], [0.13, head + (max - head) * 0.62], [peak * 0.75, max * 0.95], [peak, max],
      [peak + (1 - peak) * 0.35, max * 0.86], [peak + (1 - peak) * 0.68, ped + (max - ped) * 0.32], [0.92, ped * 1.06], [1, ped]];
  }

  const S = [];
  FS.Species = S;

  S.push({
    id: 'kapr', name: 'Kapr obecný', latin: 'Cyprinus carpio', abundance: 10,
    wMin: 0.8, wMax: 16, skew: 2.6, K: 0.019, base: 40, perKg: 65,
    power: 1.3, speed: 1.8, endurance: 22, zone: 'bottom', habitat: 'open', pattern: 'slow', window: 2.3, mouth: 3.2, wRef: 3, shy: 0.6,
    baits: { kukurice: 0.9, boilies_j: 1, boilies_r: 0.9, testo: 0.6, pelety: 0.8, zizala: 0.35, chleb: 0.35, rousnice: 0.35, cervi: 0.15 },
    lures: {}, gb: { gb_kapr: 1, gb_partikl: 1, gb_pelety: 0.9, gb_univ: 0.35 },
    desc: 'Nejoblíbenější ryba českých rybníků. Silný a vytrvalý bojovník, bere hlavně u dna na kukuřici a boilies.',
    shape: {
      bl: 0.8, ex: 1.0,
      top: [[0, 0], [0.015, 0.03], [0.06, 0.07], [0.15, 0.108], [0.26, 0.138], [0.38, 0.15], [0.5, 0.142], [0.65, 0.112], [0.8, 0.074], [0.92, 0.052], [1, 0.048]],
      bot: [[0, 0], [0.015, 0.02], [0.06, 0.05], [0.15, 0.072], [0.3, 0.09], [0.45, 0.096], [0.6, 0.085], [0.75, 0.063], [0.88, 0.047], [1, 0.044]],
      w: [[0, 0], [0.015, 0.022], [0.08, 0.052], [0.2, 0.072], [0.35, 0.082], [0.5, 0.075], [0.7, 0.052], [0.88, 0.026], [1, 0.016]],
      eye: { t: 0.085, y: 0.35, r: 0.017 }, gill: 0.21, mouthY: -0.2,
      dorsal: [{ t0: 0.4, t1: 0.79, h: [0.095, 0.06, 0.035, 0.03, 0.026, 0.022], sweep: 0.03 }],
      anal: { t0: 0.76, t1: 0.88, h: [0.075, 0.05, 0.025], sweep: 0.03 },
      caudal: { type: 'fork', len: 0.2, h: 0.115, notch: 0.45 },
      pect: { t: 0.22, y: -0.75, len: 0.12 }, pelv: { t: 0.48, len: 0.085 },
      barbels: [{ t: 0.02, y: -0.3, len: 0.018 }, { t: 0.035, y: -0.55, len: 0.032 }],
    },
    look: {
      back: [0.2, 0.22, 0.12], side: [0.62, 0.5, 0.24], belly: [0.88, 0.8, 0.56], scales: 'big', scaleRows: 36,
      fins: { dorsal: [0.27, 0.26, 0.18], caudal: [0.4, 0.3, 0.2], caudalLow: [0.62, 0.32, 0.18], anal: [0.58, 0.34, 0.2], pelvic: [0.55, 0.38, 0.22], pect: [0.5, 0.4, 0.28] },
      iris: [0.85, 0.65, 0.2], metal: 0.28, rough: 0.38, clear: 0.6,
    },
  });

  S.push({
    id: 'lysec', name: 'Kapr lysec', latin: 'Cyprinus carpio (šupinatost lysec)', abundance: 3,
    wMin: 1.5, wMax: 18, skew: 2.3, K: 0.02, base: 60, perKg: 75,
    power: 1.3, speed: 1.7, endurance: 24, zone: 'bottom', habitat: 'open', pattern: 'slow', window: 2.3, mouth: 3.3, wRef: 4, shy: 0.65,
    baits: { kukurice: 0.85, boilies_j: 1, boilies_r: 1, testo: 0.5, pelety: 0.85, zizala: 0.3 },
    lures: {}, gb: { gb_kapr: 1, gb_partikl: 0.9, gb_pelety: 1 },
    desc: 'Kapr s několika velkými zrcadlovými šupinami. Vzácnější a ceněný trofejní úlovek.',
    shapeFrom: 'kapr', depthMul: 1.06,
    look: {
      back: [0.24, 0.24, 0.12], side: [0.6, 0.5, 0.22], belly: [0.86, 0.78, 0.52], scales: 'mirror', scaleRows: 22,
      fins: { dorsal: [0.27, 0.25, 0.17], caudal: [0.42, 0.3, 0.2], caudalLow: [0.62, 0.32, 0.18], anal: [0.6, 0.34, 0.2], pelvic: [0.56, 0.38, 0.22], pect: [0.5, 0.4, 0.28] },
      iris: [0.85, 0.65, 0.2], metal: 0.25, rough: 0.3, clear: 0.8,
    },
  });

  S.push({
    id: 'amur', name: 'Amur bílý', latin: 'Ctenopharyngodon idella', abundance: 2.5,
    wMin: 2, wMax: 20, skew: 2.3, K: 0.011, base: 60, perKg: 70,
    power: 1.4, speed: 2.2, endurance: 26, zone: 'mid', habitat: 'reeds', pattern: 'slow', window: 2.0, mouth: 3.4, wRef: 5, shy: 0.7,
    baits: { kukurice: 0.6, chleb: 0.6, testo: 0.3, boilies_j: 0.5, pelety: 0.4 },
    lures: {}, gb: { gb_partikl: 0.8, gb_kapr: 0.5 },
    desc: 'Býložravec s protáhlým válcovitým tělem a síťkovaným vzorem šupin. Prudké a dlouhé výpady.',
    shape: {
      bl: 0.82, ex: 0.92,
      top: prof(0.04, 0.083, 0.36, 0.044, 0.7), bot: prof(0.035, 0.074, 0.42, 0.04, 0.7), w: prof(0.04, 0.07, 0.35, 0.02, 0.8),
      eye: { t: 0.075, y: 0.05, r: 0.012 }, gill: 0.2, mouthY: 0.0,
      dorsal: [{ t0: 0.42, t1: 0.55, h: [0.07, 0.05, 0.02], sweep: 0.025 }],
      anal: { t0: 0.77, t1: 0.86, h: [0.055, 0.035, 0.015], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.18, h: 0.09, notch: 0.42 },
      pect: { t: 0.21, y: -0.8, len: 0.09 }, pelv: { t: 0.47, len: 0.07 }, barbels: [],
    },
    look: {
      back: [0.22, 0.25, 0.2], side: [0.62, 0.62, 0.52], belly: [0.88, 0.88, 0.8], scales: 'net', scaleRows: 40,
      fins: { dorsal: [0.3, 0.32, 0.28], caudal: [0.32, 0.33, 0.3], anal: [0.45, 0.45, 0.4], pelvic: [0.5, 0.48, 0.42], pect: [0.5, 0.48, 0.42] },
      iris: [0.8, 0.75, 0.55], metal: 0.4, rough: 0.35, clear: 0.5,
    },
  });

  S.push({
    id: 'lin', name: 'Lín obecný', latin: 'Tinca tinca', abundance: 5,
    wMin: 0.25, wMax: 3.2, skew: 2.2, K: 0.016, base: 30, perKg: 110,
    power: 1.05, speed: 0.95, endurance: 14, zone: 'bottom', habitat: 'reeds', pattern: 'lift', window: 2.1, mouth: 2.5, wRef: 0.8, shy: 0.4,
    baits: { zizala: 0.9, cervi: 0.6, kukurice: 0.55, rousnice: 0.8, testo: 0.3, pelety: 0.45, boilies_r: 0.3 },
    lures: {}, gb: { gb_kapr: 0.6, gb_partikl: 0.6, gb_pelety: 0.5, gb_cervi: 0.6 },
    desc: 'Slizký zlatozelený lín s rudýma očima. Žije u rákosí a jeho záběr typicky zvedá splávek.',
    shape: {
      bl: 0.81, ex: 0.95,
      top: prof(0.04, 0.094, 0.4, 0.062, 0.7), bot: prof(0.035, 0.08, 0.45, 0.058, 0.7), w: prof(0.035, 0.064, 0.4, 0.03, 0.8),
      eye: { t: 0.075, y: 0.35, r: 0.011 }, gill: 0.2, mouthY: -0.1,
      dorsal: [{ t0: 0.44, t1: 0.6, h: [0.085, 0.08, 0.06, 0.035], sweep: 0.0, round: true }],
      anal: { t0: 0.72, t1: 0.84, h: [0.07, 0.065, 0.035], sweep: 0.0, round: true },
      caudal: { type: 'round', len: 0.19, h: 0.1, notch: 0.12 },
      pect: { t: 0.21, y: -0.8, len: 0.1, round: true }, pelv: { t: 0.45, len: 0.1, round: true },
      barbels: [{ t: 0.03, y: -0.45, len: 0.012 }],
    },
    look: {
      back: [0.1, 0.16, 0.06], side: [0.36, 0.42, 0.14], belly: [0.66, 0.62, 0.3], scales: 'tiny', scaleRows: 90,
      fins: { dorsal: [0.14, 0.18, 0.1], caudal: [0.14, 0.18, 0.1], anal: [0.16, 0.2, 0.1], pelvic: [0.2, 0.24, 0.12], pect: [0.2, 0.24, 0.12] },
      iris: [0.9, 0.25, 0.1], metal: 0.12, rough: 0.22, clear: 1.0,
    },
  });

  S.push({
    id: 'cejn', name: 'Cejn velký', latin: 'Abramis brama', abundance: 8,
    wMin: 0.3, wMax: 5.5, skew: 2.4, K: 0.013, base: 15, perKg: 45,
    power: 0.65, speed: 0.95, endurance: 8, zone: 'bottom', habitat: 'deep', pattern: 'lift', window: 1.9, mouth: 2.3, wRef: 1.2, shy: 0.3,
    baits: { cervi: 0.8, zizala: 0.65, testo: 0.6, kukurice: 0.4, chleb: 0.3, rousnice: 0.45 },
    lures: {}, gb: { gb_univ: 1, gb_cervi: 0.8, gb_kapr: 0.4 },
    desc: 'Vysoké, z boků zploštělé tělo a slizká bronzová šupina. Hejna u dna, typický „zvedací" záběr.',
    shape: {
      bl: 0.78, ex: 1.35,
      top: [[0, 0], [0.015, 0.02], [0.06, 0.05], [0.14, 0.1], [0.24, 0.145], [0.36, 0.165], [0.48, 0.155], [0.62, 0.12], [0.78, 0.074], [0.92, 0.042], [1, 0.038]],
      bot: [[0, 0], [0.015, 0.016], [0.06, 0.04], [0.15, 0.075], [0.3, 0.11], [0.45, 0.125], [0.6, 0.11], [0.75, 0.075], [0.9, 0.042], [1, 0.036]],
      w: [[0, 0], [0.015, 0.012], [0.07, 0.03], [0.2, 0.042], [0.35, 0.046], [0.55, 0.04], [0.75, 0.026], [0.9, 0.014], [1, 0.01]],
      eye: { t: 0.08, y: 0.25, r: 0.017 }, gill: 0.2, mouthY: -0.25,
      dorsal: [{ t0: 0.46, t1: 0.57, h: [0.11, 0.07, 0.02], sweep: 0.03 }],
      anal: { t0: 0.55, t1: 0.92, h: [0.06, 0.045, 0.03, 0.02, 0.015], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.22, h: 0.12, notch: 0.55, lowLonger: 0.15 },
      pect: { t: 0.22, y: -0.8, len: 0.11 }, pelv: { t: 0.44, len: 0.08 }, barbels: [],
    },
    look: {
      back: [0.18, 0.19, 0.17], side: [0.56, 0.5, 0.38], belly: [0.8, 0.76, 0.64], scales: 'medium', scaleRows: 48,
      fins: { dorsal: [0.22, 0.22, 0.22], caudal: [0.24, 0.24, 0.24], anal: [0.26, 0.26, 0.25], pelvic: [0.3, 0.28, 0.26], pect: [0.32, 0.3, 0.28] },
      iris: [0.85, 0.82, 0.7], metal: 0.32, rough: 0.3, clear: 0.9,
    },
  });

  S.push({
    id: 'plotice', name: 'Plotice obecná', latin: 'Rutilus rutilus', abundance: 14,
    wMin: 0.04, wMax: 0.9, skew: 2.5, K: 0.012, base: 6, perKg: 50,
    power: 1.0, speed: 1.4, endurance: 5, zone: 'mid', habitat: 'open', pattern: 'dip', window: 0.85, mouth: 1.5, wRef: 0.2, shy: 0.2,
    baits: { cervi: 0.9, chleb: 0.6, testo: 0.6, kukurice: 0.3, zizala: 0.45 },
    lures: { rotacni_s: 0.08 }, gb: { gb_univ: 1, gb_cervi: 1 },
    desc: 'Stříbřitá rybka s rudou duhovkou a oranžovými ploutvemi. Nejčastější úlovek – rychlé ťukavé záběry.',
    shape: {
      bl: 0.8, ex: 1.12,
      top: prof(0.035, 0.105, 0.36, 0.04), bot: prof(0.03, 0.085, 0.42, 0.037), w: prof(0.03, 0.048, 0.36, 0.014),
      eye: { t: 0.08, y: 0.25, r: 0.023 }, gill: 0.21, mouthY: 0.0,
      dorsal: [{ t0: 0.41, t1: 0.52, h: [0.095, 0.06, 0.018], sweep: 0.03 }],
      anal: { t0: 0.7, t1: 0.8, h: [0.07, 0.045, 0.016], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.2, h: 0.1, notch: 0.5 },
      pect: { t: 0.22, y: -0.8, len: 0.1 }, pelv: { t: 0.43, len: 0.085 }, barbels: [],
    },
    look: {
      back: [0.16, 0.22, 0.27], side: [0.78, 0.8, 0.82], belly: [0.94, 0.94, 0.92], scales: 'medium', scaleRows: 44,
      fins: { dorsal: [0.42, 0.34, 0.3], caudal: [0.45, 0.32, 0.28], anal: [0.9, 0.42, 0.2], pelvic: [0.92, 0.42, 0.18], pect: [0.82, 0.5, 0.3] },
      iris: [0.85, 0.12, 0.08], metal: 0.6, rough: 0.24, clear: 0.5,
    },
  });

  S.push({
    id: 'perlin', name: 'Perlín ostrobřichý', latin: 'Scardinius erythrophthalmus', abundance: 8,
    wMin: 0.04, wMax: 0.9, skew: 2.4, K: 0.014, base: 6, perKg: 55,
    power: 1.0, speed: 1.4, endurance: 5, zone: 'surface', habitat: 'reeds', pattern: 'dip', window: 0.85, mouth: 1.5, wRef: 0.2, shy: 0.15,
    baits: { chleb: 0.9, cervi: 0.75, testo: 0.5, kukurice: 0.3, zizala: 0.35 },
    lures: { rotacni_s: 0.05 }, gb: { gb_univ: 0.9, gb_cervi: 0.6 },
    desc: 'Zlatavý perlín se šarlatově rudými ploutvemi a ústy otočenými vzhůru. Bere těsně pod hladinou.',
    shape: {
      bl: 0.8, ex: 1.15,
      top: prof(0.028, 0.11, 0.4, 0.038), bot: prof(0.038, 0.095, 0.42, 0.036), w: prof(0.028, 0.048, 0.38, 0.014),
      eye: { t: 0.075, y: 0.3, r: 0.021 }, gill: 0.2, mouthY: 0.35,
      dorsal: [{ t0: 0.5, t1: 0.6, h: [0.085, 0.055, 0.018], sweep: 0.03 }],
      anal: { t0: 0.68, t1: 0.8, h: [0.07, 0.045, 0.016], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.2, h: 0.1, notch: 0.5 },
      pect: { t: 0.22, y: -0.8, len: 0.1 }, pelv: { t: 0.42, len: 0.085 }, barbels: [],
    },
    look: {
      back: [0.24, 0.24, 0.14], side: [0.8, 0.72, 0.46], belly: [0.94, 0.9, 0.78], scales: 'medium', scaleRows: 40,
      fins: { dorsal: [0.55, 0.3, 0.22], caudal: [0.85, 0.2, 0.12], anal: [0.92, 0.18, 0.1], pelvic: [0.95, 0.18, 0.1], pect: [0.9, 0.35, 0.2] },
      iris: [0.95, 0.55, 0.12], metal: 0.55, rough: 0.25, clear: 0.5,
    },
  });

  S.push({
    id: 'karas', name: 'Karas obecný', latin: 'Carassius carassius', abundance: 7,
    wMin: 0.1, wMax: 1.8, skew: 2.2, K: 0.022, base: 10, perKg: 60,
    power: 0.9, speed: 1.0, endurance: 8, zone: 'bottom', habitat: 'reeds', pattern: 'slow', window: 1.7, mouth: 2.0, wRef: 0.5, shy: 0.2,
    baits: { cervi: 0.7, zizala: 0.8, testo: 0.8, kukurice: 0.5, chleb: 0.4 },
    lures: {}, gb: { gb_univ: 0.8, gb_kapr: 0.6, gb_cervi: 0.5 },
    desc: 'Zlatohnědý karas s vysokým klenutým hřbetem. Nenáročný, opatrný a vytrvalý na tenkém vlasci.',
    shape: {
      bl: 0.8, ex: 1.1,
      top: [[0, 0], [0.015, 0.02], [0.06, 0.055], [0.15, 0.1], [0.27, 0.138], [0.4, 0.148], [0.53, 0.138], [0.66, 0.108], [0.8, 0.072], [0.92, 0.054], [1, 0.05]],
      bot: [[0, 0], [0.015, 0.016], [0.06, 0.042], [0.15, 0.065], [0.3, 0.09], [0.45, 0.098], [0.6, 0.088], [0.75, 0.064], [0.9, 0.05], [1, 0.047]],
      w: [[0, 0], [0.015, 0.014], [0.08, 0.038], [0.22, 0.056], [0.4, 0.06], [0.55, 0.054], [0.75, 0.034], [0.9, 0.018], [1, 0.012]],
      eye: { t: 0.08, y: 0.32, r: 0.019 }, gill: 0.21, mouthY: 0.0,
      dorsal: [{ t0: 0.42, t1: 0.8, h: [0.075, 0.07, 0.06, 0.05, 0.035, 0.02], sweep: 0.02, round: true }],
      anal: { t0: 0.76, t1: 0.86, h: [0.065, 0.045, 0.02], sweep: 0.02 },
      caudal: { type: 'emarg', len: 0.2, h: 0.11, notch: 0.25 },
      pect: { t: 0.22, y: -0.8, len: 0.1 }, pelv: { t: 0.45, len: 0.085 }, barbels: [],
    },
    look: {
      back: [0.24, 0.24, 0.11], side: [0.66, 0.54, 0.22], belly: [0.84, 0.74, 0.46], scales: 'big', scaleRows: 32,
      fins: { dorsal: [0.4, 0.3, 0.16], caudal: [0.45, 0.32, 0.16], anal: [0.6, 0.38, 0.18], pelvic: [0.62, 0.4, 0.2], pect: [0.6, 0.45, 0.25] },
      iris: [0.9, 0.7, 0.2], metal: 0.35, rough: 0.32, clear: 0.6, tailSpot: true,
    },
  });

  S.push({
    id: 'okoun', name: 'Okoun říční', latin: 'Perca fluviatilis', abundance: 9,
    wMin: 0.05, wMax: 2.0, skew: 2.6, K: 0.013, base: 15, perKg: 140, predator: true,
    power: 1.0, speed: 1.6, endurance: 7, zone: 'mid', habitat: 'open', pattern: 'dip', window: 1.0, mouth: 2.6, wRef: 0.3, shy: 0.1,
    baits: { zizala: 0.9, rousnice: 0.7, cervi: 0.55, rybicka: 0.8 },
    lures: { rotacni_s: 1, rotacni_g: 0.6, plandavka: 0.4, wobler_s: 0.5, twister: 0.8, ripper: 0.4 },
    gb: { gb_cervi: 0.7 },
    desc: 'Pruhovaný dravec s ostnitou hřbetní ploutví a oranžovými břišními ploutvemi. Útočí na třpytky.',
    shape: {
      bl: 0.82, ex: 1.05,
      top: [[0, 0], [0.015, 0.018], [0.06, 0.04], [0.14, 0.07], [0.24, 0.105], [0.33, 0.12], [0.45, 0.115], [0.6, 0.09], [0.78, 0.058], [0.92, 0.042], [1, 0.04]],
      bot: [[0, 0], [0.015, 0.018], [0.06, 0.045], [0.15, 0.066], [0.3, 0.082], [0.45, 0.085], [0.6, 0.074], [0.78, 0.05], [0.92, 0.04], [1, 0.038]],
      w: prof(0.03, 0.055, 0.35, 0.016),
      eye: { t: 0.075, y: 0.4, r: 0.022 }, gill: 0.24, mouthY: 0.0,
      dorsal: [{ t0: 0.27, t1: 0.5, h: [0.06, 0.1, 0.09, 0.07, 0.04, 0.012], sweep: 0.01, spiny: true, spot: true }, { t0: 0.53, t1: 0.7, h: [0.07, 0.06, 0.04, 0.015], sweep: 0.02 }],
      anal: { t0: 0.68, t1: 0.79, h: [0.065, 0.05, 0.02], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.18, h: 0.1, notch: 0.35 },
      pect: { t: 0.24, y: -0.4, len: 0.1 }, pelv: { t: 0.3, len: 0.1 }, barbels: [],
    },
    look: {
      back: [0.12, 0.22, 0.1], side: [0.56, 0.6, 0.26], belly: [0.92, 0.9, 0.72], scales: 'small', scaleRows: 64, pattern: 'bars',
      fins: { dorsal: [0.38, 0.4, 0.36], dorsal2: [0.5, 0.5, 0.3], caudal: [0.7, 0.4, 0.2], anal: [0.95, 0.42, 0.12], pelvic: [0.95, 0.4, 0.1], pect: [0.75, 0.55, 0.25] },
      iris: [0.95, 0.72, 0.15], metal: 0.25, rough: 0.4, clear: 0.4,
    },
  });

  S.push({
    id: 'stika', name: 'Štika obecná', latin: 'Esox lucius', abundance: 3.5,
    wMin: 1, wMax: 13, skew: 2.6, K: 0.0065, base: 80, perKg: 110, predator: true,
    power: 1.15, speed: 2.6, endurance: 14, zone: 'mid', habitat: 'reeds', pattern: 'run', window: 1.6, mouth: 4.2, wRef: 3, shy: 0.15,
    baits: { rybicka: 1, zizala: 0.04 },
    lures: { rotacni_g: 0.9, rotacni_s: 0.45, plandavka: 1, wobler_s: 0.9, wobler_d: 0.7, twister: 0.55, ripper: 0.8 },
    gb: {},
    desc: 'Dravec se zobákovitou tlamou plnou zubů a skvrnitým zeleným bokem. Číhá u rákosí, útok je bleskový.',
    shape: {
      bl: 0.84, ex: 0.95,
      top: [[0, 0], [0.012, 0.009], [0.06, 0.022], [0.12, 0.036], [0.22, 0.054], [0.35, 0.066], [0.5, 0.074], [0.65, 0.072], [0.78, 0.056], [0.92, 0.038], [1, 0.035]],
      bot: [[0, 0], [0.012, 0.008], [0.06, 0.018], [0.12, 0.032], [0.22, 0.052], [0.35, 0.066], [0.5, 0.072], [0.65, 0.066], [0.8, 0.048], [0.92, 0.035], [1, 0.033]],
      w: [[0, 0], [0.012, 0.016], [0.06, 0.03], [0.12, 0.038], [0.25, 0.05], [0.45, 0.056], [0.65, 0.048], [0.85, 0.026], [1, 0.012]],
      eye: { t: 0.15, y: 0.7, r: 0.013 }, gill: 0.28, mouthY: 0.0, mouthLen: 0.12,
      dorsal: [{ t0: 0.73, t1: 0.88, h: [0.04, 0.065, 0.06, 0.035], sweep: 0.025, round: true }],
      anal: { t0: 0.75, t1: 0.89, h: [0.04, 0.06, 0.05, 0.03], sweep: 0.02, round: true },
      caudal: { type: 'fork', len: 0.16, h: 0.085, notch: 0.4 },
      pect: { t: 0.29, y: -0.85, len: 0.08 }, pelv: { t: 0.55, len: 0.07 }, barbels: [],
    },
    look: {
      back: [0.12, 0.18, 0.08], side: [0.36, 0.46, 0.18], belly: [0.92, 0.9, 0.78], scales: 'small', scaleRows: 90, pattern: 'pike',
      fins: { dorsal: [0.45, 0.32, 0.18], caudal: [0.48, 0.32, 0.18], anal: [0.5, 0.33, 0.2], pelvic: [0.55, 0.38, 0.22], pect: [0.55, 0.4, 0.25] },
      iris: [0.9, 0.78, 0.25], metal: 0.15, rough: 0.3, clear: 0.8,
    },
  });

  S.push({
    id: 'candat', name: 'Candát obecný', latin: 'Sander lucioperca', abundance: 2,
    wMin: 0.8, wMax: 9, skew: 2.6, K: 0.0085, base: 120, perKg: 190, predator: true,
    power: 1.0, speed: 2.0, endurance: 14, zone: 'bottom', habitat: 'deep', pattern: 'run', window: 1.2, mouth: 3.6, wRef: 2, shy: 0.5,
    baits: { rybicka: 1, rousnice: 0.15 },
    lures: { twister: 1, ripper: 0.9, wobler_d: 0.9, wobler_s: 0.6, rotacni_g: 0.4, plandavka: 0.3 },
    gb: {},
    desc: 'Nejcennější dravec rybníka. Skelné oči, ostnitá hřbetní ploutev a tmavé pruhy. Loví u dna v hloubce.',
    shape: {
      bl: 0.83, ex: 1.05,
      top: [[0, 0], [0.012, 0.012], [0.06, 0.03], [0.14, 0.055], [0.26, 0.078], [0.36, 0.085], [0.5, 0.08], [0.65, 0.066], [0.8, 0.048], [0.92, 0.036], [1, 0.034]],
      bot: [[0, 0], [0.012, 0.012], [0.06, 0.03], [0.15, 0.05], [0.3, 0.066], [0.45, 0.07], [0.6, 0.062], [0.78, 0.045], [0.92, 0.034], [1, 0.032]],
      w: prof(0.025, 0.05, 0.36, 0.014),
      eye: { t: 0.09, y: 0.5, r: 0.02 }, gill: 0.25, mouthY: 0.0, fangs: true,
      dorsal: [{ t0: 0.27, t1: 0.5, h: [0.05, 0.085, 0.08, 0.06, 0.04, 0.015], sweep: 0.01, spiny: true }, { t0: 0.52, t1: 0.76, h: [0.06, 0.06, 0.05, 0.03, 0.012], sweep: 0.02 }],
      anal: { t0: 0.68, t1: 0.8, h: [0.06, 0.05, 0.02], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.17, h: 0.09, notch: 0.35 },
      pect: { t: 0.26, y: -0.45, len: 0.09 }, pelv: { t: 0.3, len: 0.09 }, barbels: [],
    },
    look: {
      back: [0.22, 0.27, 0.25], side: [0.62, 0.66, 0.62], belly: [0.95, 0.95, 0.92], scales: 'small', scaleRows: 80, pattern: 'zander',
      fins: { dorsal: [0.5, 0.52, 0.48], dorsal2: [0.55, 0.56, 0.5], caudal: [0.5, 0.52, 0.48], anal: [0.75, 0.75, 0.68], pelvic: [0.78, 0.78, 0.72], pect: [0.65, 0.6, 0.5] },
      iris: [0.78, 0.8, 0.72], metal: 0.35, rough: 0.3, clear: 0.5, glassyEye: true,
    },
  });

  S.push({
    id: 'sumec', name: 'Sumec velký', latin: 'Silurus glanis', abundance: 1,
    wMin: 4, wMax: 55, skew: 2.8, K: 0.0055, base: 200, perKg: 70, predator: true,
    power: 1.0, speed: 1.8, endurance: 40, zone: 'bottom', habitat: 'deep', pattern: 'run', window: 2.0, mouth: 5.0, wRef: 15, shy: 0.1,
    baits: { rybicka: 0.9, rousnice: 0.6, zizala: 0.25, pelety: 0.55, boilies_r: 0.4 },
    lures: { wobler_d: 0.7, ripper: 0.5, rotacni_g: 0.2 },
    gb: { gb_pelety: 0.7 },
    desc: 'Největší sladkovodní ryba Evropy. Obrovská hlava, šest vousů a mramorovaná kůže bez šupin. Táhne jako vlak.',
    shape: {
      bl: 0.9, ex: 0.85,
      top: [[0, 0], [0.012, 0.02], [0.05, 0.045], [0.12, 0.066], [0.22, 0.076], [0.36, 0.078], [0.52, 0.068], [0.7, 0.054], [0.88, 0.035], [1, 0.03]],
      bot: [[0, 0], [0.012, 0.022], [0.05, 0.04], [0.12, 0.056], [0.25, 0.07], [0.4, 0.074], [0.6, 0.064], [0.8, 0.045], [1, 0.03]],
      w: [[0, 0], [0.012, 0.04], [0.05, 0.07], [0.1, 0.08], [0.2, 0.078], [0.35, 0.064], [0.55, 0.046], [0.8, 0.026], [1, 0.012]],
      eye: { t: 0.06, y: 0.45, r: 0.006 }, gill: 0.16, mouthY: 0.0, wideMouth: true,
      dorsal: [{ t0: 0.28, t1: 0.33, h: [0.03, 0.025, 0.01], sweep: 0.01, round: true }],
      anal: { t0: 0.38, t1: 0.99, h: [0.025, 0.04, 0.042, 0.042, 0.04, 0.035], sweep: 0.0, round: true },
      caudal: { type: 'round', len: 0.1, h: 0.05, notch: 0.15 },
      pect: { t: 0.14, y: -0.8, len: 0.08, round: true }, pelv: { t: 0.38, len: 0.05, round: true },
      barbels: [{ t: 0.03, y: 0.35, len: 0.32, long: true }, { t: 0.02, y: -0.85, len: 0.06, inner: true }, { t: 0.025, y: -0.85, len: 0.07 }],
    },
    look: {
      back: [0.05, 0.055, 0.045], side: [0.2, 0.2, 0.15], belly: [0.5, 0.5, 0.44], scales: 'none', pattern: 'mottle',
      fins: { dorsal: [0.12, 0.12, 0.1], caudal: [0.14, 0.13, 0.11], anal: [0.18, 0.17, 0.14], pelvic: [0.3, 0.28, 0.24], pect: [0.18, 0.17, 0.14] },
      iris: [0.6, 0.55, 0.3], metal: 0.05, rough: 0.28, clear: 1.0,
    },
  });

  S.push({
    id: 'uhor', name: 'Úhoř říční', latin: 'Anguilla anguilla', abundance: 2,
    wMin: 0.3, wMax: 2.8, skew: 2.3, K: 0.0016, base: 120, perKg: 260, predator: true,
    power: 1.3, speed: 1.2, endurance: 18, zone: 'bottom', habitat: 'reeds', pattern: 'run', window: 1.6, mouth: 3.0, wRef: 0.8, shy: 0.2,
    baits: { rousnice: 1, zizala: 0.8, rybicka: 0.6 },
    lures: {}, gb: {},
    desc: 'Hadovitá tajemná ryba s nepřerušeným lemem ploutví. Kroutí se a zamotává – zdolání je zrádné.',
    swim: 'eel',
    shape: {
      bl: 0.98, ex: 1.0,
      top: [[0, 0], [0.01, 0.008], [0.04, 0.018], [0.1, 0.026], [0.25, 0.032], [0.45, 0.034], [0.65, 0.03], [0.85, 0.022], [0.97, 0.01], [1, 0.004]],
      bot: [[0, 0], [0.01, 0.01], [0.04, 0.02], [0.1, 0.027], [0.25, 0.033], [0.45, 0.035], [0.65, 0.03], [0.85, 0.022], [0.97, 0.01], [1, 0.004]],
      w: [[0, 0], [0.01, 0.01], [0.04, 0.02], [0.1, 0.026], [0.3, 0.03], [0.5, 0.026], [0.7, 0.016], [0.9, 0.008], [1, 0.003]],
      eye: { t: 0.035, y: 0.5, r: 0.006 }, gill: 0.12, mouthY: -0.1,
      dorsal: [{ t0: 0.33, t1: 1.0, h: [0.006, 0.018, 0.022, 0.024, 0.024, 0.02], sweep: 0.0, round: true }],
      anal: { t0: 0.45, t1: 1.0, h: [0.006, 0.02, 0.022, 0.022, 0.02], sweep: 0.0, round: true },
      caudal: { type: 'eel', len: 0.025, h: 0.02, notch: 0 },
      pect: { t: 0.13, y: -0.1, len: 0.025, round: true }, pelv: null, barbels: [],
    },
    look: {
      back: [0.1, 0.1, 0.05], side: [0.34, 0.32, 0.14], belly: [0.78, 0.7, 0.38], scales: 'none',
      fins: { dorsal: [0.18, 0.17, 0.1], caudal: [0.18, 0.17, 0.1], anal: [0.45, 0.42, 0.25], pelvic: [0.4, 0.4, 0.3], pect: [0.35, 0.32, 0.2] },
      iris: [0.85, 0.72, 0.3], metal: 0.08, rough: 0.2, clear: 1.0,
    },
  });

  S.push({
    id: 'ouklej', name: 'Ouklej obecná', latin: 'Alburnus alburnus', abundance: 10,
    wMin: 0.008, wMax: 0.06, skew: 2.0, K: 0.009, base: 3, perKg: 80,
    power: 1.2, speed: 1.4, endurance: 3, zone: 'surface', habitat: 'open', pattern: 'dip', window: 0.6, mouth: 1.0, wRef: 0.02, shy: 0.05,
    baits: { cervi: 1, chleb: 0.7, testo: 0.3, zizala: 0.2 },
    lures: {}, gb: { gb_univ: 0.9, gb_cervi: 0.6 },
    desc: 'Drobná, zářivě stříbrná rybka, která se drží v hejnech u hladiny. Ideální nástražní rybka.',
    shape: {
      bl: 0.81, ex: 1.25,
      top: prof(0.025, 0.07, 0.42, 0.03), bot: prof(0.035, 0.085, 0.45, 0.03), w: prof(0.025, 0.038, 0.38, 0.01),
      eye: { t: 0.075, y: 0.25, r: 0.026 }, gill: 0.2, mouthY: 0.4,
      dorsal: [{ t0: 0.55, t1: 0.63, h: [0.07, 0.045, 0.012], sweep: 0.03 }],
      anal: { t0: 0.62, t1: 0.82, h: [0.06, 0.04, 0.025, 0.012], sweep: 0.02 },
      caudal: { type: 'fork', len: 0.19, h: 0.085, notch: 0.55 },
      pect: { t: 0.21, y: -0.8, len: 0.1 }, pelv: { t: 0.44, len: 0.07 }, barbels: [],
    },
    look: {
      back: [0.18, 0.3, 0.32], side: [0.86, 0.88, 0.9], belly: [0.96, 0.96, 0.96], scales: 'small', scaleRows: 50,
      fins: { dorsal: [0.6, 0.62, 0.62], caudal: [0.62, 0.64, 0.64], anal: [0.8, 0.8, 0.78], pelvic: [0.82, 0.8, 0.78], pect: [0.8, 0.8, 0.78] },
      iris: [0.85, 0.85, 0.82], metal: 0.8, rough: 0.18, clear: 0.4,
    },
  });

  FS.SpeciesById = {};
  S.forEach((s) => {
    FS.SpeciesById[s.id] = s;
    if (s.shapeFrom) {
      const src = S.find((o) => o.id === s.shapeFrom).shape;
      const d = s.depthMul || 1;
      s.shape = Object.assign({}, src, {
        top: src.top.map(([t, v]) => [t, v * d]), bot: src.bot.map(([t, v]) => [t, v * d]),
      });
    }
  });

  // délka v cm z hmotnosti
  FS.lengthFromWeight = (sp, w) => Math.pow((w * 1000) / sp.K, 1 / 3);

  // ---------- vzácné barevné varianty ----------
  const mixFin = (fins, col, k) => {
    const out = {};
    for (const key in fins) out[key] = fins[key].map((v, i) => v + (col[i] - v) * k);
    return out;
  };
  FS.Variants = {
    zlata: {
      label: 'Zlatá forma', chance: 0.025, mult: 2.5, color: '#ffb52e',
      not: ['uhor', 'sumec'],
      look: (L) => ({ back: [0.6, 0.34, 0.06], side: [1.0, 0.64, 0.14], belly: [1.0, 0.86, 0.52], fins: mixFin(L.fins, [1.0, 0.55, 0.12], 0.7), metal: Math.max(0.45, L.metal), patternStrength: 0.4 }),
    },
    albin: {
      label: 'Albín', chance: 0.015, mult: 3.5, color: '#ffd9d2',
      look: (L) => ({ back: [0.86, 0.78, 0.72], side: [0.97, 0.91, 0.87], belly: [1, 0.97, 0.95], iris: [0.95, 0.12, 0.15], fins: mixFin(L.fins, [1.0, 0.82, 0.8], 0.8), patternStrength: 0.18 }),
    },
    koi: {
      label: 'Koi', chance: 0.035, mult: 4, color: '#ff7a3a', only: ['kapr'],
      look: (L) => ({ back: [0.97, 0.95, 0.9], side: [0.98, 0.96, 0.92], belly: [1, 0.98, 0.95], pattern: 'koi', fins: mixFin(L.fins, [1.0, 0.9, 0.85], 0.75), metal: 0.25 }),
    },
    cerna: {
      label: 'Černá forma', chance: 0.02, mult: 3, color: '#8a8a9a', only: ['stika', 'okoun', 'candat', 'lin', 'karas'],
      look: (L) => ({ back: [0.03, 0.035, 0.03], side: [0.1, 0.11, 0.09], belly: [0.3, 0.3, 0.26], fins: mixFin(L.fins, [0.06, 0.06, 0.06], 0.75), patternStrength: 0.5 }),
    },
  };
  FS.rollVariant = function (sp) {
    for (const id in FS.Variants) {
      const v = FS.Variants[id];
      if (v.only && !v.only.includes(sp.id)) continue;
      if (v.not && v.not.includes(sp.id)) continue;
      if (Math.random() < v.chance) return id;
    }
    return null;
  };
  // druh s upraveným vzhledem (id zůstává, pro cache modelu slouží lookKey)
  FS.variantSpecies = function (sp, vid, extraLook) {
    if (!vid && !extraLook) return sp;
    const v = vid ? FS.Variants[vid] : null;
    const look = Object.assign({}, sp.look, v ? v.look(sp.look) : {}, extraLook || {});
    return Object.assign({}, sp, { look, lookKey: sp.id + ':' + (vid || '') + ':' + (extraLook ? 'L' : '') });
  };

  // ---------- legendární ryby (bossové) ----------
  FS.Legends = [
    {
      id: 'mana', name: 'Zubatá Máňa', sp: 'stika', weight: 14.5, maxF: 15, endurance: 3.0, reward: 4000, tokens: 3,
      zone: [-38, -24], r: 9, baits: ['rybicka'], lures: ['wobler_s', 'wobler_d', 'ripper', 'plandavka', 'rotacni_g'],
      hint: 'Stojí v rákosí na levém konci rybníka. Bere na rybičku nebo pořádný wobler.',
      look: { back: [0.06, 0.1, 0.04], side: [0.24, 0.32, 0.12], belly: [0.85, 0.82, 0.66] },
      desc: 'Prastará štika z levého rákosí. Říká se, že už přetrhla stovky vlasců.',
    },
    {
      id: 'bohous', name: 'Starý Bohouš', sp: 'lysec', weight: 24, maxF: 21, endurance: 3.2, reward: 7000, tokens: 3,
      zone: [-12, -26], r: 10, baits: ['boilies_j', 'boilies_r', 'kukurice', 'pelety'], lures: [],
      hint: 'Pomalu krouží v hloubce uprostřed rybníka. Na kukuřici, pelety nebo boilies, nástraha na dně.',
      look: { back: [0.16, 0.14, 0.06], side: [0.52, 0.4, 0.16] },
      desc: 'Obří lysec, kterého pamatuje ještě Vávrův děda. Zlaté šupiny jako tácky.',
    },
    {
      id: 'vousac', name: 'Kapitán Vousáč', sp: 'sumec', weight: 72, maxF: 40, endurance: 2.6, reward: 15000, tokens: 5,
      zone: [4, -27], r: 9, baits: ['rybicka', 'rousnice', 'pelety', 'boilies_r'], lures: ['wobler_d'],
      hint: 'Odpočívá v nejhlubším místě vpravo vzadu. Bez sumcového prutu a šňůry to nezkoušej.',
      look: { back: [0.02, 0.022, 0.02], side: [0.12, 0.12, 0.1] },
      desc: 'Pán rybníka. Dvoumetrový sumec s vousy jako lodní lana.',
    },
  ];
  FS.LegendById = {};
  FS.Legends.forEach((l) => (FS.LegendById[l.id] = l));
})(window.FS);
