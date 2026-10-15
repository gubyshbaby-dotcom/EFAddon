// Motion rhythm vs the pack's ults: node tools/rhythm.mjs [--from 0] [--to 6.6] [--actor user] [--pack]
// Speed = mean speed (bl/s) of 6 body points (fists, feet, head, chest) relative to the actor's root (root travel excluded,
// so a dash counts only by its body motion). hold = frames slower than 0.6 bl/s; fast = faster than 4 bl/s; a burst = a
// rising crossing of 4 bl/s (≈ one distinct fast action). "Sped up instead of fast" (the author's words) = too many
// bursts per second, holds too short, peaks not fast enough.
import * as THREE from 'three';
import { readdirSync, readFileSync } from 'node:fs';
import { makePlayer, applyPose, poseAt, bonePoint } from '../rig.js';
import { r6Pose } from '../lib/r6lib.js';
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const PTS = ['fistR', 'fistL', 'footR', 'footL', 'head', 'chest'];
const pl = makePlayer(THREE, null, false);
export function rhythm(poseFn, t0, t1, fps = 60) {
  const sp = []; let prev = null;
  for (let t = t0; t <= t1 + 1e-9; t += 1 / fps) {
    const p = { ...poseFn(t) }; p.pos = [0, 0, 0]; p.plant = 0; p.rot = [0, 0, 0]; p.vis = 1;
    applyPose(pl, p); pl.root.updateMatrixWorld(true);
    const cur = PTS.map(n => bonePoint(THREE, pl, n).clone());
    sp.push(prev ? cur.reduce((s, v, i) => s + v.distanceTo(prev[i]), 0) / PTS.length * fps : 0);
    prev = cur;
  }
  sp.shift();
  const n = sp.length, segs = []; let run = 0, bursts = 0;
  for (let i = 0; i < n; i++) {
    if (sp[i] < 0.6) run++; else { if (run >= 3) segs.push(run / fps); run = 0; }
    if (i && sp[i] > 4 && sp[i - 1] <= 4) bursts++;
  }
  if (run >= 3) segs.push(run / fps);
  const s = [...sp].sort((x, y) => x - y), q = p => s[Math.floor((n - 1) * p)];
  segs.sort((x, y) => x - y);
  return { len: +(t1 - t0).toFixed(2), burstsPerS: +(bursts / (t1 - t0)).toFixed(2), holdPct: Math.round(sp.filter(v => v < 0.6).length / n * 100),
    holds: segs.length, holdMedian: +(segs[Math.floor(segs.length / 2)] || 0).toFixed(2), holdMax: +(segs.at(-1) || 0).toFixed(2), speedP90: +q(0.9).toFixed(1), speedMax: +q(1).toFixed(1) };
}
const PACK = { // measured with this tool on the pack (user side of ults/finishers)
  'normal ult (21.7 s)': { burstsPerS: 3.63, holdPct: 22, holdMedian: 0.58, speedP90: 14.8 },
  'starburst ult (18.8 s)': { burstsPerS: 0.69, holdPct: 20, holdMedian: 0.18, speedP90: 59.6 },
  'concussion finisher (5.8 s)': { burstsPerS: 1.73, holdPct: 1, holdMedian: 0.05, speedP90: 20.5 },
  'gojo kill emote (7.3 s)': { burstsPerS: 1.23, holdPct: 58, holdMedian: 0.88, speedP90: 3.7 },
  'CS finisher (7.0 s)': { burstsPerS: 1.57, holdPct: 66, holdMedian: 0.28, speedP90: 6.1 },
  'explosive grab (3.6 s)': { burstsPerS: 1.4, holdPct: 26, holdMedian: 0.22, speedP90: 7.5 },
  'bakugo ult move (2.6 s)': { burstsPerS: 0.78, holdPct: 28, holdMedian: 0.38, speedP90: 11.4 },
  'A-Train execute (2.9 s)': { burstsPerS: 1.02, holdPct: 2, holdMedian: 0, speedP90: 15.0 },
  'dropkick (3.0 s)': { burstsPerS: 1.69, holdPct: 2, holdMedian: 0.07, speedP90: 10.7 },
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const from = +opt('--from', 0), to = +opt('--to', 6.6);
  for (const id of (opt('--actor', 'user,victim')).split(',')) {
    const def = (await import(`../anim/${id}.js`)).default;
    console.log(`OURS ${id} ${from}–${to}`.padEnd(34), JSON.stringify(rhythm(t => poseAt(def, t), from, to)));
  }
  console.log('PACK reference (user side):');
  for (const [k, v] of Object.entries(PACK)) console.log('  ' + k.padEnd(30), JSON.stringify(v));
  console.log('Targets for a non-barrage stretch: burstsPerS ≤ ~1.7, holds with median ≥ 0.2 s (some 0.3–0.6 s), speedP90 ≥ 10 (strikes in 1–3 frames).');
}
