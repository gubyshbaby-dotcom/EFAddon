// Motion / contact / camera checks for the ult (runs in Node, no browser): node tools/check.mjs [--from 0] [--to 15] [--fps 60] [--quiet]
// Everything is a pure function of t, so we pose the rigs exactly like scene.js does and measure:
//   HIT    every HITS entry: nearest striking limb surface → victim body surface at the contact frame (want ≤ 0.10 bl,
//          i.e. touching; negative = depth inside). Also whether the victim is on screen at that frame.
//   FREEZE during each hit-stop window the striker and victim must hold (max part motion, want < 0.01 bl)
//   PEN    actor-vs-victim interpenetration deeper than 2 px outside the hit windows (merged intervals)
//   POP    a visible actor jumps > 0.45 bl in one frame without a cut / blink (vis 0 → 1) / space switch
//          (POPHIT = the same right at a hit: a knockback/strike smear — fine if the VFX covers it, keep it to 1–2 frames)
//   SLIDE  a planted foot (plant > 0.5, the leg's lowest corner on the ground in two frames) skating > 0.015 bl/frame
//   GROUND body box corners below the grass (world space, y < -0.03) — except the victim in the crater (≥ 9.85)
//   CAMIN  camera within 0.08 bl of / inside an actor box;  CAMLOW camera below the ground in the world
//   OFF    both key actors off screen for > 0.15 s inside a shot
//   SYNC   two clones moving their limbs the same way at the same time (correlation > 0.97 over 0.25 s)
import * as THREE from 'three';
import * as TL from '../timeline.js';
import { poseAt, makePlayer, applyPose, bonePoint, PX } from '../rig.js';
import { cameraAt, shotAt } from '../camera.js';
import USER from '../anim/user.js';
import VICTIM from '../anim/victim.js';
import CLONES from '../anim/clones.js';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? +a[i + 1] : d; };
const FROM = opt('--from', 0), TO = opt('--to', TL.LENGTH - 0.6), FPS = opt('--fps', 60);
const QUIET = a.includes('--quiet');

const mk = def => ({ def, pl: makePlayer(THREE, null, def.slim) });
const actors = { user: mk(USER), victim: mk(VICTIM) };
CLONES.forEach((c, i) => (actors[c.id || 'clone' + i] = mk({ skin: USER.skin, slim: USER.slim, ...c })));
const ids = Object.keys(actors), cloneIds = ids.filter(i => i !== 'user' && i !== 'victim');
const scene = new THREE.Scene();
for (const id of ids) scene.add(actors[id].pl.root);

// part boxes in part-local pixels (same as makePlayer)
function boxes(slim) {
  const aw = slim ? 3 : 4;
  return {
    torso: [[-4, -6, -2], [4, 6, 2]], head: [[-4, 0, -4], [4, 8, 4]],
    armR: [[-1, -10, -2], [aw - 1, 2, 2]], armL: [[-(aw - 1), -10, -2], [1, 2, 2]],
    legR: [[-2, -12, -2], [2, 0, 2]], legL: [[-2, -12, -2], [2, 0, 2]],
  };
}
const BOX = { user: boxes(USER.slim), victim: boxes(VICTIM.slim) };
for (const c of cloneIds) BOX[c] = BOX.user;
// sample points on a box surface (3×5×3 grid, surface only), part-local blocks
function samples(b) {
  const out = [];
  const [lo, hi] = b;
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 2; k++) {
    if (!(i % 2 === 0 || j % 4 === 0 || k % 2 === 0)) continue;
    out.push(new THREE.Vector3(lo[0] + (hi[0] - lo[0]) * i / 2, lo[1] + (hi[1] - lo[1]) * j / 4, lo[2] + (hi[2] - lo[2]) * k / 2).multiplyScalar(PX));
  }
  return out;
}
const SAMPLES = {};
for (const id of ids) { SAMPLES[id] = {}; for (const [p, b] of Object.entries(BOX[id])) SAMPLES[id][p] = samples(b); }

