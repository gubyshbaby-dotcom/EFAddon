// VICTIM (Alex). Owned by the animation engineer. Hand-keyed R6 style with anim/kit.js (legs in the root frame, every
// limb translated out of its socket, life + tremble layers, baked to 60 fps).
// v2 rhythm (timeline v2, world 0–6.6): holds and snaps, reactions a few frames after their cause.
//   0.00 wary bladed guard, breathing → 1.25 SNAP startle at his charge (hands jump up, half a step back), hold →
//   2.2 settles into a high guard → 2.6 leans in, peering at the glow, hold → 3.25 SNAP flinch as the seed zips past her
//   left → 3.50 the cube booms open behind her: SNAP hop-turn in the air → 3.62 lands staring at it, hold, trembling →
//   4.17 SNAP grabbed by the collar, yanked round to him, hands on his wrist; face to face, struggling → 4.5 sees the knee
//   rise, leans away → 4.80 HEAVY push kick in the belly (hit-stop 0.06): folds over the sole, flies back into the cube
//   face (limbs splayed out of their sockets, tumbling back), swallowed ≈ 5.2, hidden 5.32.
// Inside (≥ 6.6): parked floating at INSIDE (phase 1).
import { INSIDE as I, WORLD } from '../timeline.js';
import { K, F, snap, bake, aim } from './kit.js';

// the victim faces +Z (yaw 180): in her root frame x = her right (world -X), z = forward (world +Z)
const Z0 = WORLD.victim[2];
const USER_HEAD = [0.05, 1.3, 0.0];
const SEED_PATH = [1.1, 1.6, -4.3];            // where the seed passes her left (world +X side)
const CUBE_LOOK = [0.6, 2.0, -6.0];
const USER_CLOSE = [0.2, 1.45, -2.75];         // his face during the grab

// ---- poses (root frame) ----
const LEGS_GUARD = { lL: [16, 10, 9], lLp: [-0.6, 1.6, 2.0], lR: [-14, -16, 12], lRp: [0.9, 0.9, -1.6] };
const GUARD = {
  torso: [8, -22, 3], tp: [0.4, -1.5, 0.6], head: [8, 0, -4],
  aL: [104, 24, 14], aLp: [-0.4, 1.2, 3.2], aR: [84, 38, 18], aRp: [0.3, 1.8, 1.6], ...LEGS_GUARD,
};
const GUARD_SHIFT = { ...GUARD, torso: [10, -20, 4], tp: [0.6, -1.9, 0.8], aL: [100, 22, 15], aR: [82, 36, 19] };
const STARTLE_OVER = {
  torso: [-16, -12, -7], tp: [0, 1.2, -2.2], head: [-16, 0, 6], aL: [146, 18, 36], aLp: [-0.6, 3.0, 1.2],
  aR: [132, 32, 32], aRp: [0.4, 3.2, 0.4], lL: [24, 8, 12], lLp: [-0.6, 4.4, 1.2], lR: [-10, -14, 14], lRp: [0.9, 0.6, -1.2],
};
const STARTLED = { ...STARTLE_OVER, torso: [-10, -14, -5], tp: [0, 0.2, -1.6], head: [-10, 0, 4], aL: [136, 20, 30], aLp: [-0.6, 2.6, 1.6],
  aR: [124, 34, 28], aRp: [0.4, 2.8, 0.8], lL: [10, 8, 10], lLp: [-0.6, 1.4, 0.2] };
const WARY = { ...GUARD, torso: [4, -20, 0], tp: [0.4, -1.2, -0.2], aL: [116, 22, 18], aLp: [-0.4, 2.0, 2.4], aR: [96, 36, 22], aRp: [0.3, 2.4, 1.0],
  lL: [12, 8, 9], lLp: [-0.6, 1.2, 0.6] };
