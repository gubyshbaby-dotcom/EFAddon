// vfx/hyperspace.js — VFX-A: the inside of the tesseract (visible 3.40–9.65), centred at timeline INSIDE.
//   Void sky (violet-black nebula, the faint grid of a giant cube, pixel stars, abyss glow below = up/down), nested 4D
//   lattices rotating around the fighters (near ones for parallax, far ones for depth), floating pixel motes, and the
//   inside lighting (cool key + magenta/cyan rims placed relative to the camera so silhouettes always read).
//   Reactive: every hit pulses the lattices (light wave + springy swell, scaled by kind); bar 5 spins faster; 7.20 cracks +
//   aberration; 8.00–8.30 the void darkens and focuses; 8.30–8.40 everything holds, a ring of light; 8.40 the whole
//   lattice flashes and jolts (held during the freeze); 9.20–9.60 slow motion, the lattice collapses into the fighters.
import * as THREE from 'three';
import {
  Tess, Beams, Sprites, SHARED, frameShared, noiseTex, effTime, lastHits, KIND_AMP, COL, hash, clamp, lerp, smooth, ramp,
  expoOut, beatPhase,
} from './tesseract.js';
import { INSIDE, HITS, BEAT } from '../timeline.js';

const T_IN = 3.4, T_OUT = 9.65, T_CRACK = 7.2, T_RING = 8.0, T_GAP = 8.3, T_MEGA = 8.4, T_SLOW = 9.2, T_HAM = 9.6;
const I = new THREE.Vector3(...INSIDE);

// lattice clock: d(theta)/dt — integrated once into a table (pure function of t)
function rate(t) {
  let r = 1;
  r *= lerp(1, 2.8, smooth(6.3, 6.5, t) * (1 - smooth(7.9, 8.05, t)));   // bar 5: faster
  r *= lerp(1, 0.45, smooth(T_RING, T_GAP, t));                            // ring: focus, slow
  if (t >= T_GAP && t < T_MEGA + 0.2) r *= 0.04;                           // silence gap + mega freeze: hold
  r *= lerp(1, 1.6, smooth(8.6, 8.7, t) * (1 - smooth(9.15, 9.25, t)));
  r *= lerp(1, 0.3, smooth(T_SLOW, T_SLOW + 0.05, t));                     // slow motion
  for (const h of HITS) if (h.stop && t >= h.t && t < h.t + h.stop) r *= 0.12;
  return r;
}
const CLK0 = 3.0, CLKDT = 1 / 600, CLK = [];
{ let a = 0; for (let t = CLK0; t <= 10.2; t += CLKDT) { CLK.push(a); a += rate(t) * CLKDT; } }
function clock(t) {
  const x = (t - CLK0) / CLKDT;
  if (x <= 0) return x * CLKDT;
  const i = Math.min(CLK.length - 2, Math.floor(x)), u = Math.min(1, x - i);
  return CLK[i] + (CLK[i + 1] - CLK[i]) * u;
}
// hit jolts: each hit snaps the lattice rotation a little (accumulates; closed form, holds during hit-stop)
const JOLT = { light: 0.035, medium: 0.07, heavy: 0.14, mega: 0.55 };
function jolt(t, seed) {
  const te = effTime(t);
  let a = 0;
  for (let i = 0; i < HITS.length; i++) {
    const h = HITS[i];
    if (h.t < T_IN || h.t > t) continue;
    const dt = te - effTime(h.t);
    a += JOLT[h.kind] * (hash(i, seed) < 0.5 ? -1 : 1) * (1 - Math.exp(-dt * 16));
  }
  return a;
}
// springy swell of the lattice on each hit
function swell(t) {
  const te = effTime(t);
  let s = 0;
  for (const h of HITS) {
    if (h.t < T_IN || h.t > t) continue;
    const dt = te - effTime(h.t);
    if (dt > 1.2) continue;
    s += KIND_AMP[h.kind] * Math.exp(-dt * 7) * Math.cos(dt * 34);
  }
  return s;
}
function flashOf(t, k = 9) {
  const te = effTime(t);
  let s = 0;
  for (const h of HITS) {
    if (h.t < T_IN || h.t > t) continue;
    const dt = te - effTime(h.t);
    if (dt > 1.5) continue;
    s += KIND_AMP[h.kind] * Math.exp(-dt * k);
  }
  return s;
}

