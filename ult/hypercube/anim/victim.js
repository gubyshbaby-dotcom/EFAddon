// VICTIM (Alex). Owned by the animation engineer. Hand-keyed R6 style with anim/kit.js (legs in the root frame, every
// limb translated out of its socket, life + tremble layers, baked to 60 fps).
// World section 0–3.4:
//   0.00 nervous bladed guard, bouncing → 0.44 startled by the user's stomp (hop back, hands jump) → wary guard, peers at
//   the glow → 1.66 the seed zips past her left: flinch away, head whips after it → 1.90 the cube unfolds behind her:
//   BIG startled hop, turns in the air to stare back at it, arms flung → 2.10 backs away from it, frozen in fear →
//   2.30 senses the dash → 2.35 GRABBED by the collar, yanked round, hands on his wrist, stumbles in → 2.53 released →
//   2.60 HEAVY push kick in the belly (hit-stop 0.05): folds over the sole → flies back into the cube face (limbs
//   dragging, head whipping), crosses the face ≈ 2.79, swallowed, hidden 2.93.
// Inside (≥ 3.4): parked floating at INSIDE (phase 1).
import { INSIDE as I, WORLD } from '../timeline.js';
import { K, bake, aim } from './kit.js';

// the victim faces +Z (yaw 180): in her root frame x = her right (world -X), z = forward (world +Z)
const Z0 = WORLD.victim[2];
const USER_HEAD = [0.05, 1.35, 0.0];
const SEED_PATH = [1.1, 1.6, -4.3];            // where the seed passes her left (world +X side)
const CUBE_LOOK = [0.6, 2.0, -6.0];

// ---- poses (root frame) ----
const GUARD = {
  torso: [8, -22, 3], tp: [0.4, -1.5, 0.6], head: [8, 0, -4],
  aL: [104, 24, 14], aLp: [-0.4, 1.2, 3.2], aR: [84, 38, 18], aRp: [0.3, 1.8, 1.6],
  lL: [18, 10, 9], lLp: [-0.6, 1.6, 2.2], lR: [-15, -16, 13], lRp: [0.9, 0.9, -1.7],
};
const GUARD_DOWN = { // bounce: sink, arms drop a hair
  torso: [10, -20, 2], tp: [0.2, -2.6, 0.9], aL: [98, 22, 15], aLp: [-0.4, 0.6, 3.0], aR: [80, 36, 19], aRp: [0.3, 1.2, 1.8],
  lL: [20, 11, 11], lLp: [-0.7, 2.3, 2.4], lR: [-17, -17, 15], lRp: [1.0, 1.6, -1.8],
};

