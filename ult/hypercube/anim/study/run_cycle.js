// STUDY: our own combat run cycle (R6 style on the Minecraft rig). Not used by the ult.
// "Hunter sprint" v6: a bounding battle sprint. Lean 36–44°, chin down, every step a hop, big counter-swinging
// arms. Cycle 0.56 s (two steps), 8 blocks/s, ground contact 0.13 s + flight 0.15 s per step, a seamless loop.
// v6 (author: "smoother, more HUMAN, INERTIA"): overlapping action precomputed with damped springs (periodicSpring:
// steady state of a spring follower over 8 warm-up cycles, so the loop is seamless and the keys stay static):
// legs/steps drive the torso (twist ±33°, roll ±17°, lean dips on each landing, all late and overshooting a little),
// the torso carries the arms late, the forearms whip on the elbows, the head holds the target but corrects late (it
// floats: ~1/3 of the chest's yaw, a quarter cycle off), a designed weight bob (compression ~2.5 frames after each
// landing, settle, the push lifts into the flight) rides on the exactly planted legs. Left and right are not mirror
// images, and the head and arms wander a little from cycle to cycle (smooth deterministic noise).
// v5 (author: "twitchy"): no pops — the swing foot follows a smooth (C1) path that starts and ends with the planted
// foot's own position and speed, the flight height is C1 with both stances, the arm keys are evenly spaced.
// tools/limbstats.mjs: JERK p95 1.3, max 1.9 px/frame² (v4: 2.1 / 5.1).
// v4 (author: "arms through the head, small range of travel"): long stride (sole −17…+7 px around the torso centre,
// helped by a pelvis swing of ±2 px), sprint arm pump (fist −11…+14 px, below the chin), no self-intersection
// (tools/limbstats.mjs: SELF none).
//
// LEGS (since v2, after "the legs are sticks"): every leg is a virtual thigh + knee + shin, lib/vlimb.js.
// The 12-px block shows the SHIN: its bottom is the sole, it lies along the shin, so its top floats past the virtual
// knee — that floating top IS the knee: in front of the belly on the knee drive, behind and up on the heel kick,
// forward of the hip on the bent stance leg, at the hip socket only when the leg is straight.
//   swing (IK onto a smooth sole path, v5): follow-through back (knee ≥ 22°) → heel kick (knee 104–122°: sole up behind
//     the butt) → tucked pass under the body → the knee drives through (the block top up at the belly) → reach →
//     paws back onto the ground at ground speed.
//   v3 proportions (author: "limbs too far out"): thigh 3.5 px + shin 8.5, upper arm 2.5 + forearm 7.5, so the block
//     top floats ≤ 6 px from the socket (≈ 2·thigh·sin(flex/2)).
//   stance (IK): the sole is pinned (heel, then toe: it rolls, never skates); the knee lands at 14°, absorbs to 58°
//     at mid-stance (the body sinks), extends to 14° for the push. Body height comes out of that.
// Legs are in the ROOT frame (legSpace 'root'); the hip sockets are recomputed from the torso every key.
// Everything is a function of the cycle phase; the keys of 4.2 s of running are generated below (120 keys/s).
import { PX, torsoRot, partM, partAngles, mul, tr, rx, ry, rz, loopCurve, openCurve, hermite, BODY_HIP, legLow, soleEdges, periodicSpring, roundSquare, wobble, worldYRP } from './run_kit.js';
import { vleg, vlegIK, hipSocket, varm } from '../../lib/vlimb.js';

// ---- design ----
const T = 0.56;         // cycle (two steps), s
const V = 8.0;          // run speed, blocks/s
const STANCE = 0.13;    // ground contact of one foot, s  (flight per step = T/2 − STANCE = 0.15 s)
const HOP = 2.6;        // lift in each flight, px
const START = [3, 0, 36]; // root at t = 0 (runs along −Z; Alex stands at (0,0,−4), well ahead)
const END = 4.2;
const S = STANCE / T;   // stance fraction of the cycle

const D = Math.PI / 180;
const wrap = u => u - Math.floor(u);

