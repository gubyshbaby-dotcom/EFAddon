// Authoring kit for the hand-keyed animation of «Гиперкуб» (owned by the animation engineer; used by anim/user.js,
// anim/victim.js, anim/clones.js). Everything is a pure function of the key list: actors are BAKED at module load into
// dense 60 fps rig tracks (rig.js format), so rendering, scrubbing and check.mjs all see the exact same motion.
//
// Why a solver: R6 legs are rigid (no knees). To keep feet planted while the body leans, twists and sinks, the legs must
// point exactly from the hips to the footprints, and with BOTH feet down the hips can only sit on the circle where both
// 12-px legs reach their footprints. The kit computes that per frame, so stances, weight shifts and steps never skate.
//
// Key: K(t, params, ease = 'smooth', easeOverrides = {param: ease})  — ease = how each param travels INTO this key.
// Params (all optional; a param interpolates between the keys that define it):
//   yaw        root heading, deg (0 = facing -Z, + = turn left)          rot  [pitch, roll] root rotation about `pivot` (bl)
//   torso      [pitch, yaw, roll] RootJoint (whole body)                  head [pitch, yaw, roll] (added on top of `look`)
//   look       world point [x,y,z] or t => [x,y,z]: the head aims at it, scaled by `lookW` (0..1, default 1)
//   footR/footL world foot target [x, y, z]: y ≤ 0.001 = planted (solved), y > 0 = swinging (the leg points at it)
//   legR/legL  explicit leg angles (instead of a foot target): free leg (kicks, air poses)
//   armR/armL  explicit arm angles;  aimR/aimL world point / t => point the fist aims at (+ reach);
//              dirR/dirL arm direction in the ROOT frame [right, up, forward] (independent of the torso lean)
//   twistR/twistL  twist (deg) about the arm's own axis in aim/dir modes (+90 ≈ palm up for an arm held forward)
//   at         [x, z] root position while fewer than two feet are planted (anchored automatically at 2-foot keys)
//   y          root height while no foot is planted (air); anchored automatically at grounded keys
//   reachR/reachL/reachLegR/reachLegL  max px a limb may slide out of its socket toward its aim target
//   toeR/toeL  toe-out of each foot (deg, default 12): planted legs counter the torso twist to keep the toes there
//   bias       hip offset around the two-foot circle (deg)
//   shake      tremble amplitude (deg): deterministic noise on torso/head/arms (frozen during hit-stops)
//   '<part>.pos' px offsets added on top (torso.pos, head.pos, armR.pos ...);   vis (stepped), ghost
import * as THREE from 'three';
import { sample, makePlayer, applyPose, bonePoint, poseAt, PX } from '../rig.js';
import { frozenAt, HITS } from '../timeline.js';

export const FPS = 60;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const LEG = 12 * PX;                 // hip pivot → foot bottom centre
const ARM = Math.hypot(1, 11) * PX;  // shoulder pivot → fist point
const EPS = 1e-3;
const PARTS = ['torso', 'head', 'armR', 'armL', 'legR', 'legL'];
const MODES = { legR: ['footR'], legL: ['footL'], armR: ['aimR', 'dirR'], armL: ['aimL', 'dirL'], head: ['look'] };

export const K = (t, p, e = 'smooth', ez = {}) => ({ t: +(+t).toFixed(5), p, e, ez });
export const lerp = (a, b, w) => Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * w) : a + (b - a) * w;
export const add = (a, b) => a.map((v, i) => v + (b[i] || 0));

// smooth deterministic value noise in [-1, 1]
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise(t, seed = 0) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), o = seed * 61.7;
  return (hash(i + o) * (1 - u) + hash(i + 1 + o) * u) * 2 - 1;
}
/** time with hit-stops frozen (for noise-driven motion) */
export function holdT(t) { const h = frozenAt(t); return h ? h.t : t; }

const rigs = new Map();
function rigFor(key, slim) { if (!rigs.has(key)) rigs.set(key, makePlayer(THREE, null, slim)); return rigs.get(key); }

/** World point of a bone (rig.js BONE_POINTS name or part name) of a baked actor at time t. */
export function boneAt(def, name, t) {
  const pl = rigFor('probe:' + def.id, def.slim);
  applyPose(pl, poseAt(def, t)); pl.root.updateMatrixWorld(true);
  const v = bonePoint(THREE, pl, name);
  return [v.x, v.y, v.z];
}
/** World point of a part-local point (px, x right / y up / z FORWARD) of a baked actor at time t. */
export function pointAt(def, part, [x, y, z], t) {
  const pl = rigFor('probe:' + def.id, def.slim);
  applyPose(pl, poseAt(def, t)); pl.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(x * PX, y * PX, -z * PX).applyMatrix4(pl.parts[part].matrixWorld);
  return [v.x, v.y, v.z];
}

