// Limb travel and self-clipping of one actor def: node tools/limbstats.mjs <def module> [--from 0] [--to 3] [--pack]
// travel: range (max−min, px) of each fist / sole relative to the torso centre, in the actor's root frame (so a limb
// that only rotates with the torso doesn't count), along forward (z) and vertical (y). The pack's run is the yardstick.
// SELF: frames where an arm or leg box sinks > 1 px into the head or another limb box (e.g. a fist through the face).
// JERK: per-frame acceleration (second difference, px/frame²) of fists, soles, head and pelvis relative to the root —
// spikes are the 'twitchy' frames (a sudden change of direction or speed); listed worst-first with their times.
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { makePlayer, applyPose, poseAt, PX } from '../rig.js';
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const def = (await import(pathToFileURL(resolve(a[0])).href)).default;
const from = +opt('--from', 0.5), to = +opt('--to', 2.5), fps = 60;
const pl = makePlayer(THREE, null, def.slim);
const BOX = { torso: [[-4, -6, -2], [4, 6, 2]], head: [[-4, 0, -4], [4, 8, 4]], armR: [[-1, -10, -2], [3, 2, 2]], armL: [[-3, -10, -2], [1, 2, 2]], legR: [[-2, -12, -2], [2, 0, 2]], legL: [[-2, -12, -2], [2, 0, 2]] };
const PAIRS = [['armR', 'head'], ['armL', 'head'], ['armR', 'armL'], ['legR', 'legL'], ['armR', 'legR'], ['armL', 'legL']];
const inv = new THREE.Matrix4(), tmp = new THREE.Vector3();
function depth(pa, pb) { // max depth (px) of pa's box corners/edge points inside pb's box
  let worst = 0; const [lo, hi] = BOX[pa], [blo, bhi] = BOX[pb];
  inv.copy(pl.parts[pb].matrixWorld).invert();
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 2; k++) {
    tmp.set(lo[0] + (hi[0] - lo[0]) * i / 2, lo[1] + (hi[1] - lo[1]) * j / 4, lo[2] + (hi[2] - lo[2]) * k / 2).multiplyScalar(PX).applyMatrix4(pl.parts[pa].matrixWorld).applyMatrix4(inv).divideScalar(PX);
    const d = Math.min(tmp.x - blo[0], bhi[0] - tmp.x, tmp.y - blo[1], bhi[1] - tmp.y, tmp.z - blo[2], bhi[2] - tmp.z);
    if (d > worst) worst = d;
  }
  return worst;
}
const pts = { fistR: ['armR', [1, -10, 0]], fistL: ['armL', [-1, -10, 0]], soleR: ['legR', [0, -12, 0]], soleL: ['legL', [0, -12, 0]] };
const rng = {}; const self = {}; const rootInv = new THREE.Matrix4(); const hist = {};
for (let t = from; t <= to + 1e-9; t += 1 / fps) {
  applyPose(pl, poseAt(def, t)); pl.root.updateMatrixWorld(true);
  rootInv.copy(pl.root.matrixWorld).invert();
  const tc = new THREE.Vector3().setFromMatrixPosition(pl.parts.torso.matrixWorld).applyMatrix4(rootInv);
  for (const [n, [part, l]] of Object.entries({ ...pts, head: ['head', [0, 8, 0]], pelvis: ['torso', [0, -6, 0]] })) {
    const pw = new THREE.Vector3(l[0] * PX, l[1] * PX, l[2] * PX).applyMatrix4(pl.parts[part].matrixWorld).applyMatrix4(rootInv);
    (hist[n] ||= []).push([+t.toFixed(3), pw.clone().divideScalar(PX)]);
    if (!pts[n]) continue;
    const p = pw.sub(tc).divideScalar(PX);
    const r = (rng[n] ||= { z: [1e9, -1e9], y: [1e9, -1e9] });
    r.z = [Math.min(r.z[0], -p.z), Math.max(r.z[1], -p.z)]; r.y = [Math.min(r.y[0], p.y), Math.max(r.y[1], p.y)];
  }
  for (const [pa, pb] of PAIRS) { const d = Math.max(depth(pa, pb), depth(pb, pa)); if (d > 1) (self[pa + '×' + pb] ||= []).push([+t.toFixed(3), +d.toFixed(1)]); }
}
for (const [n, r] of Object.entries(rng)) console.log(n.padEnd(6), `forward ${r.z[0].toFixed(1)}…${r.z[1].toFixed(1)} (range ${(r.z[1] - r.z[0]).toFixed(1)} px)   vertical ${r.y[0].toFixed(1)}…${r.y[1].toFixed(1)} (range ${(r.y[1] - r.y[0]).toFixed(1)} px)`);
const frames = Math.round((to - from) * fps) + 1;
const jerks = [];
for (const [n, h] of Object.entries(hist)) for (let i = 1; i < h.length - 1; i++) {
  const acc = h[i + 1][1].clone().add(h[i - 1][1]).sub(h[i][1].clone().multiplyScalar(2)).length();
  jerks.push([acc, n, h[i][0]]);
}
const accs = jerks.map(j => j[0]).sort((x, y) => x - y), q = p => accs[Math.floor((accs.length - 1) * p)];
console.log(`JERK px/frame²: p50 ${q(0.5).toFixed(2)}  p95 ${q(0.95).toFixed(2)}  max ${q(1).toFixed(2)}`);
console.log('JERK worst: ' + jerks.sort((x, y) => y[0] - x[0]).slice(0, 10).map(([v, n, t]) => `${n}@${t} ${v.toFixed(1)}`).join(', '));
for (const [k, v] of Object.entries(self)) console.log(`SELF ${k}: ${v.length}/${frames} frames, worst ${Math.max(...v.map(x => x[1]))} px, e.g. t=${v.slice(0, 4).map(x => x[0]).join(', ')}`);
if (!Object.keys(self).length) console.log('SELF: none');
