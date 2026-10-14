// Evaluate a Roblox R6 KeyframeSequence (JSON from ../rbxm.py) at time t and map it onto the Minecraft
// player model. Pure function of t (no state): usable in the browser renderer and in node analysis.
//
// Space: "HRP space" = Roblox character frame (x right, y up, -z forward); units here are BLOCKS.
// R6 joints: Part1 = Part0 * C0 * Transform * C1^-1, with the standard R6 C0/C1 (C0 and C1 share their
// rotation, so a part's rotation relative to its parent is R(C0) R(T) R(C0)^T). Minecraft pivots replace
// the Roblox ones (rotations transfer exactly; R6 and the MC player have nearly the same proportions,
// except the narrower MC torso).

export const STUD = 0.4;          // blocks per stud for the torso (root) translation: R6 is 5 studs tall, MC 2 blocks
export const LIMB_STUD = 0.3;     // blocks per stud for limb translations (rare)

const R_ROOT = [-1, 0, 0, 0, 0, 1, 0, 1, 0];         // RootJoint, Neck
const R_RIGHT = [0, 0, 1, 0, 1, 0, -1, 0, 0];        // Right Shoulder, Right Hip
const R_LEFT = [0, 0, -1, 0, 1, 0, 1, 0, 0];         // Left Shoulder, Left Hip

export const JOINTS = {
  Torso: R_ROOT, Head: R_ROOT,
  'Right Arm': R_RIGHT, 'Right Leg': R_RIGHT,
  'Left Arm': R_LEFT, 'Left Leg': R_LEFT,
};

// ---- small math (row-major 3x3, quaternions [x,y,z,w]) ----
export function mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export function tr(a) { return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]; }
export function mv(a, v) {
  return [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
}
export function quatFromMat(m) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr_ = m00 + m11 + m22;
  let x, y, z, w;
  if (tr_ > 0) { const s = Math.sqrt(tr_ + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  const n = Math.hypot(x, y, z, w);
  return [x / n, y / n, z / n, w / n];
}
export function matFromQuat([x, y, z, w]) {
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
export function slerp(a, b, t) {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (d > 0.9995) {
    const r = [a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t];
    const n = Math.hypot(...r); return r.map(v => v / n);
  }
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}
export function angleBetween(qa, qb) {
  const d = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]);
  return 2 * Math.acos(Math.min(1, d));
}

// ---- Roblox pose easing (PoseEasingStyle/Direction). Legacy styles have In/Out swapped vs TweenService. ----
function outBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
const EIN = {
  Cubic: x => x * x * x,
  CubicV2: x => x * x * x,
  Elastic: x => x <= 0 ? 0 : x >= 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * (2 * Math.PI / 3)),
  Bounce: x => 1 - outBounce(1 - x),
};
export function ease(style, dir, x) {
  if (style === 'Linear') return x;
  if (style === 'Constant') return 0;
  const f = EIN[style];
  if (!f) return x;
  let d = dir;
  if (style !== 'CubicV2') d = dir === 'In' ? 'Out' : dir === 'Out' ? 'In' : dir; // legacy swap
  if (d === 'In') return f(x);
  if (d === 'Out') return 1 - f(1 - x);
  return x < 0.5 ? f(2 * x) / 2 : 1 - f(2 - 2 * x) / 2;
}

// ---- tracks ----
export function buildTracks(seq) {
  const tracks = {};
  for (const kf of seq.keyframes) {
    for (const [part, p] of Object.entries(kf.poses)) {
      if (!p.cf || part === 'HumanoidRootPart') continue;
      (tracks[part] ||= []).push({ t: kf.t, p: p.cf.slice(0, 3), q: quatFromMat(p.cf.slice(3)), style: p.style, dir: p.dir, w: p.weight });
    }
  }
  for (const k of Object.keys(tracks)) {
    // a zero-weight pose does not drive the joint, unless the joint only has such poses
    const live = tracks[k].filter(x => x.w > 0.001);
    if (live.length) tracks[k] = live;
    tracks[k].sort((a, b) => a.t - b.t);
  }
  const events = [];
  for (const kf of seq.keyframes) {
    if (kf.name && kf.name !== 'Keyframe') events.push({ t: kf.t, name: kf.name });
    for (const m of kf.markers || []) events.push({ t: kf.t, name: m.name, value: m.value });
  }
  // "_SPEED" markers (value = forward root speed in studs/s from this key on): integrate to a root offset
  const speeds = events.filter(e => e.name === '_SPEED').map(e => ({ t: e.t, v: parseFloat(e.value) || 0 })).sort((a, b) => a.t - b.t);
  let speedPath = null;
  if (speeds.length) {
    speedPath = [{ t: speeds[0].t, d: 0 }];
    for (let i = 1; i < speeds.length; i++) speedPath.push({ t: speeds[i].t, d: speedPath[i - 1].d + speeds[i - 1].v * (speeds[i].t - speeds[i - 1].t) });
    speedPath.lastV = speeds[speeds.length - 1].v;
  }
  return { tracks, events: events.filter(e => e.name !== '_SPEED'), length: seq.length, name: seq.name, speedPath };
}

/** Forward root distance (studs) from "_SPEED" markers at time t, or 0. */
export function speedDistance(bt, t) {
  const sp = bt.speedPath;
  if (!sp) return 0;
  if (t <= sp[0].t) return 0;
  let i = sp.length - 1;
  while (i > 0 && sp[i].t > t) i--;
  const next = sp[i + 1];
  const v = next ? (next.d - sp[i].d) / Math.max(1e-6, next.t - sp[i].t) : sp.lastV;
  return sp[i].d + v * (t - sp[i].t);
}

