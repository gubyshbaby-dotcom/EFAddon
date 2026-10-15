// Authoring kit for the hand-keyed animation of «Гиперкуб» (owned by the animation engineer; used by anim/user.js,
// anim/victim.js, anim/clones.js). R6 style: limbs are FREE blocks. Nothing is pinned or solved to a socket; every limb
// is posed by angle AND translation ('<limb>.pos'), legs live in the root frame (legSpace 'root') so the torso leans,
// twists, drops and shifts on its own. Actors are BAKED at module load into dense 60 fps rig tracks, so rendering,
// scrubbing, VFX probes and check.mjs all see exactly the same motion (pure function of t, no Math.random).
//
// Key: K(t, params, ease = 'smooth', overrides = {param: ease})  — ease = how each param travels INTO this key.
//   params = any rig track ('root.pos' 'root.rot' 'root.pivot' 'plant' 'torso' 'torso.pos' 'head' 'head.pos'
//   'armR' 'armR.pos' 'armL' 'armL.pos' 'legR' 'legR.pos' 'legL' 'legL.pos'), short aliases (pos rot tp aR aRp aL aLp
//   lR lRp lL lLp hp), or layer controls:
//     life    0..n  idle life: slow, per-limb, never-in-sync drift of every part (default 1)
//     shake   0..n  tremble (charge, strain): fast small jitter, different per limb
//     calmR / calmL / calmH / calmLegs  0..1 multipliers of life+shake on armR / armL / head / legs (steady hand)
//     look    world point [x,y,z] (or t => point): the head aims at it, weighted by lookW (default 1 when look is set);
//             the keyed 'head' is added on top (chin tilt, attitude)
// Hit-stops: every HITS entry with stop > 0 that involves this actor (opts.hits) freezes ALL its tracks and layers from
// t to t + stop; afterwards the animation catches up over CATCH s (a snap out of the freeze), so keys after
// t + stop + CATCH sit at their real times.
// Contact: opts.reach = [{ t, limb: 'armL' | 'legR' ..., bone: 'fistL' | 'footR' | [part, [x,y,z] px], target: [x,y,z] | t => [x,y,z] }]
// moves '<limb>.pos' at key time t so the bone point lands exactly on the target (the limb thrusts out of its socket).
import * as THREE from 'three';
import { HITS } from '../timeline.js';
import { sample, ease, poseAt, makePlayer, applyPose, bonePoint, PX } from '../rig.js';

export const FPS = 60;
export const CATCH = 0.1;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const PARTS = ['torso', 'head', 'armR', 'armL', 'legR', 'legL'];
const ALIAS = { pos: 'root.pos', rot: 'root.rot', pivot: 'root.pivot', tp: 'torso.pos', hp: 'head.pos', aR: 'armR', aRp: 'armR.pos',
  aL: 'armL', aLp: 'armL.pos', lR: 'legR', lRp: 'legR.pos', lL: 'legL', lLp: 'legL.pos' };
const CONTROLS = ['life', 'shake', 'calmR', 'calmL', 'calmH', 'calmLegs', 'look', 'lookW'];
const CTRL_DEFAULT = { life: 1, shake: 0, calmR: 1, calmL: 1, calmH: 1, calmLegs: 1, lookW: 1 };

export const K = (t, p, e = 'smooth', ez = {}) => ({ t: +(+t).toFixed(5), p, e, ez });
export const F = 1 / 60;
/**
 * The pack's rhythm (hold → snap → held follow-through) as keys: HOLD pose `from` until t − n frames (slow drift into it
 * with 'sineInOut' from the previous key), SNAP in n frames to `over` at t, SETTLE to `to` over `settle` s (quadOut).
 */
export function snap(t, from, over, to = null, { n = 2, settle = 0.1, ease = 'linear', settleEase = 'quadOut', ez = {} } = {}) {
  const out = [K(t - n * F, from, 'sineInOut'), K(t, over, ease, ez)];
  if (to) out.push(K(t + settle, to, settleEase));
  return out;
}
export const lerp = (a, b, w) => Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * w) : a + (b - a) * w;
export const add = (a, b) => a.map((v, i) => v + (b[i] || 0));

