// Playable heroes. Add a new entry here to add a character (model spec: see CharacterModel.js).
export const CHARACTERS = [
  {
    id: 'ax',
    name: 'AX BATTLER',
    title: 'Barbar',
    desc: 'Vyvážený válečník s obouručním mečem.',
    hp: 100, speed: 3.6, damage: 10, reach: 1.55,
    magic: { type: 'earth', name: 'Zemětřesení', max: 4, dmgPerLevel: 12 },
    color: '#3a6fd8',
    model: {
      skin: 0xd99a6c, cloth: 0x2a4fa8, pants: 0x2a4fa8, boots: 0x5a3a1e, hair: 0x7a4818, accent: 0xb07a2a,
      torso: 'bare', legs: 'bare', hairStyle: 'long', weapon: 'greatsword', bulk: 1.12, scale: 1.05,
    },
  },
  {
    id: 'tyris',
    name: 'TYRIS FLARE',
    title: 'Amazonka',
    desc: 'Rychlá bojovnice s nejsilnější ohnivou magií.',
    hp: 88, speed: 4.0, damage: 8, reach: 1.5,
    magic: { type: 'fire', name: 'Oheň', max: 6, dmgPerLevel: 12 },
    color: '#d8403a',
    model: {
      skin: 0xf0b58a, cloth: 0x9b1b30, pants: 0x9b1b30, boots: 0x7a2a1a, hair: 0xd0321f, accent: 0xd4a017,
      torso: 'bikini', legs: 'bare', hairStyle: 'long', weapon: 'sword', bulk: 0.88, scale: 1.0, female: true,
    },
  },
  {
    id: 'gilius',
    name: 'GILIUS THUNDERHEAD',
    title: 'Trpaslík',
    desc: 'Pomalý, ale nejsilnější úder a bleskový hrom.',
    hp: 112, speed: 3.3, damage: 12, reach: 1.4,
    magic: { type: 'lightning', name: 'Blesk', max: 3, dmgPerLevel: 15 },
    color: '#d8a23a',
    model: {
      skin: 0xe2a57a, cloth: 0x8a5a2a, pants: 0x3b5a2a, boots: 0x3a2616, hair: 0xb8743a, accent: 0x6b4a2b,
      torso: 'shirt', legs: 'pants', helmet: 'horned', beard: true, weapon: 'axe', bulk: 1.35, scale: 0.82,
      metal: 0xb8bcc4, pauldrons: true,
    },
  },
];
