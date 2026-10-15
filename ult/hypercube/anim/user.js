// USER (attacker, Steve). Owned by the animation engineer. Hand-keyed R6 style with anim/kit.js (legs in the root frame,
// every limb translated out of its socket, life + tremble layers, contacts solved by aiming the limb and thrusting it
// out of its socket, baked to 60 fps).
// v2 rhythm (timeline v2, world 0–6.6): ONE action per story beat, each a readable HOLD (alive: breathing / tremble) →
// a 2–3 frame SNAP → a held follow-through. No in-between busywork.
//   0.00 relaxed, cocky idle (weight on the back leg, chin down), slow head turn to her ~0.6 → 1.00 inhale →
//   1.20 SNAP down into the deep charge stance, hold trembling → 2.00 SNAP the palm open, palm up at chest height, hold
//   (the seed forms) → 2.80 slow coil, still → 3.20 THROW: explosive palm thrust, hold the lunge → 4.00 SNAP into the
//   flat dash → 4.15 SNAP grab her collar → 4.25 SNAP plant, face to face hold → 4.50 slow chamber, still →
//   4.80 HEAVY push kick (hit-stop 0.06), held follow-through → 5.30 SNAP the foot down, hold, head tilt →
//   5.72 two calm steps to the cube → 6.30 stands, the camera dives past him.
// Inside (≥ 6.6): parked floating (phase 1).
import { INSIDE as I } from '../timeline.js';
import { K, F, snap, bake, aim, pointAt } from './kit.js';
import VICTIM from './victim.js';

const vHead = t => pointAt(VICTIM, 'head', [0, 4, 0], t);
const vCollar = t => pointAt(VICTIM, 'torso', [0.6, 3.4, 3.0], t);  // front of her collar (the fist sinks in a little)
const vBelly = t => pointAt(VICTIM, 'torso', [0, -2.4, 2.3], t);    // where the sole lands
const PALM = [0.3, 1.18, -0.75];                                     // the seed above the open palm (look target)
const FACE = [0.2, 1.9, -5.4];                                       // the cube face
const AWAY = [-1.4, 0.3, -2.2];                                      // bored look, down-left, before he turns to her

