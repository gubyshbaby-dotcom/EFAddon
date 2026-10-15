// Overlap / follow-through of a cycle: node tools/phase.mjs <def module> <cycle seconds> <start t>. Phase (in frames at 60 fps,
// relative to the right sole's forward swing) and amplitude of the fundamental of world-space signals: chest yaw/roll,
// head yaw, fist/elbow/knee/sole travel, pelvis bob (2nd harmonic). Lags between linked parts = inertia; ±half a cycle = opposite.
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { makePlayer, applyPose, poseAt, PX } from '../rig.js';
const [file, cyc, t0s] = process.argv.slice(2); const C = +cyc, T0 = +t0s;
const def = (await import(pathToFileURL(resolve(file)).href)).default;
const pl = makePlayer(THREE, null, false); const fps = 240, N = Math.round(C * 2 * fps); // two cycles
const sig = {}; const push = (k, v) => (sig[k] ||= []).push(v);
const yawOf = (g) => { const m = new THREE.Matrix4().extractRotation(g.matrixWorld); const f = new THREE.Vector3(0, 0, -1).applyMatrix4(m); return Math.atan2(-f.x, -f.z) * 180 / Math.PI; };
const rollOf = (g) => { const m = new THREE.Matrix4().extractRotation(g.matrixWorld); const u = new THREE.Vector3(1, 0, 0).applyMatrix4(m); return Math.asin(u.y) * 180 / Math.PI; };
for (let i = 0; i < N; i++) {
  const t = T0 + i / fps; applyPose(pl, poseAt(def, t)); pl.root.updateMatrixWorld(true);
  const ri = new THREE.Matrix4().copy(pl.root.matrixWorld).invert();
  const P = (part, l) => new THREE.Vector3(l[0] * PX, l[1] * PX, l[2] * PX).applyMatrix4(pl.parts[part].matrixWorld).applyMatrix4(ri).divideScalar(PX);
  const chest = P('torso', [0, 2, 0]), pelvis = P('torso', [0, -6, 0]);
  push('pelvis.y', pelvis.y); push('chest.yaw', yawOf(pl.parts.torso)); push('chest.roll', rollOf(pl.parts.torso));
  push('head.yaw', yawOf(pl.parts.head));
  push('fistR.fwd', -P('armR', [1, -10, 0]).sub(chest).z); push('elbowR.fwd', -P('armR', [1, 0, 0]).sub(chest).z);
  push('soleR.fwd', -P('legR', [0, -12, 0]).sub(pelvis).z); push('kneeR.fwd', -P('legR', [0, 0, 0]).sub(pelvis).z);
}
const phase = (x, h = 1) => { let re = 0, im = 0; const n = x.length; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * h * 2 * i / n; re += x[i] * Math.cos(a); im += x[i] * Math.sin(a); } return { amp: 2 * Math.hypot(re, im) / n, ph: Math.atan2(im, re) }; };
const ref = phase(sig['soleR.fwd']).ph;
const fr = (dph) => { let d = dph - ref; while (d < -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI; return (d / (2 * Math.PI) * C * 60); };
for (const [k, x] of Object.entries(sig)) {
  const h = k === 'pelvis.y' ? 2 : 1, p = phase(x, h);
  console.log(k.padEnd(11), `amp ${p.amp.toFixed(1).padStart(5)}  phase vs soleR ${h === 1 ? fr(p.ph).toFixed(1).padStart(6) + ' frames' : '(2nd harmonic)'}`);
}