export function sampleTrack(keys, t) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0].t) return { p: keys[0].p, q: keys[0].q };
  const n = keys.length;
  if (t >= keys[n - 1].t) return { p: keys[n - 1].p, q: keys[n - 1].q };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m].t <= t) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi];
  const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const e = ease(a.style, a.dir, u);
  return { p: [a.p[0] + (b.p[0] - a.p[0]) * e, a.p[1] + (b.p[1] - a.p[1]) * e, a.p[2] + (b.p[2] - a.p[2]) * e], q: slerp(a.q, b.q, e) };
}

// Minecraft player geometry in HRP space (blocks), relative to the torso centre (TC).
// TC rest = 1.125 blocks above the feet.
export const TC_REST_Y = 18 / 16;
export function mcPivots(slim) {
  return {
    Head: [0, 6 / 16, 0],
    'Right Arm': [5 / 16, (slim ? 3.5 : 4) / 16, 0],
    'Left Arm': [-5 / 16, (slim ? 3.5 : 4) / 16, 0],
    'Right Leg': [1.9 / 16, -6 / 16, 0],
    'Left Leg': [-1.9 / 16, -6 / 16, 0],
  };
}

/**
 * Pose at time t: { torso: {pos, rot}, parts: {Head|Right Arm|...: {pivot, rot}} } in HRP space (blocks, feet at y 0).
 * rot = row-major 3x3 world rotation of the part; pivot = world position of the part's MC pivot.
 */
export function poseAt(tracks, t, slim = false, forwardStuds = 0) {
  const tor = sampleTrack(tracks.Torso, t) || { p: [0, 0, 0], q: [0, 0, 0, 1] };
  const RT = matFromQuat(tor.q);
  const torsoRot = mul(mul(R_ROOT, RT), tr(R_ROOT));
  const off = mv(R_ROOT, tor.p);
  const torsoPos = [off[0] * STUD, TC_REST_Y + off[1] * STUD, (off[2] - forwardStuds) * STUD];
  const piv = mcPivots(slim);
  const parts = {};
  for (const name of ['Head', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg']) {
    const s = sampleTrack(tracks[name], t) || { p: [0, 0, 0], q: [0, 0, 0, 1] };
    const R0 = JOINTS[name];
    const rel = mul(mul(R0, matFromQuat(s.q)), tr(R0));
    const d = mv(R0, s.p);
    const localPivot = [piv[name][0] + d[0] * LIMB_STUD, piv[name][1] + d[1] * LIMB_STUD, piv[name][2] + d[2] * LIMB_STUD];
    const wp = mv(torsoRot, localPivot);
    parts[name] = { pivot: [torsoPos[0] + wp[0], torsoPos[1] + wp[1], torsoPos[2] + wp[2]], rot: mul(torsoRot, rel) };
  }
  return { torso: { pos: torsoPos, rot: torsoRot }, parts };
}

/** World point of a part-local point (blocks, in the part's frame from its pivot / the torso centre). */
export function partPoint(pose, name, local) {
  const P = name === 'Torso' ? { pivot: pose.torso.pos, rot: pose.torso.rot } : pose.parts[name];
  const w = mv(P.rot, local);
  return [P.pivot[0] + w[0], P.pivot[1] + w[1], P.pivot[2] + w[2]];
}

/**
 * Mod-side fix for clips without leg keys (TSB M1s): in R6 the legs hang from the torso, so a leaning torso tilts
 * the whole body like a plank. Here the legs come from a base stance (idle) and the torso bends about the hips:
 * the clip's horizontal hip travel is kept, the hips stay at the stance height, head and arms follow the torso.
 */
export function legFix(clipPose, basePose) {
  const HIP = [0, -6 / 16, 0];
  const hipOf = p => { const w = mv(p.torso.rot, HIP); return [p.torso.pos[0] + w[0], p.torso.pos[1] + w[1], p.torso.pos[2] + w[2]]; };
  const hc = hipOf(clipPose), hb = hipOf(basePose);
  const restHip = [0, TC_REST_Y - 6 / 16, 0];
  const d = [hc[0] - restHip[0], 0, hc[2] - restHip[2]];
  const newHip = [hb[0] + d[0], hb[1], hb[2] + d[2]];
  const up = mv(clipPose.torso.rot, [0, 6 / 16, 0]);
  const torsoPos = [newHip[0] + up[0], newHip[1] + up[1], newHip[2] + up[2]];
  const sh = [torsoPos[0] - clipPose.torso.pos[0], torsoPos[1] - clipPose.torso.pos[1], torsoPos[2] - clipPose.torso.pos[2]];
  const parts = {};
  for (const n of ['Head', 'Right Arm', 'Left Arm']) {
    const p = clipPose.parts[n];
    parts[n] = { pivot: [p.pivot[0] + sh[0], p.pivot[1] + sh[1], p.pivot[2] + sh[2]], rot: p.rot };
  }
  for (const n of ['Right Leg', 'Left Leg']) {
    const p = basePose.parts[n];
    parts[n] = { pivot: [p.pivot[0] + d[0], p.pivot[1], p.pivot[2] + d[2]], rot: p.rot };
  }
  return { torso: { pos: torsoPos, rot: clipPose.torso.rot }, parts };
}