// ---- poses (root frame: x = his right, z = forward = world -Z) ----
const LEGS_IDLE = { lR: [-6, -18, 10], lRp: [0.5, 0.4, -0.8], lL: [5, -8, 7], lLp: [-0.4, 1.3, 1.8] };
const IDLE = { // relaxed, weighty, cocky: weight on the back (right) leg, lead hand loose and low-forward, chin down
  torso: [6, -12, 4], tp: [0.4, -0.8, 0.3], head: [22, 0, -6],
  aR: [-8, -26, 18], aRp: [-0.2, -1.6, -1.8], aL: [44, 30, 30], aLp: [0.6, -0.2, 2.8], ...LEGS_IDLE,
};
const INHALE = { ...IDLE, torso: [1, -10, 4], tp: [0.4, 0.3, -0.2], head: [12, 0, -3], aRp: [-0.2, -0.9, -1.8], aLp: [0.6, 0.5, 2.6] };
const LEGS_CHARGE = { lR: [-20, -26, 34], lRp: [2.8, 3.2, -1.8], lL: [26, 16, 28], lLp: [-2.6, 2.6, 2.6] };
const CHARGE_OVER = {
  torso: [44, 10, -6], tp: [0.2, -7.4, 2.4], head: [24, 0, 0],
  aR: aim('armR', [0.85, -0.5, 0.25], 30), aRp: [1.0, 3.4, 0.6], aL: aim('armL', [0.8, -0.55, -0.15], 30), aLp: [-1.0, 3.2, -1.2],
  lR: [-22, -28, 36], lRp: [3.0, 3.6, -2.0], lL: [28, 18, 30], lLp: [-2.8, 3.0, 2.8],
};
const CHARGE = {
  torso: [38, 8, -4], tp: [0.2, -6.0, 1.8], head: [18, 0, 0],
  aR: aim('armR', [0.75, -0.62, 0.25], 30), aRp: [0.9, 2.8, 0.4], aL: aim('armL', [0.72, -0.66, -0.15], 30), aLp: [-0.9, 2.6, -1.0], ...LEGS_CHARGE,
};
const CHARGE_LOW = { ...CHARGE, torso: [41, 10, -5], tp: [0, -6.7, 2.0], aRp: [1.0, 3.0, 0.4], aLp: [-1.0, 2.9, -1.0] };
const LEGS_PALM = { lR: [-18, -22, 28], lRp: [2.4, 2.4, -1.6], lL: [22, 14, 22], lLp: [-2.2, 2.0, 2.2] };
const PALM_OVER = {
  torso: [18, 16, 5], tp: [0.6, -3.2, 1.4], head: [8, 0, 0],
  aR: aim('armR', [-0.3, 0.15, 1], 90), aRp: [-0.6, 2.0, 3.4], aL: [20, -18, 48], aLp: [-1.2, 0.8, -2.6], ...LEGS_PALM,
};
const PALM_UP = {
  torso: [16, 12, 4], tp: [0.6, -3.6, 1.2], head: [10, 0, 0],
  aR: aim('armR', [-0.28, 0.08, 1], 90), aRp: [-0.6, 1.6, 3.0], aL: [26, -16, 44], aLp: [-1.2, 0.8, -2.2], ...LEGS_PALM,
};
const PALM_LATE = { ...PALM_UP, torso: [17, 12, 3], tp: [0.8, -3.9, 1.0], head: [14, 0, -4], aL: [34, -12, 50], aLp: [-1.4, 1.0, -2.4] };
const COIL = {
  torso: [4, -16, 8], tp: [1.4, -3.4, -1.6], head: [8, 0, 0],
  aR: aim('armR', [-0.1, -0.06, 1], 90), aRp: [-0.2, 1.2, -1.8], aL: [86, 24, 16], aLp: [0, 1.4, 3.4],
  lR: [-24, -22, 30], lRp: [2.8, 2.8, -1.8], lL: [18, 12, 18], lLp: [-2.0, 4.6, 1.2],
};
const COIL_LATE = { ...COIL, torso: [3, -18, 9], tp: [1.5, -3.6, -1.8] };
const LEGS_LUNGE = { lL: [46, 12, 12], lLp: [-1.2, 3.0, 4.4], lR: [-42, -12, 16], lRp: [1.2, 0.8, -0.2] };
const THROW_OVER = {
  torso: [34, 36, -9], tp: [0.2, -5.0, 4.8], head: [-8, 0, 0],
  aR: aim('armR', [-0.06, 0.1, 1], 40), aRp: [0, 1.4, 8.4], aL: [-50, -12, 54], aLp: [-1.6, 1.4, -3.8], ...LEGS_LUNGE,
};
const THROW = { ...THROW_OVER, torso: [30, 32, -8], tp: [0.2, -4.6, 4.2], aR: aim('armR', [-0.04, 0.06, 1], 40), aRp: [0, 1.2, 7.0], aL: [-44, -12, 50], aLp: [-1.4, 1.2, -3.4] };
const THROW_LATE = { ...THROW, torso: [36, 26, -6], tp: [0.2, -5.4, 3.6], head: [-14, 0, 2], aR: aim('armR', [0.0, 0.3, 1], 30), aRp: [0, 0.8, 5.6],
  aL: [-40, -10, 46], aLp: [-1.2, 1.0, -3.0], lL: [48, 12, 12], lLp: [-1.2, 3.4, 4.4] };