// ---- v6: secondary motion. Every "driver" below is a target; the body follows it through damped springs
// (periodicSpring: precomputed steady state, loops seamlessly), so each part lags, overshoots and settles on its own.
// Chain: legs/steps → torso (twist, tilt, lean) → arms carried by the torso twist, late → forearms whip on the
// elbow → head stabilised on the target but correcting late (a floating head).
const SPR = (target, f0, zeta) => periodicSpring(target, { f0, zeta, T });
// torso drivers, phase phi (right foot lands at 0, left at 0.5). Rounded square waves: the push of each leg flips
// the shoulders; the springs turn that into a lagging swing with a little overshoot.
const TW = { amp: 21, at: 0.774, skew: 2.0 };       // shoulder twist: turned right (−) around phi = TW.at
const TL = { amp: 3, at: 0.95 };                   // tilt over the stance side
const twistDrive = phi => -TW.amp * roundSquare(phi - TW.at, 1.6) + TW.skew;        // + skew: a slight left bias
const tiltDrive = phi => TL.amp * roundSquare(phi - TL.at, 1.4) + 0.8;
// lean: each landing throws the chest forward (the dip), the push lifts it; per step, right and left a bit different
const leanDrive = phi => {
  const st = wrap(phi * 2), right = phi < 0.5;
  const dip = Math.exp(-(((st - 0.07) / 0.07) ** 2)) * (right ? 9 : 7.5), lift = Math.exp(-(((st - 0.42) / 0.1) ** 2)) * 3;
  return 37.5 + dip - lift;
};
const TWIST = SPR(twistDrive, 4.2, 0.42), TILT = SPR(tiltDrive, 3.6, 0.5), LEAN = SPR(leanDrive, 4.6, 0.32);
// the hips lag on the ground and surge in the air (px, along the run); a little side sway over the stance foot
const surgeStep = loopCurve([[0, 2.0], [0.2, 0.4], [0.4, -1.2], [0.7, 0.4]]);
const SWAY = SPR(phi => 0.8 * roundSquare(phi - 0.12, 1.2), 3.5, 0.6);
const torsoAt = phi => {
  const lean = LEAN(phi), twist = TWIST(phi), tilt = TILT(phi);
  const tp = [SWAY(phi), 0, surgeStep(wrap(phi * 2))];
  const r = torsoRot(lean, twist, tilt);
  return { lean, twist, tilt, tp, ...r, world: worldYRP(r.m) };
};

// head: eyes on the target. It cancels the chest's yaw and roll and part of its lean, but the correction is a
// spring a couple of frames late, so the head floats: it swings ~1/3 as far as the chest, a quarter cycle off.
const CHEST = phi => torsoAt(phi).world;            // [yaw, roll, pitch] of the chest in the world
const HEADFIX = SPR(CHEST, 7.5, 0.55);              // the late correction
const HEADNOD = SPR(phi => torsoAt(phi).lean, 2.6, 0.45);   // the head's pitch follows the lean slowly
const headAt = (phi, torso, t) => {
  const c = torso.world, fix = HEADFIX(phi);
  const yaw = c[0] - fix[0] + 2.0 * wobble(t, 1), roll = 0.8 * (c[1] - fix[1]) + 1.5 * wobble(t, 2);
  const nod = HEADNOD(phi) - 14 + 1.5 * wobble(t, 3);
  const world = mul(ry(yaw * D), mul(rz(roll * D), rx(-nod * D)));
  return partAngles('head', mul(tr(torso.m), world));
};