const LAT = [
  // s = outer half size; spd = 4D plane speeds (xw, yw, zw) on the lattice clock; spin = slow 3D turn. The fighters and the
  // camera live inside L0's inner cell (half s/2), so no edge cuts between the camera and the fight most of the time.
  { s: 6.8, edgeW: 0.008, flareS: 0.03, edge: 0.4, flare: 0.22, coreI: 0.95, faces: null, spd: [0.55, 0.33, -0.21], spin: 0.06, hue: 0.0, near: 2.6, tilt: 0.3 },
  { s: 15, edgeW: 0.0065, flareS: 0.026, edge: 0.34, flare: 0.2, coreI: 0.75, faces: 'lattice', spd: [-0.29, 0.41, 0.17], spin: -0.035, hue: 0.12, near: 3, tilt: -0.5 },
  { s: 36, edgeW: 0.0055, flareS: 0.024, edge: 0.28, flare: 0.18, coreI: 0.6, faces: null, spd: [0.19, -0.15, 0.31], spin: 0.02, hue: -0.18, near: 3, tilt: 0.9 },
  { s: 85, edgeW: 0.005, flareS: 0.022, edge: 0.24, flare: 0.16, coreI: 0.5, faces: null, spd: [-0.11, 0.09, -0.07], spin: -0.012, hue: 0.25, near: 4, tilt: -1.1 },
];

let H = null; // module state for post()
const DBG = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('vfxa')) || ''; // debug: my probe only

