// STUDY: our own combat run cycle (R6 style on the Minecraft rig). Not used by the ult.
// "Hunter sprint" v2: a low, bounding battle sprint. Big lean, head up and locked on the target, every step a hop
// that ends in a stamp; the arms throw hooks. Cycle 0.52 s (two steps), 8 blocks/s, a seamless loop.
//
// LEGS (v2, after "the legs are sticks"): every leg is a virtual thigh (6 px) + knee + shin (6 px), lib/vlimb.js.
// The 12-px block shows the SHIN: its bottom is the sole, it lies along the shin, so its top floats past the virtual
// knee — that floating top IS the knee: in front of the belly on the knee drive, behind and up on the heel kick,
// forward of the hip on the bent stance leg, at the hip socket only when the leg is straight.
//   swing (FK): push-off → heel kick (knee 140°) → the folded leg passes under the body → high knee (thigh +74°,
//     shin hanging = block standing in front of the belly) → the shin swings out and paws down to the ground;
//   stance (IK): the sole is pinned (heel, then toe: it rolls, never skates); the knee lands at 16°, absorbs to 58°
//     at mid-stance (the body sinks), extends to 14° for the push. Body height comes out of that.
// Legs are in the ROOT frame (legSpace 'root'); the hip sockets are recomputed from the torso every key.
// Everything is a function of the cycle phase; the keys of 4.2 s of running are generated below (120 keys/s).
import { PX, torsoRot, partM, partAngles, mul, tr, rx, ry, rz, loopCurve, openCurve, hermite, BODY_HIP, legLow, soleEdges } from './run_kit.js';
import { vleg, vlegIK, hipSocket } from '../../lib/vlimb.js';

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

// arms: [pitch, yaw, roll] keyed in the WORLD frame (so the silhouette is what I key, whatever the torso does),
// [x, y, z] = out of the shoulder socket, torso frame. Phase 0 = the same-side foot lands: this arm is thrown back
// and down past the hip; half a cycle later it has been driven forward and in like a hook. A loop, not a pendulum:
// forward low and close (fast through the bottom, pulled up out of the socket = a bent elbow), back high and WIDE.
const ARM = loopCurve([
  [0.03, [-50, -4, 22, 0.6, 0.4, -1.6]],     // thrown back and down past the hip
  [0.11, [-44, -2, 20, 0.5, 0.6, -1.4]],
  [0.19, [-20, 6, 18, 0.2, 2.6, -0.4]],
  [0.24, [16, 14, 16, 0, 3.8, 1.2]],         // through the bottom: one snap, close, pulled up
  [0.31, [62, 26, 14, -0.2, 2.8, 2.0]],
  [0.43, [94, 32, 22, -0.4, 1.8, 2.4]],      // driven forward and in like a hook, out of the shoulder
  [0.55, [88, 26, 40, -0.3, 1.6, 1.6]],      // ...recoils and opens out
  [0.66, [40, 8, 70, 0.3, 1.6, 0.6]],        // ripped back round the OUTSIDE, wide
  [0.76, [-20, -6, 80, 0.6, 1.4, -0.4]],
  [0.88, [-46, -6, 46, 0.6, 0.6, -1.2]],
]);

// legs, leg phase psi: 0 = touchdown, S = toe-off. Swing keys: virtual thigh pitch (root frame) and knee flexion.
const SIDE = { legR: 'R', legL: 'L' };
const LEGS = { legR: 0, legL: 0.5 };
const TD_THIGH = 28, TD_KNEE = 16;                       // the touchdown pose (shin 12° forward: the heel lands first)
const STANCE_KNEE = loopCurve([[0, TD_KNEE], [0.45, 58], [1, 14], [1.5, 30]]);   // over the stance 0..1 (looped tail unused)
const SWING_THIGH = [[0.27, -36], [0.36, -30], [0.45, -18], [0.55, 12], [0.65, 50], [0.74, 74], [0.84, 66], [0.93, 44]];
const SWING_KNEE = [[0.27, 60], [0.36, 120], [0.45, 140], [0.55, 136], [0.65, 118], [0.74, 88], [0.84, 56], [0.93, 26]];
const SWING_ROLL = loopCurve([[0.0, 0], [0.3, 2], [0.45, 8], [0.6, 10], [0.74, 6], [0.9, 2]]);
const KNEE_DIR = [0, 0, 1];                              // knees point straight ahead
const kneeStance = u => STANCE_KNEE(Math.min(0.999, u));

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
  const td = vleg(side, h0, [TD_THIGH, 0, 0], TD_KNEE);
  const y0 = -lowOf(leg, td).y;                          // px: lift the body so the heel touches the ground
  let e = edgesOf(leg, td);
  let mode = 'heel', pin = [e.heel[0], e.heel[1] + y0, e.heel[2]];   // world-ish: root x/z at touchdown, y on the ground (0)
  let res = { ...td, hip: h0 }, Y = y0;
  for (let i = 0; i <= N; i++) {
    const u = i / N, psi = S * u, phi = wrap(psi + LEGS[leg]), dz = V * psi * T / PX;   // root has moved dz px forward
    const H = hipAt(leg, phi), d = 12 * Math.cos(kneeStance(u) * Math.PI / 360);
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
      res = { ...vlegIK(side, H, foot, { knee: KNEE_DIR }), hip: H };
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
  return vleg(SIDE[leg], hipAt(leg, phi), [sw.thigh(psi), 0, SWING_ROLL(psi)], sw.knee(psi));
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
const put = (name, t, v) => (tracks[name] ||= []).push([+t.toFixed(4), Array.isArray(v) ? v.map(x => +x.toFixed(3)) : +v.toFixed(4), 'linear']);
const FPS = 120;
for (let i = 0; i <= END * FPS; i++) {
  const t = i / FPS, phi = wrap(t / T);
  const torso = torsoAt(phi);
  put('root.pos', t, [START[0], rootY(phi), START[2] - V * t]);
  put('torso', t, torso.angles);
  put('torso.pos', t, torso.tp);
  put('head', t, headAt(phi, torso));
  for (const [arm, o] of [['armR', 0], ['armL', 0.5]]) {
    const a = ARM(wrap(phi - o));
    put(arm, t, partAngles(arm, mul(tr(torso.m), partM(arm, a.slice(0, 3)))));
    put(arm + '.pos', t, a.slice(3));
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
