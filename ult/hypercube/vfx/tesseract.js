// vfx/tesseract.js — VFX-A: the tesseract (4D hypercube) and world-level energy.
//   World beats: 0.40 charge (ground cracks, aura motes, faint 4D grid around the user) → 1.00–1.20 the grid condenses into
//   the palm → 1.20 seed (0.15 bl, 4D-spinning, arcs) → 1.62–1.80 thrown past the victim (trail) → 1.80 unfold to 3.6 bl
//   (overshoot, ground shockwave ring + dust, light burst) → 2.40 beat click → swallow ripple where the victim enters →
//   3.00 faces snap shut + 4D flip + flash → 3.20–3.40 dive (vortex face, warp tunnel, radial blur) → 9.65 exit: implode,
//   9.78 SHATTER (shards, god rays, exploding wireframe, flash) → shards fall and dissolve into motes → lingering motes.
// Also the shared 4D/FX library used by hyperspace.js: Tess (projected 4D cube: beams + flares + faces), Beams, Sprites,
// textures, hashes, effTime/hitPulse. Everything is a pure function of the scene time t.
import * as THREE from 'three';
import { poseAt, makePlayer, applyPose, bonePoint, sample, PX } from '../rig.js';
import { HITS, WORLD, BEAT, EVENTS } from '../timeline.js';

// ---------------------------------------------------------------------------------------------------------------- utils
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const ramp = (a, b, x) => clamp((x - a) / (b - a));
export const expoOut = u => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
export const expoIn = u => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10));
export const backOut = (u, s = 1.9) => { const x = u - 1; return 1 + (s + 1) * x * x * x + s * x * x; };
export function hash(i, s = 0) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((s | 0) + 0x165667b1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** Linear-light palette (sRGB hex of the style bible converted to linear). */
export const COL = {
  violet: [0.258, 0.107, 1.0], magenta: [1.0, 0.047, 0.888], cyan: [0.037, 0.80, 1.0], white: [1, 1, 1],
  deep: [0.0015, 0.0006, 0.0037],
};
export function mixc(a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
/** colour along the 4D depth w (−1 inner cell → cyan, 0 → magenta, +1 outer → violet) */
export function wColor(w, shift = 0) {
  const u = clamp((w + 1) / 2 + shift, 0, 1);
  return u < 0.5 ? mixc(COL.cyan, COL.magenta, u * 2) : mixc(COL.magenta, COL.violet, u * 2 - 1);
}
/** Scene time with every hit-stop removed: hit-reactive motion computed from it holds during freezes. */
export function effTime(t) {
  let s = 0;
  for (const h of HITS) if (h.stop && t > h.t) s += Math.min(t - h.t, h.stop);
  return t - s;
}
export const KIND_AMP = { light: 0.35, medium: 0.65, heavy: 1.0, mega: 2.2 };
/** Sum of decaying pulses from hits (holds during hit-stop). */
export function hitPulse(t, k = 7, filter) {
  const te = effTime(t);
  let s = 0;
  for (const h of HITS) {
    if (filter && !filter(h)) continue;
    const dt = te - effTime(h.t);
    if (dt < 0 || dt > 3) continue;
    s += KIND_AMP[h.kind] * Math.exp(-dt * k);
  }
  return s;
}
/** Last hit at or before t (or null), with its age in effective time. */
export function lastHits(t, n = 2) {
  const te = effTime(t), out = [];
  for (let i = HITS.length - 1; i >= 0 && out.length < n; i--) if (HITS[i].t <= t + 1e-6) out.push({ h: HITS[i], age: te - effTime(HITS[i].t) });
  return out;
}
export const beatPhase = t => ((t / BEAT) % 1 + 1) % 1;

// --------------------------------------------------------------------------------------------------------- 4D topology
export const V4 = [];
for (let i = 0; i < 16; i++) V4.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
export const E4 = []; // [i, j, axis]
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) E4.push([i, j, b]); }
export const F4 = []; // 24 squares: corners v00 v10 v01 v11 (u along axis a, v along axis b)
for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
  const o = [0, 1, 2, 3].filter(k => k !== a && k !== b);
  for (let m = 0; m < 4; m++) {
    const base = (m & 1 ? 1 << o[0] : 0) | (m & 2 ? 1 << o[1] : 0);
    F4.push({ a, b, v: [base, base | (1 << a), base | (1 << b), base | (1 << a) | (1 << b)] });
  }
}
function rotp(p, i, j, ang) { if (!ang) return; const c = Math.cos(ang), s = Math.sin(ang), x = p[i], y = p[j]; p[i] = x * c - y * s; p[j] = x * s + y * c; }
/** rotate a 4D point by angles {xw, yw, zw, xy, xz, yz} (radians) */
export function rot4(v, A, out = [0, 0, 0, 0]) {
  out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; out[3] = v[3];
  rotp(out, 0, 3, A.xw); rotp(out, 1, 3, A.yw); rotp(out, 2, 3, A.zw);
  rotp(out, 0, 2, A.xz); rotp(out, 1, 2, A.yz); rotp(out, 0, 1, A.xy);
  return out;
}

// ------------------------------------------------------------------------------------------------- shared uniforms/tex
export const SHARED = { uTime: { value: 0 }, uPx: { value: 0.002 }, uRes: { value: new THREE.Vector2(1280, 720) } };
let NOISE = null, CRACK_FACE = null, CRACK_GROUND = null;
/** Tileable value-noise RGBA texture: R fbm(4), G fbm(8), B fbm(16), A white noise. Deterministic. */
export function noiseTex() {
  if (NOISE) return NOISE;
  const N = 128, data = new Uint8Array(N * N * 4);
  const lattices = {};
  const lat = (f, s) => (lattices[f + ':' + s] ||= Float32Array.from({ length: f * f }, (_, i) => hash(i, s)));
  const vn = (x, y, f, s) => {
    const g = lat(f, s), fx = x * f, fy = y * f, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
    const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy), x0 = ix % f, x1 = (ix + 1) % f, y0 = iy % f, y1 = (iy + 1) % f;
    return lerp(lerp(g[y0 * f + x0], g[y0 * f + x1], sx), lerp(g[y1 * f + x0], g[y1 * f + x1], sx), sy);
  };
  const fbm = (x, y, f, s) => { let a = 0, w = 0.5, n = 0; for (let o = 0; o < 4; o++) { a += w * vn(x, y, f << o, s + o * 7); n += w; w *= 0.5; } return a / n; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, k = (y * N + x) * 4;
    data[k] = clamp((fbm(u, v, 4, 1) - 0.5) * 1.8 + 0.5) * 255;
    data[k + 1] = clamp((fbm(u, v, 8, 2) - 0.5) * 1.8 + 0.5) * 255;
    data[k + 2] = clamp((fbm(u, v, 16, 3) - 0.5) * 1.8 + 0.5) * 255;
    data[k + 3] = hash(y * N + x, 9) * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return (NOISE = t);
}
/**
 * Pixel crack texture (random-walk cracks with branches). R = crack (1 main, 0.6 branch), G = reveal order 0..1 along the
 * crack paths (shader: lit when G < progress), B = halo (blurred cracks), A = halo reveal order. Nearest filtered.
 */
function crackTex(N, seed, starts, arms, len, jit = 0.7, br = 0.045) {
  const R = new Float32Array(N * N), G = new Float32Array(N * N).fill(1);
  let maxOrder = 1; const segs = [];
  let hs = seed * 1000;
  const rnd = () => hash(hs++, seed);
  function walk(x, y, a, n, o0, depth) {
    for (let i = 0; i < n; i++) {
      a += (rnd() - 0.5) * jit;
      x += Math.cos(a); y += Math.sin(a);
      const px = Math.round(x), py = Math.round(y);
      if (px < 0 || py < 0 || px >= N || py >= N) return;
      const o = o0 + i;
      segs.push([px, py, depth ? 0.6 : 1, o]);
      if (depth === 0 && i < n * 0.35) segs.push([px + (Math.abs(Math.cos(a)) < 0.7 ? 1 : 0), py + (Math.abs(Math.cos(a)) >= 0.7 ? 1 : 0), 1, o]);
      maxOrder = Math.max(maxOrder, o);
      if (depth < 2 && rnd() < br) walk(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), n * (0.3 + rnd() * 0.3), o, depth + 1);
    }
  }
  for (const [sx, sy, o0] of starts) for (let k = 0; k < arms; k++) walk(sx * N, sy * N, (k + rnd() * 0.7) / arms * Math.PI * 2, len * N * (0.6 + rnd() * 0.5), o0 * N, 0);
  for (const [px, py, r, o] of segs) {
    if (px < 0 || py < 0 || px >= N || py >= N) continue;
    const k = py * N + px; R[k] = Math.max(R[k], r); G[k] = Math.min(G[k], o / maxOrder);
  }
  const B = new Float32Array(N * N), A = new Float32Array(N * N).fill(1), rad = 3;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, mo = 1;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const k = yy * N + xx; if (R[k] <= 0) continue;
      const w = Math.exp(-(dx * dx + dy * dy) / 4.5); s += R[k] * w; mo = Math.min(mo, G[k] + Math.sqrt(dx * dx + dy * dy) * 0.01);
    }
    B[y * N + x] = Math.min(1, s * 0.35); A[y * N + x] = mo;
  }
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) { data[k * 4] = R[k] * 255; data[k * 4 + 1] = G[k] * 255; data[k * 4 + 2] = B[k] * 255; data[k * 4 + 3] = A[k] * 255; }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  t.userData.segs = segs.map(([x, y, r, o]) => [x / N, y / N, o / maxOrder]);
  return t;
}
export function crackFaceTex() { return (CRACK_FACE ||= crackTex(256, 3, [[0.42, 0.55, 0], [0.78, 0.2, 0.3]], 5, 0.55, 0.32, 0.018)); }
export function crackGroundTex() { return (CRACK_GROUND ||= crackTex(128, 7, [[0.5, 0.5, 0]], 9, 0.42)); }