const PEER = { ...WARY, torso: [15, -15, 6], tp: [0.9, -2.2, 1.6], head: [12, 0, 10], aL: [102, 20, 16], aLp: [-0.2, 1.0, 3.6], aR: [88, 40, 20], aRp: [0.4, 1.6, 2.2] };
const FLINCH = {
  torso: [-6, -30, -20], tp: [2.4, -0.6, -1.4], head: [-4, 0, 0], aL: [150, -6, 64], aLp: [-1.2, 2.8, 0.4], aR: [70, 46, 34], aRp: [0.6, 2.0, 1.6],
  lL: [8, 6, 16], lLp: [-0.4, 3.0, 0.2], lR: [-12, -10, 18], lRp: [1.4, 0.6, -1.6],
};
const FLINCH_HOLD = { ...FLINCH, torso: [-4, -24, -16], tp: [2.0, -1.0, -1.2], aL: [144, -4, 58], lL: [10, 6, 14], lLp: [-0.5, 1.8, 0.4] };
const TURN_AIR = {
  torso: [-24, 62, 14], tp: [0, 2.6, -1.0], head: [-12, 0, 0], aL: [168, -24, 78], aLp: [-0.8, 3.4, -0.6], aR: [150, 6, 66], aRp: [0.8, 3.2, 0.6],
  lR: [44, -6, 26], lRp: [1.4, 4.4, 3.0], lL: [-26, 8, 12], lLp: [-0.8, 1.2, -1.6],
};
const STARE = {
  torso: [-12, 58, 10], tp: [0.2, -2.6, 1.2], head: [-6, 0, 4], aL: [130, -30, 72], aLp: [-1.2, 2.4, 1.0], aR: [40, 62, 24], aRp: [0.4, 1.4, 2.4],
  lR: [22, 14, 22], lRp: [1.8, 2.4, 1.8], lL: [-22, -10, 20], lLp: [-1.4, 2.4, -1.2],
};
const STARE_LATE = { ...STARE, torso: [-15, 60, 12], tp: [0, -2.2, 0.6], aL: [126, -30, 74], aR: [36, 64, 26] };
const GRABBED_OVER = {
  torso: [8, -14, -9], tp: [0.2, -0.4, 3.8], head: [-20, 0, -7],
  aL: aim('armL', [-0.4, -0.3, 1], 30), aLp: [0.6, 2.6, 2.6], aR: aim('armR', [-0.35, -0.35, 1], 30), aRp: [-0.4, 2.4, 2.4],
  lR: [34, 6, 14], lRp: [0.6, 3.6, 3.2], lL: [-30, -4, 16], lLp: [-1.0, 1.6, -2.4],
};
const GRABBED = { ...GRABBED_OVER, torso: [2, -8, -6], tp: [0, -1.0, 2.6], head: [-14, 0, -4], lR: [20, 6, 12], lRp: [0.8, 1.8, 1.6], lL: [-22, -6, 14], lLp: [-0.8, 1.2, -1.6] };
const STRUGGLE = { ...GRABBED, torso: [-2, -4, -4], tp: [0, -1.2, 2.0], head: [-12, 0, 2] };
const LEANBACK = { ...STRUGGLE, torso: [-14, -2, -6], tp: [0, -1.0, -0.4], head: [-18, 0, -2],
  aL: aim('armL', [0.9, -0.4, 0.05], 0), aLp: [-0.8, 2.2, 0.0], aR: aim('armR', [0.85, -0.5, 0.05], 0), aRp: [0.8, 2.0, 0.0] };
const KICKED = {
  torso: [34, 0, 6], tp: [0, -0.8, -3.6], head: [34, 0, 8], aL: [74, 20, 40], aLp: [-0.4, 0.2, 5.2], aR: [64, 14, 34], aRp: [0.2, -0.4, 5.8],
  lR: [16, 6, 14], lRp: [0.6, 2.0, 1.8], lL: [6, -4, 16], lLp: [-0.8, 1.6, 1.2],
};

// carries (the reaction overshoots for 2 frames, then settles)
const STARTLE_CARRY = { ...STARTLE_OVER, torso: [-24, -10, -9], tp: [0, 2.0, -2.8], head: [-24, 0, 8], aL: [166, 14, 44], aLp: [-0.6, 3.6, 0.6],
  aR: [154, 30, 40], aRp: [0.4, 3.8, 0.0], lL: [30, 8, 14], lLp: [-0.6, 5.2, 1.0] };
const FLINCH_CARRY = { ...FLINCH, torso: [-12, -38, -28], tp: [3.2, 0.0, -2.0], head: [-10, 0, 0], aL: [168, -10, 74], aLp: [-1.4, 3.4, 0.0],
  aR: [52, 52, 44], aRp: [0.8, 2.4, 1.2], lL: [4, 6, 20], lLp: [-0.4, 3.8, -0.2] };
const GRABBED_CARRY = { ...GRABBED_OVER, torso: [16, -18, -12], tp: [0.2, 0.0, 4.6], head: [-30, 0, -10],
  aL: aim('armL', [-0.45, -0.15, 1], 30), aLp: [0.8, 2.8, 3.2], aR: aim('armR', [-0.4, -0.2, 1], 30), aRp: [-0.6, 2.6, 3.0],
  lR: [44, 6, 16], lRp: [0.6, 4.4, 4.0], lL: [-38, -4, 18], lLp: [-1.0, 1.8, -3.0] };
