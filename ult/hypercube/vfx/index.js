// VFX entry point: composes the VFX modules. createVfx(ctx) is called once; update(t, f) every frame after the actors are
// posed and the camera is placed, right before rendering. Modules (each exports create(ctx) → { update(t, f) } and may
// export post(t, p, f) → p, see post_curves.js):
//   tesseract.js  — VFX-A: seed in the palm, the world tesseract (4D), unfold, swallow, close, dive, exit shatter, beams,
//                   charge aura / ground cracks in the world
//   hyperspace.js — VFX-A: the inside set (void, nested 4D lattices, motes, cracks, collapse), inside lighting
//   combat.js     — VFX-B: hits (sparks, flashes, rings, shockwaves, speed lines), dash/blink afterimages and trails,
//                   clones' look and shatter, fist charge, launch/meteor trails, crater, dust, debris, landing
//   title.js      — VFX-B: «ГИПЕРКУБ» title overlay (HUD)
//
// ctx: { THREE, scene, renderer, camera, world (Group: the field; visible only in 'world'), inside (Group: the hyperspace
//        set; visible only in 'inside'), actors: {user, victim, clones[]} (each {def, player}), tl (timeline module),
//        tex(url, opts), hud (HTMLElement overlay), W, H, lights: {hemi, sun} }
// f:   { t, space ('world' | 'inside'), camera, pose(id) → pose (rig.js poseAt), bone(id, name) → THREE.Vector3 (world) }
import * as tesseract from './tesseract.js';
import * as hyperspace from './hyperspace.js';
import * as combat from './combat.js';
import * as title from './title.js';

export const MODULES = [tesseract, hyperspace, combat, title];

export function createVfx(ctx) {
  const parts = MODULES.map(m => m.create(ctx));
  return { update(t, f) { for (const p of parts) p.update(t, f); } };
}