/** Mirror a pose object (left ↔ right): for clones and mirrored strikes. */
export function mirror(P) {
  const out = {};
  const sw = n => n.replace(/(arm|leg)R/, '$1#').replace(/(arm|leg)L/, '$1R').replace('#', 'L')
    .replace(/^(a|l)R(p?)$/, '$1#$2').replace(/^(a|l)L(p?)$/, '$1R$2').replace('#', 'L');
  for (const [k, v] of Object.entries(P)) {
    const n = sw(k), full = ALIAS[n] || n;
    if (!Array.isArray(v)) { out[n] = v; continue; }
    if (full.endsWith('.pos') || full === 'root.pos') out[n] = [-v[0], v[1], v[2]];
    else if (full === 'torso' || full === 'head' || full === 'root.rot') out[n] = [v[0], -v[1], -v[2]];
    else out[n] = v.slice(); // limb angles mirror through the rig's L/R convention
  }
  return out;
}

// ---- deterministic smooth noise ----
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise(t, seed = 0) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), o = seed * 61.7;
  return (hash(i + o) * (1 - u) + hash(i + 1 + o) * u) * 2 - 1;
}
// layered noise: two octaves, different seeds → no visible period
const n2 = (t, f, s) => 0.7 * noise(t * f, s) + 0.3 * noise(t * f * 2.3 + 7.1, s + 0.37);

// life (deg / px amplitude, Hz): every axis its own frequency and seed so no two parts move in sync
const LIFE = {
  torso: [[1.6, 0.55], [2.2, 0.42], [1.4, 0.61]], 'torso.pos': [[0.35, 0.5], [0.45, 0.8], [0.35, 0.45]],
  head: [[2.6, 0.5], [3.5, 0.37], [2.2, 0.58]],
  armR: [[5, 0.62], [3.5, 0.5], [4, 0.71]], 'armR.pos': [[0.45, 0.6], [0.45, 0.75], [0.45, 0.52]],
  armL: [[5, 0.55], [3.5, 0.66], [4, 0.47]], 'armL.pos': [[0.45, 0.57], [0.45, 0.69], [0.45, 0.6]],
  legR: [[0.9, 0.35], [0.8, 0.3], [0.8, 0.4]], 'legR.pos': [[0.12, 0.33], [0.12, 0.41], [0.12, 0.3]],
  legL: [[0.9, 0.31], [0.8, 0.38], [0.8, 0.36]], 'legL.pos': [[0.12, 0.37], [0.12, 0.29], [0.12, 0.35]],
};
// tremble (charge, strain): small and slowish (6–9 Hz) so a trembling hold still reads (and measures) as a HOLD
const SHAKE = {
  torso: [[0.6, 7], [0.5, 6], [0.6, 8]], 'torso.pos': [[0.15, 7], [0.18, 8.5], [0.15, 6.5]],
  head: [[0.8, 8], [0.7, 6.5], [0.6, 9]],
  armR: [[1.2, 7.5], [1.0, 6], [1.1, 8.5]], 'armR.pos': [[0.15, 7], [0.15, 8], [0.15, 6]],
  armL: [[1.2, 6.5], [1.0, 8], [1.1, 7]], 'armL.pos': [[0.15, 8], [0.15, 6.5], [0.15, 7.5]],
  legR: [[0.3, 5], [0.2, 6], [0.3, 6.5]], legL: [[0.3, 6], [0.2, 5], [0.3, 7]],
};
const calmOf = n => n.startsWith('armR') ? 'calmR' : n.startsWith('armL') ? 'calmL' : n.startsWith('head') ? 'calmH' : n.startsWith('leg') ? 'calmLegs' : null;

/** Hit-stop time warp for an actor: the authored time that frame t shows. */
export function warpFor(hits) {
  const W = hits.filter(h => h.stop > 0).map(h => [h.t, h.stop]);
  return t => {
    for (const [h, s] of W) {
      if (t >= h && t < h + s) return h;
      if (t >= h + s && t < h + s + CATCH) return h + (t - h - s) * (s + CATCH) / CATCH;
    }
    return t;
  };
}

const rigs = new Map();
function rigFor(key, slim) { if (!rigs.has(key)) rigs.set(key, makePlayer(THREE, null, slim)); return rigs.get(key); }
function place(pl, pose) { applyPose(pl, pose); pl.root.updateMatrixWorld(true); }