const inv = new THREE.Matrix4(), tmp = new THREE.Vector3();
// signed distance (blocks) from a world point to a part box of actor id (negative = inside)
function sdBox(id, part, pw) {
  const g = actors[id].pl.parts[part];
  inv.copy(g.matrixWorld).invert();
  tmp.copy(pw).applyMatrix4(inv).divideScalar(PX); // part-local px
  const [lo, hi] = BOX[id][part];
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], e = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
  const q = [Math.abs(tmp.x - c[0]) - e[0], Math.abs(tmp.y - c[1]) - e[1], Math.abs(tmp.z - c[2]) - e[2]];
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return (outside + Math.min(Math.max(q[0], q[1], q[2]), 0)) * PX;
}
// nearest approach of actor A's parts to the victim: {d, part, vpart}
function approach(id, parts = Object.keys(BOX[id])) {
  let best = { d: 1e9 };
  const w = new THREE.Vector3();
  for (const p of parts) {
    const g = actors[id].pl.parts[p];
    for (const s of SAMPLES[id][p]) {
      w.copy(s).applyMatrix4(g.matrixWorld);
      for (const vp of Object.keys(BOX.victim)) {
        const d = sdBox('victim', vp, w);
        if (d < best.d) best = { d, part: p, vpart: vp };
      }
    }
  }
  return best;
}
const poses = {};
function poseAll(t) {
  for (const id of ids) { poses[id] = poseAt(actors[id].def, t); applyPose(actors[id].pl, poses[id]); }
  scene.updateMatrixWorld(true);
}
const f = { t: 0, space: 'world', pose: id => poses[id], bone: (id, name) => bonePoint(THREE, actors[id].pl, name) };
const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.03, 400);
function camAt(t) {
  f.t = t; f.space = TL.spaceAt(t);
  const c = cameraAt(t, f);
  cam.position.set(...c.pos); cam.fov = c.fov; cam.updateProjectionMatrix(); cam.up.set(0, 1, 0); cam.lookAt(...c.look);
  cam.updateMatrixWorld(true);
  return c;
}
function onScreen(id) {
  if (poses[id].vis < 0.5) return false;
  const p = bonePoint(THREE, actors[id].pl, 'chest').project(cam);
  return p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
}
// world positions of all part box corners (for POP / GROUND / FREEZE)
function corners(id) {
  const out = [];
  for (const [p, [lo, hi]] of Object.entries(BOX[id])) {
    const g = actors[id].pl.parts[p];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push(new THREE.Vector3(x * PX, y * PX, z * PX).applyMatrix4(g.matrixWorld));
  }
  return out;
}

const report = [];
const say = s => report.push(s);

// ---- HIT contact + FREEZE ----
const strikers = h => h.by === 'user' ? ['user'] : h.by === 'clone' ? cloneIds : h.by === 'all' ? ['user', ...cloneIds] : [h.by];
let hitBad = 0;
for (const h of TL.HITS) {
  if (h.t < FROM || h.t > TO) continue;
  poseAll(h.t); camAt(h.t);
  const vis = onScreen('victim') ? '' : '  (victim OFF SCREEN)';
  const ss = strikers(h).filter(id => actors[id] && poses[id].vis > 0.5);
  if (!ss.length) { say(`HIT ${h.t.toFixed(2)} ${h.kind} ${h.by}: NO VISIBLE STRIKER  ✗`); hitBad++; continue; }
  const res = ss.map(id => ({ id, ...approach(id) })).sort((x, y) => x.d - y.d);
  const show = h.by === 'all' ? res : res.slice(0, 1);
  for (const r of show) {
    const ok = r.d <= 0.10 && r.d > -0.12;
    if (!ok) hitBad++;
    say(`HIT ${h.t.toFixed(2)} ${h.kind.padEnd(6)} ${r.id}.${r.part} → victim.${r.vpart}  ${r.d >= 0 ? 'gap' : 'depth'} ${Math.abs(r.d).toFixed(3)} bl  ${ok ? '✓' : '✗'}${vis}   [${h.move}]`);
  }
  if (h.stop) {
    const snap = id => corners(id);
    const c0 = Object.fromEntries(['victim', ...ss].map(id => [id, snap(id)]));
    poseAll(h.t + h.stop - 1e-4);
    let mx = 0;
    for (const id of Object.keys(c0)) snap(id).forEach((p, k) => (mx = Math.max(mx, p.distanceTo(c0[id][k]))));
    if (mx > 0.01) say(`FREEZE ${h.t.toFixed(2)} (+${h.stop}s): motion ${mx.toFixed(3)} bl during the hit-stop  ✗`);
  }
}

