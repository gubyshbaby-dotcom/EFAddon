// STUDY: our own combat run cycle (R6 style on the Minecraft rig). Not used by the ult.
// "Hunter sprint": a low, bounding battle sprint. Big lean, head up and locked on the target, every step a short hop
// that ends in a stamp; the arms throw hooks. Cycle 0.52 s (two steps), 8.4 blocks/s, a seamless loop.
// Legs live in the ROOT frame (legSpace 'root') but their sockets are re-attached to the torso every sample, so the
// legs follow the lean / twist / tilt of the body while their angles stay readable against the ground.
// Everything is a function of the cycle phase; the keys of 4.2 s of running are generated below (120 keys/s).
//
// How a rigid R6 leg is made to read as a bent one here:
//   - huge arcs: the free leg goes from the push-off (about −56°, root frame) up behind the body (heel kick, −126°,
//     held while the other foot is down), whips through and is cocked forward (+50°) before it stamps down (+34°);
//   - the leg block slides out of its socket along the torso's own axes: 8 px up the spine while it passes under the
//     body (the thigh hides in the hips = a folded knee), up and forward on the knee drive, up into the hips on the
//     landing (the stance "knee bend"), down/out on the push (the extension);
//   - the stance leg is solved so the foot never skates: it rolls heel → flat → toe on its sole;
//   - the body: lean 43–52° dipping into each landing, twist ±24° about the LEANED spine, tilt ±7° over the stance
//     foot, and a hop in every flight (pelvis 8.4 → 12.8 px).
import { PX, torsoRot, partM, partAngles, mul, tr, rx, ry, rz, loopCurve, openCurve, openCurveV, hermite, hipSocket, legPosTrack, legLow, soleEdges } from './run_kit.js';

// ---- design ----
const T = 0.52;         // cycle (two steps), s
const V = 8.4;          // run speed, blocks/s
const STANCE = 0.13;    // ground contact of one foot, s  (flight per step = T/2 − STANCE = 0.13 s)
const TD = 34;          // leg angle at touchdown (deg forward of vertical, root frame)
const HOP = 3.0;        // extra lift in each flight on top of the push, px
const START = [3, 0, 36]; // root at t = 0 (runs along −Z; Alex stands at (0,0,−4), well ahead)
const END = 4.2;
const S = STANCE / T;   // stance fraction of the cycle

const D = Math.PI / 180;
const wrap = u => u - Math.floor(u);

// torso: lean (dips into each landing, rises in the flight), twist about the spine (left shoulder drives forward
// with the right foot), tilt over the stance foot, a little sway of the hips over the stance foot
const leanStep = loopCurve([[0, 47], [0.24, 52], [0.52, 46], [0.76, 43]]);   // per STEP (period T/2)
const torsoAt = phi => {
  const lean = leanStep(wrap(phi * 2));
  const twist = -24 * Math.cos(2 * Math.PI * (phi - 0.05));
  const tilt = -7 * Math.cos(2 * Math.PI * (phi - 0.13));
  const tp = [0.6 * Math.cos(2 * Math.PI * (phi - 0.13)), 0, 0.4];
  return { lean, twist, tilt, tp, ...torsoRot(lean, twist, tilt) };
};

