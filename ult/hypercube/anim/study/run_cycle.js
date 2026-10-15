// STUDY: our own combat run cycle (R6 style on the Minecraft rig). Not used by the ult.
// "Hunter sprint" v5: a bounding battle sprint. Lean 36–44°, chin down, every step a hop, big counter-swinging
// arms. Cycle 0.52 s (two steps), 8 blocks/s, ground contact 0.13 s + flight 0.13 s per step, a seamless loop.
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
import { PX, torsoRot, partM, partAngles, mul, tr, rx, ry, rz, loopCurve, openCurve, hermite, BODY_HIP, legLow, soleEdges } from './run_kit.js';
import { vleg, vlegIK, hipSocket, varm } from '../../lib/vlimb.js';

// ---- design ----
const T = 0.52;         // cycle (two steps), s
const V = 8.0;          // run speed, blocks/s
const STANCE = 0.13;    // ground contact of one foot, s  (flight per step = T/2 − STANCE = 0.13 s)
const HOP = 2.6;        // lift in each flight, px
const START = [3, 0, 36]; // root at t = 0 (runs along −Z; Alex stands at (0,0,−4), well ahead)
const END = 4.2;
const S = STANCE / T;   // stance fraction of the cycle

const D = Math.PI / 180;
const wrap = u => u - Math.floor(u);

// torso: lean (dips into each landing, rises in the flight), twist about the spine (left shoulder drives forward
// with the right foot), tilt over the stance foot, a little sway of the hips over the stance foot
const leanStep = loopCurve([[0, 39], [0.2, 44], [0.42, 38], [0.7, 36]]);   // per STEP (period T/2)
// the hips lag on the ground and surge in the air (px, along the run): the planted leg does not have to cover the whole step
const surgeStep = loopCurve([[0, 2.0], [0.2, 0.4], [0.4, -1.2], [0.7, 0.4]]);
const torsoAt = phi => {
  const lean = leanStep(wrap(phi * 2));
  const twist = -24 * Math.cos(2 * Math.PI * (phi - 0.05));
  const tilt = -7 * Math.cos(2 * Math.PI * (phi - 0.1));
  const tp = [0.6 * Math.cos(2 * Math.PI * (phi - 0.1)), 0, surgeStep(wrap(phi * 2))];
  return { lean, twist, tilt, tp, ...torsoRot(lean, twist, tilt) };
};

// head: steady, chin down, eyes on the target — counters the twist and tilt, but only part of the lean (head tilted
// back too far sinks its back edge into the shoulders)
const headAt = (phi, torso) => {
  const tw = -24 * Math.cos(2 * Math.PI * (phi - 0.11)), tl = -7 * Math.cos(2 * Math.PI * (phi - 0.16));
  const world = mul(ry(0.22 * tw * D), mul(rz(0.25 * tl * D), rx(-(torso.lean - 18 + 3 * Math.cos(4 * Math.PI * (phi - 0.3))) * D)));
  return partAngles('head', mul(tr(torso.m), world));
};

// arms (v4): sprint pump. Virtual upper arm (2.5 px) + elbow + forearm (7.5 px), lib/vlimb.js varm: the block shows
// the FOREARM, fist end at the fist. Keys: [upper-arm pitch, yaw, roll] in the WORLD frame, elbow flexion, shoulder
// offset [x, y, z] px (torso frame). Phase 0 = the same-side foot lands: the arm is flung back behind the body, nearly
// straight and flared; it pumps forward folding (elbow ~90° through the bottom, fist by the hip) and punches out in
// front of the chest (fist below the chin, ≥ 12 px ahead of the torso), then rips back. On the back swing the shoulder
// drops and widens a little so the arm never sinks into the head.
const ARM = loopCurve([
  [0.00, [-100, -4, 30, 24, 1.1, -1.2, -1.2]],  // back extreme: flung out behind, nearly straight, flared
  [0.10, [-88, -4, 38, 40, 1.1, -1.2, -1.0]],
  [0.20, [-50, 0, 26, 70, 0.5, -0.3, -0.4]],    // pumping forward, the elbow folds
  [0.30, [-6, 4, 12, 90, 0, 0.2, 0.2]],         // through the bottom: fist by the hip, tight
  [0.40, [26, 8, 10, 78, 0, 0.2, 0.8]],
  [0.50, [38, 10, 12, 58, 0, 0.2, 1.2]],        // forward extreme: fist punched out in front of the chest
  [0.58, [34, 8, 14, 66, 0, 0.2, 1.0]],
  [0.68, [4, 2, 18, 86, 0, 0.1, 0.2]],          // ripped back, folding
  [0.80, [-50, -2, 30, 62, 0.6, -0.5, -0.6]],
  [0.91, [-90, -4, 34, 34, 1.0, -1.1, -1.0]],
]);

