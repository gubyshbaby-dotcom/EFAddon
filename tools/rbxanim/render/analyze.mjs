// Quality metrics for converted R6 animations (JSON from ../rbxm.py), evaluated on the Minecraft model.
// node analyze.mjs <json dir> <out.json> [--csv out.csv]
// Per animation: length, keys/s, easing styles, peak/95th joint angular speed, POPs (isolated one-frame
// rotation spikes), JITTER (frame-to-frame wobble of slow joints), FLIPs (>90° between consecutive keys),
// ground penetration / floating, root travel and height, holds after fast strikes (hit-stop feel), markers.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTracks, poseAt, quatFromMat, angleBetween, slerp, mv } from './r6.js';

const [dir, outFile] = process.argv.slice(2);
const csvIdx = process.argv.indexOf('--csv');
const PARTS = ['Torso', 'Head', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg'];
const FPS = 60, DT = 1 / FPS;
const deg = r => r * 180 / Math.PI;

// box corners of each MC part in its own frame (blocks) for ground checks
const P = 1 / 16;
const BOX = {
  Torso: [[-4, -6, -2], [4, 6, 2]], Head: [[-4, 0, -4], [4, 8, 4]],
  'Right Arm': [[-1, -10, -2], [3, 2, 2]], 'Left Arm': [[-3, -10, -2], [1, 2, 2]],
  'Right Leg': [[-2, -12, -2], [2, 0, 2]], 'Left Leg': [[-2, -12, -2], [2, 0, 2]],
};
function lowest(pose) {
  let y = 1e9;
  for (const name of PARTS) {
    const fr = name === 'Torso' ? { pivot: pose.torso.pos, rot: pose.torso.rot } : pose.parts[name];
    const [a, b] = BOX[name];
    for (const x of [a[0], b[0]]) for (const yy of [a[1], b[1]]) for (const z of [a[2], b[2]]) {
      const w = mv(fr.rot, [x * P, yy * P, z * P]);
      y = Math.min(y, fr.pivot[1] + w[1]);
    }
  }
  return y;
}

function analyze(seq) {
  const tr = buildTracks(seq);
  const L = Math.max(tr.length, DT);
  const n = Math.max(2, Math.round(L * FPS) + 1);
  const qs = [], tor = [], low = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(L, i * DT);
    const p = poseAt(tr.tracks, t, false);
    const row = { Torso: quatFromMat(p.torso.rot) };
    for (const k of PARTS.slice(1)) row[k] = quatFromMat(p.parts[k].rot);
    qs.push(row); tor.push(p.torso.pos); low.push(lowest(p));
  }
  // angular speed per joint per frame (relative to parent for limbs would be better for "effort",
  // world rotation is what the viewer sees)
  const speed = {}, pops = [], jitter = [];
  let peak = 0;
  const allSpeeds = [];
  for (const k of PARTS) {
    const sp = [];
    for (let i = 1; i < n; i++) sp.push(deg(angleBetween(qs[i - 1][k], qs[i][k])) * FPS);
    speed[k] = sp;
    for (const v of sp) { allSpeeds.push(v); peak = Math.max(peak, v); }
    for (let i = 1; i < sp.length - 1; i++) {
      const s = sp[i], nb = Math.max(sp[i - 1], sp[i + 1]);
      if (s > 1800 && s > 4 * nb) pops.push({ t: +(i * DT).toFixed(3), part: k, degPerFrame: +(s / FPS).toFixed(1) });
    }
    // jitter: wobble of a slow joint = angle between the middle sample and the midpoint of its neighbours
    for (let i = 1; i < n - 1; i++) {
      if (sp[i - 1] < 240 && sp[i] < 240) {
        const mid = slerp(qs[i - 1][k], qs[i + 1][k], 0.5);
        jitter.push(deg(angleBetween(mid, qs[i][k])));
      }
    }
  }
  allSpeeds.sort((a, b) => a - b);
  const p95 = allSpeeds[Math.floor(allSpeeds.length * 0.95)] || 0;
  jitter.sort((a, b) => a - b);
  const jit = jitter.length ? jitter[Math.floor(jitter.length * 0.9)] : 0;
  // flips: consecutive keys of a track more than 90° apart
  let flips = 0;
  for (const [k, keys] of Object.entries(tr.tracks)) for (let i = 1; i < keys.length; i++) {
    const dt = keys[i].t - keys[i - 1].t;
    if (deg(angleBetween(keys[i - 1].q, keys[i].q)) > 90 && dt < 0.05) flips++;
  }
  // holds after strikes: a frame with any joint > 900°/s followed within 0.1 s by ≥ 3 frames where all joints < 60°/s
  let holds = 0;
  const frameMax = []; for (let i = 0; i < n - 1; i++) frameMax.push(Math.max(...PARTS.map(k => speed[k][i])));
  for (let i = 0; i < frameMax.length; i++) if (frameMax[i] > 900) {
    for (let j = i + 1; j < Math.min(frameMax.length - 3, i + 7); j++)
      if (frameMax[j] < 60 && frameMax[j + 1] < 60 && frameMax[j + 2] < 60) { holds++; i = j + 3; break; }
  }
  const styles = {};
  for (const keys of Object.values(tr.tracks)) for (const k of keys) { const sk = k.style + (k.style === 'Linear' || k.style === 'Constant' ? '' : '/' + k.dir); styles[sk] = (styles[sk] || 0) + 1; }
  const keyCount = Math.max(...Object.values(tr.tracks).map(k => k.length), 0);
  const travel = Math.hypot(tor[n - 1][0] - tor[0][0], tor[n - 1][2] - tor[0][2]);
  const maxH = Math.max(...tor.map(p => p[1])) - tor[0][1];
  const minLow = Math.min(...low);
  return {
    name: seq.name, length: +L.toFixed(3), keys: keyCount, keysPerSec: +(keyCount / L).toFixed(1),
    styles, peakDegS: Math.round(peak), p95DegS: Math.round(p95), pops: pops.length, popList: pops.slice(0, 8),
    jitterDeg: +jit.toFixed(2), flips, holds,
    groundPenetration: +Math.max(0, -minLow).toFixed(3), startLow: +low[0].toFixed(3), endLow: +low[n - 1].toFixed(3),
    travel: +travel.toFixed(2), maxRise: +maxH.toFixed(2),
    markers: tr.events.map(e => `${e.name}@${e.t.toFixed(2)}`).slice(0, 12),
    loop: seq.loop,
  };
}

const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).filter(i => !i.error && i.rig === 'R6');
const res = [];
for (const it of index) {
  try { res.push({ id: it.id, ...analyze(JSON.parse(readFileSync(join(dir, it.id + '.json'), 'utf8'))) }); }
  catch (e) { res.push({ id: it.id, error: String(e) }); }
}
writeFileSync(outFile, JSON.stringify(res, null, 1));
if (csvIdx > 0) {
  const cols = ['id', 'length', 'keys', 'keysPerSec', 'peakDegS', 'p95DegS', 'pops', 'jitterDeg', 'flips', 'holds', 'groundPenetration', 'startLow', 'endLow', 'travel', 'maxRise'];
  writeFileSync(process.argv[csvIdx + 1], [cols.join(',')].concat(res.filter(r => !r.error).map(r => cols.map(c => r[c]).join(','))).join('\n'));
}
console.log(`${res.length} analysed, ${res.filter(r => r.error).length} errors`);
