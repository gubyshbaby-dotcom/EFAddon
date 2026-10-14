// Minecraft-native player rig for the ult: pure functions of time.
//
// Actor definition (anim/*.js):
//   { id, skin: 'wide_steve' | 'slim_alex' | ..., slim, ghost?: {color, opacity track}, tracks: {...} }
// Tracks: name → [[t, value, ease?], ...]  (value: number or array; ease = how the value travels INTO this key)
//   'root.pos'   [x,y,z] world blocks, feet position
//   'root.rot'   [pitch, yaw, roll] deg: pitch + = top tips forward (front flip), yaw + = turn left, roll + = tip left.
//                yaw 0 = facing -Z (towards the victim's start); yaw 180 = facing +Z
//   'root.pivot' number: height (blocks) of the point root.rot turns about (default 0.75 = pelvis; 0.9 for flips)
//   'plant'      0..1: 1 = lift/lower the whole body so the lowest leg corner sits exactly at root.pos y (feet on the
//                ground whatever the leg angles); 0 = no correction (air, zero-g). Blend between for take-offs/landings.
//   'torso'      [pitch, yaw, roll] = R6 RootJoint: turns the WHOLE body (torso with head, arms AND legs) about the torso
//                centre (18 px above the feet): pitch + = lean forward, yaw + = twist left, roll + = lean left.
//                There is no waist: like R6, the legs hang from the torso — counter-rotate them to keep the feet under you.
//   'head'       relative to the torso: pitch + = nod down, yaw + = look left, roll + = tilt left
//   'armR' 'armL' [pitch, yaw, roll]: pitch + = swing forward/up (90 = straight ahead, 180 = up), yaw + = across the body
//                (inward), roll + = raise sideways away from the body (90 = T-pose)
//   'legR' 'legL' relative to the torso (hips): pitch + = kick forward, yaw + = toe inward, roll + = spread outward.
//                With actor.legSpace = 'root' the legs are NOT children of the torso: angles and '.pos' offsets are in
//                the root frame (independent of the torso lean), rest hip socket = (±1.9, 12) px above the feet.
//   R6 style: limbs are free blocks. In the pack, legs and arms are translated out of their sockets almost all the time
//   (median ~3 px, peaks 6–10 px): a "bent knee" is a leg moved up/forward and tilted, a punch is an arm thrust out of
//   the shoulder. Use '<limb>.pos' constantly.
//   '<part>.pos' [x,y,z] pixel offset in the parent frame (x right, y up, z FORWARD); e.g. 'armR.pos' [0,0,3] = reach
//   'vis'        0/1 visibility (use 'step' for blinks)
//   'ghost'      0..1 spectral look amount (clones/afterimages), additive glow tint actor.ghostColor
// Eases: linear step smooth sine* quad* cubic* quart* quint* expo* circ* back* elastic* (In/Out/InOut); "smooth" = Catmull-Rom.
// Rotation order per part: pitch, then yaw, then roll (three.js Euler 'ZYX' on the converted angles).

export const PX = 1 / 16;
const D2R = Math.PI / 180;

function bounceOut(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
const BASE = {
  sine: x => 1 - Math.cos(x * Math.PI / 2), quad: x => x * x, cubic: x => x * x * x, quart: x => x ** 4, quint: x => x ** 5,
  expo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10), circ: x => 1 - Math.sqrt(1 - x * x),
  back: x => 2.70158 * x * x * x - 1.70158 * x * x,
  elastic: x => x <= 0 ? 0 : x >= 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * (2 * Math.PI / 3)),
  bounce: x => 1 - bounceOut(1 - x),
};
export function ease(name, x) {
  if (!name || name === 'linear' || name === 'smooth') return x;
  if (name === 'step') return x < 1 ? 0 : 1;
  const m = /^([a-z]+)(In|Out|InOut)$/.exec(name);
  if (!m || !BASE[m[1]]) throw new Error('unknown ease ' + name);
  const f = BASE[m[1]];
  if (m[2] === 'In') return f(x);
  if (m[2] === 'Out') return 1 - f(1 - x);
  return x < 0.5 ? f(2 * x) / 2 : 1 - f(2 - 2 * x) / 2;
}

/** Evaluate one track at t → number or array. */
export function sample(keys, t) {
  if (!keys) return undefined;
  if (!Array.isArray(keys) || !Array.isArray(keys[0])) return keys; // constant
  const n = keys.length;
  const val = k => keys[k][1];
  if (t <= keys[0][0]) return val(0);
  if (t >= keys[n - 1][0]) return val(n - 1);
  let i = 1;
  while (i < n - 1 && keys[i][0] < t) i++;
  const [t0, a] = keys[i - 1], [t1, b, e] = keys[i];
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
  if (e === 'smooth') {
    const p0 = val(Math.max(0, i - 2)), p3 = val(Math.min(n - 1, i + 1));
    const tm = i - 2 >= 0 ? keys[i - 2][0] : t0 - (t1 - t0), tp = i + 1 < n ? keys[i + 1][0] : t1 + (t1 - t0);
    const d = t1 - t0, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const f = (x0, x1, x2, x3) => {
      const m1 = (i - 2 >= 0 ? (x2 - x0) / Math.max(1e-4, t1 - tm) * d : x2 - x1);
      const m2 = (i + 1 < n ? (x3 - x1) / Math.max(1e-4, tp - t0) * d : x2 - x1);
      return h00 * x1 + h10 * m1 + h01 * x2 + h11 * m2;
    };
    return Array.isArray(a) ? a.map((_, k) => f(p0[k], a[k], b[k], p3[k])) : f(p0, a, b, p3);
  }
  const w = ease(e, u);
  return Array.isArray(a) ? a.map((x, k) => x + (b[k] - x) * w) : a + (b - a) * w;
}

