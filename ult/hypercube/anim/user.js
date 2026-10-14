// USER (attacker, Steve). Owned by the animation engineer. Hand-keyed with anim/kit.js (feet solved, baked to 60 fps).
// World section 0–3.4:
//   0.00 cocky idle → 0.14 sumo leg raise, arms open (inhale) → 0.40 STOMPS into a deep charging stance (trembling)
//   0.88 the right hand swings forward → 1.00 palm-up at chest height, steady to 1.46 (looks at the seed, then the
//   victim) → coil → 1.60 palm thrust + lunge stomp on the DROP → watches the cube unfold → 2.06 loads →
//   2.18 low dash → 2.35 grabs the collar (left hand) → 2.42/2.45 lands and plants → pulls, weight back, lead leg
//   chambers → 2.60 HEAVY push kick (left sole into the belly, hit-stop 0.05) → follow-through, foot down →
//   watches the cube swallow → 3.16 running step → 3.30 dives at the cube face
// Inside (≥ 3.4): parked floating behind the victim (phase 1).
import { INSIDE as I, WORLD } from '../timeline.js';
import { K, bake, appendPose, pointAt } from './kit.js';
import VICTIM from './victim.js';

const vHead = t => pointAt(VICTIM, 'head', [0, 4, 0], t);
const vCollar = t => pointAt(VICTIM, 'torso', [0, 4.5, 3.2], t);   // front of the collar
const vBelly = t => pointAt(VICTIM, 'torso', [0, -0.5, 3.6], t);   // where the sole lands
const CUBE = WORLD.cube;
const FACE = [CUBE[0], CUBE[1], CUBE[2] + 1.8];
const PALM = [0.46, 1.24, -0.88];                                  // the seed above the open palm (look target)

// footprints (the user faces -Z: his right = +X)
const IDLE_L = [-0.26, 0, -0.48], IDLE_R = [0.36, 0, 0.42];
const CH_L = [-0.22, 0, -0.40], CH_R = [0.60, 0, 0.40];          // charging stance (wide, deep)
const LUNGE_L = [0.06, 0, -0.50];                                 // thrust lunge: the front foot stomps forward
const ADV_R = [0.44, 0, -0.10], ADV_L = [0.04, 0, -0.96];         // stalking advance (two quick steps) before the dash
const LAND_L = [0.08, 0, -3.18], LAND_R = [0.44, 0, -2.66];      // dash landing (left first, right plants 2.45)
const DOWN_L = [0.12, 0, -3.56];                                 // the kick foot comes down forward
const STEP_R = [0.30, 0, -4.14];                                 // running step before the dive

