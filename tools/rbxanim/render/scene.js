// three.js scene: Minecraft player models (vanilla geometry + skin UVs) driven by r6.js poses.
import * as THREE from 'three';
import { buildTracks, poseAt, mcPivots } from './r6.js';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b4ff);
scene.fog = new THREE.Fog(0x87b4ff, 25, 60);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 12, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

const loader = new THREE.TextureLoader();
function tex(url) {
  const t = loader.load(url);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ground: grass block tops (tinted), 1 block per texture
{
  const t = tex('tex/grass_block_top.png');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(64, 64);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ map: t, color: 0x8fbf55 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
}

// ---- Minecraft box with skin UVs (64x64 skin). Corners in local space, faces as seen from outside. ----
function mcBox(x0, y0, z0, x1, y1, z1, u, v, w, h, d, mat, inflate = 0) {
  x0 -= inflate; y0 -= inflate; z0 -= inflate; x1 += inflate; y1 += inflate; z1 += inflate;
  const u0 = u, u1 = u + d, u2 = u + d + w, u3 = u + d + w + w, u4 = u + d + w + d, u5 = u4 + w;
  const v0 = v, v1 = v + d, v2 = v + d + h;
  // [TL, TR, BR, BL] corners, uv rect [ul, vt, ur, vb]
  const faces = [
    [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0], [u1, v1, u2, v2]],  // front (-z)
    [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], [u4, v1, u5, v2]],  // back (+z)
    [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [u0, v1, u1, v2]],  // character's right (+x)
    [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0], [u2, v1, u4, v2]],  // character's left (-x)
    [[x1, y1, z1], [x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [u1, v0, u2, v1]],  // top
    [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [u2, v0, u3, v1]],  // bottom
  ];
  const pos = [], uv = [], idx = [];
  for (const [a, b, c, dd, r] of faces) {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...dd);
    const [ul, vt, ur, vb] = r;
    uv.push(ul / 64, 1 - vt / 64, ur / 64, 1 - vt / 64, ur / 64, 1 - vb / 64, ul / 64, 1 - vb / 64);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
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

const P = 1 / 16;
function makePlayer(skinUrl, slim) {
  const map = tex(skinUrl);
  const base = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 });
  const over = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  const root = new THREE.Group();
  const parts = {};
  const add = (name, boxes) => {
    const g = new THREE.Group();
    for (const b of boxes) g.add(b);
    root.add(g);
    parts[name] = g;
  };
  // torso: centred on the torso centre
  add('Torso', [mcBox(-4 * P, -6 * P, -2 * P, 4 * P, 6 * P, 2 * P, 16, 16, 8, 12, 4, base),
    mcBox(-4 * P, -6 * P, -2 * P, 4 * P, 6 * P, 2 * P, 16, 32, 8, 12, 4, over, 0.25 * P)]);
  // head: pivot at the neck, box above it
  add('Head', [mcBox(-4 * P, 0, -4 * P, 4 * P, 8 * P, 4 * P, 0, 0, 8, 8, 8, base),
    mcBox(-4 * P, 0, -4 * P, 4 * P, 8 * P, 4 * P, 32, 0, 8, 8, 8, over, 0.5 * P)]);
  const aw = slim ? 3 : 4;
  // right arm (character's right = +x): pivot 1 px inside the outer... vanilla: box from pivot-1px inward to +aw outward
  add('Right Arm', [mcBox(-1 * P, -10 * P, -2 * P, (aw - 1) * P, 2 * P, 2 * P, 40, 16, aw, 12, 4, base),
    mcBox(-1 * P, -10 * P, -2 * P, (aw - 1) * P, 2 * P, 2 * P, 40, 32, aw, 12, 4, over, 0.25 * P)]);
  add('Left Arm', [mcBox(-(aw - 1) * P, -10 * P, -2 * P, 1 * P, 2 * P, 2 * P, 32, 48, aw, 12, 4, base),
    mcBox(-(aw - 1) * P, -10 * P, -2 * P, 1 * P, 2 * P, 2 * P, 48, 48, aw, 12, 4, over, 0.25 * P)]);
  add('Right Leg', [mcBox(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 0, 16, 4, 12, 4, base),
    mcBox(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 0, 32, 4, 12, 4, over, 0.25 * P)]);
  add('Left Leg', [mcBox(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 16, 48, 4, 12, 4, base),
    mcBox(-2 * P, -12 * P, -2 * P, 2 * P, 0, 2 * P, 0, 48, 4, 12, 4, over, 0.25 * P)]);
  scene.add(root);
  return { root, parts, slim };
}