const keys = [
  // ---- 0.00–0.40 nervous guard: her own bounce rhythm (not the user's) ----
  K(0.00, { pos: [0, 0, Z0], rot: [0, 180, 0], pivot: 0.75, plant: 1, ...GUARD, look: USER_HEAD, lookW: 1, life: 1.1, shake: 0 }),
  K(0.13, { ...GUARD_DOWN }, 'sineInOut'),
  K(0.27, { ...GUARD, head: [10, 0, -6] }, 'sineInOut'),
  K(0.40, { ...GUARD_DOWN, torso: [11, -21, 3] }, 'sineInOut'),
  // ---- 0.44 startle at the stomp: hands jump up, she rises, a small hop back on the front foot ----
  K(0.50, { torso: [-12, -12, -6], tp: [0, 0.8, -1.8], head: [-14, 0, 6], aL: [140, 18, 34], aLp: [-0.6, 2.6, 1.4],
    aR: [126, 32, 30], aRp: [0.4, 2.8, 0.6], lL: [24, 8, 12], lLp: [-0.6, 4.2, 1.4], lR: [-10, -14, 14], lRp: [0.9, 0.5, -1.2] },
    'sineOut', { head: 'cubicOut', aL: 'quadOut', aR: 'quadOut' }),
  K(0.57, { pos: [0, 0, Z0 - 0.12], lL: [12, 8, 10], lLp: [-0.6, 1.4, 0.4] }, 'quadIn'),
  K(0.68, { ...GUARD, torso: [4, -20, 0], tp: [0.4, -1.0, -0.2], aL: [112, 22, 18], aLp: [-0.4, 1.8, 2.6], aR: [94, 36, 22], aRp: [0.3, 2.3, 1.2],
    lL: [12, 8, 9], lLp: [-0.6, 1.2, 0.6] }, 'sineOut'),
  // ---- wary guard, she sways and peers at the glow ----
  K(0.98, { ...GUARD_DOWN, lL: [12, 9, 11], lLp: [-0.7, 1.9, 0.8], head: [6, 0, -2] }, 'sineInOut'),
  K(1.25, { ...GUARD, torso: [14, -16, 6], tp: [0.8, -2.0, 1.4], head: [12, 0, 10], lL: [12, 8, 9], lLp: [-0.6, 1.2, 0.6],
    aL: [100, 20, 16], aLp: [-0.2, 1.0, 3.6], life: 0.9, shake: 0.25 }, 'sineInOut'),
  K(1.50, { torso: [16, -14, 7], tp: [0.9, -2.3, 1.8], head: [14, 0, 12], aR: [86, 40, 20], aRp: [0.4, 1.6, 2.2], shake: 0.35 }, 'sineInOut'),
  // ---- 1.62–1.74 the seed zips past her left: flinch right/away, left arm up, the head whips after it ----
  K(1.63, { torso: [15, -15, 6], tp: [0.9, -2.2, 1.6], look: USER_HEAD, lLp: [-0.6, 1.2, 0.6] }, 'linear'),
  K(1.70, { torso: [-6, -30, -20], tp: [2.4, -0.6, -1.4], head: [-4, 0, 0], look: SEED_PATH,
    aL: [150, -6, 64], aLp: [-1.2, 2.8, 0.4], aR: [70, 46, 34], aRp: [0.6, 2.0, 1.6],
    lL: [8, 6, 16], lLp: [-0.4, 3.0, 0.2], lR: [-12, -10, 18], lRp: [1.4, 0.6, -1.6], shake: 0.8 }, 'cubicOut', { look: 'quadOut', head: 'expoOut' }),
  K(1.80, { torso: [-4, -12, -14], tp: [1.8, -1.2, -1.0], look: CUBE_LOOK, aL: [140, -4, 56], aR: [80, 42, 30] }, 'sineInOut'),
  // ---- 1.90 the cube booms open behind her: BIG startled hop, she turns in the air to stare back at it ----
  K(1.88, { pos: [0, 0, Z0], rot: [0, 180, 0], plant: 1, torso: [4, -8, -10], tp: [1.4, -2.4, -0.4], lL: [10, 6, 14], lLp: [-0.5, 2.6, 0.4],
    lR: [-14, -10, 16], lRp: [1.2, 1.4, -1.6] }, 'sineIn'),
  K(2.00, { pos: [0.06, 0.24, Z0 + 0.22], rot: [-6, 206, 0], plant: 0, torso: [-24, 62, 14], tp: [0, 2.6, -1.0], head: [-12, 0, 0],
    aL: [168, -24, 78], aLp: [-0.8, 3.4, -0.6], aR: [150, 6, 66], aRp: [0.8, 3.2, 0.6],
    lR: [44, -6, 26], lRp: [1.4, 4.4, 3.0], lL: [-26, 8, 12], lLp: [-0.8, 1.2, -1.6], shake: 1.2, life: 1.3 },
    'quadOut', { rot: 'sineOut', plant: 'linear', head: 'cubicOut' }),
  K(2.10, { pos: [0.1, 0, Z0 + 0.32], rot: [0, 226, 0], plant: 1, torso: [-12, 58, 10], tp: [0.2, -2.6, 1.2],
    lR: [22, 14, 22], lRp: [1.8, 2.4, 1.8], lL: [-22, -10, 20], lLp: [-1.4, 2.4, -1.2],
    aL: [130, -30, 72], aLp: [-1.2, 2.4, 1.0], aR: [40, 62, 24], aRp: [0.4, 1.4, 2.4] }, 'quadIn', { rot: 'sineOut', torso: 'sineOut', aL: 'sineOut', aR: 'sineOut' }),
  // ---- 2.06–2.30 frozen in fear, backing away from the cube (toward the user) ----
  K(2.18, { torso: [-16, 60, 12], tp: [0, -2.0, 0.4], head: [-6, 0, 4], lL: [-26, -10, 20], lLp: [-1.4, 3.6, -2.4] }, 'sineOut'),
  K(2.26, { pos: [0.12, 0, Z0 + 0.46], lL: [-24, -10, 18], lLp: [-1.4, 2.0, -1.8], lRp: [1.8, 2.0, 0.2],
    aL: [126, -30, 74], aR: [36, 64, 26], shake: 1.0 }, 'quadIn'),
  // senses the dash: the head starts back toward the user (too late)
  K(2.30, { torso: [-12, 50, 10], look: [0.3, 1.4, -2.0] }, 'sineIn'),
  // ---- 2.35 GRABBED: yanked round toward him by the collar, hands to his wrist, stumbles in ----
  K(2.35, { pos: [0.12, 0, Z0 + 0.46], rot: [0, 226, 0], torso: [-10, 44, 10], tp: [0, -2.0, 0.6], aL: [124, -26, 70], aLp: [-1.2, 2.2, 1.0],
    aR: [40, 60, 24], aRp: [0.4, 1.4, 2.4] }, 'sineIn'),
  K(2.44, { pos: [0.1, 0, Z0 + 0.58], rot: [0, 212, 0], torso: [6, -10, -8], tp: [0.2, -0.6, 3.4], head: [-18, 0, -6], look: [0.3, 1.5, -2.9],
    aL: [128, 46, 12], aLp: [0.6, 2.2, 3.4], aR: [120, 50, 16], aRp: [-0.4, 2.6, 3.0],
    lR: [34, 6, 14], lRp: [0.6, 3.6, 3.2], lL: [-30, -4, 16], lLp: [-1.0, 1.6, -2.4], shake: 1.4 },
    'sineOut', { look: 'cubicOut', head: 'cubicOut', aL: 'sineInOut', aR: 'sineInOut', aLp: 'sineInOut', aRp: 'sineInOut' }),
  K(2.47, { pos: [0.08, 0, Z0 + 0.62], rot: [0, 202, 0], torso: [-2, -6, -6], tp: [0, -1.2, 2.4], head: [-10, 0, -4],
    lR: [18, 6, 12], lRp: [0.8, 1.6, 1.6], lL: [-20, -6, 14], lLp: [-0.8, 1.2, -1.6], aL: [122, 44, 16], aR: [116, 48, 20] }, 'sineOut'),
  // ---- 2.49 SHOVED away by the collar: snaps back, hands fly off his wrist, stumbles a step back ----
  K(2.55, { pos: [0.08, 0, Z0 + 0.50], torso: [-18, -2, -8], tp: [0, -0.6, -1.4], head: [-20, 0, -4], aL: aim('armL', [0.7, -0.6, 0.15], 0), aLp: [-0.8, 2.6, 0.2],
    aR: aim('armR', [0.75, -0.55, 0.05], 0), aRp: [0.8, 2.6, 0.0], lR: [8, 6, 14], lRp: [0.8, 3.4, 0.4], lL: [-24, -6, 14], lLp: [-0.8, 1.0, -2.2], shake: 0.8 },
    'sineOut', { pos: 'quadOut', lRp: 'sineOut', aL: 'sineInOut', aR: 'sineInOut', aLp: 'sineInOut', aRp: 'sineInOut' }),
  K(2.588, { pos: [0.08, 0, Z0 + 0.48], torso: [-12, -2, -6], tp: [0, -1.0, -0.6], head: [-14, 0, -2], lR: [14, 6, 12], lRp: [0.8, 1.6, 0.8],
    aL: aim('armL', [0.75, -0.45, 0.3], 0), aR: aim('armR', [0.8, -0.4, 0.2], 0) }, 'sineOut'),
  // ---- 2.60 KICK in the belly: folds over the sole (contact frame), held through the hit-stop ----
  K(2.60, { pos: [0.08, 0, Z0 + 0.48], rot: [0, 202, 0], plant: 1, torso: [34, 0, 6], tp: [0, -0.8, -3.6], head: [34, 0, 8], lookW: 0,
    aL: [74, 20, 40], aLp: [-0.4, 0.2, 5.2], aR: [64, 14, 34], aRp: [0.2, -0.4, 5.8],
    lR: [16, 6, 14], lRp: [0.6, 2.0, 1.8], lL: [6, -4, 16], lLp: [-0.8, 1.6, 1.2], shake: 0, life: 0.6 },
    'expoIn', { lookW: 'linear', shake: 'linear', life: 'linear' }),
  // ---- knockback: the belly leads (C-fold), head / arms / legs drag toward him and fling out of their sockets, splayed;
  //      she starts to tumble back as the face takes her ----
  K(2.72, { rot: [-12, 200, 5], plant: 0, torso: [44, 6, 10], tp: [0, -1.0, -4.6], head: [42, 8, 12],
    aL: aim('armL', [0.75, 0.25, 0.6], 0), aLp: [-1.2, 1.0, 4.4], aR: aim('armR', [0.6, -0.1, 0.8], 0), aRp: [0.8, 0.2, 5.4],
    lR: [58, 8, 30], lRp: [1.6, 4.0, 5.4], lL: [46, -6, 30], lLp: [-1.8, 3.0, 4.6] },
    'cubicOut', { plant: 'linear', aL: 'quadOut', lL: 'sineOut', aR: 'quadOut' }),
  K(2.80, { rot: [-24, 198, 10], torso: [36, 10, 12], tp: [0, -0.8, -3.8], head: [26, 14, 12],
    aL: aim('armL', [0.7, 0.7, 0.2], 0), aLp: [-1.4, 2.2, 3.0], aR: aim('armR', [0.85, 0.15, 0.5], 0), aRp: [1.0, 1.0, 4.6],
    lR: [74, 4, 34], lRp: [1.6, 4.6, 5.6], lL: [66, -4, 38], lLp: [-1.8, 3.6, 5.0] }, 'sineInOut'),
  // the face swallows her: drag, slowing, limbs reaching back out of it
  K(2.92, { pos: [-0.08, 0.66, Z0 - 2.16], rot: [-40, 196, 14], torso: [30, 14, 10], tp: [0, -0.4, -2.6], head: [10, 18, 10],
    aL: aim('armL', [0.5, 0.9, -0.2], 0), aLp: [-1.4, 2.6, 2.4], aR: aim('armR', [0.7, 0.6, 0.35], 0), aRp: [1.0, 2.0, 3.4],
    lR: [86, 2, 30], lRp: [0.8, 4.6, 4.6], lL: [80, -2, 36], lLp: [-1.4, 3.8, 4.2] }, 'quadOut', { pos: 'sineOut' }),
  K(0, { vis: 1 }), K(2.93, { vis: 0 }, 'step'),
  // ---- 3.40 inside: parked floating (phase 1 placeholder for the zero-g tumble) ----
  K(3.40, { vis: 1 }, 'step'),
  K(3.40, { pos: [I[0], I[1] - 0.9, I[2]], rot: [-10, 180, 6], pivot: 0.9, plant: 0, torso: [24, 8, 10], tp: [0, -1, -2], head: [20, 10, 6], lookW: 0,
    aL: [120, 10, 50], aLp: [-1, 2, 3], aR: [80, 20, 60], aRp: [1, 1, 3], lR: [40, 6, 16], lRp: [1, 3, 3], lL: [16, -4, 12], lLp: [-1, 2, -1],
    life: 1.2, shake: 0 }, 'step'),
  K(4.0, { torso: [28, 12, 6], head: [26, -6, 8], aL: [130, 6, 54], aR: [90, 24, 54], lR: [46, 4, 18], lL: [10, -6, 10] }, 'sineInOut'),
];

export default bake({ id: 'victim', skin: 'slim_alex', slim: true, keys, from: 0, to: 4.0, hits: 'all', cuts: [3.4], seed: 2 });