// arms: sprint pump with a virtual upper arm (2.5 px) + elbow + forearm (7.5 px), lib/vlimb.js varm (the block
// shows the FOREARM, fist end at the fist). Keys = the INTENT: [upper-arm pitch, yaw, roll] in the heading frame,
// elbow flexion, shoulder offset [x, y, z] px (torso frame). Phase 0 = the same-side foot lands: flung back, nearly
// straight, flared; pumps forward folding; punches out in front of the chest (fist below the chin); rips back.
// What is rendered: the arm is carried by the chest's twist and roll (late, a spring), the upper arm follows its
// keys through a spring (rounded extremes, a little overshoot) and the forearm through a softer one, so it whips:
// it keeps going when the upper arm stops at each end (elbow folds at the front, opens at the back).
const ARM_KEYS = {
  armR: [
    [0.00, [-92, -4, 30, 40, 1.1, -1.3, -1.6]],     // back: flung behind, flared
    [0.13, [-74, -3, 30, 60, 0.9, -1.0, -1.1]],
    [0.27, [-20, 3, 18, 78, 0.4, -0.2, 0.2]],       // through the bottom, folded
    [0.40, [24, 8, 12, 76, 0, 0.1, 1.4]],
    [0.52, [38, 10, 13, 68, 0, 0.2, 1.8]],          // front: fist out before the chest
    [0.65, [16, 5, 18, 78, 0.1, 0.1, 0.9]],
    [0.78, [-38, -2, 27, 68, 0.6, -0.5, -0.7]],
    [0.90, [-78, -4, 31, 46, 1.0, -1.1, -1.4]],
  ],
};
// the left arm: the same pump half a cycle later, a little wider and lower (people are not symmetric)
ARM_KEYS.armL = ARM_KEYS.armR.map(([u, v]) => [u, [v[0] - 3, v[1], v[2] + 4, v[3] + 4, v[4], v[5] - 0.2, v[6]]]);
const ARM_SHIFT = -0.15;                              // the arms swing a little ahead of the legs' timing
const ARM = Object.fromEntries(Object.entries(ARM_KEYS).map(([arm, keys]) => {
  const intent = loopCurve(keys), o = (arm === 'armR' ? 0 : 0.5) + ARM_SHIFT;
  const at = phi => intent(wrap(phi - o));
  const upper = SPR(phi => at(phi).slice(0, 3), 4.8, 0.6);                         // [pitch, yaw, roll]
  const fore = SPR(phi => at(phi)[0] + at(phi)[3], 3.7, 0.5);                       // forearm pitch in the swing
  const shoulder = SPR(phi => at(phi).slice(4, 7), 4.5, 0.6);
  return [arm, phi => { const u = upper(phi); return { upper: u, elbow: fore(phi) - u[0], shoulder: shoulder(phi) }; }];
}));
const CARRY = SPR(phi => { const w = torsoAt(phi).world; return [w[0], w[1]]; }, 4.0, 0.5);   // the shoulders carry the arms, late
const softClamp = (x, lo, hi, k = 6) => { return lo + (hi - lo) * (Math.log1p(Math.exp((x - lo) / k)) - Math.log1p(Math.exp((x - hi) / k))) * k / (hi - lo); };

