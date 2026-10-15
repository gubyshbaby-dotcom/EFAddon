// Helpers for anim/study/run_cycle.js: rotation math that mirrors rig.js exactly (three.js Euler 'ZYX', the rig's
// per-part sign conventions, legSpace 'root' sockets), periodic / Hermite key curves, and leg-box forward kinematics.
// Pure functions, no three.js import, no state: usable in the page and in node analysis scripts.

export const PX = 1 / 16;
const D = Math.PI / 180;

// ---- 3x3 rotation matrices, row-major ----
export const mul = (a, b) => {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
export const tr = a => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
export const mv = (a, v) => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
export const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
/** three.js Euler 'ZYX' (radians) → matrix Rz·Ry·Rx */
export const eulerM = ([x, y, z]) => mul(rz(z), mul(ry(y), rx(x)));
/** matrix → three.js Euler 'ZYX' (radians), same formulas as THREE.Euler.setFromRotationMatrix */
export function mEuler(m) {
  const m31 = m[6];
  const y = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m[7], m[8]), y, Math.atan2(m[3], m[0])];
  return [0, y, Math.atan2(-m[1], m[4])];
}
// rig.js partEuler and its inverse: authoring degrees [pitch, yaw, roll] ↔ three.js matrix
const SIGN = { torso: [-1, 1, 1], head: [-1, 1, 1], armR: [1, 1, 1], legR: [1, 1, 1], armL: [1, -1, -1], legL: [1, -1, -1] };
export const partM = (part, a) => eulerM(a.map((v, i) => v * SIGN[part][i] * D));
export const partAngles = (part, m) => mEuler(m).map((v, i) => v / D * SIGN[part][i]);

/** Torso orientation built the way a runner moves: lean forward, twist about the LEANED spine, tilt sideways about
 *  the travel axis, then a little whole-body yaw. Returns { m, angles } (angles = the rig's torso track). */
export function torsoRot(lean, twist, tilt, yaw = 0) {
  const m = mul(ry(yaw * D), mul(rz(tilt * D), mul(rx(-lean * D), ry(twist * D))));
  return { m, angles: partAngles('torso', m) };
}

