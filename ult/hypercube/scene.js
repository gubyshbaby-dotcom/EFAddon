// The ult scene: world + hyperspace sets, actors, VFX, camera, post. window.renderAt(t) renders one exact frame.
import * as THREE from 'three';
import * as TL from './timeline.js';
import { poseAt, makePlayer, applyPose, bonePoint } from './rig.js';
import { cameraAt } from './camera.js';
import { createPost, basePost, applyPost } from './post.js';
import USER from './anim/user.js';
import VICTIM from './anim/victim.js';
import CLONES from './anim/clones.js';
import { createVfx } from './vfx/index.js';

const params = new URLSearchParams(location.search);
const W = +(params.get('w') || window.innerWidth), H = +(params.get('h') || window.innerHeight);
const DEBUG = params.has('debug');
// pose lab: ?lab=<actorId>:<view> (view: side | front | back | top | left) — a fixed camera around the actor, no letterbox;
// ?novfx — skip VFX (pure animation check)
const LAB = params.get('lab'), NOVFX = params.has('novfx');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.03, 400);
scene.add(camera);

const loader = new THREE.TextureLoader();
const texCache = {};
function tex(url, { repeat, srgb = true, nearest = false } = {}) {
  const key = url + (repeat || '');
  if (texCache[key]) return texCache[key];
  const t = loader.load(url);
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return (texCache[key] = t);
}

// ---- world set: grass field, sky, sun ----
const world = new THREE.Group(); scene.add(world);
const sky = new THREE.Color(0x8fb7ff);
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ map: tex('tex/grass_block_top.png', { repeat: 160, nearest: true }), color: 0x8fbf55 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; g.name = 'ground'; world.add(g);
}
const hemi = new THREE.HemisphereLight(0xffffff, 0x556644, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(6, 12, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 60 });
sun.shadow.bias = -0.0006; scene.add(sun); scene.add(sun.target);

// ---- inside set (the VFX engineer fills it) ----
const inside = new THREE.Group(); inside.position.set(0, 0, 0); scene.add(inside);

// ---- actors ----
const ghostMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
function makeActor(def, opts = {}) {
  const map = tex(`tex/${def.skin}.png`, { nearest: true });
  const pl = makePlayer(THREE, map, def.slim, opts.ghost ? { material: opts.ghost, overMaterial: opts.ghost } : {});
  scene.add(pl.root);
  return { def, player: pl };
}
const actors = { user: makeActor(USER), victim: makeActor(VICTIM), clones: [] };
for (const c of CLONES) actors.clones.push(makeActor({ skin: USER.skin, slim: USER.slim, ...c }, { ghost: ghostMat(c.ghostColor || 0x9a7cff) }));
const byId = { user: actors.user, victim: actors.victim };
actors.clones.forEach((c, i) => (byId[c.def.id || 'clone' + i] = c));

const hud = document.getElementById('hud');
const ctx = { THREE, scene, renderer, camera, world, inside, actors, tl: TL, tex, hud, W, H, lights: { hemi, sun } };
const vfx = createVfx(ctx);
const post = createPost(renderer, scene, camera, W, H);
let postCurves = null;
try { postCurves = (await import('./vfx/post_curves.js')).postCurves; } catch (e) { /* optional */ }

const poses = {};
const f = {
  t: 0, space: 'world', shot: 'S1', camera,
  pose: id => poses[id],
  bone: (id, name) => bonePoint(THREE, byId[id].player, name),
};

window.renderAt = (t) => {
  f.t = t;
  f.space = TL.spaceAt(t);
  const inWorld = f.space === 'world';
  world.visible = inWorld; inside.visible = !inWorld;
  scene.background = inWorld ? sky : new THREE.Color(0x05020c);
  scene.fog = inWorld ? new THREE.Fog(0x8fb7ff, 30, 120) : null;
  hemi.intensity = inWorld ? 1.15 : 0.55; sun.intensity = inWorld ? 1.9 : 0.6;
  for (const [id, a] of Object.entries(byId)) { poses[id] = poseAt(a.def, t); applyPose(a.player, poses[id]); }
  for (const c of actors.clones) {
    const g = poses[c.def.id] ? poses[c.def.id].ghost : 1;
    c.player.materials.forEach(m => { m.opacity = 0.6 * g; });
  }
  scene.updateMatrixWorld(true);
  const cam = cameraAt(t, f);
  camera.position.set(...cam.pos);
  camera.fov = cam.fov; camera.aspect = W / H; camera.updateProjectionMatrix();
  camera.up.set(0, 1, 0);
  camera.lookAt(...cam.look);
  camera.rotateY(cam.shake.yaw * Math.PI / 180); camera.rotateX(cam.shake.pitch * Math.PI / 180); camera.rotateZ(cam.roll * Math.PI / 180);
  if (LAB) {
    const [id, view] = LAB.split(':');
    const pp = poses[id], yaw = pp.rot[1] * Math.PI / 180, c = bonePoint(THREE, byId[id].player, 'pelvis');
    const V = { side: [-90, 0.3, 3.6], left: [90, 0.3, 3.6], front: [-35, 0.45, 3.8], back: [215, 0.6, 3.8], top: [-30, 3.2, 1.6] }[view || 'side'];
    const a = yaw + V[0] * Math.PI / 180; // ang 0 = in front of the actor (actor faces -Z at yaw 0)
    camera.position.set(c.x - Math.sin(a) * V[2], c.y + V[1], c.z - Math.cos(a) * V[2]);
    camera.fov = 40; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0); camera.lookAt(c.x, c.y + 0.1, c.z);
  }
  camera.updateMatrixWorld(true);
  const focus = poses.user.pos;
  sun.position.set(focus[0] + 6, focus[1] + 12, focus[2] + 5); sun.target.position.set(focus[0], focus[1], focus[2]);
  f.shot = cam.shot;
  if (!NOVFX) vfx.update(t, f);
  let p = basePost(t);
  if (postCurves && !NOVFX) p = postCurves(t, p, f) || p;
  if (LAB) Object.assign(p, { letterbox: 0, vignette: 0.1, grain: 0, fade: 0, flash: 0, invert: 0, mono: 0, radial: 0, chroma: 0 });
  applyPost(post, p, t);
  post.composer.render();
  if (DEBUG) document.getElementById('dbg').textContent = `t=${t.toFixed(3)}  ${cam.shot}  ${f.space}`;
  return cam.shot;
};
window.sceneInfo = { length: TL.LENGTH, fps: TL.FPS };
window.sceneReady = true;