const keys = [
  // ---- 0.00 cocky idle: weight back, loose asymmetric hands, chin up ----
  K(0.00, { yaw: 0, footL: IDLE_L, footR: IDLE_R, torso: [10, -18, 5], head: [-8, 0, -8], look: vHead,
    armL: [62, 26, 28], armR: [18, -8, 38], shake: 0.4 }),
  K(0.12, { torso: [8, -16, 5], armL: [58, 24, 30], armR: [16, -8, 40] }, 'sineInOut'),
  // ---- 0.14–0.33 inhale: sumo leg raise to the side, body over the left leg, arms open wide and high ----
  K(0.20, { footR: [0.50, 0.14, 0.40], at: [-0.04, -0.16] }, 'sineIn'),
  K(0.30, { footR: [0.86, 0.40, 0.34], at: [-0.12, -0.28], torso: [-10, 12, 15], head: [-18, 0, -8],
    armL: [44, -10, 104], armR: [50, -18, 100], shake: 0.8 }, 'quadOut', { torso: 'sineOut', armL: 'sineOut', armR: 'sineOut' }),
  K(0.33, { torso: [-11, 13, 16], armL: [46, -10, 108], armR: [52, -18, 104] }, 'sineOut'),
  // ---- 0.40 STOMP: the right foot slams down wide, the body drops and curls, arms slam down and back ----
  K(0.40, { footR: CH_R, footL: CH_L, torso: [34, 18, -10], head: [12, 0, -6], armL: [28, 24, 48], armR: [-38, 6, 52],
    shake: 0 }, 'cubicIn', { torso: 'quadIn', armL: 'quadIn', armR: 'quadIn', head: 'quadIn' }),
  K(0.45, { torso: [41, 20, -12], head: [16, 0, -6], armL: [22, 26, 54], armR: [-46, 4, 58] }, 'quadOut'),
  K(0.56, { torso: [36, 18, -9], head: [12, 0, -6], armL: [28, 24, 48], armR: [-40, 6, 52], shake: 1.1 }, 'sineInOut'),
  // charging: trembling, slowly coiling lower
  K(0.82, { torso: [39, 20, -10], armL: [24, 25, 51], armR: [-45, 4, 55], shake: 1.4, look: vHead }, 'sineInOut'),
  // ---- 0.82–1.00 the right hand swings forward and opens palm-up at chest height ----
  K(1.00, { torso: [16, -10, -2], head: [6, 0, -4], look: PALM, dirR: [-0.10, -0.12, 1], twistR: 90, armL: [-30, 0, 42], shake: 0.2 },
    'sineInOut'),
  K(1.10, { torso: [15, -11, -2], dirR: [-0.10, -0.08, 1] }, 'sineOut'),
  // the eyes go from the seed to the victim
  K(1.28, { look: PALM, head: [4, 0, -6] }, 'sineInOut'),
  K(1.42, { look: vHead, head: [6, 0, -4] }, 'sineInOut'),
  K(1.44, { torso: [14, -12, -2], dirR: [-0.10, -0.06, 1], armL: [-32, 0, 44], footL: CH_L, shake: 0.2, 'armR.pos': [0, 0, 0] },
    'sineInOut'),
  // ---- coil (1.44–1.54): twist away, the palm draws back beside the ribs, the front foot unloads ----
  K(1.54, { torso: [6, -30, 4], head: [8, 0, 0], dirR: [0.30, -0.35, 0.10], twistR: 90, armL: [60, 28, 34],
    footL: [-0.14, 0.10, -0.46], 'armR.pos': [0, 0, -1.5] }, 'sineInOut'),
  // ---- 1.60 THRUST on the drop (cut on the action): lunge stomp, hips/shoulder whip forward, arm out with reach ----
  K(1.60, { footL: LUNGE_L, torso: [32, 30, -6], head: [4, 0, 0], dirR: [-0.06, 0.06, 1], twistR: 0,
    armL: [-50, -6, 44], 'armR.pos': [0, 0, 3.5] }, 'expoIn', { footL: 'cubicIn' }),
  K(1.70, { torso: [36, 34, -8], dirR: [-0.04, 0.12, 1], armL: [-58, -6, 48], 'armR.pos': [0, 0, 4] }, 'quadOut'),
  // follow the seed, then watch the cube unfold
  K(1.84, { footL: LUNGE_L, footR: CH_R, torso: [26, 20, -5], head: [0, 0, 4], look: [0.4, 1.9, -5.6], dirR: [0.10, -0.30, 1],
    armL: [-34, 0, 40], 'armR.pos': [0, 0, 0], shake: 0.3 }, 'sineInOut'),
  // ---- 1.88–2.10 stalking advance: the back foot steps up, the front foot steps on (watching the cube) ----
  K(1.94, { footR: [0.52, 0.12, 0.14] }, 'sineInOut'),
  K(2.00, { footR: ADV_R, footL: LUNGE_L, torso: [18, 8, -3], look: [0.3, 1.8, -5.0], dirR: [0.30, -0.70, 0.50], armL: [-20, 0, 34] },
    'sineIn', { torso: 'sineInOut', dirR: 'sineInOut' }),
  K(2.05, { footL: [0.04, 0.10, -0.74] }, 'sineOut'),
  K(2.10, { footL: ADV_L, footR: ADV_R, torso: [24, 4, -2], look: vHead }, 'sineIn', { torso: 'sineInOut' }),
  // ---- 2.10–2.18 load: sink, lean, arms back ----
  K(2.18, { footL: ADV_L, footR: ADV_R, torso: [42, 4, -2], head: [-20, 0, 0], armL: [-30, 10, 30], armR: [-56, -6, 28] }, 'quadOut'),
  // ---- 2.18–2.35 dash: the front foot unloads, the back leg drives, low leap; the left hand shoots to the collar ----
  K(2.20, { footL: [0.04, 0.10, -1.14], at: [0.30, -0.56], torso: [48, 4, -2] }, 'quadIn'),
  K(2.23, { yaw: 0, legR: [-34, 0, 8], legL: [44, 0, 6], at: [0.30, -1.00], y: 0.08, armR: [-66, -6, 26] }, 'quadIn', { at: 'linear' }),
  K(2.24, { armL: [-26, 10, 30] }, 'sineOut'),
  K(2.30, { yaw: 4, legR: [-42, 0, 10], legL: [48, 0, 8], at: [0.28, -2.26], y: 0.18, torso: [44, 2, -2],
    aimL: vCollar, reachL: 3, armR: [-72, -4, 30] }, 'linear', { at: 'linear', aimL: 'sineInOut' }),
  K(2.35, { yaw: 6, legR: [-42, 2, 12], legL: [38, 0, 8], at: [0.27, -3.08], y: 0.12, torso: [32, 0, -2],
    aimL: vCollar, armR: [-62, -4, 36] }, 'sineOut', { at: 'sineOut' }),
  // ---- 2.42 the left foot lands, 2.45 the right plants: braced, absorbing ----
  K(2.42, { footL: LAND_L, legR: [-30, 4, 14], at: [0.24, -3.16], torso: [26, -4, 0], aimL: vCollar }, 'sineOut', { footL: 'quadIn' }),
  K(2.45, { footL: LAND_L, footR: LAND_R, torso: [22, -6, 2], armR: [-30, 10, 50], look: vHead }, 'quadOut', { footR: 'quadIn' }),
  // ---- pull: lean back onto the right foot, the lead (left) leg rises and chambers at the belly ----
  K(2.47, { footL: LAND_L, torso: [16, -8, 3] }, 'sineIn'),
  K(2.52, { footL: [0.10, 0.22, -3.34], at: [0.34, -2.84], torso: [0, -10, 4], aimL: vCollar, armR: [30, 30, 64] }, 'sineInOut'),
  K(2.555, { footL: t => vBelly(t), reachLegL: 3.5, 'legL.pos': [0, 0, -3.5], at: [0.33, -2.88], torso: [-14, 4, -2],
    armL: [56, 24, 44], armR: [6, 22, 72] }, 'sineOut', { armL: 'quadOut' }),
  // ---- 2.60 HEAVY PUSH KICK (cut on the contact): hips surge, torso throws back, the sole drives into the belly ----
  K(2.60, { footL: t => vBelly(t), reachLegL: 3.5, 'legL.pos': [0, 0, 0], at: [0.30, -3.02], torso: [-26, 12, -6], head: [20, 0, 0],
    armL: [-34, 0, 70], armR: [-40, 20, 66], shake: 0 }, 'expoIn'),
  K(2.65, { footL: t => vBelly(t), reachLegL: 3.5, 'legL.pos': [0, 0, 0], at: [0.30, -3.02], torso: [-26, 12, -6], head: [20, 0, 0],
    armL: [-34, 0, 70], armR: [-40, 20, 66], shake: 0 }, 'linear'),
  // ---- follow-through: the leg rises on, body leans back, then the kick foot comes down forward ----
  K(2.73, { legL: [100, 6, 8], reachLegL: 0, at: [0.30, -3.08], torso: [-32, 14, -8], head: [26, 0, 0], armL: [-44, 0, 78],
    armR: [-34, 20, 76] }, 'quadOut'),
  K(2.82, { footL: [0.14, 0.16, -3.52], at: [0.32, -3.10], torso: [-4, 8, -4], head: [8, 0, 0], armL: [10, 10, 58], armR: [16, 20, 56] },
    'sineInOut'),
  K(2.88, { footL: DOWN_L, footR: LAND_R, torso: [16, 4, -2], armL: [28, 18, 40], armR: [30, 22, 44], look: FACE, shake: 0.3 }, 'quadIn'),
  // ---- watches the cube swallow, cool recovery ----
  K(3.00, { torso: [8, 6, -3], head: [-4, 0, 4], armL: [16, 14, 30], armR: [12, 10, 28] }, 'sineOut'),
  K(3.12, { torso: [12, 2, -2], head: [-2, 0, 2], armL: [6, 12, 26], armR: [4, 10, 24] }, 'sineInOut'),
  // ---- 3.14–3.40 running step and dive at the cube face ----
  K(3.14, { footL: DOWN_L, footR: LAND_R }, 'linear'),
  K(3.21, { footR: [0.38, 0.18, -3.36], torso: [32, -8, 2], armL: [50, 10, 30], armR: [-46, 0, 30] }, 'sineIn'),
  K(3.27, { footR: STEP_R, torso: [40, -4, 0], armL: [-24, 0, 30], armR: [30, 0, 30] }, 'quadIn'),
  K(3.32, { legL: [-30, 0, 6], legR: [-6, 0, 8], at: [0.26, -4.42], y: 0.10, torso: [54, 0, 0], armL: [-70, 0, 24], armR: [-66, 0, 26] },
    'quadIn'),
  K(3.383, { legL: [-48, 0, 8], legR: [-34, 0, 10], at: [0.20, -4.96], y: 0.40, torso: [66, 0, 0], armL: [-90, 0, 18], armR: [-88, 0, 20] },
    'quadIn'),
];

const def = bake({ id: 'user', skin: 'wide_steve', slim: false, keys, from: 0, to: 3.4 - 1 / 60 });
// inside: parked floating behind the victim (phase 1 placeholder; the blink-in comes at 3.55)
appendPose(def, 3.4, {
  pos: [I[0] + 0.3, I[1] - 0.95, I[2] + 2.4], rot: [0, 8, 0], pivot: 0.9, plant: 0,
  torso: [14, 0, 0], head: [0, 0, 0], armR: [40, 10, 40], armL: [60, 10, 30], legR: [-10, 0, 8], legL: [20, 0, 6],
  'armR.pos': [0, 0, 0], 'armL.pos': [0, 0, 0], 'legR.pos': [0, 0, 0], 'legL.pos': [0, 0, 0], 'torso.pos': [0, 0, 0], 'head.pos': [0, 0, 0],
});
export default def;
