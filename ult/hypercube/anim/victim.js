// VICTIM (Alex). Owned by the animation engineer. Hand-keyed with anim/kit.js (feet solved, baked to 60 fps).
// World section 0–3.4: wary guard → startled hop back at the user's stomp (0.52) → flinches from the seed (1.66) →
// steps round to look back at the unfolding cube (1.90) → grabbed by the collar (2.35), yanked round, stumbles →
// HEAVY push kick in the belly (2.60, hit-stop 0.05): folds over the sole → flies into the cube face, swallowed, hidden.
// Inside (≥ 3.4): parked floating at INSIDE (phase 1).
import { INSIDE as I, WORLD } from '../timeline.js';
import { K, bake, appendPose } from './kit.js';

// the user is baked after the victim, so the victim looks at fixed points along the user's path
const USER_HEAD = [0.05, 1.42, -0.05];
const USER_DASH = [0.30, 1.30, -3.05];
const CUBE = WORLD.cube;
// footprints (the victim faces +Z: their left = +X)
const G_L = [0.22, 0, -3.56], G_R = [-0.30, 0, -4.40];
const HOP_L = [0.18, 0, -3.78];
const LB_L = [0.60, 0, -4.20];                 // look-back: the left foot swung back-left
const ST_R = [-0.14, 0, -4.06];                // stumble step when yanked