// legs, leg phase psi: 0 = touchdown, S = toe-off. Swing keys: virtual thigh pitch (root frame) and knee flexion.
const SIDE = { legR: 'R', legL: 'L' };
// Minecraft proportions for the virtual limbs (px): short thigh / upper arm, so the block top floats only 2–5 px
const LEG_T = 3.5, ARM_U = 2.5, LEG_S = 12 - LEG_T;
const hipToSole = knee => Math.sqrt(LEG_T * LEG_T + LEG_S * LEG_S + 2 * LEG_T * LEG_S * Math.cos(knee * Math.PI / 180));
const LEGS = { legR: 0, legL: 0.5 };
const TD_THIGH = 30, TD_KNEE = 14;                       // the touchdown pose (shin 12° forward: the heel lands first)
// stance knee over the stance 0..1: land, absorb, push (the left leg sinks a little deeper)
const STANCE_KNEE = {
  legR: openCurve([[0, TD_KNEE], [0.45, 57], [1, 14]], 160, -60),
  legL: openCurve([[0, TD_KNEE], [0.46, 61], [1, 15]], 160, -60),
};
// swing (v5): the SOLE travels a smooth path around the hip; the leg is solved onto it (IK, knee bending the natural
// way), so position AND speed run on from the planted foot into the swing and back into the next landing — no pops.
// Keys: [psi, [outward px, hip→sole chord pitch (deg, + = forward), knee flexion]] — the knee sets how far the sole
// is from the hip, so the leg never goes straight (≥ 26°) and never folds past 122° (block top ≤ 6 px out).
const SOLE_KEYS = [
  [0.30, [0.4, -52, 22]],        // toe-off follow-through: still going back, lifting
  [0.36, [0.8, -69, 29]],        // furthest back, the heel starts up
  [0.42, [1.0, -86, 68]],
  [0.475, [1.0, -103, 104]],     // heel kick: sole up behind the butt
  [0.53, [1.0, -104, 118]],      // top of the kick, knee folded
  [0.59, [1.0, -84, 122]],       // tucked pass under the body
  [0.66, [1.0, -40, 112]],
  [0.725, [0.8, 6, 96]],         // the knee drives through
  [0.785, [0.6, 32, 74]],        // high knee, shin swinging out
  [0.85, [0.4, 55, 46]],         // reach
  [0.915, [0.3, 53, 28]],        // ...and paw back onto the ground
];
const solePath = (keys) => keys.map(([u, [o, ch, k]]) => {
  const d = Math.sqrt(LEG_T * LEG_T + LEG_S * LEG_S + 2 * LEG_T * LEG_S * Math.cos(k * Math.PI / 180)), c = ch * Math.PI / 180;
  return [u, [o, -d * Math.cos(c), d * Math.sin(c)]];
});
// the left leg: kicks a little lower and reaches a little shorter (not a mirror image)
const SOLE_PATH = {
  legR: solePath(SOLE_KEYS),
  legL: solePath(SOLE_KEYS.map(([u, [o, ch, k]]) => [u, [o, ch < -75 ? ch + 3 : ch > 30 ? ch - 1 : ch, k > 100 ? k - 3 : k]])),
};
const KNEE_DIR = [0, 0, 1];                              // knees point straight ahead


const posToSocket = (leg, pos) => [BODY_HIP[leg][0] + pos[0], BODY_HIP[leg][1] + pos[1], -pos[2]];   // track → three-axes px
const lowOf = (leg, res) => legLow(leg, posToSocket(leg, res.pos), res.ang);
const edgesOf = (leg, res) => soleEdges(leg, posToSocket(leg, res.pos), res.ang);   // three axes (z back), px
// pelvis swing (px along the run): the hip of the reaching leg comes forward, the pushing one goes back — the stride
// gets longer without the leg block drifting from its socket
const PELVIS = loopCurve([[0, 1.4], [0.12, 0.4], [0.23, -1.6], [0.36, -3.0], [0.48, -1.8], [0.64, 0], [0.8, 1.2], [0.9, 1.6]]);
const hipAt = (leg, phi) => {
  const tor = torsoAt(phi), h = hipSocket(SIDE[leg], tor.angles, tor.tp);
  return [h[0], h[1], h[2] + PELVIS(wrap(phi - LEGS[leg]))];
};   // root frame, z fwd
const thighOf = res => { const h = res.hipV || res.hip, k = res.knee; return Math.atan2(k[2] - h[2], -(k[1] - h[1])) * 180 / Math.PI; };
// leg IK with a soft reach limit: past DS the knee does not lock straight — the block slides out of its socket toward
// the foot instead (the R6 "extension"), smoothly, never more than DMAX − DS
const kneeOf = rel => {                          // knee flexion for a hip→sole distance
  const L = Math.hypot(...rel), c = (L * L - LEG_T * LEG_T - LEG_S * LEG_S) / (2 * LEG_T * LEG_S);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
};
const DS = hipToSole(24), DMAX = hipToSole(4);
function legIK(leg, H, foot, knee) {
  const d = foot.map((v, j) => v - H[j]), L = Math.hypot(...d);
  let Hv = H;
  if (L > DS) { const Lv = DS + (DMAX - DS) * (1 - Math.exp(-(L - DS) / (DMAX - DS))); Hv = H.map((v, j) => v + d[j] / L * (L - Lv)); }
  return { ...vlegIK(SIDE[leg], Hv, foot, { knee, thighLen: LEG_T }), hip: H, hipV: Hv };
}