export function create(ctx) {
  const { inside, scene, lights } = ctx;
  const root = new THREE.Group(); inside.add(root);
  // ---------------- sky
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uI: { value: 1 }, uFlash: { value: 0 }, uGrid: { value: 1 }, uNoise: { value: noiseTex() }, uRot: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition;
      gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform float uTime; uniform float uI; uniform float uFlash; uniform float uGrid; uniform float uRot; uniform sampler2D uNoise;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = vec3(0.0035, 0.0016, 0.011);
        col += vec3(0.030, 0.008, 0.060) * pow(1.0 - abs(y), 5.0);            // horizon band
        col += vec3(0.055, 0.010, 0.090) * smoothstep(-0.05, -0.95, y);        // abyss glow below
        col += vec3(0.004, 0.010, 0.022) * smoothstep(0.2, 1.0, y);             // cold zenith
        float c = cos(uRot), s = sin(uRot);
        vec3 e = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
        vec3 ad = abs(e);
        float fx = step(ad.y, ad.x) * step(ad.z, ad.x), fy = (1.0 - fx) * step(ad.z, ad.y);
        vec2 cp = fx > 0.5 ? e.yz / ad.x : (fy > 0.5 ? e.xz / ad.y : e.xy / ad.z);
        float fid = fx > 0.5 ? 0.0 : (fy > 0.5 ? 1.0 : 2.0);
        vec2 nuv = cp * 0.33 + vec2(fid * 0.37, fid * 0.21) + vec2(uTime * 0.006, 0.0);
        float n1 = texture2D(uNoise, nuv).r;
        float n2 = texture2D(uNoise, nuv * 2.1 + 0.5).g;
        float neb = smoothstep(0.42, 0.95, n1 * 0.72 + n2 * 0.4);
        vec3 nc = mix(vec3(0.258, 0.107, 1.0), vec3(1.0, 0.047, 0.888), n2);
        nc = mix(nc, vec3(0.037, 0.8, 1.0), smoothstep(0.62, 0.9, n1) * 0.6);
        col += nc * neb * 0.085;
        vec2 gg = cp * 3.0;
        vec2 g = abs(fract(gg) - 0.5);
        vec2 fw = fwidth(gg);
        float line = max(1.0 - smoothstep(0.0, fw.x * 1.2, 0.5 - g.x), 1.0 - smoothstep(0.0, fw.y * 1.2, 0.5 - g.y));
        float rim = 1.0 - smoothstep(0.0, 0.012, 1.0 - max(abs(cp.x), abs(cp.y)));
        col += vec3(0.258, 0.107, 1.0) * (line * 0.045 + rim * 0.12) * uGrid;
        vec2 sg = cp * 70.0 + fid * 13.0; vec2 si = floor(sg); vec2 sf = fract(sg) - 0.5;
        float sh = h21(si);
        float star = step(0.975, sh) * step(max(abs(sf.x), abs(sf.y)), 0.16 + 0.12 * fract(sh * 7.0));
        col += mix(vec3(0.7, 0.55, 1.0), vec3(0.5, 0.95, 1.0), fract(sh * 13.0)) * star * (0.35 + 0.3 * sin(uTime * 3.0 + sh * 80.0));
        col *= uI;
        col += vec3(0.35, 0.22, 0.9) * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 48, 24), skyMat);
  sky.position.copy(I); sky.renderOrder = -10; sky.frustumCulled = false;
  root.add(sky);
  // ---------------- lattices
  const lat = LAT.map(L => new Tess(root, { faces: L.faces, N: 4, edgeW: L.edgeW, flareS: L.flareS, minPx: 0.9, flarePx: 1.5, near: L.near }));
  lat.forEach((T, k) => { T.beams.u.uCoreI.value = LAT[k].coreI; });
  // ---------------- motes + ring
  const motes = new Sprites(420, { order: 7, minPx: 0.9, near: 0.5 });
  const fxB = new Beams(80, { order: 6, minPx: 0.8, near: 0.2 });
  root.add(motes.mesh, fxB.mesh);
  // ---------------- lights: two rims (always in the scene so the light count never changes)
  const rimM = new THREE.DirectionalLight(0xff3df2, 0), rimC = new THREE.DirectionalLight(0x36e7ff, 0);
  scene.add(rimM, rimM.target, rimC, rimC.target);
  const base = { hemiSky: lights.hemi.color.clone(), hemiGround: lights.hemi.groundColor.clone(), sun: lights.sun.color.clone() };
  const KEYC = new THREE.Color(0xc8d4ff), HEMIS = new THREE.Color(0x7a5cff), HEMIG = new THREE.Color(0x1a0838);
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _c = new THREE.Vector3(), _v = new THREE.Vector3();

  H = { ctx, focusScreen: [0.5, 0.5] };

  function update(t, f) {
    frameShared(t, f, ctx);
    const inS = f.space === 'inside';
    if (!inS) {
      rimM.intensity = 0; rimC.intensity = 0;
      lights.hemi.color.copy(base.hemiSky); lights.hemi.groundColor.copy(base.hemiGround); lights.sun.color.copy(base.sun);
      return;
    }
    const te = effTime(t);
    const vch = f.bone('victim', 'chest');
    const cam = f.camera;
    _v.copy(vch).project(cam);
    H.focusScreen = [clamp((_v.x + 1) / 2, 0.15, 0.85), clamp((_v.y + 1) / 2, 0.15, 0.85)];
    // ---------------- lighting (camera-relative: key over the camera's shoulder, rims behind the subject)
    _c.copy(vch);
    _f.subVectors(_c, cam.position).normalize();                 // camera → subject
    _r.crossVectors(_f, _u).normalize();                          // camera right
    const hp = flashOf(t, 14);
    const dark = smooth(T_RING, T_GAP, t) * (1 - smooth(T_MEGA, T_MEGA + 0.3, t));
    const mega = t >= T_MEGA ? Math.exp(-Math.max(0, te - effTime(T_MEGA)) * 6) : 0;
    lights.sun.color.copy(KEYC);
    lights.sun.intensity = (1.7 + 0.5 * hp) * (1 - 0.45 * dark) + 3 * mega;
    lights.sun.position.copy(_c).addScaledVector(_f, -6).addScaledVector(_r, -3.5).addScaledVector(_u, 6);
    lights.sun.target.position.copy(_c);
    lights.hemi.color.copy(HEMIS); lights.hemi.groundColor.copy(HEMIG);
    lights.hemi.intensity = 0.9 * (1 - 0.3 * dark) + 0.6 * mega;
    rimM.intensity = 3.2 * (1 + 0.6 * hp) + 2 * dark;
    rimM.position.copy(_c).addScaledVector(_f, 6).addScaledVector(_r, -5).addScaledVector(_u, 2.5);
    rimM.target.position.copy(_c);
    rimC.intensity = 3.0 * (1 + 0.6 * hp) + 2 * dark;
    rimC.position.copy(_c).addScaledVector(_f, 6).addScaledVector(_r, 5).addScaledVector(_u, -1);
    rimC.target.position.copy(_c);
    rimM.target.updateMatrixWorld(); rimC.target.updateMatrixWorld(); lights.sun.target.updateMatrixWorld();

    // ---------------- lattices
    const th = clock(t);
    const entry = expoOut(ramp(T_IN, T_IN + 0.38, t));
    const col = ramp(T_SLOW, T_HAM + 0.04, t), colE = col * col * col;
    const sw = swell(t);
    const focus = smooth(T_RING, T_GAP, t) * (1 - smooth(T_MEGA, T_MEGA + 0.25, t));
    const megaKick = t >= T_MEGA ? Math.exp(-Math.max(0, te - effTime(T_MEGA)) * 10) : 0;
    const crack = Math.pow(ramp(T_CRACK, T_HAM, t), 0.8);
    const hits = lastHits(t, 2);
    const cen = I.clone().lerp(vch, 0.35 + 0.65 * colE);
    const bright = (1 + 0.6 * Math.min(1.2, flashOf(t, 8)) + 0.8 * megaKick) * lerp(1, 0.45, dark) * (1 + 1.6 * (1 - entry)) * (1 + 0.9 * colE);
    lat.forEach((T, k) => {
      const L = LAT[k];
      if (DBG.includes('nolat' + k)) { T.update({ s: 0 }); return; }
      const sc = L.s * lerp(0.3, 1, entry) * (1 + 0.035 * sw * (k === 0 ? 1.4 : 1)) * (1 - 0.1 * focus) * (1 + 0.14 * megaKick) * lerp(1, 0.05 + 0.04 * k, colE);
      const j = jolt(t, 40 + k);
      const A = { xw: L.spd[0] * th + j, yw: L.spd[1] * th - j * 0.6, zw: L.spd[2] * th + j * 0.3, xz: L.spin * th * 3 + L.tilt * 0.3, yz: L.tilt * 0.4, xy: 0.15 * L.tilt };
      // light waves from the last two hits run out through the lattice
      const u = T.beams.u;
      u.uWaveC.value.copy(vch);
      u.uWave.value.set(0, 0, 0, 0);
      const wa = h => Math.min(1.6, 2.2 * KIND_AMP[h.h.kind]) * Math.exp(-h.age * 1.2) * smooth(0, 0.04, h.age + 0.01);
      if (hits[0]) u.uWave.value.x = 1 + hits[0].age * 22, u.uWave.value.y = wa(hits[0]);
      if (hits[1]) u.uWave.value.z = 1 + hits[1].age * 22, u.uWave.value.w = wa(hits[1]);
      u.uWaveW.value = 1.2 + k * 1.5;
      u.uGlitch.value = 0.45 * crack * (k < 2 ? 1 : 0.5);
      u.uFocus.value.set(H.focusScreen[0], H.focusScreen[1], (k < 2 ? 0.75 : 0.5) * (1 - colE));
      T.update({
        c: cen, s: sc, A, edge: L.edge * bright, flare: L.flare * bright, face: T.faceMesh && (crack > 0 || megaKick > 0.02) ? 1 - smooth(T_SLOW, T_SLOW + 0.22, t) : 0, hue: L.hue,
        flowN: 2, flowS: 0.8 + 1.4 * (rate(t) - 1) / 1.8,
        uCrack: crack, uFlash: 0.15 * Math.min(1.2, flashOf(t, 10)) + 0.3 * megaKick + 0.3 * colE,
      });
    });

    // ---------------- sky
    skyMat.uniforms.uI.value = lerp(1, 0.45, dark) * (1 + 0.6 * colE) * (1 + 1.2 * (1 - entry));
    skyMat.uniforms.uFlash.value = 0.015 * flashOf(t, 10) + 0.06 * megaKick + 0.15 * colE * colE;
    skyMat.uniforms.uRot.value = th * 0.02;

    // ---------------- motes (pixel dust drifting upward; pulled into the collapse)
    const M = motes.begin();
    for (let i = 0; i < (DBG.includes('nomotes') ? 0 : 400); i++) {
      const h = m => hash(i, 2000 + m);
      const r = 1.6 + 13 * Math.pow(h(0), 1.4), az = h(1) * Math.PI * 2, el = (h(2) - 0.5) * 2.2;
      const span = 6 + 6 * h(3), v = 0.08 + 0.3 * h(4);
      const ph = ((h(5) * span + v * t) % span), fr = ph / span;
      const p = new THREE.Vector3(Math.cos(az) * r * Math.cos(el * 0.6), Math.sin(el) * r * 0.5 + ph - span / 2, Math.sin(az) * r * Math.cos(el * 0.6)).add(I);
      p.x += 0.25 * Math.sin(t * (0.4 + 0.5 * h(6)) + h(7) * 6);
      if (colE > 0) p.lerp(vch, colE * 0.85);
      if (entry < 1) p.lerp(I, (1 - entry) * 0.6);
      const tw = 0.55 + 0.45 * Math.sin(t * (2 + 5 * h(8)) + h(9) * 6);
      const kind = h(10) < 0.82 ? 0 : 1;
      const cc = h(11) < 0.45 ? COL.violet : h(11) < 0.7 ? COL.magenta : h(11) < 0.92 ? COL.cyan : [1, 1, 1];
      const size = kind === 0 ? 0.018 + 0.03 * h(12) : 0.08 + 0.12 * h(12);
      const inten = (kind === 0 ? 1.8 : 0.35) * tw * Math.sin(Math.PI * fr) * lerp(1, 0.5, dark) * (1 + 0.8 * flashOf(t, 10) + 2 * megaKick + 2 * colE);
      M.push(p, size, kind, cc, inten, h(13) * 3);
    }
    M.end();

    // ---------------- ring of light: 8.00–8.40 contracts around the victim, bursts at the mega hit
    const B = fxB.begin();
    if (t >= T_RING && t < T_MEGA + 0.3) {
      const pre = t < T_MEGA, a = t - T_MEGA;
      const R = pre ? lerp(2.8, 2.05, smooth(T_RING, T_GAP, t)) : 2.05 + 14 * expoOut(clamp((effTime(t) - effTime(T_MEGA)) / 0.5));
      const inten = pre ? 1.4 * smooth(T_RING, T_GAP + 0.05, t) * (t >= T_GAP ? 1.25 : 1) : 1.6 * Math.exp(-Math.max(0, effTime(t) - effTime(T_MEGA)) * 9);
      const cy = vch.y;
      const NS = 64;
      for (let s = 0; s < NS; s++) {
        const a0 = (s / NS) * Math.PI * 2 + th * 0.2, a1 = ((s + 1) / NS) * Math.PI * 2 + th * 0.2;
        const fl = 0.75 + 0.25 * Math.sin(s * 1.7 + t * 30);
        B.push([vch.x + Math.cos(a0) * R, cy, vch.z + Math.sin(a0) * R], [vch.x + Math.cos(a1) * R, cy, vch.z + Math.sin(a1) * R], 0.02 + (pre ? 0 : 0.035), COL.cyan, inten * fl, COL.violet, inten * fl);
      }
    }
    B.end();

    // focus point on screen (for the post radial centre)
    _v.copy(vch).project(cam);
    H.focusScreen = [clamp((_v.x + 1) / 2, 0.15, 0.85), clamp((_v.y + 1) / 2, 0.15, 0.85)];
  }
  return { update };
}