// ---------------------------------------------------------------------------------------------------------------- Beams
const BEAM_VS = `
attribute vec3 aA; attribute vec3 aB; attribute vec4 aCA; attribute vec4 aCB; attribute vec4 aW;
uniform float uPx; uniform float uMinPx; uniform float uNear; uniform float uCoreK; uniform float uWorld;
varying vec3 vCol; varying float vI; varying vec2 vQ; varying float vL; varying float vU; varying vec3 vFl;
varying float vFade; varying vec3 vWP; varying float vCK;
void main() {
  vec3 a = (modelViewMatrix * vec4(aA, 1.0)).xyz;
  vec3 b = (modelViewMatrix * vec4(aB, 1.0)).xyz;
  vec3 d = b - a; float len = length(d);
  vec3 dn = len > 1e-6 ? d / len : vec3(0.0, 1.0, 0.0);
  vec3 p = mix(a, b, position.x);
  float depth = max(0.01, -p.z);
  float pxw = uPx * depth;
  float w = max(aW.x, uMinPx * pxw);
  vec3 side = cross(dn, normalize(p));
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
  float ex = position.x * 2.0 - 1.0;
  p += side * (position.y * w) + dn * (ex * w);
  vQ = vec2(position.x * len / w + ex, position.y);
  vL = len / w;
  vU = position.x;
  vCol = mix(aCA.rgb, aCB.rgb, position.x);
  vI = mix(aCA.a, aCB.a, position.x);
  vFl = aW.yzw;
  float wpx = w / pxw;
  vCK = min(uCoreK, wpx * wpx * 1.6);
  vFade = smoothstep(uNear * 0.35, uNear, depth) * clamp(aW.x / w, 0.4, 1.0);
  vWP = uWorld > 0.5 ? mix(aA, aB, position.x) : vec3(0.0);
  gl_Position = projectionMatrix * vec4(p, 1.0);
  if (max(-a.z, -b.z) < uNear * 0.35) gl_Position = vec4(0.0, 0.0, -2.0, 1.0); // both ends inside the near fade: skip
}`;
const BEAM_FS = `
uniform float uTime; uniform float uHaloK; uniform float uGlitch; uniform vec4 uWave; uniform vec3 uWaveC; uniform float uWaveW;
uniform float uClipY; uniform float uCoreI; uniform vec3 uFocus; uniform vec2 uRes;
varying vec3 vCol; varying float vI; varying vec2 vQ; varying float vL; varying float vU; varying vec3 vFl;
varying float vFade; varying vec3 vWP; varying float vCK;
void main() {
  float s = vQ.x, y = vQ.y;
  float de = max(0.0, max(-s, s - vL));
  float r2 = y * y + de * de;
  if (r2 >= 1.0) discard;
  float halo = exp(-r2 * uHaloK) * (1.0 - r2);
  float core = exp(-r2 * vCK);
  float fl = fract(vU * vFl.x - uTime * vFl.z + vFl.y);
  float pulse = smoothstep(0.0, 0.06, fl) * (1.0 - smoothstep(0.06, 0.4, fl));
  float wv = 0.0;
  if (uWave.y + uWave.w > 0.0) {
    float dd = distance(vWP, uWaveC);
    wv = uWave.y * exp(-pow((dd - uWave.x) / uWaveW, 2.0)) + uWave.w * exp(-pow((dd - uWave.z) / uWaveW, 2.0));
  }
  float clip = smoothstep(uClipY, uClipY - 0.5, vWP.y);
  float g = 1.0;
  if (uGlitch > 0.0) {
    float h = fract(sin(vFl.y * 91.7 + floor(uTime * 24.0) * 13.13) * 43758.5453);
    g = 1.0 - uGlitch * 0.85 * step(h, 0.3) + uGlitch * 1.4 * step(0.88, h);
  }
  if (uFocus.z > 0.0) {
    vec2 dd = (gl_FragCoord.xy / uRes - uFocus.xy) * vec2(uRes.x / uRes.y, 1.0);
    g *= 1.0 - uFocus.z * (1.0 - smoothstep(0.1, 0.42, length(dd)));
  }
  vec3 c = vCol * halo * 0.4 * (1.0 + pulse * 1.5 + wv) + mix(vCol, vec3(1.0, 0.96, 1.0), 0.7) * core * uCoreI * (1.0 + pulse * 0.6 + wv * 0.6);
  gl_FragColor = vec4(c * vI * vFade * clip * g, 1.0);
}`;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _yUp = new THREE.Vector3(0, 1, 0);
const xyz = (p, i) => (Array.isArray(p) ? p[i] : i === 0 ? p.x : i === 1 ? p.y : p.z);
export class Beams {
  /** o: {order, minPx, near, coreK, haloK, coreI, world: true if positions are world (for waves/clip)} */
  constructor(max, o = {}) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n, k) => { const at = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, at); return at; };
    this.aA = mk('aA', 3); this.aB = mk('aB', 3); this.aCA = mk('aCA', 4); this.aCB = mk('aCB', 4); this.aW = mk('aW', 4);
    g.instanceCount = 0; this.geo = g;
    this.u = {
      uTime: SHARED.uTime, uPx: SHARED.uPx, uMinPx: { value: o.minPx ?? 1.0 }, uNear: { value: o.near ?? 0.25 },
      uCoreK: { value: o.coreK ?? 36 }, uHaloK: { value: o.haloK ?? 3.2 }, uCoreI: { value: o.coreI ?? 1.3 }, uGlitch: { value: 0 },
      uWave: { value: new THREE.Vector4() }, uWaveC: { value: new THREE.Vector3() }, uWaveW: { value: 0.8 },
      uClipY: { value: 1e6 }, uWorld: { value: o.world === false ? 0 : 1 }, uFocus: { value: new THREE.Vector3(0.5, 0.5, 0) }, uRes: SHARED.uRes,
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = o.order ?? 3;
  }
  begin() { this.n = 0; return this; }
  /** a, b: points; w: half width (world); ca/cb: colours (linear rgb) with intensities ia/ib; fl = [pulses per beam, phase, speed] */
  push(a, b, w, ca, ia, cb = ca, ib = ia, fl = null) {
    if (this.n >= this.max || !(ia > 0 || ib > 0)) return;
    const i = this.n++, A = this.aA.array, B = this.aB.array, CA = this.aCA.array, CB = this.aCB.array, W = this.aW.array;
    for (let k = 0; k < 3; k++) { A[i * 3 + k] = xyz(a, k); B[i * 3 + k] = xyz(b, k); CA[i * 4 + k] = ca[k]; CB[i * 4 + k] = cb[k]; }
    CA[i * 4 + 3] = ia; CB[i * 4 + 3] = ib;
    W[i * 4] = w; W[i * 4 + 1] = fl ? fl[0] : 0; W[i * 4 + 2] = fl ? fl[1] : 0; W[i * 4 + 3] = fl ? fl[2] : 0;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const at of [this.aA, this.aB, this.aCA, this.aCB, this.aW]) at.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }
}

// -------------------------------------------------------------------------------------------------------------- Sprites
const SPR_VS = `
attribute vec3 aP; attribute vec4 aC; attribute vec4 aS;
uniform float uPx; uniform float uMinPx; uniform float uNear;
varying vec2 vQ; varying vec4 vC; varying float vK; varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(aP, 1.0);
  float depth = max(0.01, -mv.z);
  float s = max(aS.x, uMinPx * uPx * depth);
  float c = cos(aS.z), sn = sin(aS.z);
  vec2 q = position.xy;
  mv.xy += vec2(c * q.x - sn * q.y, sn * q.x + c * q.y) * s * vec2(aS.w, 1.0);
  vQ = q; vC = aC; vK = aS.y;
  float sh = aS.x / s;
  vFade = smoothstep(uNear * 0.35, uNear, depth) * clamp(sh * sh, 0.15, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const SPR_FS = `