// ---- stance solve: the sole is pinned (heel, then toe: it rolls), the knee follows its curve, the root height
// comes out of the leg geometry (a short R6 leg on a long contact vaults: highest mid-stance)
function stanceTable(leg) {
  const side = SIDE[leg], N = 96, rows = [];
  const h0 = hipAt(leg, LEGS[leg]);
  const td = vleg(side, h0, [TD_THIGH, 0, 0], TD_KNEE, { thighLen: LEG_T });
  const y0 = -lowOf(leg, td).y;                          // px: lift the body so the heel touches the ground
  let e = edgesOf(leg, td);
  let mode = 'heel', pin = [e.heel[0], e.heel[1] + y0, e.heel[2]];
  let res = { ...td, hip: h0, hipV: h0 }, Y = y0;
  for (let i = 0; i <= N; i++) {
    const u = i / N, psi = S * u, phi = wrap(psi + LEGS[leg]), dz = V * psi * T / PX;   // the root has run dz px on
    const H = hipAt(leg, phi), d = hipToSole(STANCE_KNEE[leg](u));
    if (i > 0) for (let it = 0; it < 4; it++) {
      e = edgesOf(leg, res);
      const ex = mode === 'heel' ? e.heel : e.toe, cx = [(e.heel[0] + e.toe[0]) / 2, (e.heel[1] + e.toe[1]) / 2, (e.heel[2] + e.toe[2]) / 2];
      const off = [cx[0] - ex[0], cx[1] - ex[1], cx[2] - ex[2]];                 // pinned edge → sole centre
      const C = [pin[0] + off[0], 0, pin[2] + dz + off[2]], Hc = [H[0], 0, -H[2]];
      const vert = Math.sqrt(Math.max(0.25, d * d - (C[0] - Hc[0]) ** 2 - (C[2] - Hc[2]) ** 2));
      Y = off[1] + vert - H[1];                                                    // root height (px) that makes it so
      res = legIK(leg, H, [C[0], off[1] - Y, -C[2]], KNEE_DIR);
    }
    e = edgesOf(leg, res);
    if (i > 0 && mode === 'heel' && e.toe[1] < e.heel[1]) { mode = 'toe'; pin = [e.toe[0], 0, e.toe[2] - dz]; }
    rows.push({ psi, Y: Y * PX, ang: res.ang, pos: res.pos, thigh: thighOf(res), knee: STANCE_KNEE[leg](u), rel: (res.foot || td.foot).map((v, j) => v - H[j]) });
  }
  return rows;
}
const TABLE = { legR: stanceTable('legR'), legL: stanceTable('legL') };
const fromTable = (rows, psi, key) => {
  const x = psi / S * (rows.length - 1), i = Math.min(rows.length - 2, Math.floor(x)), s = x - i;
  const a = rows[i][key], b = rows[i + 1][key];
  return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * s) : a + (b - a) * s;
};
const slope = (rows, key, end) => {
  const n = rows.length, h = S / (n - 1);
  if (key === 'relV') {                         // vector slope of the hip-relative sole, over the last/first 4 rows
    const k = 4, a = end ? rows[n - 1 - k].rel : rows[0].rel, b = end ? rows[n - 1].rel : rows[k].rel;
    return a.map((v, j) => (b[j] - v) / (k * h));
  }
  return end ? (rows[n - 1][key] - rows[n - 2][key]) / h : (rows[1][key] - rows[0][key]) / h;
};
// swing per leg: Hermite spline of the hip-relative sole, C1 with the planted foot at toe-off and at touchdown
function hermiteSpline(keys, m0, m1) {         // keys [[u, [x,y,z]]...], end tangents m0/m1 (per unit u)
  const n = keys.length;
  const tan = i => i === 0 ? m0 : i === n - 1 ? m1 : keys[i + 1][1].map((v, j) => (v - keys[i - 1][1][j]) / (keys[i + 1][0] - keys[i - 1][0]));
  return u => {
    let i = 0; while (i < n - 2 && keys[i + 1][0] < u) i++;
    const [u0, a] = keys[i], [u1, b] = keys[i + 1], d = u1 - u0, s = Math.max(0, Math.min(1, (u - u0) / d));
    const ta = tan(i), tb = tan(i + 1);
    return a.map((v, j) => hermite(v, b[j], ta[j] * d, tb[j] * d, s));
  };
}
const SWING = Object.fromEntries(Object.keys(LEGS).map(leg => {
  const R = TABLE[leg], sd = leg === 'legR' ? 1 : -1;
  const keys = [[S, R.at(-1).rel], ...SOLE_PATH[leg].map(([u, p]) => [u, [sd * p[0], p[1], p[2]]]), [1, R[0].rel]];
  return [leg, hermiteSpline(keys, slope(R, 'relV', true), slope(R, 'relV', false))];
}));
const KNEE_OUT = loopCurve([[0.2, 0.05], [0.42, 0.3], [0.58, 0.45], [0.72, 0.3], [0.9, 0.05]]);
function swingPose(leg, psi, phi) {
  const H = hipAt(leg, phi), rel = SWING[leg](psi);
  const fwd = rel[2], up = rel[1], ph = Math.atan2(fwd, -up);                 // chord pitch
  const sd = leg === 'legR' ? 1 : -1, out = KNEE_OUT(psi);                   // the knee also points a little outward
  const res = legIK(leg, H, rel.map((v, j) => v + H[j]), [sd * out, Math.sin(ph), Math.cos(ph)]);
  return { ...res, rel };
}
function legPose(leg, psi, phi) {
  if (psi < S) return { ang: fromTable(TABLE[leg], psi, 'ang'), pos: fromTable(TABLE[leg], psi, 'pos') };
  return swingPose(leg, psi, phi);
}

