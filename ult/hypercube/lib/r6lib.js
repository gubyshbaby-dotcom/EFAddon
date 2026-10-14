// Pack clips → ult tracks. The ult rig (rig.js) has the exact R6 geometry of the pack renderer (lib/r6.js, copied from
// tools/rbxanim/render/r6.js), so a pack clip sampled here looks exactly like in the pack renders.
//
//   import CLIP from './clips/m1a_1.js';               // made by tools/r6import.mjs
//   const add = r6Keys(CLIP, { from: 0, to: 0.43, at: 3.45, speed: 1, mirror: false, legs: true, fps: 60 });
//   splice(tracks, add);                               // replaces the keys of those tracks inside [add.t0, add.t1]
//
// r6Keys returns { t0, t1, tracks: { torso, head, armR, armL, legR, legL, '<part>.pos' }, fwd } where every track is
// [[t, value, 'linear'], ...] sampled at fps between clip time `from` and `to`, placed at scene time `at` and played at
// `speed`. fwd = forward root travel (blocks) from the clip's "_SPEED" markers — add it to your root path yourself.
// mirror: swap left/right (a right cross becomes a left cross). legs: false = leave the legs out (TSB M1s have no leg keys:
// key the legs yourself — wide stance — instead of letting the body tilt like a plank).
// Events (Dmg / Hit markers) are returned as `events` in scene time, so contacts can be put exactly on the beat.
import { buildTracks, poseAt as r6PoseAt, speedDistance, sampleTrack, mul, mv, tr, STUD, LIMB_STUD, JOINTS } from './r6.js';

const PX = 1 / 16, R2D = 180 / Math.PI;
const cache = new WeakMap();
function built(clip) { if (!cache.has(clip)) cache.set(clip, buildTracks(clip)); return cache.get(clip); }

// three.js Euler 'ZYX' from a row-major 3x3 (same formulas as THREE.Euler.setFromRotationMatrix)
function eulerZYX(m) {
  const m11 = m[0], m12 = m[1], m21 = m[3], m22 = m[4], m31 = m[6], m32 = m[7], m33 = m[8];
  const y = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), y, Math.atan2(m21, m11)];
  return [0, y, Math.atan2(-m12, m22)];
}
const MIR = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
const mirror = m => mul(mul(MIR, m), MIR);
// rig.js partEuler inverse: rotation (parent frame) → authoring angles [pitch, yaw, roll] in degrees
function angles(part, m) {
  const [ex, ey, ez] = eulerZYX(m).map(v => v * R2D);
  if (part === 'torso' || part === 'head') return [-ex, ey, ez];
  if (part === 'armR' || part === 'legR') return [ex, ey, ez];
  return [ex, -ey, -ez];
}
const NAME = { Head: 'head', 'Right Arm': 'armR', 'Left Arm': 'armL', 'Right Leg': 'legR', 'Left Leg': 'legL' };

/** One pose of a clip at clip time u, in ult track values. */
export function r6Pose(clip, u, { mirror: mir = false, slim = false } = {}) {
  const bt = built(clip);
  const p = r6PoseAt(bt.tracks, u, slim, 0);
  let T = p.torso.rot;
  if (mir) T = mirror(T);
  const out = { torso: angles('torso', T) };
  const off = [(p.torso.pos[0]) / PX, (p.torso.pos[1] - 18 / 16) / PX, -(p.torso.pos[2]) / PX];
  out['torso.pos'] = [mir ? -off[0] : off[0], off[1], off[2]];
  for (const [rn, n] of Object.entries(NAME)) {
    let R = p.parts[rn].rot;
    if (mir) R = mirror(R);
    const rel = mul(tr(T), R);
    const dst = mir ? (n.endsWith('R') ? n.slice(0, -1) + 'L' : n.endsWith('L') ? n.slice(0, -1) + 'R' : n) : n;
    out[dst] = angles(dst, rel);
    // limb translation (rare in clips but used by some): pivot offset in the torso frame → '<part>.pos' px (z forward)
    const s = sampleTrack(bt.tracks[rn], u);
    const d = s ? mv(JOINTS[rn], s.p) : [0, 0, 0];
    out[dst + '.pos'] = [(mir ? -d[0] : d[0]) * LIMB_STUD / PX, d[1] * LIMB_STUD / PX, -d[2] * LIMB_STUD / PX];
  }
  out.fwd = speedDistance(bt, u) * STUD;
  return out;
}

/** Sample a clip segment into ult tracks (see the header). */
export function r6Keys(clip, { from = 0, to = clip.length, at = 0, speed = 1, mirror: mir = false, legs = true, head = true, fps = 60, slim = false } = {}) {
  const bt = built(clip);
  const limbs = ['armR', 'armL', ...(head ? ['head'] : []), ...(legs ? ['legR', 'legL'] : [])];
  const parts = ['torso', 'torso.pos', ...limbs, ...limbs.map(n => n + '.pos')];
  const tracks = Object.fromEntries(parts.map(p => [p, []]));
  const fwd = [];
  const n = Math.max(1, Math.round((to - from) / speed * fps));
  const f0 = r6Pose(clip, from, { mirror: mir, slim }).fwd;
  for (let i = 0; i <= n; i++) {
    const u = from + (to - from) * i / n, t = at + (u - from) / speed;
    const pose = r6Pose(clip, u, { mirror: mir, slim });
    for (const p of parts) tracks[p].push([+t.toFixed(5), pose[p].map(v => +v.toFixed(3)), 'linear']);
    fwd.push([+t.toFixed(5), +(pose.fwd - f0).toFixed(4), 'linear']);
  }
  // unwrap angles so consecutive keys never jump by 360°
  for (const p of parts) if (!p.endsWith('.pos')) {
    const k = tracks[p];
    for (let i = 1; i < k.length; i++) k[i][1] = k[i][1].map((v, j) => { const pv = k[i - 1][1][j]; return v + 360 * Math.round((pv - v) / 360); });
  }
  const events = bt.events.filter(e => e.t >= from - 1e-6 && e.t <= to + 1e-6).map(e => ({ ...e, t: at + (e.t - from) / speed }));
  return { t0: at, t1: at + (to - from) / speed, tracks, fwd, events };
}

/**
 * Insert sampled keys into an actor's tracks: for every track in add.tracks, keys of `tracks` inside [add.t0, add.t1]
 * are removed and the new ones inserted (sorted). Blend in/out by putting your own keys right before/after the segment.
 */
export function splice(tracks, add) {
  for (const [name, keys] of Object.entries(add.tracks)) {
    const base = (tracks[name] || []).filter(k => k[0] < add.t0 - 1e-6 || k[0] > add.t1 + 1e-6);
    tracks[name] = [...base, ...keys].sort((a, b) => a[0] - b[0]);
  }
  return tracks;
}
