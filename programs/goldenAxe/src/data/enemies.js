// Enemy archetypes. windup = telegraph time before the hit; cooldown = [min, max] seconds between attacks.
export const ENEMIES = {
  heninger: {
    name: 'Heninger', hp: 34, speed: 2.5, damage: 7, reach: 1.4, windup: 0.38, cooldown: [0.9, 1.8],
    knockdownChance: 0.15, score: 100, attackAnim: 'slash',
    model: {
      skin: 0xc98f65, cloth: 0x8a2020, pants: 0x3d2b1f, boots: 0x2a1c12, hair: 0x2a1c12, metal: 0x8a8f99,
      torso: 'armor', legs: 'pants', helmet: 'spiked', weapon: 'club', bulk: 1.1,
    },
  },
  longmoan: {
    name: 'Longmoan', hp: 44, speed: 2.2, damage: 9, reach: 1.7, windup: 0.45, cooldown: [1.1, 2.0],
    knockdownChance: 0.3, score: 150, attackAnim: 'overhead',
    model: {
      skin: 0xb08060, cloth: 0x3f4b6b, pants: 0x2a2a35, boots: 0x1a1a20, hair: 0x1a1a1a, metal: 0x7a7f8a,
      torso: 'armor', legs: 'pants', helmet: 'hood', weapon: 'flail', bulk: 1.22, scale: 1.05, pauldrons: true,
    },
  },
  amazon: {
    name: 'Storchinaya', hp: 30, speed: 3.4, damage: 6, reach: 1.6, windup: 0.28, cooldown: [0.7, 1.4],
    knockdownChance: 0.1, score: 120, attackAnim: 'thrust',
    model: {
      skin: 0xc8906a, cloth: 0x2f6b3a, pants: 0x2f6b3a, boots: 0x4a3020, hair: 0x1a1a1a, accent: 0x8a6a2a,
      torso: 'bikini', legs: 'bare', hairStyle: 'long', weapon: 'spear', bulk: 0.9, female: true,
    },
  },
  badBrother: {
    name: 'BAD BROTHER', hp: 240, speed: 2.0, damage: 14, reach: 2.0, windup: 0.55, cooldown: [1.0, 1.8],
    knockdownChance: 1, superArmor: true, grabbable: false, boss: true, score: 2000, attackAnim: 'overhead',
    model: {
      skin: 0x9a6a48, cloth: 0x4a3a2a, pants: 0x4a3a2a, boots: 0x2a1c12, hair: 0x1a1a1a, accent: 0x6b4a2b,
      torso: 'bare', legs: 'pants', hairStyle: 'bald', weapon: 'hammer', bulk: 1.5, scale: 1.45,
    },
  },
  thief: {
    name: 'Thief', hp: 999, speed: 3.2, damage: 0, reach: 0, thief: true, grabbable: false, score: 0,
    model: {
      skin: 0x9ab87a, cloth: 0x2f58b5, pants: 0x2f58b5, boots: 0x6b4a2b, hair: 0x6b4a2b,
      torso: 'shirt', legs: 'pants', helmet: 'hood', weapon: 'none', sack: true, bulk: 1.2, scale: 0.6,
    },
  },
};
