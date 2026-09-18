import { clamp01, lerp, smooth } from '../core/util.js';

// Procedural animation: each fighter state maps to a target pose (joint angles),
// the Animator eases the current pose toward it.

export function restPose() {
  return {
    lean: 0, hipY: 0, bodyRot: 0, bodyY: 0, head: 0,
    lSh: 0, rSh: 0, lShX: 0, rShX: 0, lEl: 0, rEl: 0,
    lHip: 0, rHip: 0, lKnee: 0, rKnee: 0,
  };
}

// rest → windup (until w) → strike (w .. w+s) → hold, t normalized to 0..1
function strike(t, w, s, rest, wind, hit) {
  if (t < w) return lerp(rest, wind, smooth(t / w));
  return lerp(wind, hit, smooth(clamp01((t - w) / s)));
}

function guard(p) {
  p.rSh = 0.45; p.rEl = 0.9; p.lSh = 0.25; p.lEl = 0.6; p.lShX = 0.12; p.rShX = 0.12;
  p.lHip = 0.18; p.rHip = -0.15; p.lKnee = -0.15; p.rKnee = -0.2; p.hipY = -0.03; p.lean = -0.05;
}

function hurtPose(p) {
  p.lean = 0.35; p.head = 0.35; p.lSh = -0.5; p.rSh = -0.3; p.lShX = 0.6; p.rShX = 0.6;
  p.lEl = 0.5; p.rEl = 0.5; p.lHip = -0.2; p.rHip = 0.25; p.lKnee = -0.3; p.hipY = -0.05;
}