const DASH = {
  torso: [60, 2, 2], tp: [0, -4.8, 4.6], head: [-30, 0, 0],
  aR: aim('armR', [0.3, -0.9, -0.35], 0), aRp: [0.6, 1.0, -2.6], aL: aim('armL', [-0.15, 0.2, 1], 25), aLp: [0.8, 2.4, 3.6],
  lR: [-74, -2, 6], lRp: [0.4, -1.6, -1.2], lL: [-38, -2, 8], lLp: [-1.0, 2.0, 6.2],
};
const DASH_LATE = { ...DASH, torso: [63, 2, 2], lR: [-78, -2, 6], lL: [-46, -2, 8], lLp: [-1.0, 1.8, 6.4] };
const GRAB = {
  torso: [28, 10, 0], tp: [0, -2.6, 3.4], head: [-14, 0, 0], aR: aim('armR', [0.5, -0.3, -1], 0), aRp: [0.6, 1.6, -1.8],
  lL: [12, 4, 10], lLp: [-0.8, 3.4, 3.6], lR: [-52, -4, 10], lRp: [0.6, 0.4, -2.0],
};
const LEGS_PLANT = { lL: [26, 4, 12], lLp: [-0.8, 2.4, 2.4], lR: [-30, -6, 12], lRp: [0.8, 1.6, -1.2] };
const PLANT_OVER = { torso: [24, 6, 0], tp: [0, -5.4, 2.4], head: [-10, 0, 0], aR: aim('armR', [0.85, -0.35, -0.45], 0), aRp: [0.8, 2.0, -0.8], ...LEGS_PLANT };
const PLANT = { ...PLANT_OVER, torso: [12, -6, 2], tp: [0, -2.8, 0.8], head: [-6, 0, -8] };
const PLANT_LATE = { ...PLANT, torso: [11, -7, 3], tp: [0, -2.7, 0.6], head: [-5, 0, -10] };
const CHAMBER = {
  torso: [-16, 18, -4], tp: [0, -1.4, -2.4], head: [14, 0, 0], aR: aim('armR', [0.85, 0.2, 0.1], 0), aRp: [0.6, 2.0, 0.6],
  aL: aim('armL', [0.7, -0.35, 0.55], 0), aLp: [-0.8, 1.8, 1.0],
  lR: [58, -4, 8], lRp: [0.2, 6.6, 3.6], lL: [22, 4, 12], lLp: [-0.8, 2.2, 2.0],
};
const CHAMBER_LATE = { ...CHAMBER, torso: [-18, 19, -4], lR: [62, -4, 8], lRp: [0.2, 7.0, 3.4] };
const KICK = {
  lRp: [0, 2.5, 1.0], torso: [-34, 24, -6], tp: [0, -0.6, -3.6], head: [28, 0, 0],
  aL: aim('armL', [0.75, 0.35, -0.55], 0), aLp: [-0.8, 1.8, -2.4], aR: aim('armR', [0.7, 0.4, -0.6], 0), aRp: [0.8, 1.6, -1.8],
  lL: [20, 4, 12], lLp: [-0.8, 2.0, 1.6],
};
const FOLLOW = {
  torso: [-46, 30, -10], tp: [0, -1.6, -4.6], head: [34, 0, 4], lR: [114, -2, 6], lRp: [0, 5.0, 6.8],
  aL: aim('armL', [0.8, 0.6, -0.35], 0), aLp: [-1.0, 2.4, -1.6], aR: aim('armR', [0.55, 0.75, -0.45], 0), aRp: [1.0, 2.6, -1.4],
  lL: [-16, 4, 14], lLp: [-0.8, 2.4, -1.0],
};
const FOLLOW_LATE = { ...FOLLOW, torso: [-41, 28, -8], tp: [0, -1.3, -4.2], lR: [104, -4, 8], lRp: [0.2, 4.6, 6.2], head: [30, 0, 4] };
const LEGS_DOWN = { lR: [18, -8, 14], lRp: [0.8, 2.4, 1.4], lL: [-14, 4, 12], lLp: [-0.8, 2.0, -0.6] };
const DOWN_OVER = { torso: [24, 14, -2], tp: [0, -5.6, 2.2], head: [8, 0, 0], aL: aim('armL', [0.8, -0.4, -0.45], 0), aLp: [-1.0, 1.0, -1.2],
  aR: aim('armR', [0.9, -0.15, 0.1], 0), aRp: [1.0, 1.2, 0.6], ...LEGS_DOWN };
const DOWN = { ...DOWN_OVER, torso: [14, 12, -2], tp: [0, -4.2, 1.6], head: [0, 0, 6], aL: aim('armL', [0.75, -0.55, -0.3], 0), aR: aim('armR', [0.8, -0.45, 0.15], 0) };
const WATCH = { torso: [4, 14, 4], tp: [0.2, -2.6, 0.6], head: [-6, 0, 14], aL: aim('armL', [0.6, -0.75, 0.15], 0), aLp: [-1.0, 1.0, 0.6],
  aR: aim('armR', [0.55, -0.8, 0.2], 0), aRp: [1.0, 0.8, 0.6], ...LEGS_DOWN };