/** World point of a bone (rig.js BONE_POINTS name, or [part, [x,y,z] px with z forward]) of a baked actor at t. */
export function boneAt(def, name, t) {
  const pl = rigFor('probe:' + def.id, def.slim);
  place(pl, poseAt(def, t));
  return worldPoint(pl, name);
}
function worldPoint(pl, name) {
  if (Array.isArray(name)) {
    const [part, [x, y, z]] = name;
    const v = new THREE.Vector3(x * PX, y * PX, -z * PX).applyMatrix4(pl.parts[part].matrixWorld);
    return [v.x, v.y, v.z];
  }
  const v = bonePoint(THREE, pl, name);
  return [v.x, v.y, v.z];
}
export const pointAt = (def, part, local, t) => boneAt(def, [part, local], t);

const evalPt = (v, t) => (typeof v === 'function' ? v(t) : v);

// ---- rotation tracks: eased segments slerp (shortest path between two orientations); 'smooth' keys stay Catmull-Rom ----
const flipOf = name => (name === 'torso' || name === 'head' ? [-1, 1, 1] : name.endsWith('L') ? [1, -1, -1] : [1, 1, 1]);
function toQ(name, a) {
  const f = flipOf(name);
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(f[0] * a[0] * D2R, f[1] * a[1] * D2R, f[2] * a[2] * D2R, 'ZYX'));
}
function fromQ(name, q, near) {
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX'), f = flipOf(name);
  const a = [f[0] * e.x * R2D, f[1] * e.y * R2D, f[2] * e.z * R2D];
  return near ? a.map((v, i) => v + 360 * Math.round((near[i] - v) / 360)) : a;
}
function sampleRot(name, keys, t, near) {
  const n = keys.length;
  if (n === 1 || t <= keys[0][0]) return keys[0][1].slice();
  if (t >= keys[n - 1][0]) return keys[n - 1][1].slice();
  let i = 1;
  while (i < n - 1 && keys[i][0] < t) i++;
  const [t0, a] = keys[i - 1], [t1, b, e] = keys[i];
  if (e === 'smooth' || e === 'step') return sample(keys, t);
  const w = ease(e, t1 > t0 ? (t - t0) / (t1 - t0) : 1);
  const ref = lerp(a, b, w);
  if (w <= 0 || w >= 1) return ref;
  return fromQ(name, toQ(name, a).slerp(toQ(name, b), w), near || ref);
}

/**
 * Limb angles [pitch, yaw, roll] pointing limb `name` ('armR' 'armL' 'legR' 'legL') along d = [right, up, forward] in its
 * parent frame (torso for arms, root for legSpace 'root' legs), twisted `twist` deg about its own axis (+90 = the inner
 * face / palm up for an arm held forward). Minimal rotation from hanging, so no gimbal flips. Left limbs mirror.
 */
export function aim(name, d, twist = 0) {
  const left = name.endsWith('L');
  const v = new THREE.Vector3(left ? -d[0] : d[0], d[1], -d[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), v);
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(v, twist * D2R));
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  return [e.x * R2D, e.y * R2D, e.z * R2D].map(x => +x.toFixed(2));
}

/**
 * Bake an actor. opts: { id, skin, slim, keys: [K...], from, to, hits: 'all' | [ids] (hit-stops that freeze it; default:
 * hits struck by this actor), reach: [...], cuts: [t...] (hard cuts: no in-between frame), ghostColor }
 * Returns a rig.js actor definition { id, skin, slim, legSpace: 'root', tracks } with dense 60 fps tracks.
 */
