// Camera direction. Each shot: keys over time; a point is
//   [x,y,z] world
//   {a: actorId, b: bone, o: [dx,dy,dz]}        bone world point + world offset
//   {a, b, rel: [right, up, fwd]}               bone world point + offset in the actor's heading frame (POV, OTS)
//   {a, root: true, o | rel}                    the actor's root (feet) position + offset (smooth: no limb jitter)
//   {c: [x,y,z] | ca: actorId, r, h, ang}       orbit: centre (or the actor's root), radius, height, angle deg (ang 0 = +Z side)
// Keys: { t, pos, look, fov, roll?, e? (ease INTO this key) }. Cuts are hard (a new shot starts with its own keys);
// sub-shots (S4b …) are extra cuts inside a timeline shot. Shake from hits is added on top (shakeAt).
import { HITS, INSIDE, WORLD } from './timeline.js';
import { sample } from './rig.js';

const I = INSIDE;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const U = (o, root = true) => ({ a: 'user', root, o });

export const SHOTS = [
  // ---- S1 calm establishing: low wide side view, both fighters, slow drift (a held, quiet frame) ----
  { id: 'S1', t0: 0.0, t1: 1.2, keys: [
    { t: 0.0, pos: [5.6, 0.5, -1.25], look: [0.0, 0.9, -1.95], fov: 40, roll: 0 },
    { t: 1.2, pos: [5.35, 0.52, -1.45], look: [0.0, 0.9, -2.0], fov: 39, roll: 1, e: 'sineInOut' } ] },
  // ---- S2 low hero angle on him: punch-in on the charge snap, then a slow push while he trembles ----
  { id: 'S2', t0: 1.2, t1: 2.0, keys: [
    { t: 1.2, pos: { ca: 'user', r: 3.0, h: 0.2, ang: 118 }, look: { a: 'user', root: true, o: [0, 0.85, 0] }, fov: 54, roll: -2 },
    { t: 1.26, pos: { ca: 'user', r: 2.6, h: 0.17, ang: 124 }, look: { a: 'user', root: true, o: [0, 0.8, 0] }, fov: 44, roll: -6, e: 'quadOut' },
    { t: 2.0, pos: { ca: 'user', r: 2.3, h: 0.15, ang: 142 }, look: { a: 'user', root: true, o: [0, 0.8, 0] }, fov: 41, roll: -3, e: 'sineInOut' } ] },
  // ---- S3 close on the palm and the seed, his face behind; crash zoom 3.0–3.2 ----
  { id: 'S3', t0: 2.0, t1: 3.2, keys: [
    { t: 2.0, pos: U([1.62, 1.0, -1.5]), look: U([0.12, 1.12, -0.62]), fov: 42, roll: 3 },
    { t: 2.12, pos: U([1.6, 1.0, -1.48]), look: { a: 'user', b: 'fistR', o: [-0.24, 0.2, 0.24] }, fov: 41, roll: 2, e: 'quadOut' },
    { t: 3.0, pos: U([1.46, 1.02, -1.36]), look: { a: 'user', b: 'fistR', o: [-0.18, 0.18, 0.2] }, fov: 37, roll: 0, e: 'sineInOut' },
    { t: 3.2, pos: { a: 'user', b: 'fistR', o: [0.62, 0.22, -0.2] }, look: { a: 'user', b: 'fistR', o: [0, 0.1, 0] }, fov: 15, roll: -6, e: 'expoIn' } ] },
  // ---- S4 wide 3/4 from his right: the throw (cut on the action), the seed flies past her, the camera pulls back and
  //      tilts up as the tesseract unfolds; she turns ----
  { id: 'S4', t0: 3.2, t1: 4.0, keys: [
    { t: 3.2, pos: [2.0, 0.5, 0.7], look: [0.15, 1.0, -1.0], fov: 50, roll: -5 },
    { t: 3.34, pos: [2.8, 0.7, 0.8], look: [0.15, 1.25, -3.0], fov: 52, roll: -2, e: 'quadOut' },
    { t: 4.0, pos: [3.6, 1.05, 0.45], look: [0.05, 1.8, -5.0], fov: 54, roll: 0, e: 'sineOut' } ] },
  // ---- S5 low side tracking of the dash and the grab; on the plant it pushes in to both faces (the music stops) ----
  { id: 'S5', t0: 4.0, t1: 4.5, keys: [
    { t: 4.0, pos: [2.9, 0.5, -0.55], look: { a: 'user', b: 'chest', o: [0, 0, -0.8] }, fov: 54, roll: 3 },
    { t: 4.2, pos: [3.05, 0.62, -1.6], look: { a: 'user', b: 'chest', o: [0, 0.05, -0.6] }, fov: 52, roll: 1, e: 'sineOut' },
    { t: 4.27, pos: [2.5, 1.95, -2.8], look: [0.12, 1.45, -2.95], fov: 36, roll: 0, e: 'quadOut' },
    { t: 4.5, pos: [2.2, 1.9, -2.85], look: [0.12, 1.48, -2.95], fov: 32, roll: -1, e: 'sineInOut' } ] },
  // ---- S6 her POV: the knee rises and the sole flies at the lens (cut on the contact) ----
  { id: 'S6', t0: 4.5, t1: 4.8, keys: [
    { t: 4.5, pos: { a: 'victim', b: 'eyes', rel: [0, 0.08, 0.12] }, look: { a: 'user', b: 'head', o: [0, -0.1, 0] }, fov: 72, roll: -4 },
    { t: 4.68, pos: { a: 'victim', b: 'eyes', rel: [0, 0.08, 0.12] }, look: { a: 'user', b: 'chest', o: [0, -0.2, 0] }, fov: 80, roll: 0, e: 'sineInOut' },
    { t: 4.8, pos: { a: 'victim', b: 'eyes', rel: [0, 0.08, 0.12] }, look: { a: 'user', b: 'pelvis', o: [0, -0.2, 0] }, fov: 86, roll: 6, e: 'quadIn' } ] },
  // ---- S7 beside the cube: the impact, she flies at the camera's left INTO the face, is swallowed, the cube snaps shut ----
  { id: 'S7', t0: 4.8, t1: 5.7, keys: [
    { t: 4.8, pos: [2.7, 0.75, -3.75], look: { a: 'victim', b: 'chest', o: [0, -0.1, 0.35] }, fov: 50, roll: 4 },
    { t: 5.12, pos: [2.75, 1.05, -4.7], look: { a: 'victim', b: 'chest', o: [0, 0, -0.1] }, fov: 50, roll: 1, e: 'quadOut' },
    { t: 5.32, pos: [2.75, 1.15, -4.8], look: [0.3, 1.7, -5.4], fov: 50, roll: 0, e: 'sineInOut' },
    { t: 5.7, pos: [3.2, 1.25, -5.0], look: [0.2, 1.4, -4.1], fov: 60, roll: 0, e: 'sineInOut' } ] },
  // ---- S8 low from behind: he walks to the cube (tracking a little slower than him) ----
  { id: 'S8', t0: 5.7, t1: 6.4, keys: [
    { t: 5.7, pos: [1.35, 0.32, -0.55], look: [0.15, 1.3, -4.8], fov: 46, roll: 2 },
    { t: 6.4, pos: [1.15, 0.4, -1.0], look: [0.15, 1.5, -5.2], fov: 44, roll: 0, e: 'sineInOut' } ] },
  // ---- S9 the dive: from above his left shoulder straight into the face (the path stays left of and above him) ----
  { id: 'S9', t0: 6.4, t1: 6.6, keys: [
    { t: 6.4, pos: [-0.75, 2.25, -2.0], look: [-0.3, 1.8, -5.4], fov: 56, roll: 0 },
    { t: 6.6, pos: [-0.55, 2.05, -5.3], look: [-0.45, 1.95, -8.0], fov: 108, roll: 8, e: 'expoIn' } ] },
  { id: 'S10', t0: 6.6, t1: 8, keys: [
    { t: 6.6, pos: { c: I, r: 3.6, h: 0.9, ang: 20 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 54 },
    { t: 8, pos: { c: I, r: 3.0, h: 0.5, ang: 140 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50, e: 'sineInOut' } ] },
  { id: 'S11', t0: 8, t1: 8.8, keys: [
    { t: 8, pos: { c: I, r: 2.5, h: 0.4, ang: 150 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 52 },
    { t: 8.4, pos: { c: I, r: 2.4, h: 0.6, ang: 240 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50, e: 'expoInOut' },
    { t: 8.8, pos: { c: I, r: 2.5, h: 0.3, ang: 330 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 52, e: 'expoInOut' } ] },
  { id: 'S12', t0: 8.8, t1: 9.6, keys: [
    { t: 8.8, pos: { c: I, r: 0.6, h: 5.0, ang: 0 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 60 },
    { t: 9.6, pos: { c: I, r: 0.6, h: 4.2, ang: 160 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 58, e: 'sineIn' } ] },
  { id: 'S13', t0: 9.6, t1: 10.4, keys: [
    { t: 9.6, pos: { c: I, r: 3.2, h: 0.6, ang: 0 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 56 },
    { t: 10.4, pos: { c: I, r: 2.8, h: 0.2, ang: 400 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 52, e: 'quadIn' } ] },
  { id: 'S14', t0: 10.4, t1: 11.2, keys: [
    { t: 10.4, pos: { a: 'victim', b: 'head', o: [0.9, 0.15, 0.9] }, look: { a: 'victim', b: 'head', o: [0, 0, 0] }, fov: 34 },
    { t: 11.2, pos: { a: 'victim', b: 'head', o: [0.6, 0.1, 0.65] }, look: { a: 'victim', b: 'head', o: [0, 0, 0] }, fov: 30, e: 'sineIn' } ] },
  { id: 'S15', t0: 11.2, t1: 12, keys: [
    { t: 11.2, pos: add(I, [0.5, 2.4, 6.4]), look: add(I, [0, 0.9, 0]), fov: 52 },
    { t: 11.6, pos: add(I, [0.4, 1.9, 5.0]), look: add(I, [0, 0.95, 0]), fov: 48, e: 'quartIn' },
    { t: 12, pos: add(I, [0.2, 1.6, 4.4]), look: add(I, [0, 1.0, 0]), fov: 50, e: 'sineOut' } ] },
  { id: 'S16', t0: 12, t1: 12.4, keys: [
    { t: 12, pos: { a: 'victim', b: 'pelvis', o: [1.4, -1.6, 1.6] }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50 },
    { t: 12.4, pos: { a: 'victim', b: 'pelvis', o: [1.2, -2.0, 1.2] }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 54, e: 'sineOut' } ] },
  { id: 'S17', t0: 12.4, t1: 12.85, keys: [
    { t: 12.4, pos: { a: 'victim', b: 'chest', o: [0.6, -1.4, 0.8] }, look: { a: 'user', b: 'chest', o: [0, 0, 0] }, fov: 60 },
    { t: 12.85, pos: { a: 'victim', b: 'chest', o: [0.4, -1.1, 0.6] }, look: { a: 'user', b: 'chest', o: [0, 0, 0] }, fov: 70, e: 'expoIn' } ] },
  { id: 'S18', t0: 12.85, t1: 13.4, keys: [
    { t: 12.85, pos: [7.5, 0.5, 2.6], look: [0, 2.6, -6.6], fov: 58 },
    { t: 13.4, pos: [7.0, 0.6, 2.0], look: [0, 1.0, -6.6], fov: 54, e: 'quadOut' } ] },
  { id: 'S19', t0: 13.4, t1: 14.4, keys: [
    { t: 13.4, pos: add(WORLD.landing, [3.2, 0.7, 2.6]), look: add(WORLD.landing, [0, 0.8, 0]), fov: 48 },
    { t: 14.4, pos: add(WORLD.landing, [2.6, 0.6, 2.2]), look: add(WORLD.landing, [0, 0.8, 0]), fov: 46, e: 'sineOut' } ] },
  { id: 'S20', t0: 14.4, t1: 16.6, keys: [
    { t: 14.4, pos: { c: WORLD.landing, r: 3.8, h: 0.35, ang: 70 }, look: add(WORLD.landing, [0, 1.2, 0]), fov: 50 },
    { t: 16.6, pos: { c: WORLD.landing, r: 3.4, h: 0.5, ang: 20 }, look: add(WORLD.landing, [0, 1.35, 0]), fov: 46, e: 'sineInOut' } ] },
  { id: 'S21', t0: 16.6, t1: 18.2, keys: [
    { t: 16.6, pos: { a: 'user', b: 'head', o: [0.55, 0.05, -1.3] }, look: { a: 'user', b: 'head', o: [0, 0.02, 0] }, fov: 34 },
    { t: 18.2, pos: { a: 'user', b: 'head', o: [0.45, 0.05, -1.0] }, look: { a: 'user', b: 'head', o: [0, 0.02, 0] }, fov: 30, e: 'sineOut' } ] },
];

export function shotAt(t) { return SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1]; }

function resolve(p, f) {
  if (Array.isArray(p)) return p;
  if (p.c || p.ca) {
    const c = p.ca ? f.pose(p.ca).pos : p.c;
    const a = p.ang * Math.PI / 180;
    return [c[0] + p.r * Math.sin(a), c[1] + p.h, c[2] + p.r * Math.cos(a)];
  }
  let b;
  if (p.root) { const q = f.pose(p.a).pos; b = { x: q[0], y: q[1], z: q[2] }; } else b = f.bone(p.a, p.b);
  if (p.rel) {
    // heading frame of the actor: yaw 0 faces -Z, right = +X at yaw 0
    const y = f.pose(p.a).rot[1] * Math.PI / 180, [r, u, fw] = p.rel;
    return [b.x + r * Math.cos(y) - fw * Math.sin(y), b.y + u, b.z - r * Math.sin(y) - fw * Math.cos(y)];
  }
  return [b.x + (p.o?.[0] || 0), b.y + (p.o?.[1] || 0), b.z + (p.o?.[2] || 0)];
}
// orbit points interpolate in polar space so the camera sweeps around instead of cutting a chord
function lerpPoint(pa, pb, w, f) {
  if ((pa.c || pa.ca) && (pb.c || pb.ca)) {
    const ca = pa.ca ? f.pose(pa.ca).pos : pa.c, cb = pb.ca ? f.pose(pb.ca).pos : pb.c;
    const q = { c: ca.map((v, k) => v + (cb[k] - v) * w), r: pa.r + (pb.r - pa.r) * w, h: pa.h + (pb.h - pa.h) * w, ang: pa.ang + (pb.ang - pa.ang) * w };
    return resolve(q, f);
  }
  const a = resolve(pa, f), b = resolve(pb, f);
  return a.map((v, k) => v + (b[k] - v) * w);
}

/** Camera at time t: {pos, look, fov, roll, shot}. f.bone(actor, bone) gives world points of the posed actors. */
export function cameraAt(t, f) {
  const s = shotAt(t);
  const k = s.keys;
  let i = 1;
  while (i < k.length - 1 && k[i].t < t) i++;
  const a = k[Math.max(0, i - 1)], b = k[Math.min(k.length - 1, i)];
  const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
  const w = sample([[0, 0], [1, 1, b.e || 'linear']], u);
  const pos = lerpPoint(a.pos, b.pos, w, f), look = lerpPoint(a.look, b.look, w, f);
  const fov = a.fov + (b.fov - a.fov) * w, roll = (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * w;
  const sh = shakeAt(t);
  return { pos, look, fov, roll: roll + sh.roll, shake: sh, shot: s.id };
}

const KIND = { light: 0.35, medium: 0.7, heavy: 1.2, mega: 2.2 };
function noise(x, seed) { // smooth value noise in [-1,1]
  const i = Math.floor(x), fr = x - i, h = n => { const s = Math.sin((n + seed * 17.31) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const sm = fr * fr * (3 - 2 * fr);
  return h(i) * (1 - sm) + h(i + 1) * sm;
}
/** Shake from hits: decaying noise (degrees of yaw/pitch/roll). */
export function shakeAt(t) {
  let yaw = 0, pitch = 0, roll = 0;
  for (const h of HITS) {
    const dt = t - h.t;
    if (dt < 0 || dt > 0.6) continue;
    const amp = KIND[h.kind] * Math.exp(-dt * (h.kind === 'mega' ? 4.5 : 9));
    yaw += amp * noise(t * 38, h.t * 3.1);
    pitch += amp * noise(t * 41, h.t * 5.7 + 1);
    roll += amp * 0.6 * noise(t * 33, h.t * 7.3 + 2);
  }
  return { yaw, pitch, roll };
}
