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
const LAND_L = [0.08, 0, -3.20], LAND_R = [0.44, 0, -2.70];      // dash landing (left first, right plants 2.45)
const DOWN_L = [0.12, 0, -3.56];                                 // the kick foot comes down forward
const STEP_R = [0.30, 0, -4.14];                                 // running step before the dive

const keys = [
  // ---- 0.00 cocky idle: weight back, loose wide hands, chin up ----
  K(0.00, { yaw: 0, footL: IDLE_L, footR: IDLE_R, torso: [12, -22, 6], head: [-8, 0, -8], look: vHead,
    armL: [70, 30, 40], armR: [12, -10, 52], shake: 0.4 }),
  K(0.12, { torso: [9, -19, 6], armL: [66, 28, 42], armR: [10, -10, 55] }, 'sineInOut'),
  // ---- 0.14–0.33 inhale: sumo leg raise to the side, body over the left leg, arms flung up into a V ----
  K(0.20, { footR: [0.50, 0.14, 0.40], at: [-0.04, -0.16] }, 'sineIn'),
  K(0.30, { footR: [0.86, 0.40, 0.34], at: [-0.12, -0.28], torso: [-12, 12, 16], head: [-20, 0, -8],
    armL: [30, -10, 128], armR: [36, -16, 122], shake: 0.8 }, 'quadOut', { torso: 'sineOut', armL: 'sineOut', armR: 'sineOut' }),
  K(0.32, { torso: [-13, 13, 17], armL: [31, -10, 131], armR: [37, -16, 125] }, 'sineOut'),
  // ---- 0.40 STOMP: the right foot slams down wide, the body drops and curls, fists drive down and out ----
  K(0.40, { footR: CH_R, footL: CH_L, torso: [30, 10, -8], head: [16, 0, -6], shake: 0 }, 'cubicIn',
    { torso: 'quadIn', head: 'quadIn' }),
  K(0.41, { armL: [-10, -2, 48], armR: [-16, 2, 52] }, 'quadIn'),
  K(0.46, { torso: [38, 12, -10], head: [22, 0, -6], armL: [-16, -4, 54], armR: [-22, 0, 58] }, 'quadOut'),
  K(0.58, { torso: [33, 10, -8], head: [14, 0, -4], armL: [-12, -2, 50], armR: [-18, 2, 54], shake: 1.1 }, 'sineInOut'),
  // charging: trembling, slowly coiling lower, glaring up from under the brows
  K(0.82, { torso: [36, 12, -9], head: [10, 0, -4], armL: [-16, -4, 53], armR: [-22, 0, 57], shake: 1.5, look: vHead }, 'sineInOut'),
  // ---- 0.82–1.00 the right hand swings forward and opens palm-up at chest height ----
  K(1.00, { torso: [16, -10, -2], head: [6, 0, -4], look: PALM, dirR: [-0.10, -0.12, 1], twistR: 90, armL: [-40, 0, 56], shake: 0.2 },
    'sineInOut'),
  K(1.10, { torso: [15, -11, -2], dirR: [-0.10, -0.08, 1] }, 'sineOut'),
  // the eyes go from the seed to the victim
  K(1.28, { look: PALM, head: [4, 0, -6] }, 'sineInOut'),
  K(1.42, { look: vHead, head: [6, 0, -4] }, 'sineInOut'),
  K(1.44, { torso: [14, -12, -2], dirR: [-0.10, -0.06, 1], armL: [-42, 0, 58], footL: CH_L, shake: 0.2, 'armR.pos': [0, 0, 0] },
    'sineInOut'),
  // ---- coil (1.44–1.54): twist far away, lean back, the palm hand pulled back behind, the left arm aims ----
  K(1.54, { torso: [-2, -38, 6], head: [6, 0, 0], dirR: [0.45, 0.10, -0.90], twistR: 90, armL: [84, 22, 30],
    footL: [-0.14, 0.10, -0.46], 'armR.pos': [0, 0, -1.5] }, 'sineInOut'),
  // ---- 1.60 THRUST on the drop (cut on the action): lunge stomp, hips/shoulder whip forward, arm out with reach ----
  K(1.60, { footL: LUNGE_L, torso: [32, 30, -6], head: [4, 0, 0], dirR: [-0.06, 0.06, 1], twistR: 0,
    armL: [-56, -6, 52], 'armR.pos': [0, 0, 3.5] }, 'expoIn', { footL: 'cubicIn' }),
  K(1.70, { torso: [36, 34, -8], dirR: [-0.04, 0.12, 1], armL: [-62, -6, 56], 'armR.pos': [0, 0, 4] }, 'quadOut'),
  // follow the seed, then watch the cube unfold
  K(1.84, { footL: LUNGE_L, footR: CH_R, torso: [26, 20, -5], head: [0, 0, 4], look: [0.4, 1.9, -5.6], dirR: [0.20, -0.20, 1],
    armL: [-40, 0, 50], 'armR.pos': [0, 0, 0], shake: 0.3 }, 'sineInOut'),
  // ---- 1.88–2.10 stalking advance: the back foot steps up, the front foot steps on (watching the cube) ----
  K(1.94, { footR: [0.52, 0.12, 0.14] }, 'sineInOut'),
  K(2.00, { footR: ADV_R, footL: LUNGE_L, torso: [18, 8, -3], look: [0.3, 1.8, -5.0], dirR: [0.70, -0.55, 0.30], armL: [-24, 0, 52] },
    'sineIn', { torso: 'sineInOut', dirR: 'sineInOut' }),
  K(2.05, { footL: [0.04, 0.10, -0.74] }, 'sineOut'),
  K(2.10, { footL: ADV_L, footR: ADV_R, torso: [24, 4, -2], look: vHead, armL: [-30, 4, 50] }, 'sineIn', { torso: 'sineInOut' }),
  // ---- 2.10–2.18 load: sink, lean, arms back and out ----
  K(2.18, { footL: ADV_L, footR: ADV_R, torso: [42, 4, -2], head: [-20, 0, 0], armL: [-40, 10, 40], armR: [-62, -6, 36] }, 'quadOut'),
  // ---- 2.18–2.35 dash: the front foot unloads, the back leg drives, low leap; the left hand shoots to the collar ----
  K(2.20, { footL: [0.04, 0.10, -1.14], at: [0.30, -0.56], torso: [48, 4, -2] }, 'quadIn'),
  K(2.23, { yaw: 0, legR: [-34, 0, 8], legL: [44, 0, 6], at: [0.30, -1.00], y: 0.08, armR: [-68, -6, 34] }, 'quadIn', { at: 'linear' }),
  K(2.30, { yaw: 4, legR: [-42, 0, 10], legL: [42, 0, 8], at: [0.28, -2.30], y: 0.18, torso: [44, 2, -2],
    aimL: vCollar, reachL: 3, armR: [-74, -4, 36] }, 'linear', { at: 'linear', aimL: 'sineInOut' }),
  K(2.35, { yaw: 6, legR: [-40, 2, 12], legL: [30, 0, 8], at: [0.26, -3.06], y: 0.12, torso: [30, 0, -2],
    aimL: vCollar, armR: [-62, -4, 44] }, 'sineOut', { at: 'sineOut' }),
  // ---- 2.42 the left foot lands, 2.45 the right plants: braced, holding the victim at arm's length ----
  K(2.42, { footL: LAND_L, legR: [-30, 4, 14], at: [0.24, -3.16], torso: [26, -4, 0], aimL: vCollar }, 'sineOut', { footL: 'quadIn' }),
  K(2.45, { footL: LAND_L, footR: LAND_R, torso: [22, -6, 2], armR: [-30, 10, 56], look: vHead }, 'quadOut', { footR: 'quadIn' }),
  K(2.49, { footL: LAND_L, torso: [20, -8, 3], aimL: vCollar }, 'sineInOut'),
  // ---- 2.49–2.555 release and chamber: weight back onto the right foot, torso tips back, the lead knee comes up ----
  K(2.53, { footL: [0.12, 0.30, -3.40], at: [0.30, -3.02], torso: [4, -6, 2], armL: [40, 20, 40], armR: [20, 30, 66] }, 'sineInOut',
    { armL: 'quadOut' }),
  K(2.555, { footL: t => vBelly(t), reachLegL: 4, 'legL.pos': [0, 0, -4], at: [0.29, -3.04], torso: [-14, 4, -2],
    armL: [30, 22, 56], armR: [6, 22, 74] }, 'sineOut'),
  // ---- 2.60 HEAVY PUSH KICK (cut on the contact): hips surge, torso throws back, the sole drives into the belly ----
  K(2.60, { footL: t => vBelly(t), reachLegL: 4, 'legL.pos': [0, 0, 0], at: [0.30, -3.10], torso: [-28, 12, -6], head: [22, 0, 0],
    armL: [-36, 0, 74], armR: [-42, 20, 70], shake: 0, look: vHead }, 'expoIn'),
  K(2.65, { look: vHead }, 'linear'),
  // ---- follow-through: the leg rises on, body leans back, then the kick foot comes down forward ----
  K(2.73, { legL: [100, 6, 8], reachLegL: 0, 'legL.pos': [0, 0, 0], at: [0.30, -3.20], torso: [-34, 14, -8], head: [28, 0, 0],
    armL: [-46, 0, 80], armR: [-36, 20, 78] }, 'sineInOut', { at: 'sineOut' }),
  K(2.82, { footL: [0.14, 0.16, -3.62], at: [0.32, -3.20], torso: [-6, 8, -4], head: [8, 0, 0], armL: [16, 0, 72], armR: [8, 20, 72] },
    'sineInOut'),
  K(2.88, { footL: DOWN_L, footR: LAND_R, torso: [14, 6, -4], armL: [10, 10, 62], armR: [16, 20, 58], look: FACE, shake: 0.3 }, 'quadIn'),
  // ---- 2.88–3.14 the cube swallows: cocky, he points his chin and right hand at it ----
  K(3.00, { torso: [2, 14, -4], head: [-6, 0, 10], armR: [118, 8, 24], armL: [-14, 0, 46] }, 'cubicOut'),
  K(3.13, { torso: [4, 12, -3], head: [-4, 0, 8], armR: [114, 8, 26], armL: [-12, 0, 44] }, 'sineInOut'),
  // ---- 3.14–3.40 running step and dive at the cube face ----
  K(3.14, { footL: DOWN_L, footR: LAND_R }, 'linear'),
  K(3.21, { footR: [0.38, 0.18, -3.36], torso: [32, -8, 2], armL: [50, 10, 40], armR: [-30, 0, 40] }, 'sineIn'),
  K(3.26, { footL: DOWN_L }, 'linear'),
  K(3.27, { footR: STEP_R, torso: [40, -4, 0], armL: [-24, 0, 40], armR: [30, 0, 40] }, 'quadIn'),
  K(3.32, { legL: [-30, 0, 6], legR: [-6, 0, 8], at: [0.26, -4.42], y: 0.10, torso: [54, 0, 0], armL: [-70, 0, 34], armR: [-66, 0, 36] },
    'quadIn'),
  K(3.383, { legL: [-48, 0, 8], legR: [-34, 0, 10], at: [0.20, -4.96], y: 0.40, torso: [66, 0, 0], armL: [-90, 0, 28], armR: [-88, 0, 30] },
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