// a = { state, t, time, phase, vy, attack }
export function computePose(a) {
  const p = restPose();
  const t = a.t;
  switch (a.state) {
    case 'idle':
      guard(p);
      p.hipY += Math.sin(a.time * 2.4) * 0.015;
      p.lean += Math.sin(a.time * 2.4) * 0.02;
      break;

    case 'walk':
    case 'run': {
      const run = a.state === 'run';
      const amp = run ? 0.95 : 0.55;
      const s = Math.sin(a.phase), c = Math.cos(a.phase);
      p.lHip = s * amp; p.rHip = -s * amp;
      p.lKnee = -0.1 - Math.max(0, c) * (run ? 1.3 : 0.7);
      p.rKnee = -0.1 - Math.max(0, -c) * (run ? 1.3 : 0.7);
      p.lSh = -s * (run ? 0.8 : 0.45); p.lEl = run ? 1.2 : 0.4;
      p.rSh = 0.45 + s * (run ? 0.5 : 0.2); p.rEl = run ? 1.3 : 0.9;
      p.lShX = 0.1; p.rShX = 0.1;
      p.lean = run ? -0.32 : -0.06;
      p.hipY = -Math.abs(c) * (run ? 0.07 : 0.035);
      break;
    }

    case 'attack':
    case 'runAttack':
    case 'jumpAttack': {
      const at = a.attack || { anim: 'slash', dur: 0.4, hitStart: 0.15 };
      const d = at.dur;
      const u = clamp01(t / d);
      const w = at.hitStart / d;
      const s = Math.max(0.12, 0.1 / d);
      guard(p);
      switch (at.anim) {
        case 'thrust':
          p.rSh = strike(u, w, s, 0.45, 0.2, 1.55); p.rEl = strike(u, w, s, 0.9, 1.9, 0.05);
          p.lSh = strike(u, w, s, 0.25, 0.6, -0.5); p.lean = strike(u, w, s, 0, 0.1, -0.35);
          p.lHip = 0.55; p.rHip = -0.45; p.lKnee = -0.4; p.rKnee = -0.1; p.hipY = -0.1;
          break;
        case 'overhead':
          p.rSh = strike(u, w, s, 0.45, 3.0, 0.35); p.lSh = strike(u, w, s, 0.25, 2.9, 0.45);
          p.rEl = strike(u, w, s, 0.9, 0.6, 0.1); p.lEl = strike(u, w, s, 0.6, 0.7, 0.2);
          p.lShX = 0.05; p.rShX = 0.05;
          p.lean = strike(u, w, s, 0, 0.25, -0.5); p.hipY = strike(u, w, s, 0, -0.02, -0.18);
          p.lHip = 0.6; p.rHip = -0.4; p.lKnee = -0.6; p.rKnee = -0.4;
          break;
        case 'charge':
          p.lean = -0.65; p.lSh = 1.3; p.lEl = 0.8; p.rSh = 1.5; p.rEl = 0.2;
          p.lHip = 0.7; p.rHip = -0.6; p.lKnee = -0.5; p.rKnee = -0.8; p.hipY = -0.12;
          break;
        case 'jumpSlash':
          p.rSh = strike(u, 0.15, 0.3, 2.8, 2.9, 0.3); p.rEl = 0.3;
          p.lSh = 1.0; p.lShX = 0.4;
          p.lHip = 1.0; p.rHip = 0.5; p.lKnee = -1.6; p.rKnee = -1.2; p.lean = -0.3;
          break;
        default: // 'slash'
          p.rSh = strike(u, w, s, 0.45, 2.7, 0.2); p.rEl = strike(u, w, s, 0.9, 1.1, 0.15);
          p.lSh = strike(u, w, s, 0.25, -0.4, 0.6); p.lean = strike(u, w, s, 0, 0.15, -0.3);
          p.lHip = 0.4; p.rHip = -0.3; p.lKnee = -0.3; p.hipY = -0.06;
      }
      break;
    }

    case 'jump':
      p.lHip = 0.9; p.rHip = 0.2; p.lKnee = -1.4; p.rKnee = -0.9;
      p.rSh = 1.2; p.rEl = 1.0; p.lSh = 0.8; p.lEl = 0.8; p.lShX = 0.3; p.rShX = 0.3; p.lean = -0.1;
      if (a.vy < 0) { p.lKnee = -0.7; p.rKnee = -0.5; }
      break;

    case 'hurt':
      hurtPose(p);
      break;

    case 'grabbed':
      hurtPose(p);
      p.lHip = 0.3; p.rHip = -0.2; p.lKnee = -0.5; p.rKnee = -0.5; p.bodyRot = 0.25;
      break;

    case 'knockdown': {
      const k = clamp01(t / 0.35);
      p.bodyRot = lerp(0.3, 1.5, k); p.bodyY = 0.1 * k;
      p.lSh = -0.5; p.rSh = -0.8; p.lShX = 0.9; p.rShX = 0.9;
      p.lHip = 0.6; p.rHip = 0.3; p.lKnee = -0.8; p.head = 0.3;
      break;
    }

    case 'down':
    case 'dead':
      p.bodyRot = 1.57; p.bodyY = 0.14;
      p.lShX = 1.2; p.rShX = 1.2; p.lHip = 0.15; p.rHip = -0.1; p.head = -0.2;
      break;

    case 'getup': {
      const k = smooth(clamp01(t / 0.45));
      p.bodyRot = lerp(1.57, 0, k); p.bodyY = lerp(0.14, 0, k);
      p.lKnee = -1.2 * (1 - k * 0.8); p.rKnee = -1.4 * (1 - k * 0.8);
      p.lHip = 1.0 * (1 - k); p.rHip = 1.2 * (1 - k);
      p.lSh = 0.8; p.rSh = 0.8;
      break;
    }

    case 'magic': {
      const k = smooth(clamp01(t / 0.4));
      p.rSh = lerp(0.45, 3.0, k); p.lSh = lerp(0.25, 3.0, k);
      p.rEl = 0.1; p.lEl = 0.1; p.lShX = 0.35 * k; p.rShX = 0.35 * k;
      p.lean = 0.2 * k; p.head = 0.35 * k;
      p.hipY = 0.03 * Math.sin(t * 30) * k;
      break;
    }

    case 'throw':
      if (t < 0.3) {
        const k = smooth(t / 0.3);
        p.rSh = lerp(1.3, 3.0, k); p.lSh = lerp(1.3, 3.0, k);
        p.lean = 0.2 * k; p.hipY = -0.1; p.lKnee = -0.4; p.rKnee = -0.4;
      } else {
        const k = smooth(clamp01((t - 0.3) / 0.15));
        p.rSh = lerp(3.0, 3.6, k); p.lSh = lerp(3.0, 3.6, k); p.lean = lerp(0.2, 0.45, k);
      }
      p.rEl = 0.3; p.lEl = 0.3;
      break;

    default:
      guard(p);
  }
  return p;
}

const FAST = new Set(['attack', 'runAttack', 'jumpAttack', 'throw', 'knockdown', 'getup', 'down', 'dead', 'hurt']);

export class Animator {
  constructor(model) {
    this.model = model;
    this.cur = restPose();
  }

  update(a, dt) {
    const target = computePose(a);
    const k = 1 - Math.exp(-dt * (FAST.has(a.state) ? 30 : 14));
    for (const key in target) this.cur[key] += (target[key] - this.cur[key]) * k;
    this.model.applyPose(this.cur);
  }
}
