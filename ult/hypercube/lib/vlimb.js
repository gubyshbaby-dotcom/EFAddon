// Virtual two-segment limbs for rigid R6 blocks — how the pack makes rigid legs read as BENT.
//
// A real leg is thigh + shin. The R6 block cannot bend, so good R6 animators let the block show the SHIN: it is aligned
// with where the shin would be, and its FOOT end sits where the foot would be. The block is 12 px long while a shin is
// ~6 px, so the block's top end floats past the virtual knee — in front of the belly on a knee drive, behind the butt on
// a heel kick, near the hip only when the leg is straight. That floating top is the "detached leg" of the pack: it is
// not random, it is the knee. Same for arms (block = forearm, fist end at the fist).
//
// Use with actor.legSpace = 'root' (legs in the root frame). All positions are in the root frame, in px
// (x right, y up, z FORWARD), angles in degrees with rig.js conventions (pitch + = forward/up, roll + = outward).
//
//   vleg(side, hip, thigh, knee)        → { ang: [p, y, r], pos: [x, y, z] }   forward kinematics
//     side 'R' | 'L'; hip: socket position (px, root frame); thigh: [pitch, yaw, roll] of the virtual thigh;
//     knee: flexion in degrees (0 = straight, + = shin swings back, like a real knee)
//   vlegIK(side, hip, foot, opts)       → same, solved so the sole lands on `foot` (planted feet, no skating)
//     opts.knee: [x,y,z] direction the knee points (default forward + a bit outward), opts.yaw: toe-out
//   hipSocket(side, torso, torsoPos)    → the hip point under a torso pose (RootJoint rotation about its centre)
//   apply(tracks, side, t, res, ease)   → push the result as keys into 'legR'/'legL' and 'legR.pos'/'legL.pos'
//
// Segment lengths: THIGH 6 px, SHIN 6 px (hip → knee → sole). The block bottom is the sole.
import * as THREE from 'three';

export const THIGH = 6, SHIN = 6, BLOCK = 12, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const REST = { R: [1.9, 12, 0], L: [-1.9, 12, 0] };          // hip sockets in the root frame (px), rig.js BODY_HIP
const v3 = (a) => new THREE.Vector3(a[0], a[1], -a[2]);       // z forward → model -Z
const arr = (v) => [v.x, v.y, -v.z];

// rig.js partEuler for legs: legR [p, y, r] → Euler(p, y, r, 'ZYX'); legL [p, -y, -r]
function quatFromAng(side, [p, y, r]) {
  const e = side === 'R' ? new THREE.Euler(p * D2R, y * D2R, r * D2R, 'ZYX') : new THREE.Euler(p * D2R, -y * D2R, -r * D2R, 'ZYX');
  return new THREE.Quaternion().setFromEuler(e);
}
function angFromQuat(side, q) {
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  return side === 'R' ? [e.x * R2D, e.y * R2D, e.z * R2D] : [e.x * R2D, -e.y * R2D, -e.z * R2D];
}
// place the 12-px block along the shin with its bottom (sole) at the foot
function blockFromShin(side, qShin, foot) {
  const top = foot.clone().sub(new THREE.Vector3(0, -BLOCK, 0).applyQuaternion(qShin));
  const rest = v3(REST[side]);
  return { ang: angFromQuat(side, qShin), pos: arr(top.sub(rest)) };
}

export function vleg(side, hip, thigh, knee) {
  const qT = quatFromAng(side, thigh);
  const H = v3(hip);
  const K = H.clone().add(new THREE.Vector3(0, -THIGH, 0).applyQuaternion(qT));
  // knee flexion: rotate about the thigh's local X (pitch axis); + flex swings the shin backward
  const qS = qT.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -knee * D2R));
  const F = K.clone().add(new THREE.Vector3(0, -SHIN, 0).applyQuaternion(qS));
  return { ...blockFromShin(side, qS, F), knee: arr(K), foot: arr(F) };
}

export function vlegIK(side, hip, foot, opts = {}) {
  const H = v3(hip), F = v3(foot);
  const d = F.clone().sub(H), len = Math.min(d.length(), THIGH + SHIN - 1e-4);
  const dir = d.clone().normalize();
  // knee bend direction: perpendicular to hip→foot, toward opts.knee (default forward, slightly outward)
  const kd = v3(opts.knee || [side === 'R' ? 0.15 : -0.15, 0, 1]);
  const perp = kd.clone().sub(dir.clone().multiplyScalar(kd.dot(dir))).normalize();
  const a = Math.acos(Math.min(1, len / (THIGH + SHIN)));      // equal segments: the knee leaves the line by this angle
  const K = H.clone().add(dir.clone().multiplyScalar(len / 2)).add(perp.clone().multiplyScalar(Math.sin(a) * THIGH));
  const Fp = H.clone().add(dir.clone().multiplyScalar(len));
  // shin orientation: block -Y along knee→foot, toes (-Z) toward the side the knee points to
  const down = Fp.clone().sub(K).normalize();
  const fw = perp.clone().sub(down.clone().multiplyScalar(perp.dot(down))).normalize();
  const yAxis = down.clone().negate(), zAxis = fw.clone().negate(), xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  let qS = new THREE.Quaternion().setFromRotationMatrix(m);
  if (opts.yaw) qS = new THREE.Quaternion().setFromAxisAngle(yAxis, (side === 'R' ? -1 : 1) * opts.yaw * D2R).multiply(qS);
  return { ...blockFromShin(side, qS, Fp), knee: arr(K), foot: arr(Fp) };
}

