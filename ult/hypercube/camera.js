// Camera direction. Each shot: keys over time; a point is [x,y,z] (world) or {a: actorId, b: bone, o: [dx,dy,dz]} (bone world
// point + world offset), or {c: [x,y,z], r, h, ang} (orbit: centre, radius, height, angle deg; ang 0 = +Z side).
// Cuts are hard (a new shot starts with its own keys). Shake from hits is added on top (shakeAt).
import { HITS, INSIDE, WORLD } from './timeline.js';
import { sample } from './rig.js';

const I = INSIDE;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const SHOTS = [
  { id: 'S1', t0: 0.0, t1: 0.8, keys: [
    { t: 0.0, pos: [0.75, 0.22, 1.9], look: [0.0, 1.45, -4.0], fov: 62 },
    { t: 0.8, pos: [0.62, 0.28, 1.35], look: [0.0, 1.35, -4.0], fov: 58, e: 'sineInOut' } ] },
  { id: 'S2', t0: 0.8, t1: 1.6, keys: [
    { t: 0.8, pos: { a: 'user', b: 'fistR', o: [0.85, 0.25, -1.1] }, look: { a: 'user', b: 'fistR', o: [0, 0.05, 0] }, fov: 46 },
    { t: 1.4, pos: { a: 'user', b: 'fistR', o: [0.7, 0.2, -0.9] }, look: { a: 'user', b: 'fistR', o: [0, 0.08, 0] }, fov: 42, e: 'sineInOut' },
    { t: 1.6, pos: { a: 'user', b: 'fistR', o: [0.55, 0.18, -0.7] }, look: { a: 'user', b: 'fistR', o: [0, 0.08, 0] }, fov: 24, e: 'expoIn' } ] },
  { id: 'S3', t0: 1.6, t1: 2.2, keys: [
    { t: 1.6, pos: [4.6, 1.3, 1.2], look: [0, 1.6, -4.6], fov: 56 },
    { t: 2.2, pos: [4.2, 1.5, 0.6], look: [0, 1.8, -5.2], fov: 52, e: 'sineOut' } ] },
  { id: 'S4', t0: 2.2, t1: 2.6, keys: [
    { t: 2.2, pos: { a: 'user', b: 'pelvis', o: [3.0, 0.2, -0.6] }, look: { a: 'victim', b: 'chest', o: [0, 0, 0.8] }, fov: 50 },
    { t: 2.6, pos: { a: 'user', b: 'pelvis', o: [2.6, 0.25, -0.9] }, look: { a: 'victim', b: 'chest', o: [0, 0, 0.5] }, fov: 46, e: 'quadOut' } ] },
  { id: 'S5', t0: 2.6, t1: 3.2, keys: [
    { t: 2.6, pos: [2.8, 1.6, -10.6], look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50 },
    { t: 3.2, pos: [2.2, 1.9, -11.2], look: [0, 1.9, -7.2], fov: 44, e: 'sineOut' } ] },
  { id: 'S6', t0: 3.2, t1: 3.4, keys: [
    { t: 3.2, pos: [0, 1.9, -3.2], look: [0, 1.9, -7.2], fov: 55 },
    { t: 3.4, pos: [0, 1.9, -6.6], look: [0, 1.9, -9.0], fov: 110, e: 'expoIn' } ] },
  { id: 'S7', t0: 3.4, t1: 4.8, keys: [
    { t: 3.4, pos: { c: I, r: 3.6, h: 0.9, ang: 20 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 54 },
    { t: 4.8, pos: { c: I, r: 3.0, h: 0.5, ang: 140 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50, e: 'sineInOut' } ] },
  { id: 'S8', t0: 4.8, t1: 5.6, keys: [
    { t: 4.8, pos: { c: I, r: 2.5, h: 0.4, ang: 150 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 52 },
    { t: 5.2, pos: { c: I, r: 2.4, h: 0.6, ang: 240 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50, e: 'expoInOut' },
    { t: 5.6, pos: { c: I, r: 2.5, h: 0.3, ang: 330 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 52, e: 'expoInOut' } ] },
  { id: 'S9', t0: 5.6, t1: 6.4, keys: [
    { t: 5.6, pos: { c: I, r: 0.6, h: 5.0, ang: 0 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 60 },
    { t: 6.4, pos: { c: I, r: 0.6, h: 4.2, ang: 160 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 58, e: 'sineIn' } ] },
  { id: 'S10', t0: 6.4, t1: 7.2, keys: [
    { t: 6.4, pos: { c: I, r: 3.2, h: 0.6, ang: 0 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 56 },
    { t: 7.2, pos: { c: I, r: 2.8, h: 0.2, ang: 400 }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 52, e: 'quadIn' } ] },
  { id: 'S11', t0: 7.2, t1: 8.0, keys: [
    { t: 7.2, pos: { a: 'victim', b: 'head', o: [0.9, 0.15, 0.9] }, look: { a: 'victim', b: 'head', o: [0, 0, 0] }, fov: 34 },
    { t: 8.0, pos: { a: 'victim', b: 'head', o: [0.6, 0.1, 0.65] }, look: { a: 'victim', b: 'head', o: [0, 0, 0] }, fov: 30, e: 'sineIn' } ] },
  { id: 'S12', t0: 8.0, t1: 8.8, keys: [
    { t: 8.0, pos: add(I, [0.5, 2.4, 6.4]), look: add(I, [0, 0.9, 0]), fov: 52 },
    { t: 8.4, pos: add(I, [0.4, 1.9, 5.0]), look: add(I, [0, 0.95, 0]), fov: 48, e: 'quartIn' },
    { t: 8.8, pos: add(I, [0.2, 1.6, 4.4]), look: add(I, [0, 1.0, 0]), fov: 50, e: 'sineOut' } ] },
  { id: 'S13', t0: 8.8, t1: 9.2, keys: [
    { t: 8.8, pos: { a: 'victim', b: 'pelvis', o: [1.4, -1.6, 1.6] }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 50 },
    { t: 9.2, pos: { a: 'victim', b: 'pelvis', o: [1.2, -2.0, 1.2] }, look: { a: 'victim', b: 'chest', o: [0, 0, 0] }, fov: 54, e: 'sineOut' } ] },
  { id: 'S14', t0: 9.2, t1: 9.65, keys: [
    { t: 9.2, pos: { a: 'victim', b: 'chest', o: [0.6, -1.4, 0.8] }, look: { a: 'user', b: 'chest', o: [0, 0, 0] }, fov: 60 },
    { t: 9.65, pos: { a: 'victim', b: 'chest', o: [0.4, -1.1, 0.6] }, look: { a: 'user', b: 'chest', o: [0, 0, 0] }, fov: 70, e: 'expoIn' } ] },
  { id: 'S15', t0: 9.65, t1: 10.2, keys: [
    { t: 9.65, pos: [7.5, 0.5, 2.6], look: [0, 2.6, -6.6], fov: 58 },
    { t: 10.2, pos: [7.0, 0.6, 2.0], look: [0, 1.0, -6.6], fov: 54, e: 'quadOut' } ] },
  { id: 'S16', t0: 10.2, t1: 11.2, keys: [
    { t: 10.2, pos: add(WORLD.landing, [3.2, 0.7, 2.6]), look: add(WORLD.landing, [0, 0.8, 0]), fov: 48 },
    { t: 11.2, pos: add(WORLD.landing, [2.6, 0.6, 2.2]), look: add(WORLD.landing, [0, 0.8, 0]), fov: 46, e: 'sineOut' } ] },
  { id: 'S17', t0: 11.2, t1: 13.4, keys: [
    { t: 11.2, pos: { c: WORLD.landing, r: 3.8, h: 0.35, ang: 70 }, look: add(WORLD.landing, [0, 1.2, 0]), fov: 50 },
    { t: 13.4, pos: { c: WORLD.landing, r: 3.4, h: 0.5, ang: 20 }, look: add(WORLD.landing, [0, 1.35, 0]), fov: 46, e: 'sineInOut' } ] },
  { id: 'S18', t0: 13.4, t1: 15.0, keys: [
    { t: 13.4, pos: { a: 'user', b: 'head', o: [0.55, 0.05, -1.3] }, look: { a: 'user', b: 'head', o: [0, 0.02, 0] }, fov: 34 },
    { t: 15.0, pos: { a: 'user', b: 'head', o: [0.45, 0.05, -1.0] }, look: { a: 'user', b: 'head', o: [0, 0.02, 0] }, fov: 30, e: 'sineOut' } ] },
];

export function shotAt(t) { return SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1]; }

function resolve(p, f) {
  if (Array.isArray(p)) return p;
  if (p.c) {
    const a = p.ang * Math.PI / 180;
    return [p.c[0] + p.r * Math.sin(a), p.c[1] + p.h, p.c[2] + p.r * Math.cos(a)];
  }
  const b = f.bone(p.a, p.b);
  return [b.x + (p.o?.[0] || 0), b.y + (p.o?.[1] || 0), b.z + (p.o?.[2] || 0)];
}
// orbit points interpolate in polar space so the camera sweeps around instead of cutting a chord
function lerpPoint(pa, pb, w, f) {
  if (pa.c && pb.c) {
    const q = { c: pa.c.map((v, k) => v + (pb.c[k] - v) * w), r: pa.r + (pb.r - pa.r) * w, h: pa.h + (pb.h - pa.h) * w, ang: pa.ang + (pb.ang - pa.ang) * w };
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
