// USER (attacker, Steve). Owned by the animation engineer. Hand-keyed R6 style with anim/kit.js (legs in the root frame,
// every limb translated out of its socket, life + tremble layers, contacts solved by aiming the limb and thrusting it
// out of its socket, baked to 60 fps).
// World section 0–3.4:
//   0.00 cocky bouncing fighting idle → 0.18 inhale: rises, arms float up and out, the right leg lifts → 0.40 STOMP into
//   a deep, wide, curled charge stance (fists pulled in, trembling, a throb on the 0.80 beat) → 0.82 the right hand
//   rises → 1.00 palm up at chest height, steady to 1.44 (eyes: palm → victim) → coil (twist away, palm drawn back,
//   front foot lifts) → 1.60 PALM THRUST on the drop: lunge stomp, hips whip, arm out of the socket → watches the cube
//   unfold → 2.05 loads → 2.20 low dash → 2.35 grabs her collar with the left hand → 2.40 lands, yanks her in →
//   2.47 shoves her off → chamber → 2.60 HEAVY rear-leg push kick (right sole into the belly, hit-stop 0.05) →
//   follow-through, 2.80 stomps the foot down → hand to the neck, neck roll while the cube swallows her →
//   3.05 swaggers toward the cube → 3.26 dives at the face.
// Inside (≥ 3.4): parked floating behind the victim (phase 1).
import { INSIDE as I } from '../timeline.js';
import { K, bake, aim, pointAt } from './kit.js';
import VICTIM from './victim.js';

const vHead = t => pointAt(VICTIM, 'head', [0, 4, 0], t);
const vCollar = t => pointAt(VICTIM, 'torso', [0.6, 4.4, 3.0], t);  // front of her collar (the fist sinks in a little)
const vBelly = t => pointAt(VICTIM, 'torso', [0, -2.4, 2.3], t);    // where the sole lands
const PALM = [0.3, 1.18, -0.75];                                     // the seed above the open palm (look target)
const FACE = [0.2, 1.9, -5.4];                                       // the cube face

// ---- poses (root frame: x = his right, z = forward = world -Z) ----
const IDLE = {
  torso: [12, -16, 5], tp: [0.5, -1.4, 0.6], head: [20, 0, -8],
  aR: aim('armR', [0.5, -0.85, -0.2], 20), aRp: [0.9, -0.4, -1.8], aL: aim('armL', [-0.25, -0.35, 1], 40), aLp: [-0.8, 1.2, 3.4],
  lR: [-14, -20, 12], lRp: [0.8, 0.8, -2.0], lL: [16, 8, 7], lLp: [-0.6, 1.6, 2.0],
};
const IDLE_DN = {
  torso: [15, -14, 4], tp: [0.3, -2.8, 1.0], aR: aim('armR', [0.55, -0.85, -0.05], 20), aRp: [0.9, -1.0, -1.4],
  aL: aim('armL', [-0.25, -0.5, 1], 40), aLp: [-0.8, 0.6, 3.0],
  lR: [-16, -21, 14], lRp: [1.0, 1.8, -2.1], lL: [18, 9, 9], lLp: [-0.7, 2.6, 2.1],
};
const CHARGE = {
  torso: [36, 8, -4], tp: [0.2, -5.6, 1.6], head: [18, 0, 0],
  aR: aim('armR', [0.75, -0.62, 0.25], 30), aRp: [0.9, 2.8, 0.4], aL: aim('armL', [0.72, -0.66, -0.15], 30), aLp: [-0.9, 2.6, -1.0],
  lR: [-20, -26, 34], lRp: [2.8, 3.2, -1.8], lL: [26, 16, 28], lLp: [-2.6, 2.6, 2.6],
};
const PALM_UP = {
  torso: [16, 12, 4], tp: [0.6, -3.6, 1.2], head: [10, 0, 0],
  aR: aim('armR', [-0.28, 0.08, 1], 90), aRp: [-0.6, 1.6, 3.0], aL: [26, -16, 44], aLp: [-1.2, 0.8, -2.2],
  lR: [-18, -22, 28], lRp: [2.4, 2.4, -1.6], lL: [22, 14, 22], lLp: [-2.2, 2.0, 2.2],
};