export function post(t, p, f) {
  if (!H || f.space !== 'inside' || DBG.includes('nopost')) return p;
  const te = effTime(t);
  p.bloom.strength = Math.max(p.bloom.strength, 0.85);
  p.bloom.radius = Math.max(p.bloom.radius, 0.6);
  p.vignette = Math.max(p.vignette, 0.45);
  p.saturation *= 1.08; p.contrast *= 1.05;
  // entry: continue the dive look and settle
  const e = 1 - expoOut(ramp(T_IN, T_IN + 0.25, t));
  p.radial = Math.max(p.radial, 1.5 * e);
  p.chroma = Math.max(p.chroma, 0.6 * e);
  p.exposure *= 1 + 0.25 * e;
  // cracks → aberration ramps (plus a kick on every hit)
  const ck = smooth(T_CRACK, 8.0, t);
  p.chroma = Math.max(p.chroma, ck * (0.18 + 0.22 * Math.min(1, flashOf(t, 12))));
  // ring charge: darker, tighter
  const dk = smooth(T_RING, T_GAP, t) * (1 - smooth(T_MEGA, T_MEGA + 0.25, t));
  p.exposure *= 1 - 0.22 * dk;
  p.vignette = Math.max(p.vignette, 0.45 + 0.3 * dk);
  // mega: aberration burst (held through the freeze)
  if (t >= T_MEGA) p.chroma = Math.max(p.chroma, 0.5 * Math.exp(-Math.max(0, te - effTime(T_MEGA)) * 6));
  // collapse
  const cu = ramp(T_SLOW, T_HAM, t);
  if (cu > 0) {
    p.radial = Math.max(p.radial, 0.45 * cu * cu);
    p.radialCenter = H.focusScreen;
    p.chroma = Math.max(p.chroma, 0.08 + 0.2 * cu);
    p.exposure *= 1 + 0.1 * cu * cu;
  }
  return p;
}