const PARTS = ['torso', 'head', 'armR', 'armL', 'legR', 'legL'];
/** Pose of an actor at time t (plain numbers). */
export function poseAt(actor, t) {
  const tr = actor.tracks;
  const p = {
    pos: sample(tr['root.pos'], t) || [0, 0, 0],
    rot: sample(tr['root.rot'], t) || [0, 0, 0],
    pivot: sample(tr['root.pivot'], t) ?? 0.75,
    plant: sample(tr.plant, t) ?? 0,
    vis: sample(tr.vis, t) ?? 1,
    ghost: sample(tr.ghost, t) ?? (actor.ghostColor ? 1 : 0),
    legSpace: actor.legSpace || 'torso',
  };
  for (const n of PARTS) {
    p[n] = sample(tr[n], t) || [0, 0, 0];
    p[n + '.pos'] = sample(tr[n + '.pos'], t) || [0, 0, 0];
  }
  return p;
}

// ---- three.js model ----
export function makePlayer(THREE, map, slim, opts = {}) {
  const base = opts.material || new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 });
  const over = opts.overMaterial || new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  const P = PX;
  function box(x0, y0, z0, x1, y1, z1, u, v, w, h, d, mat, inf = 0) {
    x0 -= inf; y0 -= inf; z0 -= inf; x1 += inf; y1 += inf; z1 += inf;
    const u1 = u + d, u2 = u + d + w, u3 = u + d + w + w, u4 = u + d + w + d, u5 = u4 + w, v1 = v + d, v2 = v + d + h;
    const faces = [
      [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0], [u1, v1, u2, v2]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], [u4, v1, u5, v2]],
      [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [u, v1, u1, v2]],
      [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0], [u2, v1, u4, v2]],
      [[x1, y1, z1], [x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [u1, v, u2, v1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [u2, v, u3, v1]],
    ];
    const pos = [], uv = [], idx = [];
    for (const [a, b, c, dd, r] of faces) {
      const k = pos.length / 3;
      pos.push(...a, ...b, ...c, ...dd);
      const [ul, vt, ur, vb] = r;
      uv.push(ul / 64, 1 - vt / 64, ur / 64, 1 - vt / 64, ur / 64, 1 - vb / 64, ul / 64, 1 - vb / 64);
      idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
  }
  const root = new THREE.Group();          // feet position + heading
  const turn = new THREE.Group();          // root rotation about the pivot
  const body = new THREE.Group();          // offset back down by the pivot
  root.add(turn); turn.add(body);
  const grp = (parent, name) => { const g = new THREE.Group(); g.name = name; parent.add(g); return g; };
  // R6 layout: the torso is the body's root part (pivot = torso centre, 18 px above the feet); head, arms and legs hang from it
  const torso = grp(body, 'torso'); torso.position.set(0, 18 * P, 0);
  torso.add(box(-4 * P, -6 * P, -2 * P, 4 * P, 6 * P, 2 * P, 16, 16, 8, 12, 4, base), box(-4 * P, -6 * P, -2 * P, 4 * P, 6 * P, 2 * P, 16, 32, 8, 12, 4, over, 0.25 * P));
  const head = grp(torso, 'head'); head.position.set(0, 6 * P, 0);
  head.add(box(-4 * P, 0, -4 * P, 4 * P, 8 * P, 4 * P, 0, 0, 8, 8, 8, base), box(-4 * P, 0, -4 * P, 4 * P, 8 * P, 4 * P, 32, 0, 8, 8, 8, over, 0.5 * P));
  const aw = slim ? 3 : 4, ay = slim ? 3.5 : 4;
  const armR = grp(torso, 'armR'); armR.position.set(5 * P, ay * P, 0);
  armR.add(box(-1 * P, -10 * P, -2 * P, (aw - 1) * P, 2 * P, 2 * P, 40, 16, aw, 12, 4, base), box(-1 * P, -10 * P, -2 * P, (aw - 1) * P, 2 * P, 2 * P, 40, 32, aw, 12, 4, over, 0.25 * P));
  const armL = grp(torso, 'armL'); armL.position.set(-5 * P, ay * P, 0);
  armL.add(box(-(aw - 1) * P, -10 * P, -2 * P, 1 * P, 2 * P, 2 * P, 32, 48, aw, 12, 4, base), box(-(aw - 1) * P, -10 * P, -2 * P, 1 * P, 2 * P, 2 * P, 48, 48, aw, 12, 4, over, 0.25 * P));
  const legR = grp(torso, 'legR'); legR.position.set(1.9 * P, -6 * P, 0);
  legR.add(box(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 0, 16, 4, 12, 4, base), box(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 0, 32, 4, 12, 4, over, 0.25 * P));
  const legL = grp(torso, 'legL'); legL.position.set(-1.9 * P, -6 * P, 0);
  legL.add(box(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 16, 48, 4, 12, 4, base), box(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 0, 48, 4, 12, 4, over, 0.25 * P));
  const rest = {};
  for (const g of [torso, head, armR, armL, legR, legL]) rest[g.name] = g.position.clone();
  return { root, turn, body, parts: { torso, head, armR, armL, legR, legL }, rest, slim, materials: [base, over] };
}