function blank() {
  const p = { pos: [0, 0, 0], rot: [0, 0, 0], pivot: 0.75, plant: 0, vis: 1, ghost: 0 };
  for (const n of PARTS) { p[n] = [0, 0, 0]; p[n + '.pos'] = [0, 0, 0]; }
  return p;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const near = (v, ref) => v + 360 * Math.round((ref - v) / 360);

/**
 * Leg angles [pitch, yaw, roll] (deg, rig.js convention) pointing leg `name` (its -Y axis) along unit d (torso frame),
 * twisted about its own axis so the toe (front face) turns as close as possible to `toe` (unit, torso frame).
 * Minimal-rotation based: no gimbal flips whatever the leg angle.
 */
export function legAngles(name, d, toe, prev = null) {
  const left = name.endsWith('L');
  const v = new THREE.Vector3(left ? -d.x : d.x, d.y, d.z).normalize();
  const tv = new THREE.Vector3(left ? -toe.x : toe.x, toe.y, toe.z);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), v);
  const f0 = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const tp = tv.sub(v.clone().multiplyScalar(tv.dot(v)));
  if (tp.lengthSq() > 1e-6) {
    const th = Math.atan2(f0.clone().cross(tp).dot(v), f0.dot(tp));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(v, th));
  }
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  let a = [e.x * R2D, e.y * R2D, e.z * R2D];
  if (prev) a = a.map((x, i) => near(x, prev[i]));
  return a;
}
/** Arm/leg angles for direction d (torso frame) with a twist about the limb axis (minimal rotation from hanging). */
export function dirAngles(name, d, twist = 0, prev = null) {
  const left = name.endsWith('L');
  const v = new THREE.Vector3(left ? -d.x : d.x, d.y, d.z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), v);
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(v, twist * D2R));
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  let a = [e.x * R2D, e.y * R2D, e.z * R2D];
  if (prev) a = a.map((x, i) => near(x, prev[i]));
  return a;
}
/** head [pitch, yaw] (deg) looking along unit d (torso frame) */
function aimHead(d) { return [Math.asin(Math.max(-1, Math.min(1, -d.y))) * R2D, Math.atan2(-d.x, -d.z) * R2D]; }
const evalPt = (v, t) => (typeof v === 'function' ? v(t) : v);

/**
 * Bake an actor. opts: { id, skin, slim, keys: [K...], from, to, ghostColor, warn, hits }
 * hits: which HITS hit-stops freeze this actor ('all' = every hit, e.g. the victim; default [id, 'all'] = by this actor)
 * Returns a rig.js actor definition with dense 60 fps tracks.
 */