const STAND = { torso: [-2, 4, -3], tp: [0.2, -1.2, 0.2], head: [-12, 0, -4], aL: aim('armL', [0.5, -0.85, 0.05], 0), aLp: [-1.0, 0.6, 0.2],
  aR: aim('armR', [0.5, -0.85, 0.1], 10), aRp: [1.0, 0.4, 0.4], lR: [8, -12, 10], lRp: [0.6, 1.0, 0.6], lL: [-6, 4, 9], lLp: [-0.6, 0.8, -0.4] };

// carries: the snap keeps going 2–3 frames past the pose (whole body: arms fling, head and chest drive), then settles
// back (pack-style fling → stop)
const CHARGE_FLEX = { ...CHARGE_OVER, torso: [52, 12, -7], tp: [0.2, -8.6, 3.0], head: [34, 0, 0],
  aR: aim('armR', [0.55, 0.8, 0.2], 30), aRp: [1.4, 4.0, 0.2], aL: aim('armL', [0.55, 0.85, -0.1], 30), aLp: [-1.4, 3.8, -1.0],
  lR: [-24, -30, 38], lRp: [3.2, 4.0, -2.2], lL: [30, 20, 32], lLp: [-3.0, 3.4, 3.0] };
const PALM_OVER2 = { ...PALM_OVER, torso: [26, 30, 8], tp: [0.6, -2.0, 2.6], head: [-2, 0, 8], aR: aim('armR', [-0.35, 0.6, 1], 90), aRp: [-0.6, 3.4, 4.6],
  aL: aim('armL', [0.6, 0.2, -0.8], 0), aLp: [-1.8, 1.4, -3.8] };
const THROW_CARRY = { ...THROW_OVER, torso: [50, 50, -14], tp: [0.2, -6.8, 7.2], head: [6, 0, 0], aR: aim('armR', [-0.12, 0.5, 1], 40), aRp: [0, 0.8, 10.0],
  aL: aim('armL', [0.4, 0.65, -0.65], 0), aLp: [-2.2, 2.2, -4.8], lL: [54, 12, 12], lLp: [-1.2, 3.6, 5.2], lR: [-48, -12, 16], lRp: [1.2, 0.4, -0.6] };
// dash strides in the air: legs scissor wide, arms pump hard against them
const DASH_B = { ...DASH, torso: [58, -8, 4], tp: [0, -4.0, 4.6], head: [-26, 0, 0], lR: [-20, -2, 6], lRp: [0.4, 2.4, 5.6], lL: [-86, -2, 8], lLp: [-1.0, -2.0, -1.6],
  aR: aim('armR', [0.15, 0.1, 1], 0), aRp: [0.6, 2.0, 3.0], aL: aim('armL', [0.4, -0.75, -0.7], 0), aLp: [-0.6, 1.0, -3.0] };
const DASH_C = { ...DASH, torso: [66, 8, 0], tp: [0, -5.2, 4.8], head: [-34, 0, 0], lR: [-86, -2, 6], lRp: [0.4, -2.0, -1.6], lL: [-20, -2, 8], lLp: [-1.0, 2.4, 5.8],
  aR: aim('armR', [0.4, -0.75, -0.7], 0), aRp: [0.6, 1.0, -3.0], aL: aim('armL', [-0.2, 0.25, 1], 25), aLp: [0.8, 2.6, 4.0] };
const FOLLOW_CARRY = { ...FOLLOW, torso: [-62, 38, -14], tp: [0, -2.6, -6.0], head: [46, 0, 8], lR: [146, -2, 6], lRp: [0, 6.4, 7.6],
  aL: aim('armL', [0.55, 0.95, 0.35], 0), aLp: [-1.6, 3.6, -0.4], aR: aim('armR', [0.2, 0.95, 0.35], 0), aRp: [1.6, 3.8, -0.2],
  lL: [-24, 4, 16], lLp: [-0.8, 3.0, -1.6] };
const DOWN_CARRY = { ...DOWN_OVER, torso: [40, 22, -4], tp: [0, -7.8, 3.2], head: [24, 0, 0], aL: aim('armL', [0.7, 0.65, -0.3], 0), aLp: [-1.4, 2.4, -1.4],
  aR: aim('armR', [0.7, 0.7, 0.2], 0), aRp: [1.4, 2.6, 0.6] };