// flight flail: limbs whip in counter-phase while she flies
const FLAIL_A = { aL: aim('armL', [0.9, 0.4, 0.3], 0), aLp: [-1.4, 2.0, 3.6], aR: aim('armR', [0.3, -0.4, 0.9], 0), aRp: [0.8, 0.0, 5.4],
  lR: [80, 10, 40], lRp: [1.8, 4.8, 5.8], lL: [40, -8, 20], lLp: [-1.6, 2.6, 4.2], head: [14, 24, 14] };
const FLAIL_B = { aL: aim('armL', [0.3, -0.3, 0.95], 0), aLp: [-1.0, 0.6, 4.8], aR: aim('armR', [0.9, 0.5, 0.2], 0), aRp: [1.4, 2.2, 3.4],
  lR: [44, 8, 22], lRp: [1.4, 3.2, 4.6], lL: [84, -6, 44], lLp: [-2.0, 4.6, 5.6], head: [30, -10, 6] };

const keys = [
  // ---- 0.00–1.20 wary bladed guard: breathing, one slow weight shift ----
  K(0.00, { pos: [0, 0, Z0], rot: [0, 180, 0], pivot: 0.75, plant: 1, ...GUARD, look: USER_HEAD, lookW: 1, life: 0.9, shake: 0 }),
  K(0.70, { ...GUARD_SHIFT }, 'sineInOut'),
  // ---- 1.25 SNAP startle at his charge (3 frames after it), half a step back; hold trembling ----
  ...snap(1.25, { ...GUARD_SHIFT, pos: [0, 0, Z0] }, { ...STARTLE_OVER, pos: [0, 0, Z0 - 0.06], shake: 0.6 }, null, { ez: { shake: 'linear' } }),
  K(1.283, { ...STARTLE_CARRY, pos: [0, 0, Z0 - 0.09] }, 'linear'),
  K(1.38, { ...STARTLED, pos: [0, 0, Z0 - 0.12] }, 'cubicOut'),
  K(1.95, { ...STARTLED, torso: [-8, -15, -4], tp: [0, -0.2, -1.4], shake: 0.7 }, 'sineInOut'),
  // ---- 2.0–2.4 settles into a high wary guard; 2.6 leans in, peering at the glow; hold ----
  K(2.35, { ...WARY, shake: 0.4 }, 'sineInOut'),
  K(2.75, { ...PEER, shake: 0.35 }, 'sineInOut'),
  // ---- 3.25 SNAP flinch as the seed zips past her left; the head whips after it ----
  ...snap(3.25, { ...PEER, torso: [16, -14, 7], tp: [0.9, -2.3, 1.8], look: USER_HEAD }, { ...FLINCH, look: SEED_PATH, shake: 0.8 }, null,
    { ez: { look: 'linear', shake: 'linear' } }),
  K(3.283, { ...FLINCH_CARRY }, 'linear'),
  K(3.37, { ...FLINCH_HOLD }, 'cubicOut'),
  // ---- 3.50 the cube booms open behind her: SNAP hop-turn in the air, 3.62 lands staring at it; hold, trembling ----
  ...snap(3.50, { ...FLINCH_HOLD, pos: [0, 0, Z0 - 0.12], rot: [0, 180, 0], plant: 1, look: [1.6, 1.9, -6.6] },
    { ...TURN_AIR, pos: [0.06, 0.24, Z0 - 0.02], rot: [-6, 204, 0], plant: 0, look: CUBE_LOOK, shake: 1.2 }, null,
    { ez: { plant: 'linear', look: 'linear' } }),
  K(3.62, { ...STARE, pos: [0.1, 0, Z0 + 0.38], rot: [0, 226, 0], plant: 1 }, 'quadIn', { rot: 'sineOut', torso: 'sineOut', aL: 'sineOut', aR: 'sineOut', head: 'sineOut' }),
  K(3.70, { ...STARE, tp: [0.2, -3.0, 1.4] }, 'quadOut'),
  K(4.15, { ...STARE_LATE, pos: [0.1, 0, Z0 + 0.38], rot: [0, 226, 0], shake: 1.0 }, 'sineInOut'),
  // ---- 4.17 SNAP grabbed: yanked round toward him by the collar, hands to his wrist; face to face, struggling ----
  K(4.183, { ...GRABBED_OVER, pos: [0.1, 0, Z0 + 0.48], rot: [0, 214, 0], look: USER_CLOSE, shake: 1.4 }, 'linear', { look: 'quadOut' }),
  K(4.217, { ...GRABBED_CARRY, pos: [0.09, 0, Z0 + 0.52], rot: [0, 210, 0] }, 'linear'),
  K(4.30, { ...GRABBED, pos: [0.08, 0, Z0 + 0.54], rot: [0, 208, 0] }, 'cubicOut'),
  K(4.50, { ...STRUGGLE, shake: 1.2 }, 'sineInOut'),
  // ---- 4.5–4.78 sees the knee rise: leans away (slow) ----
  K(4.783, { ...LEANBACK, pos: [0.08, 0, Z0 + 0.52], rot: [0, 204, 0], plant: 1, shake: 1.0, lookW: 1, life: 0.9 }, 'sineInOut'),
  // ---- 4.80 KICK in the belly: folds over the sole on the contact frame, held through the hit-stop ----
  K(4.80, { ...KICKED, pos: [0.08, 0, Z0 + 0.52], rot: [0, 204, 0], plant: 1, lookW: 0, shake: 0, life: 0.6 }, 'linear',
    { lookW: 'linear', shake: 'linear', life: 'linear' }),
  // ---- knockback: the belly leads (C-fold), head / arms / legs drag toward him and fling out of their sockets, splayed;
  //      she starts to tumble back as the face takes her ----
  K(4.92, { rot: [-12, 202, 5], plant: 0, torso: [44, 6, 10], tp: [0, -1.0, -4.6], head: [42, 8, 12],
    aL: aim('armL', [0.75, 0.25, 0.6], 0), aLp: [-1.2, 1.0, 4.4], aR: aim('armR', [0.6, -0.1, 0.8], 0), aRp: [0.8, 0.2, 5.4],
    lR: [58, 8, 30], lRp: [1.6, 4.0, 5.4], lL: [46, -6, 30], lLp: [-1.8, 3.0, 4.6] },
    'cubicOut', { plant: 'linear', aL: 'quadOut', lL: 'sineOut', aR: 'quadOut' }),
  K(4.97, { ...FLAIL_A }, 'linear'),
  K(5.03, { ...FLAIL_B }, 'linear'),
  K(5.12, { ...FLAIL_A, head: [20, 20, 12] }, 'linear'),
  K(5.06, { rot: [-26, 200, 10], torso: [36, 10, 12], tp: [0, -0.8, -3.8], head: [24, 14, 12],
    aL: aim('armL', [0.7, 0.7, 0.2], 0), aLp: [-1.4, 2.2, 3.0], aR: aim('armR', [0.85, 0.15, 0.5], 0), aRp: [1.0, 1.0, 4.6],
    lR: [74, 4, 34], lRp: [1.6, 4.6, 5.6], lL: [66, -4, 38], lLp: [-1.8, 3.6, 5.0] }, 'sineInOut'),
  // the face swallows her: drag, slowing, limbs reaching back out of it
  K(5.30, { pos: [-0.08, 0.66, Z0 - 2.16], rot: [-42, 198, 14], torso: [30, 14, 10], tp: [0, -0.4, -2.6], head: [10, 18, 10],
    aL: aim('armL', [0.5, 0.9, -0.2], 0), aLp: [-1.4, 2.6, 2.4], aR: aim('armR', [0.7, 0.6, 0.35], 0), aRp: [1.0, 2.0, 3.4],
    lR: [86, 2, 30], lRp: [0.8, 4.6, 4.6], lL: [80, -2, 36], lLp: [-1.4, 3.8, 4.2] }, 'sineInOut', { pos: 'sineOut' }),
  K(0, { vis: 1 }), K(5.32, { vis: 0 }, 'step'),
  // ---- 6.60 inside: parked floating (phase 1 placeholder for the zero-g tumble) ----
  K(6.60, { vis: 1 }, 'step'),
  K(6.60, { pos: [I[0], I[1] - 0.9, I[2]], rot: [-10, 180, 6], pivot: 0.9, plant: 0, torso: [24, 8, 10], tp: [0, -1, -2], head: [20, 10, 6], lookW: 0,
    aL: [120, 10, 50], aLp: [-1, 2, 3], aR: [80, 20, 60], aRp: [1, 1, 3], lR: [40, 6, 16], lRp: [1, 3, 3], lL: [16, -4, 12], lLp: [-1, 2, -1],
    life: 1.2, shake: 0 }, 'step'),
  K(7.2, { torso: [28, 12, 6], head: [26, -6, 8], aL: [130, 6, 54], aR: [90, 24, 54], lR: [46, 4, 18], lL: [10, -6, 10] }, 'sineInOut'),
];

export default bake({ id: 'victim', skin: 'slim_alex', slim: true, keys, from: 0, to: 7.2, hits: 'all', cuts: [6.6], seed: 2 });