// legs, leg phase psi: 0 = touchdown, S = toe-off. Swing keys: virtual thigh pitch (root frame) and knee flexion.
const SIDE = { legR: 'R', legL: 'L' };
// Minecraft proportions for the virtual limbs (px): short thigh / upper arm, so the block top floats only 2–5 px
const LEG_T = 3.5, ARM_U = 2.5, LEG_S = 12 - LEG_T;
const hipToSole = knee => Math.sqrt(LEG_T * LEG_T + LEG_S * LEG_S + 2 * LEG_T * LEG_S * Math.cos(knee * Math.PI / 180));
const LEGS = { legR: 0, legL: 0.5 };
const TD_THIGH = 30, TD_KNEE = 14;                       // the touchdown pose (shin 12° forward: the heel lands first)
const STANCE_KNEE = openCurve([[0, TD_KNEE], [0.45, 58], [1, 14]], 160, -60);   // over the stance 0..1: land, absorb, push
// swing (v5): the SOLE travels a smooth path around the hip; the leg is solved onto it (IK, knee bending the natural
// way), so position AND speed run on from the planted foot into the swing and back into the next landing — no pops.
// Keys: [psi, [outward px, hip→sole chord pitch (deg, + = forward), knee flexion]] — the knee sets how far the sole
// is from the hip, so the leg never goes straight (≥ 26°) and never folds past 122° (block top ≤ 6 px out).
const SOLE_KEYS = [
  [0.30, [0.4, -49, 22]],        // toe-off follow-through: still going back, lifting
  [0.36, [0.8, -65, 27]],        // furthest back, the heel starts up
  [0.42, [1.0, -86, 68]],
  [0.475, [1.0, -103, 104]],     // heel kick: sole up behind the butt
  [0.53, [1.0, -104, 118]],      // top of the kick, knee folded
  [0.59, [1.0, -84, 122]],       // tucked pass under the body
  [0.66, [1.0, -40, 112]],
  [0.725, [0.8, 6, 96]],         // the knee drives through
  [0.785, [0.6, 32, 74]],        // high knee, shin swinging out
  [0.85, [0.4, 52, 46]],         // reach
  [0.90, [0.3, 54, 34]],
  [0.95, [0.2, 38, 24]],         // paw back onto the ground
];
const SOLE_PATH = SOLE_KEYS.map(([u, [o, ch, k]]) => {
  const d = Math.sqrt(LEG_T * LEG_T + LEG_S * LEG_S + 2 * LEG_T * LEG_S * Math.cos(k * Math.PI / 180)), c = ch * Math.PI / 180;
  return [u, [o, -d * Math.cos(c), d * Math.sin(c)]];
});
const KNEE_DIR = [0, 0, 1];                              // knees point straight ahead
const kneeStance = u => STANCE_KNEE(u);

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
const thighOf = res => { const h = res.hip, k = res.knee; return Math.atan2(k[2] - h[2], -(k[1] - h[1])) * 180 / Math.PI; };

