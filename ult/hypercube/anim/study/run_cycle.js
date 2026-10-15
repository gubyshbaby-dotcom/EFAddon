// STUDY: our own combat run cycle (R6 style on the Minecraft rig). Not used by the ult.
// "Hunter sprint" v2: a low, bounding battle sprint. Big lean, head up and locked on the target, every step a hop
// that ends in a stamp; the arms throw hooks. Cycle 0.52 s (two steps), 8 blocks/s, a seamless loop.
// ARMS (v2): the same idea, block = FOREARM (fist end at the fist), elbow 60–108° through the swing.
//
// LEGS (v2, after "the legs are sticks"): every leg is a virtual thigh (6 px) + knee + shin (6 px), lib/vlimb.js.
// The 12-px block shows the SHIN: its bottom is the sole, it lies along the shin, so its top floats past the virtual
// knee — that floating top IS the knee: in front of the belly on the knee drive, behind and up on the heel kick,
// forward of the hip on the bent stance leg, at the hip socket only when the leg is straight.
//   swing (FK): push-off → heel kick (thigh −40°, knee 112–118°: the block rises behind the butt, sole up) → tucked
//     pass under the body (knee 116°, heel high) → the shin snaps vertical: high knee (thigh +82°, knee 78°: the block
//     stands in front of the belly) → the shin swings out and paws down onto the ground.
//   v3 proportions (author: "limbs too far out"): thigh 3.5 px + shin 8.5, upper arm 2.5 + forearm 7.5, so the block
//     top floats ≤ 6 px from the socket (≈ 2·thigh·sin(flex/2)).
//   stance (IK): the sole is pinned (heel, then toe: it rolls, never skates); the knee lands at 16°, absorbs to 58°
//     at mid-stance (the body sinks), extends to 14° for the push. Body height comes out of that.
// Legs are in the ROOT frame (legSpace 'root'); the hip sockets are recomputed from the torso every key.
// Everything is a function of the cycle phase; the keys of 4.2 s of running are generated below (120 keys/s).
import { PX, torsoRot, partM, partAngles, mul, tr, rx, ry, rz, loopCurve, openCurve, hermite, BODY_HIP, legLow, soleEdges } from './run_kit.js';
import { vleg, vlegIK, hipSocket, varm } from '../../lib/vlimb.js';

// ---- design ----
const T = 0.52;         // cycle (two steps), s
const V = 8.0;          // run speed, blocks/s
const STANCE = 0.10;    // ground contact of one foot, s  (flight per step = T/2 − STANCE = 0.16 s)
const HOP = 2.6;        // lift in each flight, px
const START = [3, 0, 36]; // root at t = 0 (runs along −Z; Alex stands at (0,0,−4), well ahead)
const END = 4.2;
const S = STANCE / T;   // stance fraction of the cycle

const D = Math.PI / 180;
const wrap = u => u - Math.floor(u);

// torso: lean (dips into each landing, rises in the flight), twist about the spine (left shoulder drives forward
// with the right foot), tilt over the stance foot, a little sway of the hips over the stance foot
const leanStep = loopCurve([[0, 47], [0.2, 52], [0.42, 46], [0.7, 43]]);   // per STEP (period T/2)
// the hips lag on the ground and surge in the air (px, along the run): the planted leg does not have to cover the whole step
const surgeStep = loopCurve([[0, 2.0], [0.2, 0.4], [0.4, -1.2], [0.7, 0.4]]);
const torsoAt = phi => {
  const lean = leanStep(wrap(phi * 2));
  const twist = -24 * Math.cos(2 * Math.PI * (phi - 0.05));
  const tilt = -7 * Math.cos(2 * Math.PI * (phi - 0.1));
  const tp = [0.6 * Math.cos(2 * Math.PI * (phi - 0.1)), 0, surgeStep(wrap(phi * 2))];
  return { lean, twist, tilt, tp, ...torsoRot(lean, twist, tilt) };
};

// head: steady and looking ahead (hunting the target) — counters most of the body's lean, twist and tilt, a bit late
const headAt = (phi, torso) => {
  const tw = -24 * Math.cos(2 * Math.PI * (phi - 0.11)), tl = -7 * Math.cos(2 * Math.PI * (phi - 0.16));
  const world = mul(ry(0.22 * tw * D), mul(rz(0.25 * tl * D), rx(-(4 + 3 * Math.cos(4 * Math.PI * (phi - 0.3))) * D)));
  return partAngles('head', mul(tr(torso.m), world));
};

// arms (v2): virtual upper arm (4 px) + elbow + forearm (6 px), lib/vlimb.js varm: the block shows the FOREARM, its fist
// end at the fist, its top floating where the elbow is. Keys: [upper-arm pitch, yaw, roll] in the WORLD frame (the
// silhouette is what I key, whatever the torso does), elbow flexion, shoulder thrust [x, y, z] px (torso frame).
// Phase 0 = the same-side foot lands. A loop, not a pendulum: the arm drives forward folded and close, the elbow
// snaps open at the front like a hook-punch and closes again, then the arm is ripped back round the OUTSIDE (wide
// flare) and the elbow flicks open once more at the back.
const ARM = loopCurve([
  [0.03, [-70, -4, 40, 80, 0.2, 0, -0.6]],   // back extreme: elbow flicks open a little, flared out
  [0.10, [-64, -2, 34, 98, 0.2, 0, -0.5]],
  [0.19, [-30, 6, 18, 104, 0, 0, -0.1]],      // drive starts, folded tight
  [0.26, [15, 14, 12, 108, 0, 0.2, 0.3]],     // through the bottom: fist by the hip, elbow 108°
  [0.34, [62, 26, 14, 100, -0.1, 0.3, 0.7]],
  [0.43, [96, 32, 22, 62, -0.2, 0.3, 1.0]],   // hook-punch: the elbow snaps open, fist thrust forward and in
  [0.50, [96, 28, 28, 76, -0.2, 0.3, 0.8]],
  [0.57, [82, 22, 44, 100, 0, 0.2, 0.4]],     // recoil: closes and opens out
  [0.66, [38, 8, 72, 106, 0.2, 0.2, 0.1]],    // ripped back round the outside, wide
  [0.76, [-20, -6, 78, 98, 0.2, 0.1, -0.2]],
  [0.88, [-58, -6, 54, 100, 0.2, 0, -0.5]],
]);