// head: steady and looking ahead (hunting the target) — counters most of the body's lean, twist and tilt, a bit late
const headAt = (phi, torso) => {
  const tw = -24 * Math.cos(2 * Math.PI * (phi - 0.11)), tl = -7 * Math.cos(2 * Math.PI * (phi - 0.19));
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

// legs, leg phase psi: 0 = touchdown, S = toe-off. Swing keys (root-frame pitch) and socket offsets along the torso
// axes [x, up the spine, torso-forward] px, roll (spread outward).
const SWING_PITCH = [[0.33, -102], [0.44, -126], [0.60, -116], [0.67, -76], [0.73, -16], [0.79, 40], [0.86, 50], [0.93, 46]];
const OFF_STANCE = openCurveV([      // on the ground
  [0.00, [0, 0.5, 0.5]],
  [0.11, [0, 4.5, -1.0]],            // pushed up into the hips = the knee bend
  [0.20, [0, 1.6, 0.0]],
  [S, [0, -0.8, 0.6]],               // push-off: slid down/out = the extension, to the last frame
]);
const OFF_SWING = openCurveV([       // in the air
  [S, [0, -0.8, 0.6]],
  [0.33, [0, 2.0, -0.4]],            // snaps up: the heel comes up to the butt
  [0.44, [0, 3.0, -0.6]],            // heel kick
  [0.60, [0, 4.0, -0.8]],
  [0.67, [0, 6.0, -1.2]],
  [0.73, [0, 8.0, -1.4]],            // passing high, folded
  [0.79, [0, 8.0, 2.6]],
  [0.86, [0, 7.0, 3.6]],             // knee drive: the block lifted up and forward = thigh up, shin down
  [0.93, [0, 4.6, 2.6]],             // ...then stamped down onto the ground
  [1.00, [0, 0.5, 0.5]],
]);
const OFFSET = psi => (psi < S ? OFF_STANCE(psi) : OFF_SWING(psi));
const ROLL = loopCurve([[0.0, 0], [0.11, -2], [S, 0], [0.42, 9], [0.68, 14], [0.74, 22], [0.82, 14], [0.9, 5], [0.97, 1]]);
const YAW = loopCurve([[0.0, -3], [0.15, -5], [S, -3], [0.5, 2], [0.8, 0]]);
const LEGS = { legR: 0, legL: 0.5 };

// ---- stance solve: the foot stays put on the ground, rolling heel → toe; body height from the stance leg ----
function stanceTable(leg) {
  const N = 104, rows = [];
  let pin = null, mode = 'heel';
  for (let i = 0; i <= N; i++) {
    const psi = S * i / N, phi = wrap(psi + LEGS[leg]), dt = psi * T;
    const torso = torsoAt(phi), off = OFFSET(psi), w = hipSocket(leg, torso.m, torso.tp, off);
    const ang = th => [th, YAW(psi), ROLL(psi)];
    const edgeZ = (th, which) => soleEdges(leg, w, ang(th))[which][2];
    let th;
    if (i === 0) { th = TD; pin = edgeZ(th, 'heel'); }
    else {
      const target = pin + V * dt / PX;           // the foot moves back relative to the root as the root runs on
      let lo = -85, hi = 85;
      for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (edgeZ(mid, mode) > target) lo = mid; else hi = mid; }
      th = (lo + hi) / 2;
      const e = soleEdges(leg, w, ang(th));
      if (mode === 'heel' && e.toe[1] < e.heel[1]) { mode = 'toe'; pin = e.toe[2] - V * dt / PX; }
    }
    const low = legLow(leg, w, ang(th));
    rows.push({ psi, th, y: -low.y * PX });
  }
  return rows;
}
const TABLE = { legR: stanceTable('legR'), legL: stanceTable('legL') };
const fromTable = (rows, psi, key) => {
  const x = psi / S * (rows.length - 1), i = Math.min(rows.length - 2, Math.floor(x)), s = x - i;
  return rows[i][key] + (rows[i + 1][key] - rows[i][key]) * s;
};
const slope = (rows, key, end) => {         // d/dpsi at the start or end of the stance
  const n = rows.length, h = S / (n - 1);
  return end ? (rows[n - 1][key] - rows[n - 2][key]) / h : (rows[1][key] - rows[0][key]) / h;
};
// swing pitch curve per leg, joined C1 to the solved stance at toe-off and touchdown
const SWING = Object.fromEntries(Object.keys(LEGS).map(leg => {
  const R = TABLE[leg];
  return [leg, openCurve([[S, R.at(-1).th], ...SWING_PITCH, [1, TD]], slope(R, 'th', true), slope(R, 'th', false))];
}));
const legPitch = (leg, psi) => psi < S ? fromTable(TABLE[leg], psi, 'th') : SWING[leg](psi);

// body height: from the stance leg on the ground; in the flight a hop joining the two stances smoothly
function rootY(phi) {
  for (const [leg, o] of Object.entries(LEGS)) { const psi = wrap(phi - o); if (psi < S) return fromTable(TABLE[leg], psi, 'y'); }
  const from = phi < 0.5 ? 'legR' : 'legL', to = from === 'legR' ? 'legL' : 'legR';
  const a = TABLE[from], b = TABLE[to], f0 = from === 'legR' ? S : 0.5 + S, len = 0.5 - S;
  const s = (wrap(phi - f0)) / len;
  return hermite(a.at(-1).y, b[0].y, slope(a, 'y', true) * len, slope(b, 'y', false) * len, s) + HOP * PX * Math.sin(Math.PI * s);
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
    const psi = wrap(phi - o);
    const w = hipSocket(leg, torso.m, torso.tp, OFFSET(psi));
    put(leg, t, [legPitch(leg, psi), YAW(psi), ROLL(psi)]);
    put(leg + '.pos', t, legPosTrack(leg, w));
  }
}

export const CYCLE = T, SPEED = V;
export default { id: 'user', skin: 'wide_steve', slim: false, legSpace: 'root', tracks };
