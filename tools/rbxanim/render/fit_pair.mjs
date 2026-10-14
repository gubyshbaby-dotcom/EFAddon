// Find where a victim stands relative to the user when the pair's animations do not encode it
// (both HumanoidRootParts at one point and the bodies overlap). Searches the victim's HRP offset in front of
// the user and its facing, scoring body interpenetration (bad) against limb contact at the user's hit moments.
// node fit_pair.mjs <json dir> <userId> <victimId>   → best placements (use with render.mjs --place 1:x:z:yaw)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTracks, poseAt, speedDistance, mv } from './r6.js';

const [dir, uid, vid] = process.argv.slice(2);
const load = id => buildTracks(JSON.parse(readFileSync(join(dir, id + '.json'), 'utf8')));
const U = load(uid), V = load(vid);
const P = 1 / 16;
const BOX = { // half extents and centre offset from the part frame origin (blocks)
  Torso: { c: [0, 0, 0], h: [4 * P, 6 * P, 2 * P] }, Head: { c: [0, 4 * P, 0], h: [4 * P, 4 * P, 4 * P] },
  'Right Arm': { c: [P, -4 * P, 0], h: [2 * P, 6 * P, 2 * P] }, 'Left Arm': { c: [-P, -4 * P, 0], h: [2 * P, 6 * P, 2 * P] },
  'Right Leg': { c: [0, -6 * P, 0], h: [2 * P, 6 * P, 2 * P] }, 'Left Leg': { c: [0, -6 * P, 0], h: [2 * P, 6 * P, 2 * P] },
};
const NAMES = Object.keys(BOX);
function boxes(bt, t, ox, oz, yaw) {
  const pose = poseAt(bt.tracks, Math.min(t, bt.length), false, speedDistance(bt, Math.min(t, bt.length)));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const Ry = [c, 0, s, 0, 1, 0, -s, 0, c];
  const out = {};
  for (const n of NAMES) {
    const fr = n === 'Torso' ? { pivot: pose.torso.pos, rot: pose.torso.rot } : pose.parts[n];
    const cl = mv(fr.rot, BOX[n].c);
    let ctr = [fr.pivot[0] + cl[0], fr.pivot[1] + cl[1], fr.pivot[2] + cl[2]];
    ctr = mv(Ry, ctr); ctr[0] += ox; ctr[2] += oz;
    const R = mulR(Ry, fr.rot);
    out[n] = { ctr, R, h: BOX[n].h };
  }
  return out;
}
function mulR(a, b) { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; }
function local(b, p) { // point → box-local coordinates
  const d = [p[0] - b.ctr[0], p[1] - b.ctr[1], p[2] - b.ctr[2]];
  return [b.R[0] * d[0] + b.R[3] * d[1] + b.R[6] * d[2], b.R[1] * d[0] + b.R[4] * d[1] + b.R[7] * d[2], b.R[2] * d[0] + b.R[5] * d[1] + b.R[8] * d[2]];
}
function distToBox(b, p) { const l = local(b, p); let s = 0; for (let k = 0; k < 3; k++) { const e = Math.max(0, Math.abs(l[k]) - b.h[k]); s += e * e; } return Math.sqrt(s); }
function depthIn(b, p) { const l = local(b, p); let m = 1e9; for (let k = 0; k < 3; k++) m = Math.min(m, b.h[k] - Math.abs(l[k])); return Math.max(0, m); }
function samples(b) { // centre + 6 face centres + 8 corners
  const pts = [[0, 0, 0]];
  for (let k = 0; k < 3; k++) for (const sg of [-1, 1]) { const q = [0, 0, 0]; q[k] = sg * b.h[k] * 0.9; pts.push(q); }
  for (const a of [-1, 1]) for (const bb of [-1, 1]) for (const cc of [-1, 1]) pts.push([a * b.h[0] * 0.9, bb * b.h[1] * 0.9, cc * b.h[2] * 0.9]);
  return pts.map(q => { const w = [b.R[0] * q[0] + b.R[1] * q[1] + b.R[2] * q[2], b.R[3] * q[0] + b.R[4] * q[1] + b.R[5] * q[2], b.R[6] * q[0] + b.R[7] * q[1] + b.R[8] * q[2]]; return [b.ctr[0] + w[0], b.ctr[1] + w[1], b.ctr[2] + w[2]]; });
}
// user's hit moments: its markers, or else the frames of fastest limb-tip motion
const tips = { 'Right Arm': [P, -10 * P, 0], 'Left Arm': [-P, -10 * P, 0], 'Right Leg': [0, -12 * P, 0], 'Left Leg': [0, -12 * P, 0] };
let hits = U.events.filter(e => /dmg|hit|knock|kick|slap|punch|launch|explode|throw/i.test(e.name)).map(e => e.t);
if (!hits.length) {
  const L = U.length, sp = [];
  for (let t = 0.05; t < L; t += 1 / 30) {
    const a = boxes(U, t - 1 / 30, 0, 0, 0), b = boxes(U, t, 0, 0, 0);
    let m = 0; for (const n of Object.keys(tips)) m = Math.max(m, Math.hypot(...[0, 1, 2].map(k => b[n].ctr[k] - a[n].ctr[k])));
    sp.push({ t, m });
  }
  sp.sort((x, y) => y.m - x.m);
  hits = [];
  for (const s of sp) { if (hits.every(h => Math.abs(h - s.t) > 0.25)) hits.push(s.t); if (hits.length >= 4) break; }
}
const L = Math.min(U.length, V.length);
const times = []; for (let t = 0; t <= L; t += 0.05) times.push(t);
function score(ox, oz, yaw) {
  let pen = 0;
  for (const t of times) {
    const ub = boxes(U, t, 0, 0, 0), vb = boxes(V, t, ox, oz, yaw);
    for (const un of NAMES) for (const vn of NAMES) {
      for (const p of samples(vb[vn])) pen += depthIn(ub[un], p);
    }
  }
  pen /= times.length;
  let contact = 0;
  for (const t of hits) {
    const ub = boxes(U, t, 0, 0, 0), vb = boxes(V, t, ox, oz, yaw);
    let best = 1e9;
    for (const [n, tip] of Object.entries(tips)) {
      const w = mv(ub[n].R, [tip[0] - BOX[n].c[0], tip[1] - BOX[n].c[1], tip[2] - BOX[n].c[2]]);
      const p = [ub[n].ctr[0] + w[0], ub[n].ctr[1] + w[1], ub[n].ctr[2] + w[2]];
      for (const vn of NAMES) best = Math.min(best, distToBox(vb[vn], p));
    }
    contact += best;
  }
  contact /= Math.max(1, hits.length);
  return { s: pen * 40 + contact * 3, pen, contact };
}
const res = [];
for (const yawDeg of [180, 0, 90, -90]) for (let oz = 0; oz >= -4; oz -= 0.125) for (let ox = -1; ox <= 1.001; ox += 0.25) {
  const r = score(ox, oz, yawDeg * Math.PI / 180);
  res.push({ ox: +ox.toFixed(3), oz: +oz.toFixed(3), yaw: yawDeg, ...r });
}
res.sort((a, b) => a.s - b.s);
const base = score(0, 0, 0);
console.log(`hits at ${hits.map(h => h.toFixed(2)).join(', ')} | as authored (same HRP): pen ${base.pen.toFixed(3)} contact ${base.contact.toFixed(3)}`);
for (const r of res.slice(0, 5)) console.log(`--place 1:${r.ox}:${r.oz}:${r.yaw}   score ${r.s.toFixed(3)} pen ${r.pen.toFixed(3)} contact ${r.contact.toFixed(3)}`);