const m4 = new THREE.Matrix4();
function applyPose(player, pose, origin, yaw) {
  player.root.position.set(origin[0], origin[1], origin[2]);
  player.root.rotation.set(0, yaw, 0);
  const set = (g, p, R) => {
    m4.set(R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1);
    g.matrixAutoUpdate = false;
    g.matrix.copy(m4);
  };
  set(player.parts.Torso, pose.torso.pos, pose.torso.rot);
  for (const n of ['Head', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg']) set(player.parts[n], pose.parts[n].pivot, pose.parts[n].rot);
}

// ---- API for the driver (render.mjs) ----
const S = { actors: [], cam: null, label: '' };
window.setupScene = async (cfg) => {
  // cfg: {actors: [{seq, skin, slim, origin:[x,y,z], yaw}], label, cam: {mode, ...}}
  for (const a of S.actors) scene.remove(a.player.root);
  S.actors = cfg.actors.map(a => ({ ...a, tracks: buildTracks(a.seq), player: makePlayer(a.skin, a.slim) }));
  S.cam = cfg.cam;
  S.label = cfg.label || '';
  S.length = Math.max(...S.actors.map(a => a.tracks.length));
  await new Promise(r => setTimeout(r, 300)); // textures
  return { length: S.length, events: S.actors.map(a => a.tracks.events) };
};

function worldTorso(a, t) {
  const p = poseAt(a.tracks.tracks, Math.min(t, a.tracks.length), a.slim).torso.pos;
  const c = Math.cos(a.yaw || 0), s = Math.sin(a.yaw || 0);
  return [a.origin[0] + c * p[0] + s * p[2], a.origin[1] + p[1], a.origin[2] - s * p[0] + c * p[2]];
}
function centroid(t) {
  let x = 0, y = 0, z = 0;
  for (const a of S.actors) { const p = worldTorso(a, t); x += p[0]; y += p[1]; z += p[2]; }
  const n = S.actors.length;
  return [x / n, y / n, z / n];
}
function smoothCentroid(t, win) {
  // camera target: centroid averaged over ±win seconds (a pure function of t, no lag state)
  let acc = [0, 0, 0], n = 0;
  for (let k = -8; k <= 8; k++) {
    const tt = Math.max(0, Math.min(S.length, t + (k / 8) * win));
    const c = centroid(tt); acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n++;
  }
  return acc.map(v => v / n);
}

function spread(t) {
  if (S.actors.length < 2) return 0;
  let m = 0;
  for (let i = 0; i < S.actors.length; i++) for (let j = i + 1; j < S.actors.length; j++) {
    const a = worldTorso(S.actors[i], t), b = worldTorso(S.actors[j], t);
    m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return m;
}
function smoothSpread(t, win) {
  let acc = 0, n = 0;
  for (let k = -8; k <= 8; k++) { acc += spread(Math.max(0, Math.min(S.length, t + (k / 8) * win))); n++; }
  return acc / n;
}
window.renderAtCam = (t, cam) => { S.cam = cam; return window.renderAt(t); };
// several cameras side by side in one canvas (one screenshot per frame)
window.renderAtCams = (t, cams) => {
  const w = Math.floor(W / cams.length);
  renderer.setScissorTest(true);
  cams.forEach((c, i) => {
    renderer.setViewport(i * w, 0, w, H);
    renderer.setScissor(i * w, 0, w, H);
    camera.aspect = w / H;
    S.cam = c;
    window.renderAt(t);
  });
  renderer.setScissorTest(false);
  return true;
};
window.renderAt = (t) => {
  for (const a of S.actors) applyPose(a.player, poseAt(a.tracks.tracks, Math.min(t, a.tracks.length), a.slim), a.origin, a.yaw || 0);
  const c = S.cam || {};
  const tgt = c.follow === false ? (c.target || [0, 1, -1.5]) : smoothCentroid(t, c.smooth ?? 0.35);
  const az = (c.az ?? 90) * Math.PI / 180, el = (c.el ?? 12) * Math.PI / 180;
  // pull back when the actors spread apart (thrown victims), smoothed like the target: pure function of t
  const dist = Math.max(c.dist ?? 6, (c.dist ?? 6) * 0.55 + smoothSpread(t, c.smooth ?? 0.35) * 1.25);
  camera.position.set(tgt[0] + dist * Math.cos(el) * Math.sin(az), Math.max(0.3, tgt[1] + dist * Math.sin(el)), tgt[2] + dist * Math.cos(el) * Math.cos(az));
  camera.fov = c.fov ?? 50;
  camera.updateProjectionMatrix();
  camera.lookAt(tgt[0], tgt[1] - 0.1, tgt[2]);
  sun.position.set(tgt[0] + 6, 12, tgt[2] + 4);
  sun.target.position.set(tgt[0], 0, tgt[2]);
  renderer.render(scene, camera);
  // HUD: names, time, events firing within the last 0.15 s
  const ev = [];
  for (const a of S.actors) for (const e of a.tracks.events) if (t >= e.t && t < e.t + 0.15) ev.push(`${a.role}: ${e.name}${e.value ? '=' + e.value : ''}`);
  document.getElementById('hud').textContent = `${S.label}\nt = ${t.toFixed(3)} s   frame ${Math.round(t * 60)} @60`;
  document.getElementById('ev').textContent = ev.join('\n');
  return true;
};
window.sceneReady = true;