// legs, leg phase psi: 0 = touchdown, S = toe-off. Swing keys: virtual thigh pitch (root frame) and knee flexion.
const SIDE = { legR: 'R', legL: 'L' };
// Minecraft proportions for the virtual limbs (px): short thigh / upper arm, so the block top floats only 2–5 px
const LEG_T = 3.5, ARM_U = 2.5, LEG_S = 12 - LEG_T;
const hipToSole = knee => Math.sqrt(LEG_T * LEG_T + LEG_S * LEG_S + 2 * LEG_T * LEG_S * Math.cos(knee * Math.PI / 180));
const LEGS = { legR: 0, legL: 0.5 };
const TD_THIGH = 28, TD_KNEE = 16;                       // the touchdown pose (shin 12° forward: the heel lands first)
const STANCE_KNEE = openCurve([[0, TD_KNEE], [0.45, 58], [1, 14]], 160, -60);   // over the stance 0..1: land, absorb, push
const SWING_THIGH = [[0.26, -34], [0.32, -40], [0.38, -36], [0.44, -22], [0.50, -4], [0.56, 12], [0.62, 28], [0.67, 46], [0.71, 70], [0.75, 88], [0.81, 88], [0.88, 68], [0.95, 42]];
const SWING_KNEE = [[0.26, 55], [0.32, 90], [0.38, 112], [0.44, 118], [0.50, 120], [0.56, 120], [0.62, 120], [0.67, 118], [0.71, 104], [0.75, 82], [0.81, 62], [0.88, 42], [0.95, 20]];
const SWING_ROLL = loopCurve([[0.0, 0], [0.3, 3], [0.42, 8], [0.6, 10], [0.72, 6], [0.9, 2]]);
const KNEE_DIR = [0, 0, 1];                              // knees point straight ahead
const kneeStance = u => STANCE_KNEE(u);

const posToSocket = (leg, pos) => [BODY_HIP[leg][0] + pos[0], BODY_HIP[leg][1] + pos[1], -pos[2]];   // track → three-axes px
const lowOf = (leg, res) => legLow(leg, posToSocket(leg, res.pos), res.ang);
const edgesOf = (leg, res) => soleEdges(leg, posToSocket(leg, res.pos), res.ang);   // three axes (z back), px
const hipAt = (leg, phi) => { const tor = torsoAt(phi); return hipSocket(SIDE[leg], tor.angles, tor.tp); };   // root frame, z fwd
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
    rows.push({ psi, Y: Y * PX, ang: res.ang, pos: res.pos, thigh: thighOf(res), knee: kneeStance(u) });
  }
  return rows;
}
const TABLE = { legR: stanceTable('legR'), legL: stanceTable('legL') };
const fromTable = (rows, psi, key) => {
  const x = psi / S * (rows.length - 1), i = Math.min(rows.length - 2, Math.floor(x)), s = x - i;
  const a = rows[i][key], b = rows[i + 1][key];
  return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * s) : a + (b - a) * s;
};
const slope = (rows, key, end) => { const n = rows.length, h = S / (n - 1); return end ? (rows[n - 1][key] - rows[n - 2][key]) / h : (rows[1][key] - rows[0][key]) / h; };
// swing curves per leg: start from the solved toe-off (C1), end on the touchdown pose
const SWING = Object.fromEntries(Object.keys(LEGS).map(leg => {
  const R = TABLE[leg], last = R.at(-1);
  return [leg, {
    thigh: openCurve([[S, last.thigh], ...SWING_THIGH, [1, TD_THIGH]], slope(R, 'thigh', true), -260),
    knee: openCurve([[S, last.knee], ...SWING_KNEE, [1, TD_KNEE]], 600, -120),
  }];
}));
function legPose(leg, psi, phi) {
  if (psi < S) return { ang: fromTable(TABLE[leg], psi, 'ang'), pos: fromTable(TABLE[leg], psi, 'pos') };
  const sw = SWING[leg];
  return vleg(SIDE[leg], hipAt(leg, phi), [sw.thigh(psi), 0, SWING_ROLL(psi)], sw.knee(psi), { thighLen: LEG_T });
}

// body height: from the planted leg; in the flight a hop from the push to the next landing
function rootY(phi) {
  for (const [leg, o] of Object.entries(LEGS)) { const psi = wrap(phi - o); if (psi < S) return fromTable(TABLE[leg], psi, 'Y'); }
  const from = phi < 0.5 ? 'legR' : 'legL', to = from === 'legR' ? 'legL' : 'legR';
  const a = TABLE[from].at(-1).Y, b = TABLE[to][0].Y, f0 = from === 'legR' ? S : 0.5 + S, len = 0.5 - S;
  const s = wrap(phi - f0) / len;
  return a + (b - a) * s * s * (3 - 2 * s) + HOP * PX * Math.sin(Math.PI * Math.pow(s, 0.85));
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
    out[leg] = psi < S ? { stance: true, thigh: fromTable(TABLE[leg], psi, 'thigh'), knee: fromTable(TABLE[leg], psi, 'knee') }
      : { stance: false, thigh: SWING[leg].thigh(psi), knee: SWING[leg].knee(psi) };
  }
  return out;
}
