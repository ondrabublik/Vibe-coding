// Stage 1 – Wilderness.
// waves[].at        player x that triggers the wave (camera locks at `lock`, default at + 4)
// waves[].groups    spawned one after another; next group comes when alive count <= reinforceAt
// waves[].thieves   potion thieves (don't count for clearing the wave)
// waves[].boss      clearing this wave completes the level
export default {
  id: 'wilderness',
  name: 'STAGE 1 · WILDERNESS',
  length: 160,
  endX: 150,
  zMin: -3.2,
  zMax: 2.0,
  seed: 1337,
  colors: {
    skyTop: 0x2b4f8f,
    skyHorizon: 0xf2c48a,
    fog: 0xd9b089,
    grass: [0x5b7a2e, 0x6b8a36, 0x4f6b28, 0x62823a],
    dirt: [0x8a6a45, 0x7d5f3d, 0x96744c, 0x876747],
  },
  decor: { treeDensity: 0.55, rockDensity: 0.35 },
  landmarks: [
    { type: 'hut', x: 26, z: -8.5 },
    { type: 'campfire', x: 30, z: -5.4 },
    { type: 'fence', x: 20, z: -5.2, len: 5 },
    { type: 'skullPole', x: 50, z: -4.3 },
    { type: 'skullPole', x: 56, z: 3.4 },
    { type: 'fence', x: 62, z: -4.8, len: 9 },
    { type: 'hut', x: 84, z: -9.5, rot: 0.3 },
    { type: 'hut', x: 90, z: -11, rot: -0.2 },
    { type: 'campfire', x: 87, z: -6 },
    { type: 'ruin', x: 108, z: -7.5 },
    { type: 'deadTree', x: 120, z: -5 },
    { type: 'deadTree', x: 126, z: 4.5 },
    { type: 'skullPole', x: 131, z: -4.3 },
    { type: 'skullPole', x: 137, z: -4.3 },
    { type: 'arch', x: 146, z: -5.5 },
    { type: 'skullPole', x: 152, z: 3.4 },
  ],
  waves: [
    {
      at: 8,
      groups: [[{ type: 'heninger', side: 'right' }, { type: 'heninger', side: 'left' }]],
    },
    {
      at: 34,
      thieves: [{ side: 'right', drops: ['potion', 'potion'] }],
      groups: [
        [{ type: 'heninger', side: 'right' }, { type: 'longmoan', side: 'right' }],
        [{ type: 'amazon', side: 'left' }],
      ],
    },
    {
      at: 66,
      reinforceAt: 1,
      groups: [
        [{ type: 'amazon', side: 'right' }, { type: 'heninger', side: 'left' }, { type: 'longmoan', side: 'right' }],
        [{ type: 'longmoan', side: 'right' }, { type: 'heninger', side: 'right' }],
      ],
    },
    {
      at: 98,
      thieves: [{ side: 'left', drops: ['potion', 'meat', 'potion'] }],
      groups: [[{ type: 'amazon', side: 'right' }, { type: 'amazon', side: 'left' }, { type: 'heninger', side: 'right' }]],
    },
    {
      at: 136,
      lock: 144,
      boss: true,
      reinforceAt: 1,
      groups: [
        [{ type: 'badBrother', side: 'right', z: -0.5 }, { type: 'heninger', side: 'left' }],
        [{ type: 'longmoan', side: 'left' }],
      ],
    },
  ],
};