// root height: from the planted leg; in the flight a hop from the push to the next landing (C1 with both stances)
function rootY(phi) {
  for (const [leg, o] of Object.entries(LEGS)) { const psi = wrap(phi - o); if (psi < S) return fromTable(TABLE[leg], psi, 'Y'); }
  const from = phi < 0.5 ? 'legR' : 'legL', to = from === 'legR' ? 'legL' : 'legR';
  const A = TABLE[from], B = TABLE[to], f0 = from === 'legR' ? S : 0.5 + S, len = 0.5 - S;
  const s = wrap(phi - f0) / len;
  return hermite(A.at(-1).Y, B[0].Y, slope(A, 'Y', true) * len, slope(B, 'Y', false) * len, s) + HOP * PX * 16 * s * s * (1 - s) * (1 - s);
}
// WEIGHT: the visible body height is designed — one bob per step: it falls into the landing, compresses ~2.5 frames
// after touchdown, rebounds a little and settles, and the push lifts it into the flight. The legs stay solved on the
// geometric root above (feet exactly planted); the torso rides on them with torso.pos y = WEIGHT, so on the
// compression the legs sink into the hips (the R6 "knee bend") and on the push they slide out.
const BODY = loopCurve([
  [0.000, -2.0], [0.07, -3.0], [0.115, -2.75], [0.16, -2.85], [0.232, -2.1], [0.37, -0.1],
  [0.500, -2.1], [0.572, -3.25], [0.617, -2.95], [0.662, -3.05], [0.732, -2.2], [0.87, -0.15],
]);
const WEIGHT = phi => softClamp(BODY(phi) - rootY(phi) / PX, -2.8, 1.2, 0.4);
const WLAG = SPR(WEIGHT, 3.2, 0.42);              // what the head and arms do with the bob, late