export function bake(opts) {
  const { id, keys, from = 0, to, cuts = [] } = opts;
  const hits = opts.hits === 'all' ? HITS : HITS.filter(h => (opts.hits || [id]).includes(h.by) || (h.by === 'all' && id === 'user'));
  const warp = warpFor(hits);
  // ---- sparse tracks ----
  const sp = {};
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const k of sorted) for (const [raw, v] of Object.entries(k.p)) {
    const n = ALIAS[raw] || raw;
    (sp[n] ||= []).push([k.t, v, k.ez[raw] || k.ez[n] || k.e]);
  }
  for (const n of Object.keys(sp)) if (sp[n].length && sp[n][0][2] === 'smooth' && sp[n].length === 1) sp[n][0][2] = 'linear';
  const ctrl = (n, t) => (sp[n] ? sample(sp[n], t) : CTRL_DEFAULT[n]);
  const lookAt = t => {
    const ks = sp.look; if (!ks) return null;
    let i = 0; while (i < ks.length - 1 && ks[i + 1][0] <= t) i++;
    // look targets do not interpolate between points; they switch with a smooth head turn (the head angle is smoothed below)
    if (t < ks[0][0]) return evalPt(ks[0][1], t);
    const a = evalPt(ks[i][1], t);
    if (i + 1 < ks.length) {
      const [t1, b, e] = ks[i + 1], t0 = ks[i][0];
      if (e !== 'step' && t > t0) { const w = sample([[t0, 0], [t1, 1, e === 'smooth' ? 'sineInOut' : e]], t); return lerp(a, evalPt(b, t), w); }
    }
    return a;
  };
  const pl = rigFor('bake:' + id, opts.slim);
  const prevRot = {};
  const rawPose = (t, extra) => {
    const te = warp(t);
    const p = { legSpace: 'root', vis: 1, ghost: opts.ghostColor ? 1 : 0 };
    p.pos = (sp['root.pos'] ? sample(sp['root.pos'], te) : [0, 0, 0]).slice();
    p.rot = (sp['root.rot'] ? sample(sp['root.rot'], te) : [0, 0, 0]).slice();
    p.pivot = sp['root.pivot'] ? sample(sp['root.pivot'], te) : 0.75;
    p.plant = sp.plant ? sample(sp.plant, te) : 0;
    const life = ctrl('life', te), shake = ctrl('shake', te);
    for (const n of PARTS) for (const tr of [n, n + '.pos']) {
      const v = sp[tr] ? (tr === n ? sampleRot(n, sp[tr], te, prevRot[n]) : sample(sp[tr], te).slice()) : [0, 0, 0];
      if (tr === n) prevRot[n] = v.slice();
      const c = calmOf(tr), calm = c ? ctrl(c, te) : 1;
      const L = LIFE[tr], S = SHAKE[tr], seed = (PARTS.indexOf(n) + 1) * 3.1 + (tr.endsWith('.pos') ? 17 : 0) + (opts.seed || 0) * 11;
      for (let k = 0; k < 3; k++) {
        if (L && life) v[k] += life * calm * L[k][0] * n2(te, L[k][1], seed + k);
        if (S && shake) v[k] += shake * calm * S[k][0] * noise(te * S[k][1], seed + k + 40);
      }
      p[tr] = v;
    }
    if (extra) for (const [tr, d] of Object.entries(extra)) p[tr] = add(p[tr], d);
    return { p, te };
  };
  // ---- contacts: solve '<limb>.pos' at key times so the bone point lands on the target ----
  const keyAt = (tr, t, ease) => {
    sp[tr] ||= [[0, [0, 0, 0], 'linear']];
    let k = sp[tr].find(q => Math.abs(q[0] - t) < 1e-6);
    if (!k) { k = [t, sample(sp[tr], t).slice(), ease || 'smooth']; sp[tr].push(k); sp[tr].sort((a, b) => a[0] - b[0]); }
    return k;
  };
  for (const r of opts.reach || []) {
    const tr = r.limb + '.pos';
    const k = keyAt(tr, r.t, r.ease);
    // aim: point the limb at the target first (twist = r.aim deg), the rest is the thrust out of the socket
    if (r.aim !== undefined) {
      // aim from the socket (or a hint offset), not from an already thrust pivot (that would feed back on itself)
      k[1] = (r.hint || [0, 0, 0]).slice();
      const ka = keyAt(r.limb, r.t, r.ease);
      for (let it = 0; it < 3; it++) {
        const { p } = rawPose(r.t);
        place(pl, p);
        const g = pl.parts[r.limb], pv = new THREE.Vector3(); g.getWorldPosition(pv);
        const tg = evalPt(r.target, r.t);
        const d = new THREE.Vector3(tg[0] - pv.x, tg[1] - pv.y, tg[2] - pv.z);
        const q = new THREE.Quaternion(); g.parent.getWorldQuaternion(q);
        d.applyQuaternion(q.invert());
        ka[1] = aim(r.limb, [d.x, d.y, -d.z], r.aim);
      }
    }
    for (let it = 0; it < 3; it++) {
      const { p } = rawPose(r.t);
      place(pl, p);
      const cur = worldPoint(pl, r.bone), tgt = evalPt(r.target, r.t);
      const d = new THREE.Vector3(tgt[0] - cur[0], tgt[1] - cur[1], tgt[2] - cur[2]);
      // delta → the limb's parent frame (px, z forward)
      const parent = pl.parts[r.limb].parent;
      const q = new THREE.Quaternion(); parent.getWorldQuaternion(q);
      d.applyQuaternion(q.invert()).divideScalar(PX);
      k[1] = [k[1][0] + d.x, k[1][1] + d.y, k[1][2] - d.z];
    }
    r.solved = k[1].map(v => +v.toFixed(2));
    if (opts.log) console.log(`[kit] ${id} reach ${r.limb} @${r.t}: ${tr} = [${r.solved.join(', ')}] px (|${Math.hypot(...r.solved).toFixed(1)}|)` +
      (r.aim !== undefined ? `  ${r.limb} = [${sample(sp[r.limb], r.t).map(v => v.toFixed(1)).join(', ')}]` : ''));
  }
  // ---- dense bake ----
  const out = {};
  const push = (n, t, v) => (out[n] ||= []).push([+t.toFixed(6), Array.isArray(v) ? v.map(x => +x.toFixed(4)) : +(+v).toFixed(4), 'linear']);
  const times = [];
  const n = Math.round((to - from) * FPS);
  for (let i = 0; i <= n; i++) times.push(from + i / FPS);
  for (const c of cuts) times.push(c - 0.0005);
  // hit-stop ends rarely fall on a frame: sample the exact end so the dense track holds to it
  for (const h of hits) if (h.stop > 0 && h.t >= from && h.t <= to) times.push(h.t + h.stop - 0.0002, h.t + h.stop);
  times.sort((a, b) => a - b);
  let headPrev = null;
  for (const t of times) {
    const { p, te } = rawPose(t);
    // head look-at
    const tgt = lookAt(te);
    const lw = sp.lookW ? sample(sp.lookW, te) : (tgt ? 1 : 0);
    if (tgt && lw > 0) {
      const hk = p.head; p.head = [0, 0, 0];
      place(pl, p);
      const hp = new THREE.Vector3(); pl.parts.head.getWorldPosition(hp); hp.y += 4 * PX;
      const d = new THREE.Vector3(tgt[0], tgt[1], tgt[2]).sub(hp).normalize();
      const q = new THREE.Quaternion(); pl.parts.torso.getWorldQuaternion(q);
      d.applyQuaternion(q.invert());
      let yaw = Math.atan2(-d.x, -d.z) * R2D, pitch = -Math.asin(Math.max(-1, Math.min(1, d.y))) * R2D;
      yaw = Math.max(-85, Math.min(85, yaw)); pitch = Math.max(-55, Math.min(60, pitch));
      p.head = [hk[0] + lw * pitch, hk[1] + lw * yaw, hk[2]];
    }
    headPrev = p.head;
    for (const tr of ['root.pos', 'root.rot', 'root.pivot', 'plant']) push(tr, t, tr === 'root.pos' ? p.pos : tr === 'root.rot' ? p.rot : tr === 'plant' ? p.plant : p.pivot);
    for (const nn of PARTS) { push(nn, t, p[nn]); push(nn + '.pos', t, p[nn + '.pos']); }
  }
  // vis / ghost stay sparse (use 'step' for blinks)
  if (sp.vis) out.vis = sp.vis.map(([t, v, e]) => [t, v, e === 'smooth' ? 'step' : e]);
  if (sp.ghost) out.ghost = sp.ghost;
  return { id, skin: opts.skin, slim: !!opts.slim, legSpace: 'root', ...(opts.ghostColor ? { ghostColor: opts.ghostColor } : {}), tracks: out, reach: opts.reach };
}

/** Study helper: a def that shows each pose for dt s at t = 0, dt, 2dt … (lab sheets; keep it < 3.4 s = the world). */
export function poseSheet(id, skin, slim, poses, base = {}, dt = 0.3) {
  const keys = poses.map((P, i) => K(i * dt, { plant: 1, pos: [0, 0, 0], life: 0, ...base, ...P }, 'step'));
  return { ...bake({ id, skin, slim, keys, from: 0, to: (poses.length - 1) * dt }), times: poses.map((_, i) => +(i * dt).toFixed(2)) };
}