const keys = [
  // ---- guard: bladed left-forward stance, hands high, chin down; own breathing rhythm ----
  K(0.00, { yaw: 180, rot: [0, 0], footL: G_L, footR: G_R, torso: [12, -18, 3], head: [8, 0, 2], look: USER_HEAD, lookW: 1,
    armL: [112, 22, 18], armR: [96, 34, 20], shake: 0.5 }),
  K(0.33, { torso: [14, -16, 2], armL: [108, 22, 17], armR: [93, 34, 19] }, 'sineInOut'),
  K(0.52, { torso: [11, -19, 3], armL: [113, 23, 18], armR: [97, 35, 20], footL: G_L }, 'sineInOut'),
  // ---- startle (stomp at 0.40, reacts at 0.52): recoil, hands jump up, the front foot hops back ----
  K(0.60, { torso: [-8, -8, -5], head: [-12, 0, 4], armL: [136, 28, 28], armR: [120, 40, 32], footL: [0.20, 0.12, -3.68] },
    'cubicOut'),
  K(0.68, { footL: HOP_L, torso: [2, -12, -2] }, 'quadIn'),
  K(0.86, { torso: [9, -16, 1], head: [6, 0, 0], armL: [118, 25, 22], armR: [100, 37, 24] }, 'sineOut'),
  K(1.22, { torso: [11, -15, 2], armL: [114, 24, 20], armR: [97, 36, 22] }, 'sineInOut'),
  // peering at the glow in the user's palm
  K(1.56, { torso: [15, -12, 4], head: [12, 0, 10], armL: [108, 22, 18], armR: [92, 34, 20], shake: 0.4 }, 'sineInOut'),
  // ---- the seed zips past the left side (1.62–1.70): flinch away, then the head follows it behind ----
  K(1.64, { torso: [15, -12, 4], head: [12, 0, 10], look: USER_HEAD }, 'linear'),
  K(1.71, { torso: [4, -26, -14], head: [-8, -24, -12], armL: [140, 4, 50], armR: [126, 30, 34], shake: 0.9 }, 'quadOut'),
  K(1.78, { look: [2.6, 1.7, -4.0] }, 'sineInOut'),
  K(1.88, { torso: [2, -6, -8], head: [-6, 0, 4], look: [1.6, 1.9, -6.6], armL: [130, 10, 44], armR: [116, 30, 32] }, 'sineInOut'),
  // ---- 1.90 shockwave: big flinch, the left foot swings back-left, body opens round to stare at the cube ----
  K(1.90, { yaw: 180, footL: HOP_L, footR: G_R }, 'linear'),
  K(1.98, { torso: [-12, 26, 10], head: [-16, 0, 0], armL: [150, -14, 66], armR: [-10, 14, 56], footL: [0.40, 0.16, -3.96],
    shake: 1.2 }, 'quadOut', { armR: 'sineInOut', armL: 'sineInOut' }),
  K(2.05, { yaw: 214, footL: LB_L, torso: [-6, 36, 10], look: CUBE }, 'quadIn', { torso: 'sineOut', yaw: 'sineInOut' }),
  K(2.20, { torso: [-9, 38, 11], armL: [146, -10, 62], armR: [-18, 12, 52], head: [-10, 0, 4], shake: 0.8 }, 'sineOut'),
  // senses the dash (2.28): the head starts back toward the user — too late
  K(2.29, { look: [2.6, 1.6, -3.0], torso: [-8, 34, 10] }, 'sineIn'),
  // ---- 2.35 GRAB by the collar: yanked forward and round, flails at the arm, stumbles a step ----
  K(2.35, { yaw: 214, footR: G_R, footL: LB_L, torso: [-6, 30, 8], look: [1.8, 1.5, -3.2], armL: [144, -8, 60], armR: [-14, 12, 54] },
    'sineIn'),
  K(2.43, { torso: [24, 10, -4], head: [16, 0, -6], look: USER_DASH, armL: [100, 40, 32], armR: [110, 44, 24],
    footR: [-0.20, 0.14, -4.20] }, 'quadOut', { armL: 'sineInOut', armR: 'sineInOut' }),
  K(2.49, { yaw: 196, footR: ST_R, torso: [24, 4, -3] }, 'quadIn', { yaw: 'sineOut' }),
  K(2.55, { torso: [20, 2, -2], head: [10, 0, -4], armL: [106, 36, 28], armR: [100, 42, 26], shake: 0.6 }, 'sineOut'),
  K(2.583, { torso: [17, 2, -2], head: [6, 0, -2], armL: [112, 30, 40], armR: [104, 36, 38], lookW: 1, rot: [0, 0] }, 'linear'),
  // ---- 2.60 KICK in the belly: folds over the sole (contact frame), held through the hit-stop ----
  K(2.60, { yaw: 196, footR: ST_R, footL: LB_L, torso: [40, 0, 4], head: [36, 0, 6], armL: [96, 10, 74], armR: [100, 8, 70],
    lookW: 0, look: USER_DASH, shake: 0, rot: [0, 0] }, 'expoIn'),
  K(2.65, { yaw: 196, footR: ST_R, footL: LB_L, torso: [40, 0, 4], head: [36, 0, 6], armL: [96, 10, 74], armR: [100, 8, 70],
    lookW: 0, look: USER_DASH, shake: 0, rot: [0, 0] }, 'linear'),
  // ---- knockback: the belly leads, head/arms/legs drag toward the user; rising toward the cube face ----
  K(2.70, { legR: [44, 6, 14], legL: [30, -4, 12], torso: [46, 2, 6], head: [40, 0, 8], armL: [104, 8, 68], armR: [106, 6, 64],
    at: [0.18, -4.40], y: 0.10, rot: [-6, 3] }, 'sineOut', { at: 'quadIn', y: 'sineInOut' }),
  K(2.80, { legR: [62, 8, 20], legL: [50, -6, 16], torso: [46, 4, 8], head: [24, 6, 10], armL: [120, 0, 70], armR: [118, 4, 66],
    at: [0.06, -5.55], y: 0.46, rot: [-18, 6] }, 'quadOut', { at: 'linear', y: 'sineOut' }),
  // the face swallows: drag, slowing, limbs reaching back out
  K(2.92, { legR: [70, 4, 24], legL: [58, -2, 22], torso: [40, 6, 6], head: [10, 8, 6], armL: [150, 4, 40], armR: [146, 8, 36],
    at: [0.02, -6.3], y: 0.62, rot: [-26, 8], vis: 1 }, 'quadOut'),
  K(2.94, { vis: 0 }, 'step'),
];

const def = bake({ id: 'victim', skin: 'slim_alex', slim: true, keys, from: 0, to: 3.0, hits: 'all' });
// inside: parked floating (phase 1 placeholder for the tumble at INSIDE)
appendPose(def, 3.4, {
  pos: [I[0], I[1] - 0.9, I[2]], rot: [0, 180, 0], pivot: 0.9, plant: 0,
  torso: [24, 8, 10], head: [18, 0, 6], armR: [70, 10, 60], armL: [96, 0, 44], legR: [30, 0, 14], legL: [12, 0, 10],
  'armR.pos': [0, 0, 0], 'armL.pos': [0, 0, 0], 'legR.pos': [0, 0, 0], 'legL.pos': [0, 0, 0], 'torso.pos': [0, 0, 0], 'head.pos': [0, 0, 0],
  vis: 1,
});
export default def;