// ---- per-frame scan ----
const hitWin = id => TL.HITS.filter(h => strikers(h).includes(id)).map(h => [h.t - 0.07, h.t + (h.stop || 0) + 0.09]);
const WIN = Object.fromEntries(ids.map(id => [id, hitWin(id)]));
const inWin = (id, t) => WIN[id].some(([x, y]) => t >= x && t <= y);
const runs = new Map(), list = []; // open run per key; finished runs in order
function mark(key, t, val) {
  const r = runs.get(key);
  if (r && t - r[1] <= 1.5 / FPS) { r[1] = t; r[2] = Math.max(r[2], val); return; }
  const n = [t, t, val]; runs.set(key, n); list.push([key, n]);
}
let prev = null, offRun = 0, offStart = 0;
const hist = {}; // clone limb angle history for SYNC
const N = Math.round((TO - FROM) * FPS);
for (let i = 0; i <= N; i++) {
  const t = FROM + i / FPS;
  poseAll(t);
  const c = camAt(t);
  const space = TL.spaceAt(t);
  const shot = c.shot;
  const cur = {};
  for (const id of ids) {
    if (poses[id].vis < 0.5) continue;
    cur[id] = corners(id);
    // GROUND
    if (space === 'world' && !(id === 'victim' && t >= 9.85)) {
      const low = Math.min(...cur[id].map(p => p.y));
      if (low < -0.03) mark(`GROUND ${id}`, t, -low);
    }
    // PEN vs victim
    if (id !== 'victim' && poses.victim.vis > 0.5 && !inWin(id, t)) {
      const ap = approach(id);
      if (ap.d < -2 * PX) mark(`PEN ${id}.${ap.part}→victim.${ap.vpart}`, t, -ap.d);
    }
    // CAMIN
    for (const p of Object.keys(BOX[id])) {
      const d = sdBox(id, p, cam.position);
      if (d < 0.08) { mark(`CAMIN ${shot} ${id}.${p}`, t, 0.08 - d); break; }
    }
  }
  if (space === 'world' && cam.position.y < 0.05) mark(`CAMLOW ${shot}`, t, 0.05 - cam.position.y);
  // POP
  if (prev && prev.shot === shot && prev.space === space) {
    for (const id of Object.keys(cur)) {
      if (!prev.cur[id]) continue; // just appeared (blink) — fine
      let mx = 0;
      cur[id].forEach((p, k) => (mx = Math.max(mx, p.distanceTo(prev.cur[id][k]))));
      if (mx > 0.45) mark(`${inWin(id, t) || (id === 'victim' && TL.HITS.some(h => t >= h.t && t <= h.t + 0.12)) ? 'POPHIT' : 'POP'} ${id} (${shot})`, t, mx);
    }
  }
  // SLIDE
  const feet = {};
  for (const id of Object.keys(cur)) {
    if (!(poses[id].plant > 0.5) || space !== 'world') continue;
    for (const leg of ['legR', 'legL']) {
      const g = actors[id].pl.parts[leg];
      let lo = null;
      for (const x of [-2, 2]) for (const z of [-2, 2]) for (const y of [0, -12]) {
        const w = new THREE.Vector3(x * PX, y * PX, z * PX).applyMatrix4(g.matrixWorld);
        if (!lo || w.y < lo.y) lo = w;
      }
      feet[id + '.' + leg] = lo;
      const pf = prev?.feet?.[id + '.' + leg];
      if (pf && prev.shot === shot && lo.y < poses[id].pos[1] + 0.02 && pf.y < poses[id].pos[1] + 0.02) {
        const d = Math.hypot(lo.x - pf.x, lo.z - pf.z);
        if (d > 0.015) mark(`SLIDE ${id}.${leg}`, t, d);
      }
    }
  }
  // OFF
  const anyOn = onScreen('victim') || onScreen('user') || cloneIds.some(onScreen);
  if (!anyOn) { if (!offRun) offStart = t; offRun++; } else { if (offRun / FPS > 0.15) say(`OFF ${shotAt(offStart).id} ${offStart.toFixed(2)}–${t.toFixed(2)}: no actor on screen`); offRun = 0; }
  // SYNC history
  for (const id of cloneIds) if (poses[id].vis > 0.5) (hist[id] ||= []).push([t, ...['armR', 'armL', 'legR', 'legL', 'torso'].flatMap(p => poses[id][p])]); else (hist[id] ||= []).push(null);
  prev = { cur, shot, space, feet };
}
for (const [key, [t0, t1, v]] of list) say(`${key.split(' ')[0]} ${key.split(' ').slice(1).join(' ')}  ${t0.toFixed(2)}–${t1.toFixed(2)}  worst ${v.toFixed(3)} bl`);

// SYNC: velocity correlation of clone pairs over sliding 0.25 s windows
const W = Math.round(0.25 * FPS);
for (let x = 0; x < cloneIds.length; x++) for (let y = x + 1; y < cloneIds.length; y++) {
  const A = hist[cloneIds[x]], B = hist[cloneIds[y]];
  let inRun = null;
  for (let i = W; i < (A?.length || 0); i += 3) {
    let sab = 0, saa = 0, sbb = 0, ok = true;
    for (let k = i - W + 1; k <= i; k++) {
      if (!A[k] || !A[k - 1] || !B[k] || !B[k - 1]) { ok = false; break; }
      for (let j = 1; j < A[k].length; j++) { const da = A[k][j] - A[k - 1][j], db = B[k][j] - B[k - 1][j]; sab += da * db; saa += da * da; sbb += db * db; }
    }
    const r = ok && saa > 1 && sbb > 1 ? sab / Math.sqrt(saa * sbb) : 0;
    const t = A[i] ? A[i][0] : 0;
    if (r > 0.97) { if (!inRun) inRun = [t - 0.25, t]; else inRun[1] = t; }
    else if (inRun) { say(`SYNC ${cloneIds[x]}~${cloneIds[y]}  ${inRun[0].toFixed(2)}–${inRun[1].toFixed(2)}`); inRun = null; }
  }
  if (inRun) say(`SYNC ${cloneIds[x]}~${cloneIds[y]}  ${inRun[0].toFixed(2)}–${inRun[1].toFixed(2)}`);
}

const kinds = {};
for (const l of report) { const k = l.split(' ')[0]; if (k === 'HIT' && !l.includes('✗')) continue; kinds[k] = (kinds[k] || 0) + 1; }
for (const l of report) if (!QUIET || !l.startsWith('HIT') || l.includes('✗')) console.log(l);
console.log('SUMMARY', JSON.stringify({ hitsChecked: TL.HITS.filter(h => h.t >= FROM && h.t <= TO).length, hitBad, ...kinds }));