varying vec2 vQ; varying vec4 vC; varying float vK; varying float vFade;
void main() {
  vec2 q = vQ; float r2 = dot(q, q);
  float a;
  if (vK < 0.5) {            // pixel square with a soft glow
    float m = max(abs(q.x), abs(q.y));
    a = m < 0.42 ? 1.0 : exp(-r2 * 5.0) * 0.3;
  } else if (vK < 1.5) {     // soft orb
    a = exp(-r2 * 4.5) * (1.0 - min(r2, 1.0));
  } else if (vK < 2.5) {     // anime flare: core + halo + 4 streaks
    float ax = abs(q.x), ay = abs(q.y);
    a = exp(-r2 * 36.0) * 2.0 + exp(-r2 * 6.0) * 0.45 + (exp(-ay * 55.0) * (1.0 - ax) + exp(-ax * 55.0) * (1.0 - ay)) * 0.9;
  } else {                   // ring
    float r = sqrt(r2);
    a = exp(-pow((r - 0.8) * 9.0, 2.0)) + exp(-r2 * 30.0) * 0.4;
  }
  #ifdef DUST
  gl_FragColor = vec4(vC.rgb, vC.a * a * vFade);
  #else
  gl_FragColor = vec4(vC.rgb * vC.a * a * vFade, 1.0);
  #endif
}`;
export class Sprites {
  /** kinds: 0 pixel square, 1 soft orb, 2 flare, 3 ring. o: {order, minPx, near, dust (normal blending)} */
  constructor(max, o = {}) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n, k) => { const at = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, at); return at; };
    this.aP = mk('aP', 3); this.aC = mk('aC', 4); this.aS = mk('aS', 4);
    g.instanceCount = 0; this.geo = g;
    this.u = { uPx: SHARED.uPx, uMinPx: { value: o.minPx ?? 1.2 }, uNear: { value: o.near ?? 0.2 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: SPR_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false,
      blending: o.dust ? THREE.NormalBlending : THREE.AdditiveBlending, defines: o.dust ? { DUST: 1 } : {},
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = o.order ?? 4;
  }
  begin() { this.n = 0; return this; }
  push(p, size, kind, col, inten, rot = 0, aspect = 1) {
    if (this.n >= this.max || !(inten > 0) || !(size > 0)) return;
    const i = this.n++, P = this.aP.array, C = this.aC.array, S = this.aS.array;
    P[i * 3] = xyz(p, 0); P[i * 3 + 1] = xyz(p, 1); P[i * 3 + 2] = xyz(p, 2);
    C[i * 4] = col[0]; C[i * 4 + 1] = col[1]; C[i * 4 + 2] = col[2]; C[i * 4 + 3] = inten;
    S[i * 4] = size; S[i * 4 + 1] = kind; S[i * 4 + 2] = rot; S[i * 4 + 3] = aspect;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const at of [this.aP, this.aC, this.aS]) at.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }
}

// --------------------------------------------------------------------------------------------------------------- faces
const FACE_VS = `
attribute vec3 aUv; attribute float aW4;
uniform vec3 uRipC; uniform float uRipAge; uniform float uRipAmp; uniform float uScale;
varying vec3 vUv; varying vec3 vWP; varying vec3 vN; varying float vW;
void main() {
  vec3 p = position; vec3 n = normal;
#ifdef PORTAL
  if (uRipAge > 0.0 && uRipAmp > 0.0) {
    float pd = dot(p - uRipC, n);
    float gate = exp(-pd * pd * 40.0 / (uScale * uScale));
    float rd = length((p - uRipC) - n * pd) / uScale;
    float front = uRipAge * 2.4;
    float wave = sin((rd - front) * 20.0) * exp(-abs(rd - front) * 3.5) * exp(-uRipAge * 2.2);
    float dent = exp(-rd * rd * 10.0) * smoothstep(0.0, 0.05, uRipAge) * exp(-uRipAge * 3.5);
    p += n * (wave * 0.05 - dent * 0.16) * uScale * uRipAmp * gate;
  }
#endif
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = aUv; vW = aW4;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FACE_FS = `
uniform float uTime; uniform float uI; uniform float uOpen; uniform float uShut; uniform float uDive; uniform float uFlash;
uniform float uDetail; uniform float uCrack; uniform float uScale;
uniform vec3 uRipC; uniform float uRipAge; uniform float uRipAmp;
uniform sampler2D uNoise; uniform sampler2D uCrackTex;
varying vec3 vUv; varying vec3 vWP; varying vec3 vN; varying float vW;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 V = normalize(cameraPosition - vWP);
  vec3 N = normalize(vN);
  float ndv = abs(dot(N, V));
  float fres = 1.0 - ndv; fres *= fres;
  vec2 uv = vUv.xy; float fid = vUv.z;
  vec2 c2 = abs(uv - 0.5) * 2.0;
  float edge = max(c2.x, c2.y);
  float hh = 0.5 + 0.5 * sin((fres * 0.8 + vW * 0.35 + fid * 0.13 + uTime * 0.12) * 6.2832);
  vec3 pal = mix(vec3(1.0, 0.047, 0.888), vec3(0.037, 0.8, 1.0), hh);
  pal = mix(pal, vec3(0.258, 0.107, 1.0), 0.35);
  vec3 em; float a;
#ifdef PORTAL
  float ring = 0.0;
  if (uRipAge > 0.0 && uRipAmp > 0.0) {
    float pd = dot(vWP - uRipC, N);
    float gate = exp(-pd * pd * 40.0 / (uScale * uScale));
    float rd = length((vWP - uRipC) - N * pd) / uScale;
    float front = uRipAge * 2.4;
    ring = gate * uRipAmp * exp(-uRipAge * 2.0) * (exp(-abs(rd - front) * 7.0) * (0.55 + 0.45 * sin((rd - front) * 46.0)) + exp(-rd * rd * 14.0) * exp(-uRipAge * 4.0) * 1.5);
    uv += (uv - 0.5) * ring * 0.05;
  }
  vec2 pu = (floor(uv * uDetail) + 0.5) / uDetail;
  vec2 q = pu - 0.5; float r = length(q);
  float ang = atan(q.y, q.x) / 6.2832;
  float tt = uTime * 0.22 + fid * 3.7;
  float n1 = texture2D(uNoise, vec2(ang * 2.0 + r * 0.9 - tt * 0.7, r * 0.8 - tt * 0.9)).r;
  float n2 = texture2D(uNoise, pu * 0.8 + vec2(tt * 0.31, -tt * 0.17)).g;
  float sw = smoothstep(0.32, 0.9, n1 * 0.62 + n2 * 0.48);
  vec3 d = -V; vec3 ad = abs(d);
  vec2 sp = (ad.x > ad.y && ad.x > ad.z) ? d.yz / ad.x : ((ad.y > ad.z) ? d.xz / ad.y : d.xy / ad.z);
  vec2 sg = sp * 30.0; vec2 si = floor(sg); vec2 sf = fract(sg) - 0.5;
  float sh = h21(si);
  float star = step(0.92, sh) * step(max(abs(sf.x), abs(sf.y)), 0.17) * (0.55 + 0.45 * sin(uTime * 7.0 + sh * 60.0));
  float scan = 0.8 + 0.2 * step(0.5, fract(uv.y * uDetail * 0.5 - uTime * 1.5));
  float frame = pow(edge, 14.0);
  // dark alien crystal: little emissive per layer, so a stack of faces converges to emissive/alpha (stays dark)
  em = vec3(0.006, 0.002, 0.02) * (0.5 + sw * 2.0) + pal * (sw * sw * 0.13 + fres * 0.08 + frame * 0.22) * scan + vec3(0.7, 0.62, 0.9) * star * (1.0 - fres);
  a = uOpen * (0.2 + 0.2 * fres + 0.1 * sw);
  // swallow ripple rings
  em += mix(pal, vec3(1.0), 0.4) * ring * 0.6;
  a += ring * 0.15;
  // shut: a bright wipe runs from the frame to the centre and leaves the face closed (denser crystal)
  float sf2 = 1.0 - uShut;
  float wipe = exp(-pow((edge - sf2) * 16.0, 2.0)) * step(0.001, uShut) * step(uShut, 0.999);
  float closed = smoothstep(sf2 - 0.02, sf2 + 0.02, edge) * step(0.001, uShut);
  em += mix(pal, vec3(1.0), 0.6) * wipe * 0.8 + pal * closed * (0.02 + 0.04 * sw);
  a += closed * 0.22;
  // cracks (exit)
  if (uCrack > 0.0) {
    vec4 ck = texture2D(uCrackTex, uv);
    float lit = ck.r * step(ck.g, uCrack);
    em += mix(pal, vec3(1.3, 1.2, 1.6), 0.6) * lit + pal * ck.b * step(ck.a, uCrack) * 0.15;
  }
  em += pal * uFlash * 0.08;
  a = clamp(a, 0.0, 0.9);
#else
  // lattice: faint fresnel sheen + frame + cracks (additive only)
  float frame = pow(edge, 16.0);
  float fsel = fract(sin(fid * 12.9898 + 4.1) * 43758.5453);
  vec2 cuv = fsel > 0.5 ? 1.0 - uv : uv;
  cuv = fract(fsel * 7.0) > 0.5 ? cuv.yx : cuv;
  float prog = uCrack * 1.5 - fsel * 0.7;
  vec4 ck = texture2D(uCrackTex, cuv);
  float cfade = smoothstep(1.5, 4.5, distance(vWP, cameraPosition)) * step(0.001, uCrack) * step(0.45, fract(fsel * 3.1));
  float lit = ck.r * step(ck.g, prog) * cfade;
  float front = lit * (1.0 - smoothstep(0.0, 0.1, prog - ck.g));
  float n2 = texture2D(uNoise, uv * 0.7 + vec2(uTime * 0.03, fid * 0.37)).g;
  em = pal * (fres * 0.035 + frame * 0.16 + n2 * n2 * 0.02) + mix(pal * 1.2, vec3(1.3, 1.2, 1.7), 0.4 + 0.6 * front) * lit * (0.35 + 0.6 * front) + pal * ck.b * step(ck.a, prog) * cfade * 0.08;
  em += pal * uFlash * (0.08 + 0.15 * fres);
  a = 0.0;
#endif
  gl_FragColor = vec4(em * uI, a * min(uI, 1.0));
}`;

/**
 * A projected tesseract: 32 edge beams, 16 vertex flares and (optionally) 24 faces.
 * opts: { faces: 'portal' | 'lattice' | null, N (face grid), d (4D camera distance), edgeW, flareS (fractions of the half size),
 *         minPx, flarePx, near, order }
 * update(P): P = { c: [x,y,z], s: half size of the outer cell at rest, A: angles, edge, flare, face, hue, ... face uniforms }
 */
export class Tess {
  constructor(parent, o = {}) {
    this.o = Object.assign({ faces: null, N: 6, d: 3, edgeW: 0.04, flareS: 0.1, minPx: 1.0, flarePx: 2.0, near: 0.3, order: 0, coreK: 36, haloK: 3.2 }, o);
    this.group = new THREE.Group(); parent.add(this.group);
    this.beams = new Beams(32, { order: this.o.order + 2, minPx: this.o.minPx, near: this.o.near, coreK: this.o.coreK, haloK: this.o.haloK });
    this.flares = new Sprites(16, { order: this.o.order + 3, minPx: this.o.flarePx, near: this.o.near });
    this.group.add(this.beams.mesh, this.flares.mesh);
    this.R = V4.map(() => [0, 0, 0, 0]); this.P = V4.map(() => new THREE.Vector3()); this.K = new Float32Array(16);
    if (this.o.faces) {
      const N = this.o.N, NV = (N + 1) * (N + 1);
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(24 * NV * 3), nor = new Float32Array(24 * NV * 3), uv = new Float32Array(24 * NV * 3), w4 = new Float32Array(24 * NV);
      const idx = [];
      for (let f = 0; f < 24; f++) {
        for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = f * NV + j * (N + 1) + i; uv[k * 3] = i / N; uv[k * 3 + 1] = j / N; uv[k * 3 + 2] = f; }
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const k = f * NV + j * (N + 1) + i;
          idx.push(k, k + 1, k + N + 2, k, k + N + 2, k + N + 1);
        }
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aUv', new THREE.BufferAttribute(uv, 3));
      g.setAttribute('aW4', new THREE.BufferAttribute(w4, 1).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(idx);
      this.fu = {
        uTime: SHARED.uTime, uI: { value: 1 }, uOpen: { value: 1 }, uShut: { value: 0 }, uDive: { value: 0 }, uFlash: { value: 0 },
        uDetail: { value: 16 }, uCrack: { value: 0 }, uScale: { value: 1 }, uRipC: { value: new THREE.Vector3() }, uRipAge: { value: -1 },
        uRipAmp: { value: 0 }, uNoise: { value: noiseTex() }, uCrackTex: { value: crackFaceTex() },
      };
      const portal = this.o.faces === 'portal';
      this.faceMat = new THREE.ShaderMaterial({
        uniforms: this.fu, vertexShader: FACE_VS, fragmentShader: FACE_FS, defines: portal ? { PORTAL: 1 } : { LATTICE: 1 },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      });
      this.faceMesh = new THREE.Mesh(g, this.faceMat); this.faceMesh.frustumCulled = false; this.faceMesh.renderOrder = this.o.order + 1;
      this.group.add(this.faceMesh);
    }
  }
  update(P) {
    const vis = P.vis !== false && P.s > 1e-4 && ((P.edge || 0) > 0 || (P.face || 0) > 0 || (P.flare || 0) > 0);
    this.group.visible = vis;
    if (!vis) return;
    const { d } = this.o, s = P.s, c = P.c, A = P.A;
    for (let i = 0; i < 16; i++) {
      const r = rot4(V4[i], A, this.R[i]);
      const k = (d - 1) / (d - r[3]);
      this.K[i] = k;
      this.P[i].set(xyz(c, 0) + r[0] * k * s, xyz(c, 1) + r[1] * k * s, xyz(c, 2) + r[2] * k * s);
    }
    const hue = P.hue || 0, ei = P.edge || 0, fi = P.flare || 0;
    const B = this.beams.begin(), ew = this.o.edgeW * s * (P.edgeMul || 1);
    if (ei > 0) for (let e = 0; e < 32; e++) {
      const [i, j, ax] = E4[e];
      const ii = ei * (P.edgeI ? P.edgeI(e, i, j) : 1);
      B.push(this.P[i], this.P[j], ew * 0.5 * (this.K[i] + this.K[j]), wColor(this.R[i][3], hue), ii, wColor(this.R[j][3], hue), ii,
        [P.flowN ?? 2, hash(e, 77) + (ax === 3 ? 0.5 : 0), P.flowS ?? 1.2]);
    }
    B.end();
    const F = this.flares.begin();
    if (fi > 0) for (let i = 0; i < 16; i++) F.push(this.P[i], this.o.flareS * s * this.K[i], 2, wColor(this.R[i][3], hue), fi * (0.7 + 0.3 * this.K[i]), (P.flareRot || 0) + i * 0.4);
    F.end();
    if (this.faceMesh) {
      const fv = (P.face || 0) > 0;
      this.faceMesh.visible = fv;
      if (fv) this.updateFaces(P);
    }
  }
  updateFaces(P) {
    const N = this.o.N, NV = (N + 1) * (N + 1), d = this.o.d, s = P.s, c = P.c;
    const g = this.faceMesh.geometry, pos = g.attributes.position.array, nor = g.attributes.normal.array, w4 = g.attributes.aW4.array;
    const cx = xyz(c, 0), cy = xyz(c, 1), cz = xyz(c, 2), q = [0, 0, 0, 0];
    for (let f = 0; f < 24; f++) {
      const [i00, i10, i01, i11] = F4[f].v, r00 = this.R[i00], r10 = this.R[i10], r01 = this.R[i01], r11 = this.R[i11];
      _a.subVectors(this.P[i10], this.P[i00]); _b.subVectors(this.P[i01], this.P[i00]);
      const n = _a.cross(_b).normalize();
      const mx = (this.P[i00].x + this.P[i11].x) / 2 - cx, my = (this.P[i00].y + this.P[i11].y) / 2 - cy, mz = (this.P[i00].z + this.P[i11].z) / 2 - cz;
      if (n.x * mx + n.y * my + n.z * mz < 0) n.negate();
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const u = i / N, v = j / N, k = f * NV + j * (N + 1) + i;
        for (let m = 0; m < 4; m++) q[m] = (r00[m] * (1 - u) + r10[m] * u) * (1 - v) + (r01[m] * (1 - u) + r11[m] * u) * v;
        const kk = (d - 1) / (d - q[3]) * s;
        pos[k * 3] = cx + q[0] * kk; pos[k * 3 + 1] = cy + q[1] * kk; pos[k * 3 + 2] = cz + q[2] * kk;
        nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z; w4[k] = q[3];
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.aW4.needsUpdate = true;
    const u = this.fu;
    u.uI.value = P.face; u.uScale.value = s;
    for (const key of ['uOpen', 'uShut', 'uDive', 'uFlash', 'uCrack', 'uDetail', 'uRipAge', 'uRipAmp']) if (P[key] !== undefined) u[key].value = P[key];
    if (P.uRipC) u.uRipC.value.set(xyz(P.uRipC, 0), xyz(P.uRipC, 1), xyz(P.uRipC, 2));
  }
}

/** Per-frame shared uniforms (both modules call it; idempotent). */
export function frameShared(t, f, ctx) {
  SHARED.uTime.value = t;
  const cam = f.camera || ctx.camera;
  SHARED.uPx.value = 2 * Math.tan(cam.fov * Math.PI / 360) / ctx.H;
  SHARED.uRes.value.set(ctx.W, ctx.H);
}

// -------------------------------------------------------------------------------------------------------- hidden rigs
function hiddenRig(def) { return { def, pl: makePlayer(THREE, null, def.slim) }; }
function poseRig(h, t) { applyPose(h.pl, poseAt(h.def, t)); h.pl.root.updateMatrixWorld(true); }
function boneAt(h, name, t) { poseRig(h, t); return bonePoint(THREE, h.pl, name, new THREE.Vector3()); }
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
/** Point above the right palm: hand centre pushed out along the arm side that faces up the most. */
function palmPoint(pl, lift, out = new THREE.Vector3()) {
  const arm = pl.parts.armR; arm.updateWorldMatrix(true, false);
  const m = arm.matrixWorld;
  out.set(1 * PX, -8.5 * PX, 0).applyMatrix4(m);
  let best = null, by = -2;
  for (const ax of AXES) { _a.copy(ax).transformDirection(m); if (_a.y > by) { by = _a.y; best = _a.clone(); } }
  return out.addScaledVector(best, 2 * PX + lift);
}

// ---------------------------------------------------------------------------------------------------------- world plan
// All times come from timeline EVENTS (v2): snappy effects keep their real durations relative to their event, ambient ones
// (cracks, grid shimmer, seed growth) fill the holds between events.
const EV = Object.fromEntries(EVENTS.map(e => [e.id, e.t]));
const T_CHARGE = EV.charge ?? 1.2, T_PALM = EV.palm_open ?? 2.0, T_SEED = EV.seed ?? 2.2, T_COIL = EV.coil ?? 2.8;
const T_THROW = EV.throw ?? 3.2, T_REL = T_THROW + 0.02, T_UNF = EV.unfold ?? 3.4, T_DASH = EV.dash ?? 4.0;
const T_KICK = EV.kick_in ?? 4.8, T_SWAL = EV.swallow ?? 5.2, T_SHUT = EV.close ?? 5.6, T_DIVE = EV.dive ?? 6.4, T_IN = EV.inside ?? 6.6;
const T_EXIT = EV.exit ?? 12.85, T_SHAT = (EV.meteor ?? 13.0) - 0.02;
const B1 = T_DASH, B2 = T_DASH + BEAT; // beat clicks of the resting cube (dash, grab)
const Q = Math.PI / 2;
// 4D angles in quarter turns. Rest (cube-in-cube, faces axis-aligned) whenever every angle is a whole number.
const ROT = {
  xw: [[T_CHARGE, 0], [T_PALM, 0.35, 'smooth'], [T_SEED, 0.9, 'smooth'], [T_COIL, 2.4, 'smooth'], [T_THROW, 3.6, 'smooth'], [T_UNF, 4.6, 'smooth'],
    [T_UNF + 0.2, 5.4, 'smooth'], [T_UNF + 0.4, 5.85, 'smooth'], [T_UNF + 0.52, 6.0, 'smooth'], [B1 - 0.12, 6.0], [B1, 7.0, 'backOut'],
    [T_SHUT, 7.0], [T_SHUT + 0.19, 9.0, 'cubicOut'], [T_EXIT, 9.0], [T_SHAT, 14.0, 'quadIn'], [T_SHAT + 0.62, 16.0, 'expoOut']],
  yw: [[T_CHARGE, 0], [T_SEED, 0.4, 'smooth'], [T_COIL, 1.0, 'smooth'], [T_THROW, 1.8, 'smooth'], [T_UNF, 2.6, 'smooth'], [T_UNF + 0.3, 3.6, 'smooth'],
    [T_UNF + 0.54, 4.0, 'smooth'], [B2 - 0.12, 4.0], [B2, 5.0, 'backOut'], [T_EXIT, 5.0], [T_SHAT, 8.0, 'quadIn'], [T_SHAT + 0.62, 9.0, 'expoOut']],
  zw: [[T_SHUT, 0], [T_SHUT + 0.17, 2.0, 'cubicOut'], [T_EXIT, 2.0], [T_SHAT, 5.0, 'quadIn'], [T_SHAT + 0.62, 6.0, 'expoOut']],
  xz: [[T_CHARGE, 0], [T_SEED, 0.25, 'smooth'], [T_COIL, 0.6, 'smooth'], [T_THROW, 1.0, 'smooth'], [T_UNF, 1.45, 'smooth'], [T_UNF + 0.5, 2.0, 'smooth'],
    [T_EXIT, 2.0], [T_SHAT, 3.0, 'quadIn']],
  yz: [[T_SEED, 0], [T_COIL, 0.2, 'smooth'], [T_THROW, 0.35, 'smooth'], [T_UNF + 0.1, 0.3, 'smooth'], [T_UNF + 0.5, 0, 'smooth']],
};
function worldAngles(t) {
  const A = {};
  for (const k of Object.keys(ROT)) A[k] = sample(ROT[k], t) * Q;
  // breathing: the inner cell drifts a little at rest so the object is never dead still
  const br = smooth(T_UNF + 0.5, T_UNF + 0.8, t) * (1 - smooth(T_SHUT - 0.14, T_SHUT - 0.02, t));
  A.yw += br * 0.16 * Math.sin(t * Math.PI * 2 / (BEAT * 4));
  A.xw += br * 0.11 * Math.sin(t * Math.PI * 2 / (BEAT * 2) + 1);
  return A;
}
const SEED_H = 0.075, CUBE_H = 1.8;

let S = null; // module state for post()
const DBG = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('vfxa')) || ''; // debug: my probe only

export function create(ctx) {
  const { world, scene, camera } = ctx;
  const W = ctx.actors;
  const hid = { user: hiddenRig(W.user.def), victim: hiddenRig(W.victim.def) };
  const CUBE = new THREE.Vector3(...WORLD.cube);
  // --- precomputed anchors from the animation (pure functions of the animation tracks) ---
  poseRig(hid.user, T_REL);
  const REL = palmPoint(hid.user.pl, 0.08 + SEED_H);
  const crack0 = poseAt(W.user.def, 0.4).pos;
  // swallow: where the victim's chest enters the outer cell
  let tc = T_SWAL, pc = new THREE.Vector3(CUBE.x, CUBE.y, CUBE.z + CUBE_H);
  {
    let prev = null;
    for (let t = T_KICK - 0.05; t <= T_SHUT + 0.1; t += 1 / 240) {
      const p = boneAt(hid.victim, 'chest', t);
      const inside = Math.abs(p.x - CUBE.x) < CUBE_H && Math.abs(p.y - CUBE.y) < CUBE_H && Math.abs(p.z - CUBE.z) < CUBE_H;
      if (inside && prev) {
        // project onto the face that was crossed
        const r = [prev.x - CUBE.x, prev.y - CUBE.y, prev.z - CUBE.z].map(v => v / CUBE_H);
        const ax = [0, 1, 2].reduce((m, k) => (Math.abs(r[k]) > Math.abs(r[m]) ? k : m), 0);
        pc = p.clone(); const sgn = Math.sign(r[ax]) || 1;
        pc.setComponent(ax, CUBE.getComponent(ax) + sgn * CUBE_H);
        tc = t; break;
      }
      prev = p;
    }
  }
  // exit: the cube re-appears around the victim (it shoots out of it at 9.80)
  const vc = boneAt(hid.victim, 'chest', T_EXIT + 0.01);
  const EXIT = new THREE.Vector3(vc.x, Math.max(CUBE.y, vc.y), vc.z);
  if (!isFinite(EXIT.x) || EXIT.distanceTo(CUBE) > 12) EXIT.copy(CUBE);

  // --- objects ---
  const tess = new Tess(world, { faces: 'portal', N: 6, edgeW: 0.026, flareS: 0.1, minPx: 0.9, flarePx: 1.8, near: 0.15 });
  tess.beams.u.uCoreI.value = 0.85;
  // dive portal: the one face the camera flies into turns into a hyperspace vortex (drawn over the cube)
  const portalMat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uDive: { value: 0 }, uNoise: { value: noiseTex() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uDive; uniform sampler2D uNoise; varying vec2 vUv;
      void main(){
        vec2 q = vUv - 0.5; float r = length(q) * 2.0; float ang = atan(q.y, q.x);
        float z = 0.3 / max(r, 0.03) + uTime * 7.0;
        float n = texture2D(uNoise, vec2(ang / 6.2832 * 3.0 + z * 0.04, z * 0.2)).r;
        float rings = 0.5 + 0.5 * sin(z * 5.0);
        float spiral = 0.5 + 0.5 * sin(ang * 6.0 + z * 1.6);
        vec3 vio = vec3(0.258, 0.107, 1.0), mag = vec3(1.0, 0.047, 0.888), cy = vec3(0.037, 0.8, 1.0);
        vec3 col = mix(vio, mag, n) * (0.1 + 0.7 * rings * spiral) + cy * pow(spiral * n, 3.0) * 1.1;
        col += vec3(0.8, 0.45, 1.5) * exp(-r * r * 5.0) * (0.15 + 0.45 * uDive * uDive);
        vec2 e = abs(q) * 2.0; float ed = max(e.x, e.y);
        col += mix(vio, vec3(1.0), 0.5) * pow(ed, 14.0) * 0.6;
        float a = uDive * (0.75 + 0.25 * (1.0 - ed));
        gl_FragColor = vec4(col * uDive, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), portalMat); portal.renderOrder = 5; portal.visible = false;
  world.add(portal);
  const fxB = new Beams(260, { order: 6, minPx: 0.8, near: 0.1 });
  const fxS = new Sprites(900, { order: 7, minPx: 1.0, near: 0.12 });
  const dust = new Sprites(80, { order: 5, dust: true, minPx: 1.0 });
  world.add(fxB.mesh, fxS.mesh, dust.mesh);
  // tunnel streaks for the dive (camera space, both spaces)
  const tunnel = new Beams(140, { order: 8, minPx: 0.7, near: 0.05, world: false, coreK: 20, haloK: 2.5 });
  camera.add(tunnel.mesh);
  // ground crack decal (MC pixel cracks, 16 px per block)
  const gcrack = crackGroundTex();
  const crackMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: gcrack }, uProg: { value: 0 }, uI: { value: 0 }, uTime: SHARED.uTime },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uProg; uniform float uI; uniform float uTime; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(uTex, vUv);
        float on = step(c.g, uProg) * step(0.01, c.r);
        float front = on * (1.0 - smoothstep(0.0, 0.07, uProg - c.g));
        float halo = c.b * step(c.a, uProg);
        float fl = 0.85 + 0.15 * sin(uTime * 23.0 + c.g * 40.0);
        vec3 col = vec3(0.258, 0.107, 1.0) * halo * 0.12 + mix(vec3(0.42, 0.14, 1.7), vec3(1.6, 1.3, 2.2), front) * c.r * on * fl;
        gl_FragColor = vec4(col * uI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), crackMat);
  crackMesh.rotation.x = -Math.PI / 2; crackMesh.position.set(crack0[0], 0.012, crack0[2]); crackMesh.renderOrder = 1;
  world.add(crackMesh);
  const crackPts = gcrack.userData.segs.filter((_, i) => i % 3 === 0);
  // ground shockwave ring (unfold)
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uTime: SHARED.uTime },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uI; varying vec2 vP;
      void main(){ float r = length(vP); float x = (r - 0.75) / 0.25;
        float a = smoothstep(0.0, 1.0, x) * (1.0 - smoothstep(0.93, 1.0, x));
        vec3 c = mix(vec3(0.258, 0.107, 1.0) * 1.2, vec3(2.5, 2.3, 3.0), pow(x, 6.0));
        gl_FragColor = vec4(c * a * uI, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 96, 1), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.set(CUBE.x, 0.016, CUBE.z); ring.renderOrder = 2;
  world.add(ring);
  // exit shards: thin square crystal plates
  const NSH = 90;
  const shGeo = new THREE.BoxGeometry(1, 1, 1);
  const shAttr = new THREE.InstancedBufferAttribute(new Float32Array(NSH * 4), 4); shAttr.setUsage(THREE.DynamicDrawUsage);
  shGeo.setAttribute('aSh', shAttr);
  const shMat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime },
    vertexShader: `attribute vec4 aSh; varying vec3 vLP; varying vec3 vN; varying vec4 vSh; varying vec3 vWP;
      void main(){ vLP = position; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vWP = wp.xyz; vSh = aSh;
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; varying vec3 vLP; varying vec3 vN; varying vec4 vSh; varying vec3 vWP;
      void main(){
        vec2 pg = floor((vLP.xy + 0.5) * 6.0);
        float n = fract(sin(dot(pg + vSh.x * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
        if (n < vSh.y) discard;
        float burn = (1.0 - smoothstep(0.0, 0.2, n - vSh.y)) * step(0.001, vSh.y);
        vec2 e = abs(vLP.xy) * 2.0;
        float rim = smoothstep(0.7, 0.97, max(e.x, e.y));
        vec3 V = normalize(cameraPosition - vWP);
        float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        float k = fract(vSh.x * 3.7);
        vec3 col = k < 0.45 ? vec3(0.258, 0.107, 1.0) : (k < 0.75 ? vec3(1.0, 0.047, 0.888) : vec3(0.037, 0.8, 1.0));
        float up = 0.6 + 0.4 * max(0.0, normalize(vN).y);
        vec3 em = vec3(0.05, 0.02, 0.12) + col * (0.55 * up + fres * 1.2) + col * rim * 2.0 + vec3(1.0) * rim * rim + col * burn * 3.0;
        em = mix(em, vec3(3.2, 3.0, 3.5), vSh.z);
        gl_FragColor = vec4(em * vSh.w, 1.0);
      }`,
  });
  const shards = new THREE.InstancedMesh(shGeo, shMat, NSH); shards.frustumCulled = false; shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(shards);
  // the tesseract's light on the world (one point light, always present → no shader recompiles)
  const light = new THREE.PointLight(0x9a70ff, 0, 14, 2); scene.add(light);

  // shard plan (closed form, drag): p(τ) = p0 + vt·τ + (v0 − vt)(1 − e^{−kτ})/k
  const SK = 1.7, SVT = -1.9, SH0 = 0.95;
  const shPlan = [];
  for (let i = 0; i < NSH; i++) {
    const h = k => hash(i, 300 + k);
    const ax = Math.floor(h(0) * 3), sg = h(1) < 0.5 ? -1 : 1, inner = h(2) < 0.25;
    const hs = SH0 * (inner ? 0.5 : 1);
    const p0 = [(h(3) * 2 - 1) * hs, (h(4) * 2 - 1) * hs, (h(5) * 2 - 1) * hs]; p0[ax] = sg * hs;
    const dir = new THREE.Vector3(p0[0] + (h(6) - 0.5) * 0.5, p0[1] + (h(7) - 0.5) * 0.5 + 0.25, p0[2] + (h(8) - 0.5) * 0.5).normalize();
    const sp = 3.5 + 7.5 * h(9) * h(9) + (inner ? 2 : 0);
    const v0 = dir.multiplyScalar(sp); v0.y += 0.6 + 2.2 * h(10);
    const nrm = new THREE.Vector3(); nrm.setComponent(ax, sg);
    const q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
    q0.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), h(11) * Math.PI));
    const spinAx = new THREE.Vector3(h(12) - 0.5, h(13) - 0.5, h(14) - 0.5).normalize();
    const size = 0.1 + 0.36 * h(15) * h(15);
    const pl = { p0: new THREE.Vector3(...p0).add(EXIT), v0, q0, spinAx, w0: 7 + 16 * h(16), w1: 0.8 + 2.4 * h(17), size, seed: h(18), life: 1.1 + 2.4 * h(19) * h(19) };
    // dissolve start: life end, or just before reaching the grass
    let td = pl.life;
    for (let tau = 0.3; tau < pl.life; tau += 1 / 60) if (shardPos(pl, tau, _a).y < 0.35 + size * 0.5) { td = tau; break; }
    pl.td = td;
    shPlan.push(pl);
  }
  function shardPos(pl, tau, out) {
    const e = (1 - Math.exp(-SK * tau)) / SK;
    return out.set(pl.p0.x + pl.v0.x * e, pl.p0.y + SVT * tau + (pl.v0.y - SVT) * e, pl.p0.z + pl.v0.z * e);
  }
  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

  S = { ctx, CUBE, EXIT, tc, pc, cubeScreen: [0.5, 0.5] };
  if (DBG.includes('log')) console.log('[vfxA] swallow t=' + tc.toFixed(3) + ' at ' + pc.toArray().map(v => v.toFixed(2)) + '  exit ' + EXIT.toArray().map(v => v.toFixed(2)) + '  release ' + REL.toArray().map(v => v.toFixed(2)));

  // ------------------------------------------------------------------------------------------------ per-frame plan
  function seedState(t, f) {
    // returns {c, s, phase}
    const chest = f.bone('user', 'chest');
    if (t < T_CHARGE) return { c: chest, s: 2.7, ph: 'idle' };
    if (t < T_PALM) return { c: chest, s: 2.7, ph: 'grid' };
    const palm = palmPoint(W.user.player, 0.08 + SEED_H, new THREE.Vector3());
    if (t < T_SEED) {
      const u = expoIn(ramp(T_PALM, T_SEED, t));
      return { c: chest.lerp(palm, smooth(T_PALM, T_PALM + 0.17, t)), s: lerp(2.7, SEED_H * 0.72, u), ph: 'gather' };
    }
    if (t < T_REL) return { c: palm, s: SEED_H * lerp(0.72, 1, smooth(T_SEED, T_COIL, t)), ph: 'seed' };  // grows a little to the coil
    if (t < T_UNF) return { c: throwPos(t), s: SEED_H * 1.15, ph: 'throw' };
    if (t < T_IN) return { c: CUBE.clone(), s: unfoldScale(t), ph: 'cube' };
    if (t < T_EXIT) return { c: CUBE.clone(), s: CUBE_H, ph: 'hidden' };
    return { c: EXIT.clone(), s: exitScale(t), ph: 'exit' };
  }
  function throwPos(t) {
    const u = ramp(T_REL, T_UNF, t), e = 1 - (1 - u) * (1 - u) * (1 - 0.35 * u);
    const p = new THREE.Vector3().lerpVectors(REL, CUBE, e);
    const arc = Math.sin(Math.PI * e);
    return p.add(new THREE.Vector3(0.85 * arc, 0.5 * arc, 0));
  }
  function unfoldScale(t) {
    if (t < T_UNF) return SEED_H;
    const u = ramp(T_UNF, T_UNF + 0.4, t);
    let s = lerp(SEED_H * 1.15, CUBE_H, backOut(u, 1.6));
    // close: the cell snaps a touch smaller and back
    s *= 1 - 0.08 * Math.sin(Math.PI * ramp(T_SHUT, T_SHUT + 0.14, t));
    // kick lands: a short swell
    s *= 1 + 0.025 * Math.exp(-Math.max(0, effTime(t) - effTime(T_KICK)) * 9) * (t >= T_KICK ? 1 : 0);
    return s;
  }
  function exitScale(t) {
    if (t < T_SHAT) return lerp(CUBE_H, SH0, Math.pow(ramp(T_EXIT, T_SHAT, t), 2.2));
    return lerp(SH0, 6.5, expoOut(ramp(T_SHAT, T_SHAT + 0.3, t)));
  }

  function update(t, f) {
    // debug only (my probe passes vfxa=camW / camI): fixed review cameras independent of camera.js
    if (DBG.includes('camW') || DBG.includes('camI')) {
      const c = f.camera, inS = f.space === 'inside';
      if (inS) { c.position.set(3.2, 61.2, 3.6); c.fov = 55; c.lookAt(0, 60.3, 0); }
      else if (t >= T_EXIT) { c.position.set(7.5, 0.6, 2.6); c.fov = 55; c.lookAt(0, 2.2, -6.8); }
      else { c.position.set(5.2, 1.5, 1.4); c.fov = 55; c.lookAt(0, 1.5, -5.0); }
      c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    }
    frameShared(t, f, ctx);
    const inWorld = f.space === 'world';
    const st = seedState(t, f);
    S.st = st;
    const A = worldAngles(t);
    const beat = Math.exp(-beatPhase(t) * BEAT * 9);
    // ---------------- tesseract
    let edge = 0, flare = 0, face = 0, P = {};
    if (inWorld) {
      tess.beams.u.uNear.value = st.ph === 'grid' || st.ph === 'gather' ? 0.7 : 0.15;
      if (st.ph === 'grid') {
        edge = 0.32 * smooth(T_CHARGE, T_CHARGE + 0.35, t) * (0.75 + 0.25 * Math.sin(t * 31) * Math.sin(t * 17.3)); flare = edge * 0.6;
        tess.beams.u.uClipY.value = lerp(-0.5, 6, smooth(T_CHARGE, T_CHARGE + 0.7, t));
      } else if (st.ph === 'gather') {
        const u = ramp(T_PALM, T_SEED, t);
        edge = lerp(0.32, 2.0, u * u); flare = lerp(0.2, 1.6, u); face = smooth(T_SEED - 0.08, T_SEED, t);
        tess.beams.u.uClipY.value = 1e6;
      } else if (st.ph === 'seed') { const coil = smooth(T_COIL, T_THROW, t); edge = 1.7 + 0.5 * beat + 0.9 * coil; flare = 1.3 + 0.4 * beat + 0.8 * coil; face = 1 + 0.6 * coil; }
      else if (st.ph === 'throw') { edge = 2.2; flare = 1.6; face = 1; }
      else if (st.ph === 'cube') {
        const unf = ramp(T_UNF, T_UNF + 0.4, t);
        edge = lerp(1.8, 1.0, unf) + 0.25 * beat + 0.8 * Math.exp(-Math.max(0, t - T_SHUT) * 10) * (t >= T_SHUT ? 1 : 0) + 0.8 * smooth(T_DIVE, T_IN, t);
        flare = 0.5 + 0.2 * beat + 1.0 * Math.exp(-Math.max(0, t - T_SHUT) * 10) * (t >= T_SHUT ? 1 : 0);
        face = 1;
      } else if (st.ph === 'exit') {
        const im = ramp(T_EXIT, T_SHAT, t), out = ramp(T_SHAT, T_SHAT + 0.3, t);
        edge = t < T_SHAT ? lerp(1.2, 2.0, im) : 1.4 * Math.pow(1 - out, 2.5);
        flare = t < T_SHAT ? lerp(0.6, 1.2, im) : 1.0 * Math.pow(1 - out, 3);
        face = t < T_SHAT ? 1 : 0;
      }
      tess.beams.u.uGlitch.value = st.ph === 'exit' && t < T_SHAT ? 0.35 : 0;
    }
    P = {
      c: st.c, s: st.s, A, edge, flare, face, flowN: 2, edgeMul: st.ph === 'grid' ? 0.25 : st.ph === 'gather' ? lerp(0.25, 1, Math.pow(ramp(T_PALM, T_SEED, t), 4)) : 1, flowS: st.ph === 'cube' ? 1.0 : 2.2,
      uOpen: st.ph === 'exit' ? 0.6 : 1,
      uShut: st.ph === 'exit' ? 1 : (st.ph === 'cube' ? ramp(T_SHUT, T_SHUT + 0.07, t) : 0),
      uDive: 0,
      uFlash: st.ph === 'cube' ? 0.35 * Math.exp(-Math.max(0, t - T_SHUT) * 14) * (t >= T_SHUT ? 1 : 0) + 0.3 * Math.exp(-Math.max(0, t - T_UNF) * 8) * (t >= T_UNF ? 1 : 0) : (st.ph === 'exit' ? ramp(T_EXIT, T_SHAT, t) * 0.8 : 0),
      uCrack: st.ph === 'exit' ? lerp(0.55, 1.0, ramp(T_EXIT, T_SHAT, t)) : 0,
      uDetail: st.s < 0.3 ? 8 : 16,
      uRipC: S.pc, uRipAge: st.ph === 'cube' ? t - S.tc : -1, uRipAmp: 1,
    };
    // small (seed) scale: colour-led edges and glowing faces so the 4D object reads at 0.15 bl
    const small = 1 - smooth(0.12, 0.8, st.s);
    tess.beams.u.uCoreI.value = lerp(0.85, 0.5, small);
    if (P.face > 0) P.face *= 1 + 2.5 * small;
    if (DBG.includes('noface')) P.face = 0;
    if (DBG.includes('notess')) P.s = 0;
    tess.update(P);

    // ---------------- light
    light.intensity = 0;
    if (inWorld) {
      light.position.copy(st.c);
      let li = 0;
      if (st.ph === 'gather') li = 0.05 * smooth(T_SEED - 0.1, T_SEED, t);
      else if (st.ph === 'seed') li = 0.04 + 0.02 * beat + 0.05 * smooth(T_COIL, T_THROW, t);
      else if (st.ph === 'throw') li = 0.4;
      else if (st.ph === 'cube') li = lerp(1, 7, smooth(T_UNF, T_UNF + 0.2, t)) + 8 * Math.exp(-Math.max(0, t - T_SHUT) * 8) * (t >= T_SHUT ? 1 : 0) + 6 * smooth(T_DIVE, T_IN, t) + 6 * Math.exp(-Math.max(0, t - T_UNF) * 6) * (t >= T_UNF ? 1 : 0);
      else if (st.ph === 'exit') li = t < T_SHAT ? lerp(4, 9, ramp(T_EXIT, T_SHAT, t)) : 14 * Math.exp(-(t - T_SHAT) * 6);
      light.intensity = DBG.includes('nolight') ? 0 : li;
      light.distance = st.ph === 'seed' || st.ph === 'gather' ? 2.5 : 16;
    }

    // ---------------- effects
    const B = fxB.begin(), Sp = fxS.begin(), D = dust.begin();
    const tb = tunnel.begin();
    if (inWorld && !DBG.includes('nofx')) {
      worldFx(t, f, st, B, Sp, D, beat);
    }
    // dive tunnel (3.22 → 3.58, across the cut)
    tunnelFx(t, tb);
    B.end(); Sp.end(); D.end(); tb.end();

    // dive portal on the face the camera flies into
    const dv = inWorld && st.ph === 'cube' ? Math.pow(ramp(T_DIVE + 0.02, T_IN - 0.025, t), 1.4) : 0;
    portal.visible = dv > 0 && !DBG.includes('noportal');
    if (portal.visible) {
      _p.subVectors(f.camera.position, CUBE);
      const ax = Math.abs(_p.x) > Math.abs(_p.y) ? (Math.abs(_p.x) > Math.abs(_p.z) ? 'x' : 'z') : (Math.abs(_p.y) > Math.abs(_p.z) ? 'y' : 'z');
      const n = new THREE.Vector3(); n[ax] = Math.sign(_p[ax]) || 1;
      portal.position.copy(CUBE).addScaledVector(n, st.s + 0.006);
      portal.lookAt(_p.copy(portal.position).add(n));
      portal.scale.setScalar(st.s);
      portalMat.uniforms.uDive.value = dv;
    }
    // ground cracks
    const cp = 0.5 * expoOut(ramp(T_CHARGE, T_CHARGE + 0.35, t)) + 0.42 * smooth(T_CHARGE + 0.25, T_THROW - 0.2, t) + 0.08 * smooth(T_THROW, T_UNF, t);
    crackMat.uniforms.uProg.value = cp;
    const since = (t0) => (t >= t0 ? Math.exp(-(t - t0) * 6) : 0);
    crackMat.uniforms.uI.value = inWorld && t < T_IN ? smooth(T_CHARGE - 0.02, T_CHARGE + 0.06, t) * (1 - smooth(T_DASH + 0.2, T_SWAL + 0.3, t)) * (0.8 + 0.35 * beat + 0.9 * since(T_CHARGE) + 0.8 * since(T_THROW)) : 0;
    crackMesh.visible = crackMat.uniforms.uI.value > 0;
    // ring
    const ru = ramp(T_UNF, T_UNF + 0.75, t);
    ring.visible = inWorld && t >= T_UNF && ru < 1;
    if (ring.visible) { const R = 0.8 + 8.5 * expoOut(ru); ring.scale.setScalar(R); ringMat.uniforms.uI.value = 1.8 * Math.pow(1 - ru, 1.5); }
    // shards
    updateShards(t, inWorld);
    // cube screen position (for post radial centre)
    if (f.camera) {
      _p.copy(st.c).project(f.camera);
      S.cubeScreen = [clamp((_p.x + 1) / 2, 0.1, 0.9), clamp((_p.y + 1) / 2, 0.1, 0.9)];
    }
  }

  function updateShards(t, inWorld) {
    const vis = inWorld && t >= T_SHAT - 1e-4;
    shards.visible = vis;
    if (!vis) return;
    const a = shAttr.array;
    let n = 0;
    for (let i = 0; i < NSH; i++) {
      const pl = shPlan[i], tau = t - T_SHAT;
      const dis = ramp(pl.td, pl.td + 0.35, tau);
      if (dis >= 1) continue;
      shardPos(pl, tau, _p);
      const ang = pl.w1 * tau + (pl.w0 - pl.w1) * (1 - Math.exp(-2.2 * tau)) / 2.2;
      _q.setFromAxisAngle(pl.spinAx, ang).multiply(pl.q0);
      const grow = smooth(0, 0.06, tau);
      _s.set(pl.size * grow, pl.size * grow, 0.035 + pl.size * 0.08);
      _m.compose(_p, _q, _s);
      shards.setMatrixAt(n, _m);
      a[n * 4] = pl.seed; a[n * 4 + 1] = dis; a[n * 4 + 2] = Math.exp(-tau * 5); a[n * 4 + 3] = 1;
      n++;
    }
    shards.count = n;
    shards.instanceMatrix.needsUpdate = true; shAttr.needsUpdate = true;
  }

  function worldFx(t, f, st, B, Sp, D, beat) {
    // aura motes rising from the cracks (0.45 → 2.6)
    if (t > T_CHARGE && t < T_DASH + 0.6) {
      for (let i = 0; i < 130; i++) {
        const h = k => hash(i, 40 + k);
        const cpnt = crackPts[Math.floor(h(0) * crackPts.length)];
        if (!cpnt || cpnt[2] > 0.75) continue;
        const burst = i < 40;
        const t0 = burst ? T_CHARGE + 0.02 + h(1) * 0.12 : T_CHARGE + 0.1 + cpnt[2] * 0.6 + h(1) * (T_DASH - T_CHARGE - 0.8);
        const life = (burst ? 0.6 : 0.8) + 0.7 * h(2), a = (t - t0) / life;
        if (a < 0 || a > 1) continue;
        const x = crack0[0] + (cpnt[0] - 0.5) * 8, z = crack0[2] - (cpnt[1] - 0.5) * 8;
        const y = 0.03 + (burst ? 1.4 + 1.2 * h(3) : 0.5 + 1.0 * h(3)) * (t - t0) + 0.2 * a * a;
        const sw = 0.06 * Math.sin((t - t0) * (4 + 3 * h(4)) + h(5) * 6);
        const col = h(6) < 0.5 ? COL.violet : (h(6) < 0.8 ? COL.magenta : COL.cyan);
        Sp.push([x + sw, y, z + sw * 0.6], 0.011 + 0.013 * h(7), 0, col, 2.2 * Math.sin(Math.PI * a) * (1 - smooth(T_DASH - 0.1, T_DASH + 0.4, t)), 0);
      }
    }
    // gather: motes stream into the palm (0.98 → 1.2)
    if (t > T_PALM - 0.05 && t < T_SEED + 0.02) {
      for (let i = 0; i < 28; i++) {
        const h = k => hash(i, 90 + k);
        const t0 = T_PALM - 0.05 + h(0) * 0.12, a = clamp((t - t0) / (T_SEED - t0));
        if (t < t0) continue;
        const dir = new THREE.Vector3(h(1) - 0.5, h(2) - 0.3, h(3) - 0.5).normalize();
        const r = (0.5 + 1.2 * h(4)) * Math.pow(1 - a, 2);
        const p = st.c.clone().addScaledVector(dir, r);
        const p2 = st.c.clone().addScaledVector(dir, r + 0.06 + 0.25 * (1 - a));
        B.push(p, p2, 0.006, COL.magenta, 2.0 * Math.sin(Math.PI * a), COL.violet, 0);
      }
    }
    // seed birth flash (1.2)
    if (t >= T_SEED - 0.03 && t < T_SEED + 0.25) {
      const u = (t - (T_SEED - 0.03)) / 0.28;
      Sp.push(st.c, 0.05 + 0.3 * expoOut(u) * (1 - u), 2, [1.0, 0.75, 1.0], 2.2 * Math.pow(1 - u, 2), 0.3);
      Sp.push(st.c, 0.04 + 0.22 * expoOut(u), 3, COL.magenta, 1.2 * Math.pow(1 - u, 2), 0);
    }
    // seed glow + arcs (1.2 → 1.62)
    if (st.ph === 'seed' || st.ph === 'throw') {
      Sp.push(st.c, 0.13, 1, COL.violet, 0.35 + 0.15 * beat, 0);
      Sp.push(st.c, 0.035, 1, [1, 0.8, 1], 0.6, 0);
    }
    if (st.ph === 'seed') {
      const fr = Math.floor(t * 30);
      for (let k = 0; k < 3; k++) {
        if (hash(fr, 500 + k) < (t > T_COIL ? 0.08 : 0.3)) continue;
        const h = m => hash(fr * 7 + k, 600 + m);
        const dir = new THREE.Vector3(h(0) - 0.5, h(1) - 0.7, h(2) - 0.5).normalize();
        const end = st.c.clone().addScaledVector(dir, 0.1 + 0.12 * h(3));
        let prev = st.c.clone().addScaledVector(dir, SEED_H * 0.8);
        for (let j = 1; j <= 5; j++) {
          const p = prev.clone().lerp(end, 1 / (6 - j));
          if (j < 5) p.add(new THREE.Vector3(h(4 + j) - 0.5, h(9 + j) - 0.5, h(14 + j) - 0.5).multiplyScalar(0.045));
          B.push(prev, p, 0.004, COL.cyan, 2.6, COL.magenta, 2.2);
          prev = p;
        }
      }
    }
    // throw trail (1.62 → 1.95): hot core streak + two helix strands (cyan / magenta) twisting around the path
    if (t >= T_REL && t < T_UNF + 0.2) {
      const n = 22, dtk = 0.009, fadeAll = t > T_UNF ? Math.exp(-(t - T_UNF) * 14) : 1;
      const side = new THREE.Vector3(), up = new THREE.Vector3(), dir = new THREE.Vector3();
      for (let k = 0; k < n; k++) {
        const ta = t - k * dtk, tb = t - (k + 1) * dtk;
        if (tb < T_REL || ta > T_UNF) continue;
        const pa = throwPos(Math.min(ta, T_UNF)), pb = throwPos(Math.max(tb, T_REL));
        const fk = 1 - k / n, fade = fk * fadeAll;
        B.push(pa, pb, 0.012 + 0.03 * fk, wColor(0.9 - k / n * 1.9), 2.4 * fade, wColor(0.9 - (k + 1) / n * 1.9), 2.4 * fade * 0.9);
        dir.subVectors(pa, pb).normalize(); side.crossVectors(dir, _yUp).normalize(); up.crossVectors(side, dir);
        for (const [ph, col] of [[0, COL.cyan], [Math.PI, COL.magenta]]) {
          const ra = 0.07 * (0.4 + 0.6 * (k / n)), rb = 0.07 * (0.4 + 0.6 * ((k + 1) / n));
          const aa = ta * 55 + ph, ab = tb * 55 + ph;
          const qa = pa.clone().addScaledVector(side, Math.cos(aa) * ra).addScaledVector(up, Math.sin(aa) * ra);
          const qb = pb.clone().addScaledVector(side, Math.cos(ab) * rb).addScaledVector(up, Math.sin(ab) * rb);
          B.push(qa, qb, 0.008 + 0.01 * fk, col, 2.0 * fade, col, 1.8 * fade);
        }
      }
      if (t < T_UNF) Sp.push(throwPos(t), 0.22, 2, [1, 0.85, 1], 1.4, t * 20);
      for (let i = 0; i < 40; i++) { // shed motes
        const ts = T_REL + (i / 40) * (T_UNF - T_REL), age = t - ts;
        if (age < 0 || age > 0.6) continue;
        const p = throwPos(ts).add(new THREE.Vector3(hash(i, 70) - 0.5, hash(i, 71) - 0.5, hash(i, 72) - 0.5).multiplyScalar(0.5 * age));
        p.y -= 0.4 * age * age;
        Sp.push(p, 0.022, 0, hash(i, 73) < 0.5 ? COL.magenta : COL.cyan, 2.5 * (1 - age / 0.6), 0);
      }
    }
    // unfold burst (1.8): flare + rays + dust along the ground ring
    if (t >= T_UNF && t < T_UNF + 1.4) {
      const a = t - T_UNF;
      if (a < 0.28) {
        const u = a / 0.28;
        Sp.push(CUBE, 0.5 + 4.5 * expoOut(u), 2, [1.0, 0.8, 1.0], 1.8 * Math.pow(1 - u, 2.5), 0.2);
        Sp.push(CUBE, 0.5 + 6 * expoOut(u), 3, COL.violet, 1.2 * Math.pow(1 - u, 2), 0);
      }
      if (a < 0.45) for (let i = 0; i < 18; i++) {
        const h = k => hash(i, 120 + k);
        const dir = new THREE.Vector3(h(0) - 0.5, h(1) * 0.9 - 0.25, h(2) - 0.5).normalize();
        const L = (2.5 + 6 * h(3)) * expoOut(clamp(a / 0.18));
        const p0 = CUBE.clone().addScaledVector(dir, 0.3 + L * 0.15), p1 = CUBE.clone().addScaledVector(dir, 0.3 + L);
        const fade = Math.pow(1 - a / 0.45, 1.6);
        B.push(p0, p1, 0.03 + 0.05 * h(4), COL.violet, 2.4 * fade, h(5) < 0.5 ? COL.magenta : COL.cyan, 0);
      }
      for (let i = 0; i < 36; i++) {
        const h = k => hash(i, 150 + k);
        const ang = (i + h(0) * 0.8) / 36 * Math.PI * 2, sp = 0.75 + 0.35 * h(1);
        const R = (0.8 + 8.5 * expoOut(clamp(a / 0.75))) * sp * 0.92;
        const up = 0.15 + 0.9 * h(2) * (1 - Math.exp(-a * 3));
        const p = [CUBE.x + Math.cos(ang) * R, 0.12 + up * 0.6, CUBE.z + Math.sin(ang) * R];
        const life = clamp(a / (1.0 + 0.4 * h(3)));
        D.push(p, 0.25 + 0.9 * life * (0.7 + 0.6 * h(4)), 1, [0.52, 0.47, 0.42], 0.55 * Math.sin(Math.PI * Math.sqrt(life)) * (1 - life), h(5) * 6);
      }
    }
    // swallow splash: light droplets spray out of the face where the victim enters
    if (t >= S.tc && t < S.tc + 0.7 && t < T_IN) {
      const a = t - S.tc, n = new THREE.Vector3().subVectors(S.pc, CUBE);
      const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 'x' : 'z') : (Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z');
      const nrm = new THREE.Vector3(); nrm[ax] = Math.sign(n[ax]) || 1;
      for (let i = 0; i < 40; i++) {
        const h = k => hash(i, 200 + k);
        const v = nrm.clone().multiplyScalar(1.0 + 2.5 * h(0)).add(new THREE.Vector3(h(1) - 0.5, h(2) - 0.3, h(3) - 0.5).multiplyScalar(4));
        const p = S.pc.clone().addScaledVector(v, a).add(new THREE.Vector3(0, -3.5 * a * a, 0));
        const life = 0.35 + 0.35 * h(4);
        if (a > life) continue;
        Sp.push(p, 0.02 + 0.025 * h(5), 0, h(6) < 0.5 ? COL.cyan : COL.magenta, 3.0 * (1 - a / life), 0);
      }
      if (a < 0.3) Sp.push(S.pc, 0.3 + 1.0 * expoOut(a / 0.3), 3, COL.cyan, 0.9 * Math.pow(1 - a / 0.3, 2), 0);
    }
    // close flash (3.0)
    if (t >= T_SHUT && t < T_SHUT + 0.16) {
      const u = (t - T_SHUT) / 0.16;
      Sp.push(CUBE, 0.6 + 3.5 * expoOut(u), 2, [1, 0.85, 1], 0.8 * Math.pow(1 - u, 3), 0.6);
      Sp.push(CUBE, 1.0 + 5 * expoOut(u), 3, COL.violet, 1.0 * Math.pow(1 - u, 2), 0);
    }
    // ---------------- exit
    if (st.ph === 'exit') exitFx(t, st, B, Sp);
  }

  function exitFx(t, st, B, Sp) {
    const C = EXIT;
    if (t < T_SHAT) {
      // suck: streaks rushing into the core
      const u = ramp(T_EXIT, T_SHAT, t);
      for (let i = 0; i < 46; i++) {
        const h = k => hash(i, 700 + k);
        const dir = new THREE.Vector3(h(0) - 0.5, h(1) - 0.5, h(2) - 0.5).normalize();
        const ph = (u + h(3)) % 1;
        const r = (1.2 + 4.5 * h(4)) * Math.pow(1 - ph, 1.6);
        B.push(C.clone().addScaledVector(dir, r), C.clone().addScaledVector(dir, r + 0.3 + 0.9 * (1 - ph)), 0.012 + 0.02 * h(5), COL.cyan, 2.4 * Math.sin(Math.PI * ph), COL.violet, 0);
      }
      // light leaks through the cracks: thin rays begin to pierce out
      for (let i = 0; i < 6; i++) {
        const h = k => hash(i, 760 + k);
        const dir = new THREE.Vector3(h(0) - 0.5, h(1) * 0.8 - 0.2, h(2) - 0.5).normalize();
        const L = 2 + 4 * u;
        B.push(C, C.clone().addScaledVector(dir, L), 0.015 + 0.03 * u, [1, 0.9, 1], 1.5 * u * u, COL.violet, 0);
      }
      Sp.push(C, 0.4 + 0.8 * u, 2, [1, 0.85, 1], 1.2 + 2.0 * u * u, u * 2);
      return;
    }
    const a = t - T_SHAT;
    // core flash
    if (a < 0.2) {
      const u = a / 0.2;
      Sp.push(C, 0.8 + 3 * expoOut(u), 2, [1, 0.9, 1], 1.5 * Math.pow(1 - u, 3), 0.25);
      Sp.push(C, 1.0 + 6 * expoOut(u), 3, COL.magenta, 1.0 * Math.pow(1 - u, 2), 0);
    }
    // god rays
    if (a < 1.1) for (let i = 0; i < 14; i++) {
      const h = k => hash(i, 800 + k);
      const dir = new THREE.Vector3(h(0) - 0.5, h(1) * 0.9 - 0.15, h(2) - 0.5).normalize();
      const life = 0.55 + 0.5 * h(3), u = a / life;
      if (u >= 1) continue;
      const L = (7 + 12 * h(4)) * expoOut(clamp(a / 0.12));
      const fl = 0.8 + 0.2 * Math.sin(t * 60 + i * 3);
      B.push(C.clone().addScaledVector(dir, 0.3), C.clone().addScaledVector(dir, L), (0.04 + 0.09 * h(5)) * (1 - u * 0.6), [1, 0.92, 1], 1.1 * Math.pow(1 - u, 2) * fl, h(6) < 0.5 ? COL.violet : COL.cyan, 0);
    }
    // debris sparkle (fast pixel bits)
    for (let i = 0; i < 160; i++) {
      const h = k => hash(i, 900 + k);
      const life = 0.5 + 0.9 * h(0);
      if (a > life) continue;
      const dir = new THREE.Vector3(h(1) - 0.5, h(2) - 0.35, h(3) - 0.5).normalize();
      const sp = 7 + 13 * h(4), k = 3.2, e = (1 - Math.exp(-k * a)) / k;
      const p = C.clone().addScaledVector(dir, 0.4 + sp * e); p.y += -2.0 * a + 2.0 * e;
      const col = h(5) < 0.4 ? COL.violet : h(5) < 0.7 ? COL.magenta : h(5) < 0.9 ? COL.cyan : [1, 1, 1];
      Sp.push(p, 0.03 + 0.04 * h(6), 0, col, 3.2 * Math.pow(1 - a / life, 1.2), h(7) * 3);
    }
    // shards dissolving into pixel motes
    for (let i = 0; i < NSH; i++) {
      const pl = shPlan[i];
      for (let j = 0; j < 4; j++) {
        const ts = pl.td + j * 0.07, age = a - ts, h = k => hash(i * 4 + j, 1000 + k);
        const life = 1.0 + 1.3 * h(0);
        if (age < 0 || age > life) continue;
        shardPos(pl, ts, _p);
        const p = new THREE.Vector3(_p.x + (h(1) - 0.5) * pl.size + (h(2) - 0.5) * 0.25 * age, _p.y + (0.15 + 0.35 * h(3)) * age, _p.z + (h(4) - 0.5) * pl.size + (h(5) - 0.5) * 0.25 * age);
        const col = fractCol(pl.seed);
        const tw = 0.75 + 0.25 * Math.sin(t * (9 + 6 * h(6)) + h(7) * 6);
        Sp.push(p, 0.02 + 0.02 * h(8), 0, col, 2.6 * Math.sin(Math.PI * Math.min(1, age / life * 1.1 + 0.05)) * tw, 0);
      }
    }
    // lingering motes: blown out by the blast, then float through the title
    for (let i = 0; i < 34; i++) {
      const h = k => hash(i, 1100 + k);
      const dir = new THREE.Vector3(h(0) - 0.5, h(1) * 0.7 - 0.2, h(2) - 0.5).normalize();
      const sp = 3 + 8 * h(3), k = 2.6, e = (1 - Math.exp(-k * a)) / k;
      const p = C.clone().addScaledVector(dir, sp * e);
      p.y += 0.12 * a - 0.0 + 0.25 * Math.sin(a * (0.7 + 0.5 * h(4)) + h(5) * 6);
      p.x += 0.2 * Math.sin(a * (0.5 + 0.4 * h(6)) + h(7) * 6);
      if (p.y < 0.25) p.y = 0.25 + (0.25 - p.y) * 0.2;
      const tw = 0.6 + 0.4 * Math.sin(t * (4 + 4 * h(8)) + h(9) * 6);
      const fade = smooth(0, 0.3, a) * (1 - smooth(4.0 + 0.6 * h(10), 4.75, a)) * (1 - 0.45 * smooth(2.1, 2.5, a));
      Sp.push(p, 0.02 + 0.022 * h(11), h(12) < 0.6 ? 0 : 1, fractCol(h(13)), 1.6 * tw * fade, 0);
    }
  }
  function fractCol(x) { const k = (x * 3.7) % 1; return k < 0.45 ? COL.violet : k < 0.75 ? COL.magenta : COL.cyan; }

  function tunnelFx(t, tb) {
    const on = smooth(T_DIVE + 0.02, T_DIVE + 0.1, t) * (1 - smooth(T_IN + 0.05, T_IN + 0.2, t));
    if (on <= 0) return;
    const speed = t < T_IN ? lerp(25, 70, ramp(T_DIVE, T_IN, t)) : lerp(70, 18, ramp(T_IN, T_IN + 0.2, t));
    // integrated travel (closed form, piecewise)
    const ta = Math.min(t, T_IN) - T_DIVE, tbb = Math.max(0, t - T_IN);
    const travel = 25 * ta + 22.5 * ta * ta / 0.2 + (70 * tbb - 0.5 * (52 / 0.2) * tbb * tbb * (tbb < 0.2 ? 1 : 0));
    for (let i = 0; i < 130; i++) {
      const h = k => hash(i, 1300 + k);
      const ang = h(0) * Math.PI * 2, r = 0.35 + 2.8 * Math.pow(h(1), 0.8);
      const span = 48, z = ((h(2) * span + travel) % span) - span + 2;
      const L = 0.6 + speed * 0.06 * (0.6 + 0.8 * h(3));
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      const fz = smooth(-span + 2, -span + 10, z) * (1 - smooth(-1.5, 1.5, z));
      const col = h(4) < 0.4 ? COL.violet : h(4) < 0.7 ? COL.magenta : h(4) < 0.9 ? COL.cyan : [1, 1, 1];
      tb.push([x, y, z - L], [x, y, z], 0.008 + 0.02 * h(5), col, 0, col, 2.4 * on * fz);
    }
  }

  return { update };
}