export function bake(opts) {
  const { id, skin, slim } = opts;
  const keys = opts.keys.slice().sort((a, b) => a.t - b.t);
  const from = opts.from ?? keys[0].t, to = opts.to ?? keys[keys.length - 1].t;
  const R = rigFor('solve:' + id, slim);
  const easeOf = (k, name) => k.ez[name] || k.e;
  const warn = opts.warn !== false;

  // numeric param tracks
  const NUM = {};
  const numKeys = name => (NUM[name] ||= keys.filter(k => k.p[name] !== undefined).map(k => [k.t, k.p[name], easeOf(k, name)]));
  const num = (name, t, d) => { const ks = numKeys(name); return ks.length ? sample(ks, t) : d; };

  // limb modes: angle param (legR/armR) or one of MODES[L] (target point / direction)
  const LK = {};
  for (const L of Object.keys(MODES)) LK[L] = keys.filter(k => (L !== 'head' && k.p[L] !== undefined) || MODES[L].some(m => k.p[m] !== undefined));
  const modeOf = (L, k) => (L !== 'head' && k.p[L] !== undefined) ? null : MODES[L].find(m => k.p[m] !== undefined);
  const memoAng = new Map();
  function segment(list, t) {
    if (t <= list[0].t) return [0, 0];
    if (t >= list[list.length - 1].t) return [list.length - 1, list.length - 1];
    let i = 1; while (i < list.length - 1 && list[i].t < t) i++;
    return [i - 1, i];
  }
  function targetRun(L, m, t, a, b) {
    const list = LK[L];
    let i0 = a, i1 = b;
    while (i0 > 0 && modeOf(L, list[i0 - 1]) === m) i0--;
    while (i1 < list.length - 1 && modeOf(L, list[i1 + 1]) === m) i1++;
    const ks = list.slice(i0, i1 + 1).map(k => [k.t, evalPt(k.p[m], t), easeOf(k, m)]);
    return new THREE.Vector3(...sample(ks, t));
  }
  function solvedAngles(L, k) {
    if (!memoAng.has(L)) memoAng.set(L, new Map());
    const m = memoAng.get(L);
    if (!m.has(k)) { m.set(k, [0, 0, 0]); m.set(k, solve(k.t).pose[L]); }
    return m.get(k);
  }
  function limbAt(L, t) {
    const list = LK[L];
    if (!list.length) return null;
    const [a, b] = segment(list, t);
    const ex = Math.abs(list[b].t - t) < 1e-7 ? list[b] : Math.abs(list[a].t - t) < 1e-7 ? list[a] : null;
    if (ex) { const m = modeOf(L, ex); return m ? { mode: m, v: new THREE.Vector3(...evalPt(ex.p[m], t)) } : { ang: ex.p[L].slice() }; }
    const ma = modeOf(L, list[a]), mb = modeOf(L, list[b]);
    if (ma && ma === mb) return { mode: ma, v: targetRun(L, ma, t, a, b) };
    if (L === 'head') return null;
    const ks = list.map(k => { const m = modeOf(L, k); return [k.t, m ? solvedAngles(L, k) : k.p[L], easeOf(k, m || L)]; });
    return { ang: sample(ks, t) };
  }

  const prevSol = {};
  const wp = g => g.getWorldPosition(new THREE.Vector3());
  // ---- one frame ----
  function solve(t, store = false) {
    const tn = holdT(t);
    const shake = num('shake', t, 0);
    const nz = (seed, amp) => amp * (noise(tn * 7.3, seed) * 0.7 + noise(tn * 17.1, seed + 3) * 0.3);
    const P = blank();
    const yaw = num('yaw', t, 0), rr = num('rot', t, [0, 0]);
    P.rot = [rr[0], yaw, rr[1]];
    P.pivot = num('pivot', t, 0.75);
    P.torso = add(num('torso', t, [0, 0, 0]), [nz(1, shake * 0.5), nz(2, shake * 0.4), nz(3, shake * 0.4)]);
    for (const n of PARTS) P[n + '.pos'] = num(n + '.pos', t, [0, 0, 0]).slice();
    P.ghost = num('ghost', t, opts.ghostColor ? 1 : 0);
    // FK at the root origin (no plant) → torso centre, hips, torso rotation
    applyPose(R, P); R.root.updateMatrixWorld(true);
    const C0 = wp(R.parts.torso), H0 = { legR: wp(R.parts.legR), legL: wp(R.parts.legL) };
    const qT = R.parts.torso.getWorldQuaternion(new THREE.Quaternion()), qTi = qT.clone().invert();
    const legs = { legR: limbAt('legR', t), legL: limbAt('legL', t) };
    const planted = ['legR', 'legL'].filter(L => legs[L] && legs[L].mode && legs[L].v.y <= EPS);
    for (const L of planted) legs[L].v.y = 0;
    let off; // root translation
    if (planted.length === 2) {
      const A = legs.legR.v.clone().sub(H0.legR).add(C0), B = legs.legL.v.clone().sub(H0.legL).add(C0);
      const M = A.clone().add(B).multiplyScalar(0.5), ab = A.clone().sub(B), dAB = ab.length();
      const n = ab.clone().normalize();
      const rho = Math.sqrt(Math.max(0, LEG * LEG - dAB * dAB / 4));
      if (dAB > 2 * LEG + 1e-4 && store && warn) console.warn(`[kit] ${id} t=${t.toFixed(3)}: feet ${dAB.toFixed(3)} apart > 2 legs`);
      const up = new THREE.Vector3(0, 1, 0);
      const u = up.clone().sub(n.clone().multiplyScalar(up.dot(n))).normalize();
      u.applyAxisAngle(n, -num('bias', t, 0) * D2R);
      off = M.add(u.multiplyScalar(rho)).sub(C0);
    } else if (planted.length === 1) {
      const L = planted[0], F = legs[L].v;
      const at = num('at', t, [0, 0]);
      const hip = new THREE.Vector3(at[0], 0, at[1]).add(H0[L]);
      const dxz = Math.hypot(F.x - hip.x, F.z - hip.z);
      if (dxz > LEG && store && warn) console.warn(`[kit] ${id} t=${t.toFixed(3)}: ${L} can't reach its footprint (${dxz.toFixed(3)})`);
      const hy = F.y + Math.sqrt(Math.max(0, LEG * LEG - dxz * dxz));
      off = new THREE.Vector3(at[0], hy - H0[L].y, at[1]);
    } else {
      const at = num('at', t, [0, 0]);
      off = new THREE.Vector3(at[0], num('y', t, 0), at[1]);
    }
    // legs
    for (const L of ['legR', 'legL']) {
      const lm = legs[L];
      if (!lm) continue;
      if (lm.ang) { P[L] = lm.ang.slice(); continue; }
      const hip = H0[L].clone().add(off);
      let v = lm.v.clone().sub(hip);
      const dist = v.length();
      if (!planted.includes(L) && lm.v.y < 0.5 && dist < LEG) {
        // swinging foot near the ground: the foot reaches the target HEIGHT, heading toward the target (no ground dip)
        const h = Math.max(-LEG, Math.min(LEG, lm.v.y - hip.y)), r = Math.sqrt(LEG * LEG - h * h), hx = Math.hypot(v.x, v.z);
        v = hx > 1e-6 ? new THREE.Vector3(v.x / hx * r, h, v.z / hx * r) : new THREE.Vector3(0, -LEG, 0);
      }
      const d = v.normalize().applyQuaternion(qTi);
      const th = (yaw + (L === 'legR' ? -num('toeR', t, 12) : num('toeL', t, 12))) * D2R;
      const toe = new THREE.Vector3(-Math.sin(th), 0, -Math.cos(th)).applyQuaternion(qTi);
      P[L] = legAngles(L, d, toe, prevSol[L]);
      const rmax = num(L === 'legR' ? 'reachLegR' : 'reachLegL', t, 0);
      if (rmax > 0 && !planted.includes(L)) P[L + '.pos'] = add(P[L + '.pos'], [d.x, d.y, -d.z].map(c => c * Math.max(-rmax, Math.min(rmax, (dist - LEG) / PX))));
    }
    P.pos = [off.x, planted.length ? 0 : off.y, off.z];
    P.plant = planted.length ? 1 : 0;
    applyPose(R, P); R.root.updateMatrixWorld(true);
    const yEff = R.root.position.y;
    // arms
    const fwd = new THREE.Vector3(-Math.sin(yaw * D2R), 0, -Math.cos(yaw * D2R)), right = new THREE.Vector3(Math.cos(yaw * D2R), 0, -Math.sin(yaw * D2R));
    for (const L of ['armR', 'armL']) {
      const lm = limbAt(L, t);
      const sd = L === 'armR' ? 10 : 20;
      const sk = [nz(sd + 1, shake), nz(sd + 2, shake * 0.6), nz(sd + 3, shake * 0.8)];
      if (!lm) { P[L] = sk; continue; }
      if (lm.ang) { P[L] = add(lm.ang, sk); continue; }
      const twist = num(L === 'armR' ? 'twistR' : 'twistL', t, 0);
      if (lm.mode.startsWith('dir')) {
        const dw = right.clone().multiplyScalar(lm.v.x).add(new THREE.Vector3(0, lm.v.y, 0)).add(fwd.clone().multiplyScalar(lm.v.z)).normalize();
        P[L] = add(dirAngles(L, dw.applyQuaternion(qTi), twist, prevSol[L]), sk);
        continue;
      }
      const sh = wp(R.parts[L]);
      const v = lm.v.clone().sub(sh), dist = v.length();
      const d = v.normalize().applyQuaternion(qTi);
      P[L] = add(dirAngles(L, d, twist, prevSol[L]), sk);
      const rmax = num(L === 'armR' ? 'reachR' : 'reachL', t, 0); // slide out (or into the shoulder) to touch the target
      if (rmax > 0) P[L + '.pos'] = add(P[L + '.pos'], [d.x, d.y, -d.z].map(c => c * Math.max(-rmax, Math.min(rmax, (dist - ARM) / PX))));
    }
    // head
    const hd = num('head', t, [0, 0, 0]);
    let hang = [0, 0, 0];
    if (LK.head.length) {
      // gaze: every look key's target → head angles from the current eye, then interpolate the ANGLES (no flips when
      // the target jumps from far to near)
      const eye = wp(R.parts.head).add(new THREE.Vector3(0, 4.5 * PX, 0).applyQuaternion(qT));
      const [ia, ib] = segment(LK.head, t), ka = LK.head[ia], kb = LK.head[ib];
      const ang = k => aimHead(new THREE.Vector3(...evalPt(k.p.look, t)).sub(eye).normalize().applyQuaternion(qTi));
      const A = ang(ka), B = ang(kb);
      B[1] = near(B[1], A[1]);
      const e = easeOf(kb, 'look');
      const [hp, hy] = sample([[ka.t, A], [kb.t, B, e === 'smooth' ? 'sineInOut' : e]], t);
      const w = num('lookW', t, 1);
      hang = [Math.max(-55, Math.min(60, hp)) * w, Math.max(-85, Math.min(85, wrap(hy * D2R) * R2D)) * w, 0];
    }
    P.head = add(add(hd, hang), [nz(31, shake * 0.8), nz(32, shake * 0.8), nz(33, shake * 0.5)]);
    if (store) for (const L of ['legR', 'legL', 'armR', 'armL']) prevSol[L] = P[L];
    return { pose: P, yEff, off };
  }

  // pass 1: anchor `at` / `y` at the keys from the solved stance so one-foot and air phases continue seamlessly
  const nPlanted = t => ['legR', 'legL'].map(L => limbAt(L, t)).filter(l => l && l.mode && l.v.y <= EPS).length;
  const atKeys = [], yKeys = [];
  for (const k of keys) {
    if (nPlanted(k.t) === 2) { const s = solve(k.t); atKeys.push([k.t, [s.off.x, s.off.z], easeOf(k, 'at')]); yKeys.push([k.t, s.yEff, easeOf(k, 'y')]); }
    else if (k.p.at !== undefined) atKeys.push([k.t, k.p.at, easeOf(k, 'at')]);
  }
  NUM.at = dedupe(atKeys.sort((a, b) => a[0] - b[0]));
  for (const k of keys) {
    const n = nPlanted(k.t);
    if (n === 1) yKeys.push([k.t, solve(k.t).yEff, easeOf(k, 'y')]);
    else if (n === 0 && k.p.y !== undefined) yKeys.push([k.t, k.p.y, easeOf(k, 'y')]);
  }
  NUM.y = dedupe(yKeys.sort((a, b) => a[0] - b[0]));
  memoAng.clear();

  // pass 2: bake
  const tracks = {};
  const push = (name, t, v) => (tracks[name] ||= []).push([t, Array.isArray(v) ? v.map(r4) : r4(v), 'linear']);
  const n = Math.round((to - from) * FPS);
  // hit-stops this actor takes part in (opts.hits: 'all' for the victim, or a list of `by` values): hold the exact pose
  const stops = HITS.filter(h => h.stop && (opts.hits === 'all' || (opts.hits || [id, 'all']).includes(h.by)));
  const held = t => stops.find(h => t > h.t + 1e-6 && t < h.t + h.stop + 1e-6);
  for (let i = 0; i <= n; i++) {
    const t = +(from + i / FPS).toFixed(6);
    const h = held(t);
    const { pose: P } = solve(h ? h.t : t, !h);
    push('root.pos', t, P.pos); push('root.rot', t, P.rot); push('root.pivot', t, P.pivot); push('plant', t, P.plant);
    for (const p of PARTS) { push(p, t, P[p]); push(p + '.pos', t, P[p + '.pos']); }
    push('ghost', t, P.ghost);
  }
  const vk = keys.filter(k => k.p.vis !== undefined).map(k => [k.t, k.p.vis, 'step']);
  if (vk.length) tracks.vis = vk;
  for (const p of PARTS) { // unwrap angle tracks
    const k = tracks[p];
    for (let i = 1; i < k.length; i++) k[i][1] = k[i][1].map((v, j) => near(v, k[i - 1][1][j]));
  }
  const def = { id, skin, slim, tracks };
  if (opts.ghostColor) def.ghostColor = opts.ghostColor;
  return def;
}
function r4(v) { return Math.round(v * 1e4) / 1e4; }
function dedupe(ks) { const out = []; for (const k of ks) { if (out.length && Math.abs(out[out.length - 1][0] - k[0]) < 1e-6) out[out.length - 1] = k; else out.push(k); } return out; }

/** Append keys (e.g. a parked pose after a teleport) to baked tracks. pose: rig.js pose fields; ease 'step' = cut. */
export function appendPose(def, t, pose, ease = 'step') {
  const T = def.tracks;
  const set = (name, v) => (T[name] ||= []).push([t, v, ease]);
  if (pose.pos) set('root.pos', pose.pos);
  if (pose.rot) set('root.rot', pose.rot);
  if (pose.pivot !== undefined) set('root.pivot', pose.pivot);
  if (pose.plant !== undefined) set('plant', pose.plant);
  for (const p of PARTS) { if (pose[p]) set(p, pose[p]); if (pose[p + '.pos']) set(p + '.pos', pose[p + '.pos']); }
  if (pose.vis !== undefined) set('vis', pose.vis);
  if (pose.ghost !== undefined) set('ghost', pose.ghost);
}
