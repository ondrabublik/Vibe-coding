'use strict';
// Shared helpers, terrain height function and game constants.
window.BW = window.BW || {};

(function (BW) {
  BW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  BW.lerp = (a, b, t) => a + (b - a) * t;
  BW.smoothstep = (e0, e1, x) => {
    const t = BW.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // Seeded PRNG (mulberry32) so the world looks the same every mission.
  BW.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  BW.WORLD_SIZE = 20000;
  BW.WATER_LEVEL = -28;
  BW.BATTLE_RADIUS = 6500;

  // Runway runs along +z (north), centred at the origin.
  BW.AIRFIELD = { halfWidth: 170, halfLength: 680, runwayHalfWidth: 30, runwayHalfLength: 575 };

  BW.terrainHeight = function (x, z) {
    let h =
      140 * Math.sin(x * 0.00093 + 1.3) * Math.cos(z * 0.00081 - 0.4) +
      70 * Math.sin(x * 0.0021 + z * 0.0016 + 0.7) +
      35 * Math.cos(x * 0.0047 - z * 0.0039 + 2.1) +
      12 * Math.sin(x * 0.011 + z * 0.0093) +
      40;
    // Flatten the airfield (ellipse stretched along the runway).
    const d = Math.hypot(x, z / 1.8);
    h *= BW.smoothstep(450, 1300, d);
    // Mountain ring bounding the battle area.
    const r = Math.hypot(x, z);
    const m = BW.smoothstep(6200, 9500, r);
    if (m > 0) {
      const a = Math.atan2(z, x);
      h += m * (520 + 220 * Math.sin(a * 7 + r * 0.0012) + 120 * Math.sin(a * 17 - r * 0.003));
    }
    return h;
  };
  BW.groundHeight = (x, z) => Math.max(BW.terrainHeight(x, z), BW.WATER_LEVEL);
  BW.isWater = (x, z) => BW.terrainHeight(x, z) < BW.WATER_LEVEL;
  BW.onAirfield = (x, z) => Math.abs(x) < BW.AIRFIELD.halfWidth && Math.abs(z) < BW.AIRFIELD.halfLength;

  // Difficulty levels. aimCone/spread are in radians.
  BW.DIFFICULTIES = {
    easy: {
      name: 'Nováček', desc: '3 nepřátelé, 3 spojenci. Nepřítel střílí nepřesně, tvůj letoun vydrží hodně.',
      enemies: 3, allies: 3, enemyHp: 60, playerHp: 160, dmgToPlayer: 0.4,
      skill: 0.5, reaction: 0.6, aimCone: 0.075, spread: 0.024, fireRange: 320,
      maxOnPlayer: 1, evade: 0.2, leadMarker: true, crashVs: -9, groups: 1,
    },
    normal: {
      name: 'Pilot', desc: '5 nepřátel, 3 spojenci. Vyrovnaný souboj.',
      enemies: 5, allies: 3, enemyHp: 85, playerHp: 130, dmgToPlayer: 0.65,
      skill: 0.7, reaction: 0.35, aimCone: 0.055, spread: 0.015, fireRange: 380,
      maxOnPlayer: 2, evade: 0.45, leadMarker: true, crashVs: -7.5, groups: 1,
    },
    hard: {
      name: 'Veterán', desc: '7 nepřátel ve dvou skupinách, 2 spojenci. Bez ukazatele předstihu.',
      enemies: 7, allies: 2, enemyHp: 105, playerHp: 110, dmgToPlayer: 0.85,
      skill: 0.8, reaction: 0.22, aimCone: 0.04, spread: 0.009, fireRange: 430,
      maxOnPlayer: 2, evade: 0.65, leadMarker: false, crashVs: -6.5, groups: 2,
    },
    ace: {
      name: 'Eso', desc: '9 nepřátelských es ve dvou skupinách, 2 spojenci. Soustředí se na tebe.',
      enemies: 9, allies: 2, enemyHp: 125, playerHp: 100, dmgToPlayer: 1.1,
      skill: 0.95, reaction: 0.1, aimCone: 0.03, spread: 0.006, fireRange: 480,
      maxOnPlayer: 4, evade: 1.0, leadMarker: false, crashVs: -6, groups: 2,
    },
  };

  BW.ALLY_AI = { skill: 0.8, reaction: 0.3, aimCone: 0.05, spread: 0.014, fireRange: 380, evade: 0.5 };

  BW.hex = (s) => BABYLON.Color3.FromHexString(s);
})(window.BW);