export function post(t, p, f) {
  if (!S || DBG.includes('nopostA')) return p;
  const sc = S.cubeScreen || [0.5, 0.5];
  const space = f.space;
  if (space === 'world' && t < T_IN) {
    // charge: a touch of violet in the grade
    const ch = smooth(T_CHARGE, T_PALM, t) * (1 - smooth(T_THROW, T_UNF + 0.4, t));
    p.saturation *= 1 + 0.08 * ch;
    // unfold burst
    if (t >= T_UNF) {
      const a = t - T_UNF;
      p.radial = Math.max(p.radial, 0.2 * Math.exp(-a * 14));
      p.chroma = Math.max(p.chroma, 0.3 * Math.exp(-a * 12));
      p.flash = Math.max(p.flash, 0.12 * Math.exp(-a * 20));
      if (a < 0.3) p.radialCenter = sc;
    }
    if (t >= T_SHUT) {
      const a = t - T_SHUT;
      const fl = 0.26 * Math.exp(-a * 30);
      if (fl > p.flash) { p.flash = fl; p.flashColor = [0.75, 0.6, 1.0]; }
      p.chroma = Math.max(p.chroma, 0.4 * Math.exp(-a * 12));
    }
    if (t >= T_DIVE) {
      const u = ramp(T_DIVE, T_IN, t), e = Math.pow(u, 2.2);
      p.radial = Math.max(p.radial, 1.6 * e);
      p.chroma = Math.max(p.chroma, 0.7 * e);
      p.exposure *= 1 + 0.15 * e;
      p.tint = [lerp(p.tint[0], 0.85, e), lerp(p.tint[1], 0.7, e), lerp(p.tint[2], 1.15, e)];
      p.radialCenter = [0.5, 0.5];
      p.bloom.strength = Math.max(p.bloom.strength, 0.6 + 0.35 * e);
    }
  }
  if (space === 'world' && t >= T_EXIT && t < T_EXIT + 1.5) {
    if (t < T_SHAT) {
      const u = ramp(T_EXIT, T_SHAT, t);
      p.radial = Math.max(p.radial, 0.7 * u);
      p.radialCenter = sc;
      p.chroma = Math.max(p.chroma, 0.3 * u);
    } else {
      const a = t - T_SHAT;
      const fl = 0.35 * Math.exp(-a * 28);
      if (fl > p.flash) { p.flash = fl; p.flashColor = [0.8, 0.65, 1.0]; }
      p.chroma = Math.max(p.chroma, 0.3 * Math.exp(-a * 12));
      p.radial = Math.max(p.radial, 0.3 * Math.exp(-a * 14));
      if (a < 0.4) p.radialCenter = sc;
      p.bloom.strength = Math.max(p.bloom.strength, 0.55 + 0.2 * Math.exp(-a * 10));
    }
  }
  return p;
}