/** Hip socket (px, root frame) for a torso pose: rotation [pitch, yaw, roll] about the torso centre (18 px), plus torso.pos. */
export function hipSocket(side, torso = [0, 0, 0], torsoPos = [0, 0, 0]) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-torso[0] * D2R, torso[1] * D2R, torso[2] * D2R, 'ZYX'));
  const p = new THREE.Vector3(side === 'R' ? 1.9 : -1.9, -6, 0).applyQuaternion(q);
  return arr(p.add(new THREE.Vector3(torsoPos[0], 18 + torsoPos[1], -torsoPos[2])));
}

export function apply(tracks, side, t, res, ease = 'linear') {
  const k = 'leg' + side;
  (tracks[k] ||= []).push([t, res.ang.map(v => +v.toFixed(3)), ease]);
  (tracks[k + '.pos'] ||= []).push([t, res.pos.map(v => +v.toFixed(3)), ease]);
}

// ---- arms: block = FOREARM, fist end at the fist; its top floats where the elbow is (behind/below the shoulder on a
// guard, out to the side on a hook, back behind the body on a wind-up), at the shoulder only when the arm is straight.
// Arms hang from the torso, so everything here is in the TORSO frame (px from the torso centre, z forward):
// shoulder sockets (±5, 4) px (slim 3.5). Virtual upper arm 4 px + forearm 6 px = the block's pivot→fist end (10 px),
// so a straight arm sits exactly in its socket.
export const UPPER = 4, FORE = 6;
const ARM_REST = slim => ({ R: [5, slim ? 3.5 : 4, 0], L: [-5, slim ? 3.5 : 4, 0] });
function armBlock(side, qF, fist, slim) {
  const pivot = fist.clone().sub(new THREE.Vector3(0, -(UPPER + FORE), 0).applyQuaternion(qF));
  return { ang: angFromQuat(side, qF), pos: arr(pivot.sub(v3(ARM_REST(slim)[side]))) };
}
/** FK: upper arm [pitch, yaw, roll] (rig conventions: pitch + = forward/up, roll + = out to the side) + elbow flexion
 *  (deg, + = forearm comes forward/up like a real elbow) → { ang, pos, elbow, fist } for 'armX' / 'armX.pos'. */
export function varm(side, upper, elbow, { slim = false, shoulder } = {}) {
  const qU = quatFromAng(side, upper);
  const S = v3(shoulder || ARM_REST(slim)[side]);
  const E = S.clone().add(new THREE.Vector3(0, -UPPER, 0).applyQuaternion(qU));
  const qF = qU.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), elbow * D2R));
  const W = E.clone().add(new THREE.Vector3(0, -FORE, 0).applyQuaternion(qF));
  return { ...armBlock(side, qF, W, slim), elbow: arr(E), fist: arr(W) };
}
/** IK: put the fist end at `fist` (torso frame, px); the elbow bends toward opts.elbow (default down, back and out). */
export function varmIK(side, fist, { slim = false, shoulder, elbow: ed, twist = 0 } = {}) {
  const S = v3(shoulder || ARM_REST(slim)[side]), W0 = v3(fist);
  const d = W0.clone().sub(S), len = Math.min(d.length(), UPPER + FORE - 1e-4), dir = d.clone().normalize();
  const want = v3(ed || [side === 'R' ? 0.6 : -0.6, -1, -0.5]);
  const perp = want.clone().sub(dir.clone().multiplyScalar(want.dot(dir))).normalize();
  // two unequal segments: law of cosines for the angle at the shoulder
  const cosA = (UPPER * UPPER + len * len - FORE * FORE) / (2 * UPPER * len);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const E = S.clone().add(dir.clone().multiplyScalar(Math.cos(A) * UPPER)).add(perp.clone().multiplyScalar(Math.sin(A) * UPPER));
  const W = S.clone().add(dir.clone().multiplyScalar(len));
  const down = W.clone().sub(E).normalize();                      // forearm axis (block -Y)
  let fw = perp.clone().negate();                                  // palm side faces away from the elbow point
  fw = fw.sub(down.clone().multiplyScalar(fw.dot(down))).normalize();
  const yAxis = down.clone().negate(), zAxis = fw.clone().negate(), xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  let qF = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  if (twist) qF = new THREE.Quaternion().setFromAxisAngle(yAxis, twist * D2R).multiply(qF);
  return { ...armBlock(side, qF, W, slim), elbow: arr(E), fist: arr(W) };
}
/** Push arm keys: 'armR'/'armL' and their '.pos'. */
export function applyArm(tracks, side, t, res, ease = 'linear') {
  const k = 'arm' + side;
  (tracks[k] ||= []).push([t, res.ang.map(v => +v.toFixed(3)), ease]);
  (tracks[k + '.pos'] ||= []).push([t, res.pos.map(v => +v.toFixed(3)), ease]);
}