// ---- key curves ----
/** periodic Catmull-Rom through keys [[u, v], ...] with u in [0,1) (sorted); v number or array */
export function loopCurve(keys) {
  const n = keys.length;
  const at = i => { const k = ((i % n) + n) % n, w = Math.floor(i / n); return [keys[k][0] + w, keys[k][1]]; };
  const one = (u, j) => {
    u = u - Math.floor(u);
    let i = n - 1; while (i >= 0 && keys[i][0] > u) i--;
    // segment from key i (possibly -1 → wrapped) to i+1
    const [u0, a] = at(i), [u1, b] = at(i + 1), [um, p] = at(i - 1), [up, q] = at(i + 2);
    const pick = v => (Array.isArray(v) ? v[j] : v);
    const d = u1 - u0, s = (u - u0) / d;
    const m0 = (pick(b) - pick(p)) / (u1 - um) * d, m1 = (pick(q) - pick(a)) / (up - u0) * d;
    return hermite(pick(a), pick(b), m0, m1, s);
  };
  return u => (Array.isArray(keys[0][1]) ? keys[0][1].map((_, j) => one(u, j)) : one(u, 0));
}
export function hermite(a, b, m0, m1, s) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * a + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * b + (s3 - s2) * m1;
}
/** open Catmull-Rom through keys [[u, v]...] (numbers) with given end slopes (dv/du) */
export function openCurve(keys, slope0, slope1) {
  const n = keys.length;
  const tan = i => i === 0 ? slope0 : i === n - 1 ? slope1 : (keys[i + 1][1] - keys[i - 1][1]) / (keys[i + 1][0] - keys[i - 1][0]);
  return u => {
    if (u <= keys[0][0]) return keys[0][1];
    if (u >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (keys[i + 1][0] < u) i++;
    const d = keys[i + 1][0] - keys[i][0];
    return hermite(keys[i][1], keys[i + 1][1], tan(i) * d, tan(i + 1) * d, (u - keys[i][0]) / d);
  };
}
/** vector version of openCurve; slopes per component, or null = the slope of the first / last segment (a kink) */
export function openCurveV(keys, slope0 = null, slope1 = null) {
  const n = keys.length, dim = keys[0][1].length;
  const seg = i => keys[i + 1][1].map((v, j) => (v - keys[i][1][j]) / (keys[i + 1][0] - keys[i][0]));
  const s0 = slope0 || seg(0), s1 = slope1 || seg(n - 2);
  const comp = j => openCurve(keys.map(([u, v]) => [u, v[j]]), s0[j], s1[j]);
  const fs = Array.from({ length: dim }, (_, j) => comp(j));
  return u => fs.map(f => f(u));
}
export const lerp = (a, b, s) => a + (b - a) * s;
export const smooth = s => s * s * (3 - 2 * s);

// ---- body geometry (rig.js R6 layout, pixels, three.js axes: x right, y up, z BACK) ----
const HIP_LOCAL = { legR: [1.9, -6, 0], legL: [-1.9, -6, 0] };   // hip sockets in the torso frame
export const BODY_HIP = { legR: [1.9, 12, 0], legL: [-1.9, 12, 0] }; // legSpace 'root' rest sockets
/** world (body-frame, px) position of a point given in torso-local px, for torso rotation m and torso.pos tp */
export function torsoPoint(m, tp, local) {
  const c = [tp[0], 18 + tp[1], -tp[2]];
  const w = mv(m, local);
  return [c[0] + w[0], c[1] + w[1], c[2] + w[2]];
}
/** leg socket in the body frame: hip on the torso + an extra offset along the torso's own axes [x, up-the-spine, torso-forward] */
export function hipSocket(leg, m, tp, extra = [0, 0, 0]) {
  const h = HIP_LOCAL[leg];
  return torsoPoint(m, tp, [h[0] + extra[0], h[1] + extra[1], h[2] - extra[2]]);
}
/** body-frame socket (px, three axes) → the rig's '<leg>.pos' track value (x right, y up, z FORWARD) in legSpace 'root' */
export const legPosTrack = (leg, w) => [w[0] - BODY_HIP[leg][0], w[1] - BODY_HIP[leg][1], -w[2]];
/** the 8 corners of a leg box (px, body frame) for socket w (px) and angles a ([pitch, yaw, roll] rig degrees) */
export function legCorners(leg, w, a) {
  const m = partM(leg, a), out = [];
  for (const x of [-2, 2]) for (const z of [-2, 2]) for (const y of [0, -12]) {
    const v = mv(m, [x, y, z]);
    out.push({ x: w[0] + v[0], y: w[1] + v[1], z: w[2] + v[2], heel: z > 0, bottom: y < 0 });
  }
  return out;
}
/** lowest point of a leg: { y, z, heel } (px, body frame); for a planted foot the bottom heel/toe edge */
export function legLow(leg, w, a) {
  let best = null;
  for (const c of legCorners(leg, w, a)) if (!best || c.y < best.y - 1e-9) best = c;
  return best;
}
/** heel-edge and toe-edge midpoints of the sole (px, body frame) */
export function soleEdges(leg, w, a) {
  const m = partM(leg, a);
  const p = l => { const v = mv(m, l); return [w[0] + v[0], w[1] + v[1], w[2] + v[2]]; };
  return { heel: p([0, -12, 2]), toe: p([0, -12, -2]) };
}

// ---- secondary motion (precomputed, deterministic) ----
/** Steady-state response of a damped spring follower y'' = w0²(x − y) − 2ζw0·y' to a PERIODIC target x(phi), phi in
 *  [0,1) over a period of T seconds. Simulated over `warm` periods from rest so the result loops seamlessly; returns a
 *  sampler phi → y (number or array, like the target). f0 = natural frequency (Hz). */
export function periodicSpring(target, { f0, zeta, T, N = 480, warm = 8 }) {
  const w = 2 * Math.PI * f0, dt = T / N, sub = 4, h = dt / sub;
  const x0 = target(0), isArr = Array.isArray(x0);
  const y = isArr ? [...x0] : [x0], v = y.map(() => 0), out = new Array(N);
  for (let c = 0; c < warm; c++) for (let i = 0; i < N; i++) {
    if (c === warm - 1) out[i] = [...y];
    const x = target(i / N), xs = isArr ? x : [x];
    for (let s = 0; s < sub; s++) for (let j = 0; j < y.length; j++) {
      v[j] += (w * w * (xs[j] - y[j]) - 2 * zeta * w * v[j]) * h;
      y[j] += v[j] * h;
    }
  }
  return phi => {
    const x = (phi - Math.floor(phi)) * N, i = Math.floor(x) % N, s = x - Math.floor(x), a = out[i], b = out[(i + 1) % N];
    const r = a.map((v, j) => v + (b[j] - v) * s);
    return isArr ? r : r[0];
  };
}
/** rounded square wave of phase x: +1 at x = 0, −1 at x = 0.5; k = squareness (≈ 0 → cosine) */
export const roundSquare = (x, k = 2) => Math.tanh(k * Math.cos(2 * Math.PI * x)) / Math.tanh(k);
/** smooth deterministic wobble of time t (sum of incommensurate sines), roughly in [−1, 1] */
export const wobble = (t, seed = 0) =>
  (Math.sin(2 * Math.PI * 0.37 * t + seed * 1.7) + 0.7 * Math.sin(2 * Math.PI * 0.83 * t + seed * 2.9 + 1.1) + 0.5 * Math.sin(2 * Math.PI * 1.31 * t + seed * 4.3 + 2.3)) / 2.2;
/** world yaw / roll / pitch-of-forward (deg) of a rotation matrix (three axes) */
export function worldYRP(m) {
  const f = mv(m, [0, 0, -1]), u = mv(m, [1, 0, 0]);
  return [Math.atan2(-f[0], -f[2]) / D, Math.asin(Math.max(-1, Math.min(1, u[1]))) / D, Math.asin(Math.max(-1, Math.min(1, -f[1]))) / D];
}