// ---- generate the tracks ----
const tracks = { plant: [[0, 0]], 'root.rot': [[0, [0, 0, 0]]] };
// Euler continuity: of the two equivalent 'ZYX' triples (and ±360°), keep the one closest to the previous key, so
// interpolating between keys never spins a limb
const SIGNS = { torso: [-1, 1, 1], head: [-1, 1, 1], armR: [1, 1, 1], legR: [1, 1, 1], armL: [1, -1, -1], legL: [1, -1, -1] };
const near = (v, ref) => v + 360 * Math.round((ref - v) / 360);
function continuous(name, a, prev) {
  const sg = SIGNS[name]; if (!sg || !prev) return a;
  const e = a.map((v, i) => v * sg[i]), alt = [e[0] + 180, 180 - e[1], e[2] + 180].map((v, i) => v * sg[i]);
  const fit = c => c.map((v, i) => near(v, prev[i]));
  const A = fit(a), B = fit(alt), dist = c => c.reduce((s, v, i) => s + Math.abs(v - prev[i]), 0);
  return dist(B) < dist(A) ? B : A;
}
const put = (name, t, v) => {
  const k = (tracks[name] ||= []);
  if (Array.isArray(v)) v = continuous(name, v, k.length ? k[k.length - 1][1] : null);
  k.push([+t.toFixed(4), Array.isArray(v) ? v.map(x => +x.toFixed(3)) : +v.toFixed(4), 'linear']);
};
const FPS = 120;
for (let i = 0; i <= END * FPS; i++) {
  const t = i / FPS, phi = wrap(t / T);
  const torso = torsoAt(phi);
  put('root.pos', t, [START[0], rootY(phi), START[2] - V * t]);
  put('torso', t, torso.angles);
  const w = WEIGHT(phi), wl = WLAG(phi) - w;
  put('torso.pos', t, [torso.tp[0], torso.tp[1] + w, torso.tp[2]]);
  put('head', t, headAt(phi, torso, t));
  put('head.pos', t, [0, 0.3 + 0.45 * wl, 0]);
  const carry = CARRY(phi);
  for (const arm of ['armR', 'armL']) {
    const a = ARM[arm](phi), sd = arm === 'armR' ? 1 : -1, n = wobble(t, sd > 0 ? 5 : 7);
    const keyed = [a.upper[0] + 2 * n, a.upper[1], a.upper[2] + 3 * n];
    const world = mul(ry(0.75 * carry[0] * D), mul(rz(0.4 * carry[1] * D), partM(arm, keyed)));
    const upper = partAngles(arm, mul(tr(torso.m), world));
    const elbow = softClamp(a.elbow + 3 * wobble(t, sd > 0 ? 6 : 8), 16, 124), sh = a.shoulder;
    const r = varm(arm === 'armR' ? 'R' : 'L', upper, elbow, { shoulder: [sd * (5 + sh[0]), 4 + sh[1] + 0.7 * wl, sh[2]], upperLen: ARM_U });
    put(arm, t, r.ang);
    put(arm + '.pos', t, r.pos);
  }
  for (const [leg, o] of Object.entries(LEGS)) {
    const r = legPose(leg, wrap(phi - o), phi);
    put(leg, t, r.ang);
    put(leg + '.pos', t, r.pos);
  }
}

export const CYCLE = T, SPEED = V;
export default { id: 'user', skin: 'wide_steve', slim: false, legSpace: 'root', tracks };
/** analysis helper: virtual thigh pitch and knee flexion of both legs at time t */
export function legState(t) {
  const phi = wrap(t / T), out = {};
  for (const [leg, o] of Object.entries(LEGS)) {
    const psi = wrap(phi - o);
    if (psi < S) out[leg] = { stance: true, thigh: fromTable(TABLE[leg], psi, 'thigh'), knee: fromTable(TABLE[leg], psi, 'knee') };
    else { const r = swingPose(leg, psi, phi); out[leg] = { stance: false, thigh: thighOf(r), knee: kneeOf(r.foot.map((v, j) => v - r.hipV[j])) }; }
  }
  return out;
}
/** analysis helper: hip-relative sole at toe-off / touchdown and its speed (px per unit phase) */
export const _debug = () => Object.fromEntries(Object.keys(LEGS).map(leg => {
  const R = TABLE[leg], c = r => [Math.atan2(r[2], -r[1]) * 180 / Math.PI, Math.hypot(...r)];
  return [leg, { S, toeOff: R.at(-1).rel, toeOffChordDist: c(R.at(-1).rel), vOff: slope(R, 'relV', true), td: R[0].rel, tdChordDist: c(R[0].rel), vTd: slope(R, 'relV', false) }];
}));
export const _stance = leg => TABLE[leg].map(r => [r.psi.toFixed(3), r.knee.toFixed(0), r.thigh.toFixed(0), r.rel.map(v => v.toFixed(1)).join(',')].join(' '));