// convert authoring angles (deg) to three.js Euler (rad) per part
function partEuler(name, [p, y, r]) {
  switch (name) {
    case 'torso': case 'head': return [-p * D2R, y * D2R, r * D2R];
    case 'armR': case 'legR': return [p * D2R, y * D2R, r * D2R];
    case 'armL': case 'legL': return [p * D2R, -y * D2R, -r * D2R];
  }
}

/** Apply a pose (from poseAt) to a player built by makePlayer. */
const BODY_HIP = { legR: [1.9, 12, 0], legL: [-1.9, 12, 0] }; // hip sockets in the body (root) frame, px above the feet
export function applyPose(pl, pose) {
  // legSpace 'root': the legs hang from the body frame instead of the torso, so they move independently of the
  // RootJoint (torso lean/twist/offset); 'legR'/'legL' angles and '.pos' offsets are then in the root frame.
  const space = pose.legSpace || 'torso';
  if (pl.legSpace !== space) {
    for (const n of ['legR', 'legL']) (space === 'root' ? pl.body : pl.parts.torso).add(pl.parts[n]);
    pl.legSpace = space;
  }
  pl.root.visible = pose.vis > 0.5;
  pl.root.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  const [rp, ry, rr] = pose.rot;
  pl.root.rotation.set(0, ry * D2R, 0);
  pl.turn.position.set(0, pose.pivot, 0);
  pl.turn.rotation.set(-rp * D2R, 0, rr * D2R, 'ZXY');
  pl.body.position.set(0, -pose.pivot, 0);
  for (const [name, g] of Object.entries(pl.parts)) {
    const e = partEuler(name, pose[name]);
    g.rotation.set(e[0], e[1], e[2], 'ZYX');
    const o = pose[name + '.pos'];
    // offsets: x right, y up, z forward (forward = -Z in model space)
    const r = space === 'root' && BODY_HIP[name] ? { x: BODY_HIP[name][0] * PX, y: BODY_HIP[name][1] * PX, z: 0 } : pl.rest[name];
    g.position.set(r.x + o[0] * PX, r.y + o[1] * PX, r.z - o[2] * PX);
  }
  if (pose.plant > 0) {
    // feet on the ground: shift the body so the lowest leg-box corner is at root.pos y (pure function of the pose)
    pl.root.updateMatrixWorld(true);
    let low = Infinity;
    for (const leg of [pl.parts.legR, pl.parts.legL]) {
      const m = leg.matrixWorld.elements;
      for (const x of [-2, 2]) for (const z of [-2, 2]) for (const y of [0, -12]) {
        const wy = m[1] * x * PX + m[5] * y * PX + m[9] * z * PX + m[13];
        if (wy < low) low = wy;
      }
    }
    pl.root.position.y -= (low - pose.pos[1]) * pose.plant;
  }
}

/** Points on bones (part-local, pixels from the pivot) for VFX: e.g. fist of armR = [1, -11, 0]. */
export const BONE_POINTS = {
  fistR: ['armR', [1, -11, 0]], fistL: ['armL', [-1, -11, 0]], footR: ['legR', [0, -12, 1]], footL: ['legL', [0, -12, 1]],
  head: ['head', [0, 4, 0]], chest: ['torso', [0, 2, 0]], pelvis: ['torso', [0, -6, 0]], eyes: ['head', [0, 4.5, 4]],
  elbowR: ['armR', [1, -4, -2]], elbowL: ['armL', [-1, -4, -2]], kneeR: ['legR', [0, -6, 2]], kneeL: ['legL', [0, -6, 2]],
  back: ['torso', [0, 1, -2]], face: ['head', [0, 4, 4]], hipR: ['legR', [0, 0, 0]], hipL: ['legL', [0, 0, 0]],
};
export function bonePoint(THREE, pl, name, out = new THREE.Vector3()) {
  const [part, local] = BONE_POINTS[name] || [name, [0, 0, 0]];
  const g = pl.parts[part] || pl.root;
  g.updateWorldMatrix(true, false);
  return out.set(local[0] * PX, local[1] * PX, -local[2] * PX).applyMatrix4(g.matrixWorld);
}