const keys = [
  // ---- 0.00–0.18 cocky bouncing idle (bounces on the 8ths, eyes on her) ----
  K(0.00, { pos: [0, 0, 0], rot: [0, 0, 0], pivot: 0.75, plant: 1, ...IDLE, look: vHead, lookW: 1, life: 1, shake: 0,
    calmR: 1, calmL: 1, calmH: 1 }),
  K(0.10, { ...IDLE_DN }, 'sineInOut'),
  K(0.18, { ...IDLE, aL: aim('armL', [-0.2, -0.3, 1], 40), aLp: [-0.8, 1.6, 3.8] }, 'sineInOut'),
  // ---- 0.18–0.31 inhale: rises tall, leans back, arms float up and out, the right leg lifts for the stomp ----
  K(0.31, { torso: [-12, 6, 8], tp: [0.4, 1.0, -1.2], head: [-14, 0, 6], lookW: 0.4,
    aR: aim('armR', [0.85, 0.0, 0.45], 0), aRp: [0.6, 2.6, -0.2], aL: aim('armL', [0.75, 0.2, 0.5], 0), aLp: [-0.8, 2.2, 0.4],
    lR: [14, -12, 30], lRp: [2.4, 6.4, 0.4], lL: [24, 14, 24], lLp: [-2.4, 1.8, 2.4] }, 'sineInOut', { lR: 'sineOut', lRp: 'sineOut' }),
  // ---- 0.31–0.40 STOMP on the beat: arms drive down, the body drops and curls, the right foot slams down wide ----
  K(0.40, { ...CHARGE, torso: [38, 8, -6], tp: [0.2, -6.2, 2.0], head: [22, 0, 0], lookW: 0.55,
    aR: aim('armR', [0.8, -0.55, 0.3], 30), aRp: [0.8, 2.4, 0.2], aL: aim('armL', [0.75, -0.6, -0.1], 30), aLp: [-0.8, 2.4, -0.8] }, 'sineIn',
    { lookW: 'linear', lR: 'quadIn', lRp: 'quadIn', aR: 'sineInOut', aL: 'sineInOut' }),
  K(0.46, { ...CHARGE, torso: [42, 10, -6], tp: [0.2, -6.8, 2.2], aRp: [1.0, 3.2, 0.6], aLp: [-1.0, 3.0, -1.2], shake: 1.0 }, 'quadOut', { aR: 'sineOut', aL: 'sineOut' }),
  K(0.58, { ...CHARGE, shake: 1.1 }, 'sineInOut'),
  // charging: trembling, coiling lower; a throb on the 0.80 beat
  K(0.74, { torso: [38, 10, -5], tp: [0.0, -6.0, 1.8], aR: aim('armR', [0.7, -0.68, 0.2], 30), aRp: [0.8, 3.0, 0.2], aLp: [-0.9, 2.8, -1.4], shake: 1.5 }, 'sineInOut'),
  K(0.80, { tp: [0.0, -6.8, 1.9], torso: [41, 10, -6], shake: 1.7 }, 'quadIn'),
  // ---- 0.80–1.00 the right hand rises and opens palm up at chest height; the body rises to a mid crouch ----
  K(0.88, { aR: aim('armR', [0.2, -0.75, 1], 60), aRp: [0.2, 2.4, 0.8], torso: [30, 10, -2], tp: [0.2, -5.0, 1.6], shake: 1.0 }, 'sineInOut'),
  K(1.00, { ...PALM_UP, look: PALM, lookW: 1, shake: 0.35, calmR: 0.12 }, 'cubicOut', { look: 'sineInOut', calmR: 'linear' }),
  // alive around the steady palm: weight sways, the left arm floats, eyes go from the seed to her
  K(1.18, { torso: [14, 10, 6], tp: [0.2, -3.0, 1.6], aL: [34, -12, 52], aLp: [-1.4, 1.2, -2.6], lLp: [-2.2, 2.4, 2.4] }, 'sineInOut'),
  K(1.30, { look: PALM, head: [8, 0, -6] }, 'sineInOut'),
  K(1.40, { look: vHead, head: [14, 0, -4] }, 'sineInOut'),
  K(1.44, { ...PALM_UP, torso: [17, 12, 3], tp: [0.8, -3.8, 1.0], head: [14, 0, -4], shake: 0.4, calmR: 0.12, aL: [44, 6, 34], aLp: [-1.0, 1.0, 0.2] }, 'sineInOut'),
  // ---- 1.44–1.565 coil: the body loads (twist away, weight back, front foot lifts, left arm aims) while the palm stays up
  //      and readable, only drawn back toward the chest ----
  K(1.565, { torso: [4, -16, 8], tp: [1.4, -3.4, -1.6], head: [8, 0, 0], aR: aim('armR', [-0.1, -0.06, 1], 90), aRp: [-0.2, 1.2, -1.8],
    aL: [86, 24, 16], aLp: [0, 1.4, 3.4], lL: [18, 12, 18], lLp: [-2.0, 4.6, 1.2], lR: [-24, -22, 30], lRp: [2.8, 2.8, -1.8],
    calmR: 0.5 }, 'sineInOut'),
  // ---- 1.60 THRUST on the drop (cut on the action): lunge stomp, hips/shoulders whip, the arm shoots out of the socket ----
  K(1.60, { pos: [0, 0, -0.22], torso: [30, 34, -8], tp: [0.2, -4.6, 4.4], head: [-8, 0, 0], aR: aim('armR', [-0.04, 0.06, 1], 40), aRp: [0, 1.2, 7.2],
    aL: [-42, -12, 48], aLp: [-1.4, 1.2, -3.4], lL: [46, 12, 12], lLp: [-1.2, 3.0, 4.4], lR: [-42, -12, 16], lRp: [1.2, 0.8, -0.2],
    shake: 0, calmR: 1 }, 'cubicIn', { pos: 'quadIn', lL: 'quadIn', lLp: 'quadIn' }),
  K(1.67, { torso: [34, 36, -9], tp: [0.2, -5.0, 4.8], aR: aim('armR', [-0.06, 0.1, 1], 40), aRp: [0, 1.4, 8.4], aL: [-50, -12, 54], aLp: [-1.6, 1.4, -3.8] }, 'quadOut'),
  // watches the seed fly and the cube unfold; sinks out of the lunge, the arm lowers, the hand closes
  K(1.84, { torso: [22, 26, -4], tp: [0.4, -4.0, 3.0], head: [-4, 0, 6], look: [0.4, 1.9, -5.6], aR: aim('armR', [0.1, -0.35, 1], 20), aRp: [0, 0.6, 4.4],
    aL: [-30, -8, 46], aLp: [-1.2, 0.6, -2.6] }, 'sineInOut'),
  K(2.00, { torso: [16, 14, 0], tp: [0.4, -3.2, 1.8], head: [-2, 0, 10], aR: [38, -16, 34], aRp: [0.6, 0.4, 1.6], aL: aim('armL', [0.2, -0.85, 0.5], 30), aLp: [-0.6, 1.0, 0.6],
    lL: [36, 10, 12], lLp: [-1.2, 2.6, 3.4], lR: [-34, -14, 16], lRp: [1.2, 1.2, -0.6], look: vHead }, 'sineInOut', { look: 'sineInOut' }),
  // ---- 2.06–2.19 load: sink low, lean in, the right arm swept back, the left hand already low and forward ----
  K(2.19, { pos: [0, 0, -0.3], torso: [42, 2, 0], tp: [0, -5.6, 2.2], head: [-28, 0, 0], lookW: 0.3,
    aR: aim('armR', [0.35, -0.6, -1], 0), aRp: [0.6, 1.4, -2.4], aL: aim('armL', [-0.1, -0.55, 1], 30), aLp: [0, 1.0, 1.4],
    lR: [-34, -10, 16], lRp: [1.2, 2.4, -0.8], lL: [30, 6, 12], lLp: [-1.0, 3.4, 3.0], plant: 1 }, 'quadOut'),
  // ---- 2.20–2.35 DASH: low and fast; the back leg drives and trails far back; the left hand shoots for her collar ----
  K(2.235, { pos: [0.03, -0.06, -0.68], plant: 0, torso: [58, 0, 2], tp: [0, -4.6, 4.4], aR: aim('armR', [0.35, -0.85, -0.45], 0), aRp: [0.6, 1.4, -2.4],
    aL: aim('armL', [-0.1, -0.1, 1], 30), aLp: [0, 1.2, 2.2], lR: [-66, -4, 8], lRp: [0.6, -0.6, -1.4], lL: [-30, -2, 8], lLp: [-1.0, 2.4, 5.6] },
    'quadIn', { pos: 'quadIn', plant: 'linear' }),
  K(2.29, { pos: [0.06, -0.14, -1.5], torso: [64, 2, 2], tp: [0, -5.0, 4.8], lR: [-78, -2, 6], lRp: [0.4, -1.8, -1.2], lL: [-46, -2, 8], lLp: [-1.0, 1.8, 6.4],
    aR: aim('armR', [0.3, -0.9, -0.35], 0), aRp: [0.6, 1.0, -2.6], aL: aim('armL', [-0.15, 0.3, 1], 25), aLp: [0.8, 2.4, 3.6] }, 'linear'),
  K(2.315, { pos: [0.08, -0.06, -1.86], torso: [52, 4, 2], tp: [0, -3.8, 4.8], aL: aim('armL', [-0.25, 0.25, 1], 20), aLp: [2.0, 3.6, 5.0],
    lR: [-70, -2, 6], lRp: [0.4, -1.4, -1.6], lL: [-14, -2, 8], lLp: [-1.0, 2.8, 6.2] }, 'linear', { aL: 'sineOut', aLp: 'sineOut' }),
  // ---- 2.35 GRAB (left hand at her collar), legs swing forward to land ----
  K(2.35, { pos: [0.10, 0.08, -2.22], torso: [30, 10, 0], tp: [0, -2.6, 3.4], head: [-14, 0, 0], lookW: 1,
    aR: aim('armR', [0.5, -0.3, -1], 0), aRp: [0.6, 1.6, -1.8], lL: [12, 4, 10], lLp: [-0.8, 3.4, 3.6], lR: [-52, -4, 10], lRp: [0.6, 0.4, -2.0] },
    'sineOut', { pos: 'quadOut' }),
  // ---- 2.40 the left foot lands (front), the right plants: braced, yanking her in (feet stay put from here) ----
  K(2.40, { pos: [0.12, 0, -2.40], plant: 1, torso: [22, 4, 0], tp: [0, -4.4, 2.0], lL: [26, 4, 12], lLp: [-0.8, 2.4, 2.4],
    lR: [-30, -6, 12], lRp: [0.8, 1.6, -1.2] }, 'quadIn', { plant: 'quadIn', pos: 'sineOut' }),
  K(2.43, { torso: [10, -10, 2], tp: [0, -4.0, 0.2], aR: aim('armR', [0.85, -0.3, -0.45], 0), aRp: [0.8, 2.0, -0.8] }, 'quadOut'),
  // ---- 2.47 SHOVE: the left arm drives her away by the collar (release), weight rocks forward onto the left ----
  K(2.49, { aL: aim('armL', [-0.2, 0.2, 1], 20), aLp: [-2.6, 3.0, 5.0], torso: [16, 16, -2], tp: [0, -3.4, 2.0], lR: [-30, -6, 12], lRp: [0.8, 1.6, -1.2] }, 'sineInOut'),
  // ---- 2.48–2.575 chamber: torso tips back over the left foot, the right "knee" rises (whole leg up + forward), arms open ----
  K(2.538, { torso: [-8, 16, -2], tp: [0, -2.0, -1.6], aR: aim('armR', [0.8, 0.1, 0.3], 0), aRp: [0.6, 1.8, 0.4], aL: aim('armL', [0.55, 0.0, 0.85], 0), aLp: [-0.6, 1.8, 1.8],
    lR: [36, -4, 10], lRp: [0.4, 5.8, 3.0], lL: [24, 4, 12], lLp: [-0.8, 2.2, 2.0] }, 'sineInOut'),
  K(2.575, { torso: [-16, 18, -4], tp: [0, -1.4, -2.4], head: [14, 0, 0], aL: aim('armL', [0.85, 0.1, 0.2], 0), aLp: [-0.8, 1.8, 0.2],
    aR: aim('armR', [0.85, 0.2, 0.1], 0), aRp: [0.6, 2.0, 0.6], lR: [58, -4, 8], lRp: [0.2, 6.6, 3.6] }, 'sineOut'),
  // ---- 2.60 HEAVY PUSH KICK: hips surge, torso throws back, arms fling, the sole drives out of the socket into her belly ----
  K(2.60, { pos: [0.12, 0, -2.48], lRp: [0, 2.5, 1.0], torso: [-32, 22, -6], tp: [0, -0.6, -3.4], head: [28, 0, 0], aL: aim('armL', [0.75, 0.35, -0.55], 0), aLp: [-0.8, 1.8, -2.4],
    aR: aim('armR', [0.7, 0.4, -0.6], 0), aRp: [0.8, 1.6, -1.8], lL: [20, 4, 12], lLp: [-0.8, 2.0, 1.6], shake: 0, lookW: 1 },
    'cubicIn'),
  // ---- follow-through: the leg drives on and up, a little hop forward on the support foot ----
  K(2.68, { pos: [0.12, 0.07, -2.46], lL: [-16, 4, 14], lLp: [-0.8, 2.4, -1.0] }, 'sineOut'),
  K(2.72, { pos: [0.12, 0, -2.52], torso: [-46, 30, -10], tp: [0, -1.6, -4.6], head: [34, 0, 4], lR: [114, -2, 6], lRp: [0, 5.0, 6.8],
    aL: aim('armL', [0.8, 0.6, -0.35], 0), aLp: [-1.0, 2.4, -1.6], aR: aim('armR', [0.55, 0.75, -0.45], 0), aRp: [1.0, 2.6, -1.4] }, 'quadOut', { pos: 'sineIn' }),
  // ---- 2.80 STOMP the kick foot down forward (beat) ----
  K(2.73, { lR: [104, -4, 8], lRp: [0.2, 4.4, 6.0], torso: [-34, 24, -6] }, 'sineOut'),
  K(2.80, { torso: [18, 14, -2], tp: [0, -4.6, 1.8], head: [4, 0, 0], look: FACE, lR: [30, -8, 16], lRp: [0.8, 2.6, 3.0],
    aL: aim('armL', [0.8, -0.35, -0.45], 0), aLp: [-1.0, 1.0, -1.2], aR: aim('armR', [0.9, -0.1, 0.1], 0), aRp: [1.0, 1.2, 0.6] },
    'sineIn', { look: 'sineInOut', aL: 'sineInOut', aR: 'sineInOut', aLp: 'sineInOut', aRp: 'sineInOut', torso: 'sineInOut', tp: 'sineInOut' }),
  // ---- 2.80–3.05 rises tall while the cube swallows her: right hand to the back of the neck, head rolls one way then the
  //      other (neck crack), the left arm hangs loose out ----
  K(2.94, { torso: [-8, 18, 6], tp: [0.2, -1.2, 0.0], head: [-8, 0, 20], aL: aim('armL', [0.6, -0.75, 0.15], 0), aLp: [-1.0, 1.0, 0.6],
    aR: aim('armR', [-0.2, 0.85, -0.45], 0), aRp: [-0.6, 2.8, -1.4] }, 'sineInOut'),
  K(3.01, { torso: [-6, 10, -4], head: [-6, 0, -18], tp: [0.0, -1.4, 0.4], aR: aim('armR', [-0.15, 0.8, -0.55], 0), aRp: [-0.6, 2.6, -1.6] }, 'sineInOut'),
  // ---- 3.05–3.25 swaggers two steps toward the cube (planted leg rolls back as the root advances; off the dive line) ----
  K(3.05, { pos: [0.12, 0, -2.52], lR: [30, -8, 16], lRp: [0.8, 2.6, 3.0], lL: [-16, 4, 14], lLp: [-0.8, 2.4, -1.0] }, 'linear'),
  K(3.07, { lLp: [-0.8, 3.4, -0.6] }, 'quadOut'),
  K(3.10, { lL: [6, 4, 10], lLp: [-0.8, 4.6, 0.6], torso: [8, -10, -4], tp: [0.2, -1.6, 1.2], aL: aim('armL', [0.45, -0.8, -0.5], 0), aLp: [-0.8, 0.8, -1.6] }, 'sineOut'),
  K(3.15, { pos: [0.24, 0, -3.0], lR: [0, -8, 14], lRp: [0.8, 2.0, 1.4], lL: [24, 4, 10], lLp: [-0.8, 2.0, 1.6], tp: [0.2, -2.8, 1.4] },
    'linear', { lL: 'sineIn', lLp: 'sineIn', tp: 'sineIn' }),
  K(3.19, { aR: aim('armR', [0.45, -0.7, 0.5], 20), aRp: [0.8, 1.0, 1.8] }, 'sineInOut'),
  K(3.17, { lRp: [0.8, 3.4, 1.4] }, 'quadOut'),
  K(3.20, { lR: [8, -6, 12], lRp: [0.8, 4.4, 1.6], torso: [8, 10, 2], tp: [0.2, -1.6, 1.2], aL: aim('armL', [0.4, -0.75, 0.5], 20), aLp: [-0.8, 1.2, 1.4] }, 'sineOut'),
  K(3.25, { pos: [0.4, 0, -3.46], lL: [-6, 4, 10], lLp: [-0.8, 1.4, 0.4], lR: [22, -6, 12], lRp: [0.8, 2.0, 1.8],
    torso: [30, 4, 0], tp: [0, -4.4, 2.4], aL: aim('armL', [0.6, -0.75, -0.25], 0), aLp: [-0.8, 1.6, -1.2], aR: aim('armR', [0.65, -0.7, -0.25], 0), aRp: [0.8, 1.8, -1.2], plant: 1 },
    'linear', { lR: 'sineIn', lRp: 'sineIn', torso: 'quadIn', tp: 'quadIn', aR: 'sineInOut', aL: 'sineInOut' }),
  // ---- 3.25–3.40 dives at the face, arms forward ----
  K(3.399, { pos: [0.46, 0.62, -4.25], plant: 0, torso: [60, 0, 0], tp: [0, -1.0, 3.0], head: [-30, 0, 0], lookW: 0,
    aL: aim('armL', [0.2, 0.6, 0.8], 0), aLp: [0, 2.6, 2.4], aR: aim('armR', [0.25, 0.55, 0.8], 0), aRp: [0, 2.8, 2.0],
    lR: [-40, -4, 8], lRp: [0.6, 0.2, -1.2], lL: [-58, 4, 10], lLp: [-0.6, -0.6, -2.0] }, 'sineIn', { pos: 'quadIn', plant: 'linear', aL: 'sineInOut', aR: 'sineInOut' }),
  // ---- 3.40 inside: parked floating behind the victim (phase 1; the blink-in comes at 3.55) ----
  K(3.40, { pos: [I[0] - 0.5, I[1] - 0.95, I[2] - 2.0], rot: [6, 168, 0], pivot: 0.9, plant: 0, lookW: 0, life: 1, shake: 0,
    torso: [14, -10, 4], tp: [0, -1, 1], head: [10, 0, 0], aR: [40, 10, 50], aRp: [0.5, 1.5, 1.5], aL: [70, 20, 30], aLp: [-0.5, 1.5, 2.5],
    lR: [-20, -6, 10], lRp: [1, 2, -1.5], lL: [30, 6, 12], lLp: [-1, 3, 2] }, 'step'),
  K(4.00, { torso: [18, -6, 2], aR: [46, 12, 46], aL: [64, 22, 34], lR: [-16, -6, 12], lL: [24, 6, 10] }, 'sineInOut'),
];

export default bake({
  id: 'user', skin: 'wide_steve', slim: false, keys, from: 0, to: 4.0, cuts: [3.4], seed: 0,
  reach: [
    { t: 2.35, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20 },
    { t: 2.40, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20 },
    { t: 2.43, limb: 'armL', bone: 'fistL', target: vCollar, aim: 20 },
    { t: 2.60, limb: 'legR', bone: 'footR', target: vBelly, aim: 0 },
  ],
  log: typeof process !== 'undefined' && process.env && process.env.KITLOG,
});
