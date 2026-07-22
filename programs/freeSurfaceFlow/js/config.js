const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

const CellType = {
  SOLID: 0,
  GAS: 1,
  FLUID: 2,
  INTERFACE: 3,
};

const MASS_FULL = 1.0;
const MASS_EPS = 1e-8;

const DEFAULTS = {
  nx: 160,
  ny: 90,
  nu: 0.02,
  gravity: 4e-5,
  stepsPerFrame: 4,
  contourLevels: 8,
  /** Remove disconnected fluid blobs smaller than this (cells). */
  minFluidComponent: 5,
};

/** Presets keep ~16:9 aspect; changing resolution resets the case. */
const GRID_PRESETS = [
  { id: '80x45', nx: 80, ny: 45, label: '80 × 45 (nízké)' },
  { id: '120x68', nx: 120, ny: 68, label: '120 × 68' },
  { id: '160x90', nx: 160, ny: 90, label: '160 × 90 (výchozí)' },
  { id: '240x135', nx: 240, ny: 135, label: '240 × 135' },
  { id: '320x180', nx: 320, ny: 180, label: '320 × 180 (vysoké)' },
];