const keys = [
  // ---- 0.00–1.00 idle: one long breathing hold; the head turns slowly from "bored" to her ----
  K(0.00, { pos: [0, 0, 0], rot: [0, 0, 0], pivot: 0.75, plant: 1, ...IDLE, look: AWAY, lookW: 0.7, life: 0.8, shake: 0,
    calmR: 1, calmL: 1, calmH: 1 }),
  K(0.45, { look: AWAY }, 'linear'),
  K(0.95, { look: vHead, ...IDLE, torso: [6, -10, 3] }, 'sineInOut'),
  // ---- 1.00–1.17 inhale (slow), 1.20 SNAP down into the charge stance, settle, hold trembling, sinking ----
  ...snap(1.20, { ...INHALE, lookW: 0.6 }, { ...CHARGE_OVER, shake: 0.3 }),
  K(1.233, { ...CHARGE_FLEX }, 'linear'),
  K(1.32, { ...CHARGE, shake: 0.8 }, 'cubicOut'),
  K(1.95, { ...CHARGE_LOW, shake: 1.0 }, 'sineInOut'),
  // ---- 2.00 SNAP the palm open, palm up at chest height (eyes on it); hold while the seed forms; eyes go to her ----
  ...snap(2.00, { ...CHARGE_LOW, shake: 1.0, look: vHead }, { ...PALM_OVER, look: PALM, shake: 0.2, calmR: 0.15 }, null,
    { ez: { look: 'linear', shake: 'linear', calmR: 'linear' } }),
  K(2.033, { ...PALM_OVER2 }, 'linear'),
  K(2.12, { ...PALM_UP, shake: 0.3 }, 'cubicOut'),
  K(2.45, { look: PALM, head: [8, 0, -6] }, 'sineInOut'),
  K(2.75, { ...PALM_LATE, look: vHead }, 'sineInOut'),
  // ---- 2.80–3.05 the coil: slow wind-up, then STILL (the body loads, the palm stays up, drawn to the chest) ----
  K(3.05, { ...COIL, shake: 0.6, calmR: 0.4 }, 'sineInOut'),
  // ---- 3.20 THROW on the DROP: explosive palm thrust, lunge stomp; hold the follow-through (slow sink) ----
  ...snap(3.20, { pos: [0, 0, 0], ...COIL_LATE, shake: 0.6 }, { pos: [0, 0, -0.25], ...THROW_OVER, shake: 0, calmR: 1 }, null,
    { ease: 'quadIn', ez: { shake: 'linear', calmR: 'linear' } }),
  K(3.233, { pos: [0, 0, -0.3], ...THROW_CARRY }, 'linear'),
  K(3.32, { pos: [0, 0, -0.28], ...THROW }, 'cubicOut'),
  K(3.75, { look: [0.4, 1.9, -5.6] }, 'sineInOut'),
  // ---- 4.00 SNAP into the flat dash (the body freezes in the dash pose while it flies) ----
  ...snap(4.00, { ...THROW_LATE, pos: [0, 0, -0.28], look: vHead, plant: 1 }, { pos: [0.02, -0.06, -0.45], ...DASH, plant: 0 }, null,
    { n: 3, ez: { look: 'linear', plant: 'linear' } }),
  K(4.058, { pos: [0.05, -0.1, -1.12], torso: DASH_B.torso, tp: DASH_B.tp, head: DASH_B.head, lR: DASH_B.lR, lRp: DASH_B.lRp, lL: DASH_B.lL, lLp: DASH_B.lLp }, 'linear'),
  K(4.034, { aR: DASH_B.aR, aRp: DASH_B.aRp, aL: DASH_B.aL, aLp: DASH_B.aLp }, 'linear'),
  K(4.09, { aR: DASH_C.aR, aRp: DASH_C.aRp, aL: DASH_C.aL, aLp: DASH_C.aLp }, 'linear'),
  K(4.13, { pos: [0.08, -0.05, -1.98], torso: DASH_C.torso, tp: DASH_C.tp, head: DASH_C.head, lR: DASH_C.lR, lRp: DASH_C.lRp, lL: DASH_C.lL, lLp: DASH_C.lLp }, 'linear'),
  // ---- 4.15 SNAP the grab (left hand to her collar, body up, legs swing to land) ----
  K(4.15, { pos: [0.10, 0.06, -2.22], ...GRAB, lookW: 1 }, 'linear'),
  // ---- 4.25 SNAP the plant, then face to face: he pulls her in, cocky head tilt, held ----
  K(4.20, { pos: [0.11, 0.06, -2.33], plant: 0, ...GRAB, torso: [22, 10, 0], tp: [0, -2.0, 3.2], aR: aim('armR', [0.6, 0.2, -0.8], 0), aRp: [0.6, 2.0, -2.0],
    lL: [10, 4, 10], lLp: [-0.8, 4.4, 3.8], lR: [-56, -4, 10], lRp: [0.6, 0.6, -2.2] }, 'linear'),
  K(4.25, { pos: [0.12, 0, -2.40], plant: 1, ...PLANT_OVER, torso: [40, 10, -3], tp: [0, -7.6, 3.4], head: [2, 0, 0],
    aR: aim('armR', [0.8, -0.55, 0.3], 0), aRp: [1.0, 2.4, 0.6], lL: [30, 4, 14], lLp: [-0.8, 2.8, 2.6], lR: [-34, -6, 14], lRp: [0.8, 2.0, -1.4] }, 'linear'),
  K(4.31, { ...PLANT, shake: 0.15 }, 'cubicOut'),
  K(4.53, { ...PLANT_LATE, shake: 0.2 }, 'sineInOut'),
  // ---- 4.50–4.72 he lets go of her collar and slowly chambers (the knee rises, he leans back, the free arm opens for
  //      balance), still; 4.80 the KICK snaps ----
  K(4.762, { ...CHAMBER, shake: 0.5 }, 'linear'),
  ...snap(4.80, { ...CHAMBER_LATE, pos: [0.12, 0, -2.40], shake: 0.5 }, { ...KICK, pos: [0.12, 0, -2.48], shake: 0 }, null,
    { ease: 'linear', ez: { shake: 'linear' } }),
  // ---- follow-through (after the hit-stop): the leg drives on and up, a little hop forward; held ----
  K(4.865, { ...FOLLOW_CARRY }, 'linear'),
  K(4.92, { pos: [0.12, 0.07, -2.54] }, 'sineOut'),
  K(4.98, { pos: [0.12, 0, -2.58] }, 'sineIn'),
  K(5.02, { ...FOLLOW }, 'cubicOut'),
  K(5.25, { ...FOLLOW_LATE }, 'sineInOut'),
  // ---- 5.30 SNAP the foot down (lands the kick), settle; hold watching her vanish, head tilts ----
  ...snap(5.30, FOLLOW_LATE, DOWN_OVER, null, { n: 2 }),
  K(5.333, { ...DOWN_CARRY }, 'linear'),
  K(5.42, { ...DOWN }, 'cubicOut'),
  K(5.62, { ...WATCH, look: FACE }, 'sineInOut'),
  // ---- 5.55–6.35 three calm steps to the cube, feet planted on the audio's footsteps 5.75 (L), 6.00 (R), 6.25 (L);
  //      the planted leg rolls back as the root advances; arms swing against the legs ----
  K(5.55, { pos: [0.12, 0, -2.58], ...WATCH }, 'sineInOut'),
  // 5.60 the cube snaps shut (accent): he flicks both hands out and down, shoulders roll — done with her — and walks
  K(5.583, { torso: WATCH.torso, tp: WATCH.tp, head: WATCH.head, aL: WATCH.aL, aLp: WATCH.aLp, aR: WATCH.aR, aRp: WATCH.aRp }, 'sineInOut'),
  K(5.60, { torso: [-8, 10, 2], tp: [0.2, -0.8, -0.2], head: [-12, 0, -2], aL: aim('armL', [0.9, -0.2, 0.35], 0), aLp: [-1.6, 2.4, 1.0],
    aR: aim('armR', [0.95, -0.15, 0.3], 0), aRp: [1.6, 2.6, 1.0] }, 'linear'),
  K(5.633, { torso: [-2, 8, 2], tp: [0.2, -1.8, 0.4], head: [-6, 0, 2], aL: aim('armL', [0.75, -0.65, 0.05], 0), aLp: [-1.2, 1.2, 0.4],
    aR: aim('armR', [0.8, -0.6, 0.05], 0), aRp: [1.2, 1.2, 0.4] }, 'linear'),
  K(5.62, { lL: [-14, 4, 12], lLp: [-0.8, 2.0, -0.6] }, 'linear'),
  K(5.685, { lL: [2, 4, 10], lLp: [-0.8, 5.0, 0.4], torso: [4, 7, 2], tp: [0.2, -1.8, 0.6] }, 'sineOut'),
  K(5.75, { aL: aim('armL', [0.55, -0.8, -0.2], 0), aLp: [-1.0, 1.0, 0.2], aR: aim('armR', [0.55, -0.75, 0.3], 10), aRp: [1.0, 1.0, 0.4] }, 'sineInOut'),
  K(5.75, { lL: [16, 4, 10], lLp: [-0.8, 2.0, 1.2], tp: [0.2, -2.8, 1.0] }, 'sineIn'),
  K(5.85, { lR: [-6, -8, 12], lRp: [0.8, 1.6, 0.0] }, 'linear'),
  K(5.925, { lR: [4, -8, 12], lRp: [0.8, 5.0, 0.8], torso: [6, -6, -2], tp: [0.2, -1.8, 0.8],
    aL: aim('armL', [0.45, -0.8, 0.35], 10), aR: aim('armR', [0.45, -0.85, -0.3], 0) }, 'sineOut', { aL: 'sineInOut', aR: 'sineInOut' }),
  K(6.00, { lR: [16, -8, 12], lRp: [0.8, 2.0, 1.2], tp: [0.2, -2.8, 1.0] }, 'sineIn'),
  K(6.10, { lL: [-6, 4, 10], lLp: [-0.8, 1.6, 0.0] }, 'linear'),
  K(6.175, { lL: [2, 4, 10], lLp: [-0.8, 5.0, 0.6], torso: [5, 6, 2], tp: [0.2, -1.8, 0.8],
    aL: aim('armL', [0.45, -0.85, -0.25], 0), aR: aim('armR', [0.45, -0.8, 0.3], 10) }, 'sineOut', { aL: 'sineInOut', aR: 'sineInOut' }),
  K(6.25, { lL: [12, 4, 10], lLp: [-0.8, 2.0, 1.0], tp: [0.2, -2.6, 0.8] }, 'sineIn'),
  K(6.33, { pos: [0.36, 0, -3.54], lR: [-2, -8, 12], lRp: [0.8, 1.6, 0.4] }, 'linear', { pos: 'sineOut' }),
  // ---- 6.30 stands at the cube (hold) while the camera dives past him ----
  K(6.42, { ...STAND, look: FACE }, 'sineOut'),
  K(6.599, { ...STAND, torso: [-3, 4, -3], tp: [0.2, -1.0, 0.2] }, 'sineInOut'),
  // ---- 6.60 inside: parked floating (phase 1; the blink-in comes at 6.75) ----
  K(6.60, { pos: [I[0] - 0.5, I[1] - 0.95, I[2] - 2.0], rot: [6, 168, 0], pivot: 0.9, plant: 0, lookW: 0, life: 1, shake: 0,
    torso: [14, -10, 4], tp: [0, -1, 1], head: [10, 0, 0], aR: [40, 10, 50], aRp: [0.5, 1.5, 1.5], aL: [70, 20, 30], aLp: [-0.5, 1.5, 2.5],
    lR: [-20, -6, 10], lRp: [1, 2, -1.5], lL: [30, 6, 12], lLp: [-1, 3, 2] }, 'step'),
  K(7.20, { torso: [18, -6, 2], aR: [46, 12, 46], aL: [64, 22, 34], lR: [-16, -6, 12], lL: [24, 6, 10] }, 'sineInOut'),
];

export default bake({
  id: 'user', skin: 'wide_steve', slim: false, keys, from: 0, to: 7.2, cuts: [6.6], seed: 0,
  reach: [
    { t: 4.15, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20, hint: [0.4, 1.6, 2.6] },
    { t: 4.20, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20, hint: [0.4, 1.6, 2.6] },
    { t: 4.25, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20, hint: [0.4, 1.6, 2.6] },
    { t: 4.31, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20, hint: [0.4, 1.6, 2.6] },
    { t: 4.53, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20, hint: [0.4, 1.6, 2.6] },
    { t: 4.80, limb: 'legR', bone: 'footR', target: vBelly, aim: 0, hint: [0, 2.5, 1.0] },
  ],
  log: typeof process !== 'undefined' && process.env && process.env.KITLOG,
});