// ---- stance solve: the sole is pinned (heel, then toe), the knee follows its curve, the body height comes out ----
function stanceTable(leg) {
  const side = SIDE[leg], N = 96, rows = [];
  // touchdown pose (FK) with the root at height 0 → the lowest corner gives the body height
  const h0 = hipAt(leg, LEGS[leg]);
  const td = vleg(side, h0, [TD_THIGH, 0, 0], TD_KNEE, { thighLen: LEG_T });
  const y0 = -lowOf(leg, td).y;                          // px: lift the body so the heel touches the ground
  let e = edgesOf(leg, td);
  let mode = 'heel', pin = [e.heel[0], e.heel[1] + y0, e.heel[2]];   // world-ish: root x/z at touchdown, y on the ground (0)
  let res = { ...td, hip: h0 }, Y = y0;
  for (let i = 0; i <= N; i++) {
    const u = i / N, psi = S * u, phi = wrap(psi + LEGS[leg]), dz = V * psi * T / PX;   // root has moved dz px forward
    const H = hipAt(leg, phi), d = hipToSole(kneeStance(u));
    if (i === 0) res.foot = td.foot;
    if (i > 0) for (let it = 0; it < 4; it++) {
      // sole centre from the pinned edge, using the current shin orientation
      e = edgesOf(leg, res);
      const ex = mode === 'heel' ? e.heel : e.toe, cx = [(e.heel[0] + e.toe[0]) / 2, (e.heel[1] + e.toe[1]) / 2, (e.heel[2] + e.toe[2]) / 2];
      const off = [cx[0] - ex[0], cx[1] - ex[1], cx[2] - ex[2]];                 // edge → centre (three axes)
      // centre relative to the root now (three axes: z back); pin is relative to the root at touchdown
      const C = [pin[0] + off[0], 0, pin[2] + dz + off[2]];
      const Hc = [H[0], 0, -H[2]];                                              // hip, three axes
      const hor2 = (C[0] - Hc[0]) ** 2 + (C[2] - Hc[2]) ** 2;
      const vert = Math.sqrt(Math.max(0.25, d * d - hor2));                       // hip above the sole centre
      Y = off[1] + vert - H[1];                                                    // root height (px) that makes it so
      const foot = [C[0], off[1] - Y, -C[2]];                                      // sole centre, root frame z fwd
      res = { ...vlegIK(side, H, foot, { knee: KNEE_DIR, thighLen: LEG_T }), hip: H };
    }
    e = edgesOf(leg, res);
    if (i > 0 && mode === 'heel' && e.toe[1] < e.heel[1]) { mode = 'toe'; pin = [e.toe[0], 0, e.toe[2] - dz]; }
    rows.push({ psi, Y: Y * PX, ang: res.ang, pos: res.pos, thigh: thighOf(res), knee: kneeStance(u), rel: res.foot.map((v, j) => v - H[j]) });
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
  const keys = [[S, R.at(-1).rel], ...SOLE_PATH.map(([u, p]) => [u, [sd * p[0], p[1], p[2]]]), [1, R[0].rel]];
  return [leg, hermiteSpline(keys, slope(R, 'relV', true), slope(R, 'relV', false))];
}));
const KNEE_OUT = loopCurve([[0.2, 0.05], [0.42, 0.3], [0.58, 0.45], [0.72, 0.3], [0.9, 0.05]]);
const kneeOf = rel => {                          // knee flexion for a hip→sole distance (analysis)
  const L = Math.hypot(...rel), c = (L * L - LEG_T * LEG_T - LEG_S * LEG_S) / (2 * LEG_T * LEG_S);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
};
function swingPose(leg, psi, phi) {
  const H = hipAt(leg, phi), rel = SWING[leg](psi);
  const fwd = rel[2], up = rel[1], ph = Math.atan2(fwd, -up);                 // chord pitch
  const sd = leg === 'legR' ? 1 : -1, out = KNEE_OUT(psi);                   // the knee also points a little outward
  const res = vlegIK(SIDE[leg], H, rel.map((v, j) => v + H[j]), { knee: [sd * out, Math.sin(ph), Math.cos(ph)], thighLen: LEG_T });
  return { ...res, hip: H, rel };
}
function legPose(leg, psi, phi) {
  if (psi < S) return { ang: fromTable(TABLE[leg], psi, 'ang'), pos: fromTable(TABLE[leg], psi, 'pos') };
  return swingPose(leg, psi, phi);
}

// body height: from the planted leg; in the flight a hop from the push to the next landing
function rootY(phi) {
  for (const [leg, o] of Object.entries(LEGS)) { const psi = wrap(phi - o); if (psi < S) return fromTable(TABLE[leg], psi, 'Y'); }
  const from = phi < 0.5 ? 'legR' : 'legL', to = from === 'legR' ? 'legL' : 'legR';
  const A = TABLE[from], B = TABLE[to], f0 = from === 'legR' ? S : 0.5 + S, len = 0.5 - S;
  const s = wrap(phi - f0) / len;
  // C1 with both stances (their vertical speeds), plus a hop bump with zero slope at both ends
  return hermite(A.at(-1).Y, B[0].Y, slope(A, 'Y', true) * len, slope(B, 'Y', false) * len, s) + HOP * PX * 16 * s * s * (1 - s) * (1 - s);
}

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
  put('torso.pos', t, torso.tp);
  put('head', t, headAt(phi, torso));
  for (const [arm, o] of [['armR', 0], ['armL', 0.5]]) {
    const a = ARM(wrap(phi - o)), sd = arm === 'armR' ? 1 : -1;
    const upper = partAngles(arm, mul(tr(torso.m), partM(arm, a.slice(0, 3))));
    const r = varm(arm === 'armR' ? 'R' : 'L', upper, a[3], { shoulder: [sd * (5 + a[4]), 4 + a[5], a[6]], upperLen: ARM_U });
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
    else { const r = swingPose(leg, psi, phi); out[leg] = { stance: false, thigh: thighOf(r), knee: kneeOf(r.rel) }; }
  }
  return out;
}
/** analysis helper: hip-relative sole at toe-off / touchdown and its speed (px per unit phase) */
export const _debug = () => Object.fromEntries(Object.keys(LEGS).map(leg => {
  const R = TABLE[leg], c = r => [Math.atan2(r[2], -r[1]) * 180 / Math.PI, Math.hypot(...r)];
  return [leg, { S, toeOff: R.at(-1).rel, toeOffChordDist: c(R.at(-1).rel), vOff: slope(R, 'relV', true), td: R[0].rel, tdChordDist: c(R[0].rel), vTd: slope(R, 'relV', false) }];
}));
