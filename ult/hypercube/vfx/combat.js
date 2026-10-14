// vfx/combat.js — VFX-B (combat FX). See vfx/index.js for the contract.
// Charge aura, dash, every hit by kind (light/medium/heavy/mega), blinks, clones (ghost look, split, fist charge,
// shatter), energy gather, launch trail, meteor, crater, landing, aftermath dust/embers, eye glow; post(): hit flashes,
// radial/chroma kicks, screen ripples, impact frames, heat shimmer, shake for the crater/landing.
//
// Determinism: everything is a pure function of the scene time t. Particles are closed-form (ballistic / linear drag),
// randomness is hash(seed, index), past poses come from poseAt(def, t') on hidden probe rigs. Hit FX run on fxClock(t),
// which crawls at 6 % speed during hit-stop windows, so sparks hold while the characters are frozen.
import { poseAt, makePlayer, applyPose, bonePoint, sample } from '../rig.js';
import HITMAP from '../anim/hits.js';
import { HITS, WORLD, spaceAt } from '../timeline.js';
import { cameraAt } from '../camera.js';

// ------------------------------------------------------------------------------------------------ helpers
const TAU = Math.PI * 2, FR = 1 / 60;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, u) => a + (b - a) * u;
const backOut = x => { const c1 = 1.70158, c3 = c1 + 1; x = clamp(x); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
/** hash of any numbers → [0,1) */
function R(...k) {
  let h = 0x811c9dc5;
  for (let v of k) { v = Math.round(v * 1024) | 0; h = Math.imul(h ^ v, 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); }
  h ^= h >>> 13; h = Math.imul(h, 0x297a2d39); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function lin(hex) { const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return [f(hex >> 16 & 255), f(hex >> 8 & 255), f(hex & 255)]; }
const VIO = lin(0x8b5cff), MAG = lin(0xff3df2), CYA = lin(0x36e7ff), WHT = [1, 1, 1], EMB = [1.0, 0.42, 0.12];
const PAL = [VIO, MAG, CYA];
const mixc = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

// hit-stop clock: runs at SLOW speed inside every freeze window
const FREEZES = HITS.filter(h => h.stop > 0).map(h => [h.t, h.t + h.stop]);
const SLOW = 0.06;
export function fxClock(t) { let c = t; for (const [a, b] of FREEZES) if (t > a) c -= (1 - SLOW) * (Math.min(t, b) - a); return c; }
const since = (t, t0) => fxClock(t) - fxClock(t0);

const KIND = {
  light: { s: 0.26, n: 4, flash: 0.3, life: 0.07, sparks: 7, lines: 0, ring3: 0, smoke: 0, shards: 0, light: 4, rad: 0.5 },
  medium: { s: 0.42, n: 6, flash: 0.5, life: 0.1, sparks: 13, lines: 8, ring3: 1, smoke: 3, shards: 0, light: 9, rad: 0.8 },
  heavy: { s: 0.7, n: 8, flash: 0.6, life: 0.12, sparks: 24, lines: 12, ring3: 2, smoke: 7, shards: 14, light: 22, rad: 1.4 },
  mega: { s: 0.75, n: 8, flash: 1.0, life: 0.2, sparks: 36, lines: 26, ring3: 2, smoke: 10, shards: 26, light: 45, rad: 2.2 },
};

let S = null; // module state shared with post()

/** Impact frames (mega hits): {t0, fi} while one is on screen. fi 0–1 black-on-white, 2–3 white-on-black. */
const IMPACTS = [[8.4, 4], [9.6, 2]];
export function impactFrame(t) {
  for (const [t0, n] of IMPACTS) { const fi = Math.floor((t - t0) * 60 + 0.02); if (t >= t0 && fi < n) return { t0, fi }; }
  return null;
}
const IMPACT_LAYER = 1; // actors + lights + the impact star render alone on this layer during impact frames

// ------------------------------------------------------------------------------------------------ shaders
const BILL_VS = `
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iP;
varying vec2 vQ; varying vec4 vC; varying vec4 vP; varying float vS;
void main(){
  vQ = position.xy; vC = iC; vP = iP; vS = iB.w;
  vec3 a = (modelViewMatrix * vec4(iA.xyz, 1.0)).xyz;
  vec3 mv;
  if (abs(iB.w - 4.0) < 0.5) {
    vec3 b = (modelViewMatrix * vec4(iB.xyz, 1.0)).xyz;
    vec3 sd = cross(b - a, a + b);
    float l = length(sd);
    sd = l > 1e-9 ? sd / l : vec3(0.0, 1.0, 0.0);
    mv = mix(a, b, position.x * 0.5 + 0.5) + sd * position.y * iA.w;
  } else {
    float c = cos(iP.x), s = sin(iP.x);
    mv = a + vec3(c * position.x - s * position.y, s * position.x + c * position.y, 0.0) * iA.w;
  }
  gl_Position = projectionMatrix * vec4(mv, 1.0);
}`;
const BILL_FS = `
varying vec2 vQ; varying vec4 vC; varying vec4 vP; varying float vS;
float h1(float n){ return fract(sin(n * 127.1 + 0.37) * 43758.5453); }
void main(){
  vec2 q = vQ; float r = length(q); float m = 0.0; vec3 o = vC.rgb; float s = vS;
  if (s < 0.5) {                       // 0 glow: p1 white-hot core, p2 falloff power
    float g = clamp(1.0 - r, 0.0, 1.0);
    m = pow(g, vP.z > 0.0 ? vP.z : 2.0);
    o = vC.rgb + vec3(vP.y) * g * g * g * g * 3.0;
  } else if (s < 1.5) {                // 1 anime star: p1 points, p2 seed, p3 spike half-width
    float N = vP.y; float seg = 6.2831853 / N;
    float ang = atan(q.y, q.x);
    float k = floor(ang / seg + 0.5); float phi = ang - k * seg;
    float L = 0.5 + 0.5 * h1(mod(k + N * 4.0, N) + vP.z * 7.31);
    float along = r * cos(phi), perp = r * abs(sin(phi));
    float hw = vP.w * max(0.0, 1.0 - along / L);
    float aa = fwidth(r) * 1.2 + 1e-4;
    m = (1.0 - smoothstep(-aa, aa, perp - hw)) * step(0.0, along);
    m = max(m, 1.0 - smoothstep(vP.w * 1.5 - aa, vP.w * 1.5 + aa, r));
    o = vC.rgb * (1.0 + 1.2 * (1.0 - r));
  } else if (s < 2.5) {                // 2 pixel square
    float aa = fwidth(q.x) + 1e-4;
    m = (1.0 - smoothstep(1.0 - aa, 1.0, abs(q.x))) * (1.0 - smoothstep(1.0 - aa, 1.0, abs(q.y)));
  } else if (s < 3.5) {                // 3 ring: p1 thickness, p2 power
    float th = max(vP.y, 0.01); float x = (r - (1.0 - th * 0.5)) / (th * 0.5);
    m = pow(clamp(1.0 - x * x, 0.0, 1.0), vP.z > 0.0 ? vP.z : 1.0);
  } else if (s < 4.5) {                // 4 streak A→B: p1 fade toward A (power), p2 width taper toward A
    float u = q.x * 0.5 + 0.5;
    float th = mix(1.0, u, vP.z);
    float y = abs(q.y) / max(th, 0.02);
    m = clamp(1.0 - y * y, 0.0, 1.0) * pow(max(u, 0.0), vP.y);
    m *= smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.96, 1.0, u));
    o = vC.rgb * (1.0 + 1.5 * exp(-y * y * 10.0));
  } else if (s < 5.5) {                // 5 soft puff (dust): p1 seed
    float ang = atan(q.y, q.x);
    float edge = 0.8 + 0.12 * sin(ang * 5.0 + vP.y * 6.0) + 0.08 * sin(ang * 9.0 - vP.y * 3.0);
    m = 1.0 - smoothstep(edge * 0.4, edge, r);
  } else if (s < 6.5) {                // 6 shard (diamond): p1 elongation
    float d = abs(q.x) + abs(q.y) * vP.y;
    float aa = fwidth(d) + 1e-4;
    m = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    o = vC.rgb * (1.0 + 0.8 * (1.0 - d));
  } else {                             // 7 cross flare: p1 thinness
    float g = max(exp(-abs(q.y) * vP.y) * (1.0 - abs(q.x)), exp(-abs(q.x) * vP.y) * (1.0 - abs(q.y)));
    m = clamp(g + exp(-r * r * 30.0), 0.0, 1.0);
  }
  float al = vC.a * m;
  if (al < 0.002) discard;
  gl_FragColor = vec4(o, al);
}`;
const QUAD_VS = `
attribute vec4 iC; attribute vec4 iU; attribute vec4 iV; attribute vec4 iK; attribute vec4 iX;
varying vec2 vQ; varying vec4 vK; varying vec4 vX; varying float vS; varying vec2 vP;
void main(){
  vQ = position.xy; vK = iK; vX = iX; vS = iC.w; vP = vec2(iU.w, iV.w);
  vec3 w = iC.xyz + iU.xyz * position.x + iV.xyz * position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
}`;
const QUAD_FS = `
varying vec2 vQ; varying vec4 vK; varying vec4 vX; varying float vS; varying vec2 vP;
void main(){
  vec2 q = vQ; float r = length(q); float m = 0.0; vec3 o = vK.rgb;
  if (vS < 0.5) {                      // 0 shock ring: p1 thickness, p2 power
    float th = max(vP.x, 0.01); float x = (r - (1.0 - th * 0.5)) / (th * 0.5);
    m = pow(clamp(1.0 - x * x, 0.0, 1.0), max(vP.y, 0.3));
    o = vK.rgb * (0.55 + 1.3 * smoothstep(-0.4, 0.9, x));
  } else if (vS < 1.5) {               // 1 disc glow: p1 power
    m = pow(clamp(1.0 - r, 0.0, 1.0), max(vP.x, 0.5));
  } else if (vS < 2.5) {               // 2 square frame ("cube face"): p1 thickness, p2 fill
    float d = max(abs(q.x), abs(q.y)); float th = vP.x;
    float aa = fwidth(d) + 1e-4;
    m = (1.0 - smoothstep(1.0 - aa, 1.0, d)) * smoothstep(1.0 - th - aa, 1.0 - th, d);
    m += vP.y * (1.0 - smoothstep(0.0, 1.0, d));
  } else {                             // 3 arc: x start angle, y span, p1 thickness
    float a = mod(atan(q.y, q.x) - vX.x, 6.2831853);
    float u = a / max(vX.y, 1e-3);
    if (u > 1.0) discard;
    float th = vP.x * mix(0.25, 1.0, u); float x = (r - (1.0 - th * 0.5)) / (th * 0.5);
    m = clamp(1.0 - x * x, 0.0, 1.0) * u;
  }
  float al = vK.a * m;
  if (al < 0.002) discard;
  gl_FragColor = vec4(o, al);
}`;
const RIB_VS = `
attribute vec4 aCol; attribute vec2 aUv; varying vec4 vCol; varying vec2 vUv;
void main(){ vCol = aCol; vUv = aUv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FS = `
varying vec4 vCol; varying vec2 vUv;
void main(){ float v = vUv.y; float m = clamp(1.0 - v * v, 0.0, 1.0); float core = exp(-v * v * 9.0);
  float al = vCol.a * m; if (al < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * (0.45 + 1.6 * core), al); }`;
const GHOST_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vY = wp.y;
  vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GHOST_FS = `
uniform sampler2D map; uniform vec3 uCol; uniform vec3 uRim; uniform float uOp; uniform float uScan; uniform float uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  vec4 tx = texture2D(map, vUv); if (tx.a < 0.5) discard;
  float l = dot(tx.rgb, vec3(0.299, 0.587, 0.114));
  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV))); fr *= fr;
  float sc = 1.0 - uScan * (0.5 + 0.5 * sin(vY * 150.0 - uTime * 40.0));
  vec3 c = (uCol * (0.22 + 1.2 * l) + uRim * fr * 2.2) * sc;
  gl_FragColor = vec4(c, uOp);
}`;
const SPH_VS = `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SPH_FS = `
uniform vec3 uCol; uniform float uA;
varying vec3 vN; varying vec3 vV;
void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float m = pow(f, 4.0) * 0.9 + 0.012;
  gl_FragColor = vec4(uCol * (1.0 + 1.2 * pow(f, 10.0)), uA * m); }`;
const DECAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRACK_FS = `
uniform sampler2D map; uniform float uReveal, uGlow, uDark; uniform vec3 uGlowCol;
varying vec2 vUv;
void main(){
  vec4 tx = texture2D(map, vUv); float r = length(vUv - 0.5) * 2.0;
  float rev = 1.0 - smoothstep(uReveal - 0.06, uReveal, r);
  float crack = tx.r * rev, glow = tx.g * rev;
  float a = max(crack * uDark, clamp(glow * uGlow * 1.2, 0.0, 1.0));
  if (a < 0.003) discard;
  vec3 dark = vec3(0.035, 0.028, 0.03);
  vec3 col = mix(dark, uGlowCol * (0.6 + 2.5 * crack), clamp(uGlow * (glow + crack), 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}`;
const SCORCH_FS = `
uniform float uAmt, uGlow, uSeed; uniform vec3 uGlowCol;
varying vec2 vUv;
float hh(vec2 p){ return fract(sin(dot(p, vec2(27.17, 91.43)) + uSeed) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  vec2 px = floor(vUv * 64.0) / 64.0;                    // Minecraft-pixel grain
  float n = vn(px * 9.0) * 0.6 + vn(px * 23.0) * 0.4;
  float edge = 0.62 + 0.22 * (n - 0.5);
  float burnt = 1.0 - smoothstep(edge - 0.18, edge, r);
  float soot = (1.0 - smoothstep(edge, edge + 0.3, r)) * 0.45;
  vec3 col = mix(vec3(0.16, 0.11, 0.07), vec3(0.03, 0.025, 0.025), smoothstep(0.2, 0.9, burnt) * (0.7 + 0.3 * n));
  float a = max(burnt * 0.95, soot * (0.5 + 0.5 * n)) * uAmt;
  float hot = (1.0 - smoothstep(0.0, 0.42, r)) * smoothstep(0.35, 0.75, vn(px * 15.0 + 3.0));
  col += uGlowCol * hot * uGlow * 3.0;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

// ------------------------------------------------------------------------------------------------ pools
function billPool(THREE, max, blending, order) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new Float32Array(max * 4), B = new Float32Array(max * 4), C = new Float32Array(max * 4), P = new Float32Array(max * 4);
  const attrs = [['iA', A], ['iB', B], ['iC', C], ['iP', P]].map(([n, arr]) => { const a = new THREE.InstancedBufferAttribute(arr, 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; });
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: BILL_VS, fragmentShader: BILL_FS, transparent: true, depthWrite: false, blending });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = order;
  let n = 0;
  return {
    mesh, max,
    reset() { n = 0; },
    count() { return n; },
    spr(x, y, z, size, shape, r, gg, b, a, rot = 0, p1 = 0, p2 = 0, p3 = 0) {
      if (n >= max || a <= 0.002 || size <= 0) return;
      const i = n * 4;
      A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = size;
      B[i] = 0; B[i + 1] = 0; B[i + 2] = 0; B[i + 3] = shape;
      C[i] = r; C[i + 1] = gg; C[i + 2] = b; C[i + 3] = Math.min(a, 1);
      P[i] = rot; P[i + 1] = p1; P[i + 2] = p2; P[i + 3] = p3;
      n++;
    },
    line(ax, ay, az, bx, by, bz, w, r, gg, b, a, p1 = 0, p2 = 0) {
      if (n >= max || a <= 0.002 || w <= 0) return;
      const i = n * 4;
      A[i] = ax; A[i + 1] = ay; A[i + 2] = az; A[i + 3] = w;
      B[i] = bx; B[i + 1] = by; B[i + 2] = bz; B[i + 3] = 4;
      C[i] = r; C[i + 1] = gg; C[i + 2] = b; C[i + 3] = Math.min(a, 1);
      P[i] = 0; P[i + 1] = p1; P[i + 2] = p2; P[i + 3] = 0;
      n++;
    },
    flush() {
      g.instanceCount = n;
      for (const a of attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(4, n * 4)); a.needsUpdate = true; }
      mesh.visible = n > 0;
    },
  };
}
function quadPool(THREE, max) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const arrs = { iC: new Float32Array(max * 4), iU: new Float32Array(max * 4), iV: new Float32Array(max * 4), iK: new Float32Array(max * 4), iX: new Float32Array(max * 4) };
  const attrs = Object.entries(arrs).map(([nm, arr]) => { const a = new THREE.InstancedBufferAttribute(arr, 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(nm, a); return a; });
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: QUAD_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 11;
  let n = 0;
  const set = (arr, i, a, b, c, d) => { arr[i] = a; arr[i + 1] = b; arr[i + 2] = c; arr[i + 3] = d; };
  return {
    mesh,
    reset() { n = 0; },
    // centre c, half axes u, v (Vector3), shape, colour (r,g,b), alpha, params
    quad(c, u, v, shape, col, gain, a, p1 = 0, p2 = 0, x0 = 0, x1 = 0) {
      if (n >= max || a <= 0.002) return;
      const i = n * 4;
      set(arrs.iC, i, c.x, c.y, c.z, shape); set(arrs.iU, i, u.x, u.y, u.z, p1); set(arrs.iV, i, v.x, v.y, v.z, p2);
      set(arrs.iK, i, col[0] * gain, col[1] * gain, col[2] * gain, Math.min(a, 1)); set(arrs.iX, i, x0, x1, 0, 0);
      n++;
    },
    flush() {
      g.instanceCount = n;
      for (const a of attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(4, n * 4)); a.needsUpdate = true; }
      mesh.visible = n > 0;
    },
  };
}
function ribbonPool(THREE, maxPts) {
  const pos = new Float32Array(maxPts * 6), col = new Float32Array(maxPts * 8), uv = new Float32Array(maxPts * 4), idx = new Uint16Array(maxPts * 6);
  const g = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(pos, 3), aC = new THREE.BufferAttribute(col, 4), aU = new THREE.BufferAttribute(uv, 2), aI = new THREE.BufferAttribute(idx, 1);
  for (const a of [aP, aC, aU, aI]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aP); g.setAttribute('aCol', aC); g.setAttribute('aUv', aU); g.setIndex(aI);
  const mat = new THREE.ShaderMaterial({ vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 12;
  let nv = 0, ni = 0;
  const T = new THREE.Vector3(), V = new THREE.Vector3(), Sd = new THREE.Vector3();
  return {
    mesh,
    reset() { nv = 0; ni = 0; },
    /** pts: Vector3[] tail → head; wf(s) half width, cf(s) → [r,g,b,a] for s = 0 (tail) .. 1 (head) */
    ribbon(pts, cam, wf, cf) {
      const n = pts.length;
      if (n < 2 || nv + n * 2 > maxPts * 2) return;
      const base = nv;
      for (let i = 0; i < n; i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        T.subVectors(b, a); V.subVectors(cam, p);
        Sd.crossVectors(T, V); const l = Sd.length();
        if (l < 1e-9) Sd.set(0, 1, 0); else Sd.multiplyScalar(1 / l);
        const s = i / (n - 1), w = wf(s), c = cf(s);
        for (let side = 0; side < 2; side++) {
          const k = nv * 3, sg = side ? -1 : 1;
          pos[k] = p.x + Sd.x * w * sg; pos[k + 1] = p.y + Sd.y * w * sg; pos[k + 2] = p.z + Sd.z * w * sg;
          const kc = nv * 4; col[kc] = c[0]; col[kc + 1] = c[1]; col[kc + 2] = c[2]; col[kc + 3] = Math.min(1, c[3]);
          const ku = nv * 2; uv[ku] = s; uv[ku + 1] = sg;
          nv++;
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const k = base + i * 2;
        idx[ni++] = k; idx[ni++] = k + 1; idx[ni++] = k + 2; idx[ni++] = k + 1; idx[ni++] = k + 3; idx[ni++] = k + 2;
      }
    },
    flush() {
      for (const a of [aP, aC, aU, aI]) a.needsUpdate = true;
      g.setDrawRange(0, ni);
      mesh.visible = ni > 0;
    },
  };
}
function instPool(THREE, geom, mat, max, shadow) {
  const mesh = new THREE.InstancedMesh(geom, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.castShadow = !!shadow; mesh.receiveShadow = !!shadow;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  const M = new THREE.Matrix4(), Cc = new THREE.Color(), Sv = new THREE.Vector3(), Q = new THREE.Quaternion(), Pv = new THREE.Vector3();
  let n = 0;
  return {
    mesh,
    reset() { n = 0; },
    put(p, q, s, col, sy = 1) {
      if (n >= max || s <= 0.002) return;
      Pv.copy(p); Sv.set(s, s * sy, s); if (q) Q.copy(q); else Q.identity();
      M.compose(Pv, Q, Sv); mesh.setMatrixAt(n, M);
      Cc.setRGB(col[0], col[1], col[2]); mesh.setColorAt(n, Cc);
      n++;
    },
    flush() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.visible = n > 0; },
  };
}

// ------------------------------------------------------------------------------------------------ textures
function blockTextures(THREE) {
  const S = 16;
  const mk = (draw) => {
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S; const g = cv.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = draw(x, y); g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(x, y, 1, 1); }
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const dirt = (x, y) => { const n = R(x, y, 5), k = n < 0.12 ? 0.62 : n > 0.9 ? 1.18 : 0.88 + n * 0.2; return [134 * k, 96 * k, 67 * k]; };
  const grass = (x, y) => { const n = R(x, y, 9); const k = 0.82 + n * 0.3; return [88 * k, 128 * k, 52 * k]; };
  return {
    side: mk((x, y) => (y < 3 + (R(x, 2) > 0.55 ? 1 : 0) + (R(x, 3) > 0.85 ? 1 : 0) ? grass(x, y) : dirt(x, y))),
    dirt: mk(dirt),
  };
}
function crackTexture(THREE, seed, n0, len0, w0) {
  const N = 512, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const paths = [];
  const walk = (x, y, a, len, w, depth, k) => {
    const pts = [[x, y]];
    let l = 0, i = 0;
    while (l < len) {
      const st = 7 + R(seed, k, i, 1) * 12;
      a += (R(seed, k, i, 2) - 0.5) * 0.9;
      x += Math.cos(a) * st; y += Math.sin(a) * st; l += st; i++;
      pts.push([x, y]);
      if (depth < 2 && R(seed, k, i, 3) < 0.13) walk(x, y, a + (R(seed, k, i, 4) < 0.5 ? -1 : 1) * (0.5 + R(seed, k, i, 5) * 0.6), (len - l) * 0.55, w * 0.6, depth + 1, k * 7 + i);
    }
    paths.push({ pts, w });
  };
  for (let k = 0; k < n0; k++) {
    const a = k / n0 * TAU + (R(seed, k, 9) - 0.5) * 0.5;
    walk(N / 2 + Math.cos(a) * 14, N / 2 + Math.sin(a) * 14, a, len0 * (0.6 + R(seed, k, 8) * 0.4), w0 * (0.7 + R(seed, k, 7) * 0.5), 0, k + 1);
  }
  const stroke = (style, wk, blur) => {
    g.strokeStyle = style; g.shadowColor = style; g.shadowBlur = blur;
    for (const { pts, w } of paths) {
      for (let i = 1; i < pts.length; i++) {
        const u = i / pts.length;
        g.lineWidth = Math.max(1, w * wk * (1 - u * 0.75));
        g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      }
    }
  };
  stroke('rgba(0,255,0,0.45)', 3.2, 10);
  stroke('rgba(255,0,0,1)', 1, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ------------------------------------------------------------------------------------------------ create
export function create(ctx) {
  const { THREE, scene } = ctx;
  const V3 = THREE.Vector3;
  const actors = ctx.actors;
  const defs = { user: actors.user.def, victim: actors.victim.def };
  const clones = actors.clones.map((c, i) => ({ i, id: c.def.id || 'clone' + i, def: c.def, player: c.player }));
  for (const c of clones) defs[c.id] = c.def;

  // probes: hidden rigs posed at arbitrary times (past poses, contact points)
  const probes = [makePlayer(THREE, null, false), makePlayer(THREE, null, true)];
  const posed = (def, tt) => { const pl = probes[def.slim ? 1 : 0]; applyPose(pl, poseAt(def, tt)); return pl; };
  const boneAt = (def, tt, name) => bonePoint(THREE, posed(def, tt), name, new V3());

  // ---- pools ----
  const B = billPool(THREE, 3600, THREE.AdditiveBlending, 13);
  const BN = billPool(THREE, 900, THREE.NormalBlending, 9);
  const Q = quadPool(THREE, 160);
  const RB = ribbonPool(THREE, 900);
  const gradMap = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  gradMap.magFilter = gradMap.minFilter = THREE.NearestFilter; gradMap.needsUpdate = true;
  const smokeMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradMap });
  const SM = instPool(THREE, new THREE.IcosahedronGeometry(1, 1), smokeMat, 300, false);
  const btex = blockTextures(THREE);
  const topTex = ctx.tex('tex/grass_block_top.png', { nearest: true });
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const sideM = lam({ map: btex.side }), dirtM = lam({ map: btex.dirt }), topM = lam({ map: topTex, color: 0x8fbf55 });
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const BK = instPool(THREE, boxG, [sideM, sideM, topM, dirtM, sideM, sideM], 140, true);
  const DK = instPool(THREE, boxG, dirtM, 60, true);
  for (const p of [B, BN, Q, RB, SM, BK, DK]) scene.add(p.mesh);

  // mega sphere shockwave
  const sphMat = new THREE.ShaderMaterial({ vertexShader: SPH_VS, fragmentShader: SPH_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uCol: { value: new THREE.Vector3() }, uA: { value: 0 } } });
  const sph = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), sphMat); sph.frustumCulled = false; sph.renderOrder = 8; sph.visible = false; scene.add(sph);

  // ground decals
  const decal = (fs, size, uniforms, y, order) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: fs, uniforms, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = order; m.visible = false; scene.add(m); return m;
  };
  const glowU = () => new THREE.Vector3(VIO[0] * 1.4 + 0.15, VIO[1] * 1.4 + 0.05, VIO[2] * 1.6);
  const scorch = decal(SCORCH_FS, 4.2, { uAmt: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: 3.7 }, uGlowCol: { value: glowU() } }, 0.012, 5);
  const cracks = decal(CRACK_FS, 11, { map: { value: crackTexture(THREE, 11, 11, 230, 7) }, uReveal: { value: 0 }, uGlow: { value: 0 }, uDark: { value: 0 }, uGlowCol: { value: glowU() } }, 0.018, 6);
  const lcracks = decal(CRACK_FS, 3.4, { map: { value: crackTexture(THREE, 23, 7, 170, 6) }, uReveal: { value: 0 }, uGlow: { value: 0 }, uDark: { value: 0 }, uGlowCol: { value: glowU() } }, 0.016, 6);
  const lscorch = decal(SCORCH_FS, 1.5, { uAmt: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: 9.1 }, uGlowCol: { value: glowU() } }, 0.011, 5);

  // hit light (always present so shader programs never change)
  const light = new THREE.PointLight(0xb894ff, 0, 9, 2); light.castShadow = false; scene.add(light);

  // ghost material (afterimages, clones)
  const ghostMat = (map, col, rim, scan) => new THREE.ShaderMaterial({ vertexShader: GHOST_VS, fragmentShader: GHOST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: map }, uCol: { value: new THREE.Vector3(...col) }, uRim: { value: new THREE.Vector3(...rim) }, uOp: { value: 0 }, uScan: { value: scan }, uTime: { value: 0 } } });
  const userMap = ctx.tex(`tex/${defs.user.skin}.png`, { nearest: true });
  const ghosts = [];
  for (let i = 0; i < 7; i++) {
    const m = ghostMat(userMap, i % 2 ? CYA : VIO, i % 2 ? VIO : CYA, 0.25);
    const pl = makePlayer(THREE, userMap, !!defs.user.slim, { material: m, overMaterial: m });
    pl.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 7; } });
    pl.root.visible = false; scene.add(pl.root);
    ghosts.push({ pl, m });
  }
  // clones: my ghost look (fresnel rim, scanlines, a faint offset duplicate)
  for (const c of clones) {
    const map = ctx.tex(`tex/${c.def.skin || defs.user.skin}.png`, { nearest: true });
    const base = c.i % 2 ? CYA : VIO, rim = c.i % 2 ? MAG : CYA;
    c.mat = ghostMat(map, base.map(v => v * 0.75), rim.map(v => v * 0.7), 0.35);
    c.dup = ghostMat(map, (c.i % 2 ? VIO : CYA).map(v => v * 0.6), MAG, 0.6);
    c.dups = [];
    const meshes = []; c.player.root.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      o.material = c.mat; o.castShadow = false; o.renderOrder = 7;
      const d = new THREE.Mesh(o.geometry, c.dup); d.renderOrder = 7; o.add(d); c.dups.push(d);
    }
  }

  // impact-frame silhouettes: actors, lights and a dedicated star pool on layer 1
  for (const a of [actors.user, actors.victim, ...actors.clones]) a.player.root.traverse(o => o.layers.enable(IMPACT_LAYER));
  const black = new THREE.Color(0, 0, 0), whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  // the impact star: a flat jagged star mesh facing the camera (renders white under the override material)
  const starMesh = (() => {
    const sh = new THREE.Shape(), N = 11;
    for (let i = 0; i <= 2 * N; i++) {
      const a = i / (2 * N) * TAU, r = i % 2 ? 0.16 + R(3, i) * 0.08 : 0.55 + R(4, i) * 0.45;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), whiteMat); m.layers.set(IMPACT_LAYER); m.visible = false; m.frustumCulled = false;
    scene.add(m); return m;
  })();

  // ---- scan the animation once (pure functions of the defs) ----
  const visOf = (def, tt) => (sample(def.tracks.vis, tt) ?? 1) > 0.5;
  const posOf = (def, tt) => sample(def.tracks['root.pos'], tt) || [0, 0, 0];
  const blinks = [];
  {
    const def = defs.user, dt = 1 / 240;
    let pv = visOf(def, 0), pp = posOf(def, 0), off = null;
    for (let i = 1; i <= 15 * 240; i++) {
      const tt = i * dt, v = visOf(def, tt), p = posOf(def, tt);
      if (pv && !v) off = tt;
      else if (!pv && v && off !== null) { blinks.push({ tOff: off, tOn: tt }); off = null; }
      else if (v && pv && Math.hypot(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]) > 0.5 && spaceAt(tt) === spaceAt(tt - dt)) blinks.push({ tOff: tt - dt * 0.5, tOn: tt });
      pv = v; pp = p;
    }
    for (const b of blinks) {
      b.B = boneAt(def, b.tOn + 1e-4, 'chest');
      const sameSpace = spaceAt(b.tOff) === spaceAt(b.tOn);
      b.kind = sameSpace && b.tOn - b.tOff < 0.3 ? 'blink' : 'appear';
      if (b.kind === 'blink') b.A = boneAt(def, b.tOff - 1 / 240, 'chest');
      b.seed = Math.round(b.tOn * 240);
    }
    // the 3.55 blink-in from a cube face: if the animation has no appearance there yet, still mark the event
    if (!blinks.some(b => b.tOn > 3.42 && b.tOn < 3.75) && visOf(def, 3.55) && spaceAt(3.55) === 'inside')
      blinks.push({ tOff: 3.55, tOn: 3.55, kind: 'appear', B: boneAt(def, 3.55, 'chest'), seed: 852 });
    for (const b of blinks) if (b.kind === 'appear') {
      // a cube face beside the arrival point, on the screen side away from the victim (camera of that moment)
      const tt = b.tOn;
      const fakeF = { t: tt, space: spaceAt(tt), bone: (id, n) => boneAt(defs[id] || defs.user, tt, n), pose: id => poseAt(defs[id] || defs.user, tt) };
      const cm = cameraAt(tt, fakeF);
      const fwd = new V3(...cm.look).sub(new V3(...cm.pos)).normalize(), right = new V3().crossVectors(fwd, new V3(0, 1, 0)).normalize();
      const vc = boneAt(defs.victim, tt, 'chest');
      const side = vc.clone().sub(b.B).dot(right) > 0 ? -1 : 1;
      b.A = b.B.clone().addScaledVector(right, side * 1.7).addScaledVector(fwd, 0.5).add(new V3(0, 0.55, 0));
      b.face = true;
    }
  }
  for (const c of clones) {
    let first = null, last = null, pv = false;
    for (let i = 0; i <= 15 * 240; i++) {
      const tt = i / 240, v = visOf(c.def, tt);
      if (v && !pv && first === null) first = tt;
      if (!v && pv) last = tt;
      pv = v;
    }
    const always = first === 0 && last === null;
    c.spawn = always || first === null ? 6.4 + c.i * 0.033 + R(c.i, 1) * 0.02 : first;
    c.vanish = always || last === null ? 8.6 + c.i * 0.034 + R(c.i, 2) * 0.02 : last;
    c.spawnFrom = boneAt(defs.user, c.spawn, 'chest');
    c.spawnAt = boneAt(c.def, c.spawn + 1e-3, 'chest');
    const names = ['head', 'chest', 'pelvis', 'fistR', 'fistL', 'elbowR', 'elbowL', 'footR', 'footL', 'kneeR', 'kneeL', 'back', 'face', 'hipR', 'hipL'];
    const pl = posed(c.def, c.vanish - 1 / 240);
    c.shardPts = names.map(n => bonePoint(THREE, pl, n, new V3()));
    c.shardC = bonePoint(THREE, pl, 'chest', new V3());
    const e = HITMAP['8.40']; const list = Array.isArray(e) ? e : e ? [e] : [];
    c.limb = (list.find(x => x.id === c.id) || {}).limb || (c.i % 2 ? 'fistL' : 'fistR');
  }
  const userMegaLimb = (() => { const e = HITMAP['8.40']; const list = Array.isArray(e) ? e : e ? [e] : []; return (list.find(x => x.id === 'user') || {}).limb || 'fistR'; })();

  // ---- contact points of the hits (memoised pure function of the animation) ----
  const contactCache = new Map();
  function contacts(i) {
    if (contactCache.has(i)) return contactCache.get(i);
    const h = HITS[i];
    const e = HITMAP[h.t.toFixed(2)];
    const list = e ? (Array.isArray(e) ? e : [e]) : [];
    const out = [];
    for (const en of list) {
      const sdef = defs[en.id] || defs.user;
      const L = boneAt(sdef, h.t, en.limb || 'fistR'), Vc = boneAt(defs.victim, h.t, en.at || 'chest');
      const P = L.clone().lerp(Vc, 0.3);
      const D = en.dir ? new V3(...en.dir) : Vc.clone().sub(L);
      if (D.lengthSq() < 1e-6) D.set(0, 0, -1);
      out.push({ id: defs[en.id] ? en.id : 'user', limb: en.limb, P, D: D.normalize() });
    }
    if (!out.length) {
      const Vc = boneAt(defs.victim, h.t, 'chest'), U = boneAt(defs.user, h.t, 'chest');
      let D = Vc.clone().sub(U);
      if (h.by !== 'user' || D.length() > 3.5 || D.lengthSq() < 1e-4) { const a = R(i, 3) * TAU; D = new V3(Math.cos(a), (R(i, 4) - 0.5) * 0.6, Math.sin(a)); }
      D.normalize();
      const off = new V3(R(i, 5) - 0.5, R(i, 6) - 0.5, R(i, 7) - 0.5).multiplyScalar(0.25);
      out.push({ id: null, limb: null, P: Vc.clone().add(off).addScaledVector(D, -0.14), D, fallback: true });
    }
    contactCache.set(i, out);
    return out;
  }
  // crater / landing follow the animation when it puts the actors there, else the timeline spots
  const near = (p, w, r) => Math.abs(p[1]) < 2 && Math.hypot(p[0] - w[0], p[2] - w[2]) < r;
  const craterAt = (() => { const p = posOf(defs.victim, 9.85); return near(p, WORLD.crater, 2.5) ? new V3(p[0], 0, p[2]) : new V3(WORLD.crater[0], 0, WORLD.crater[2]); })();
  const landAt = (() => { const p = posOf(defs.user, 10.4); return near(p, WORLD.landing, 2.5) ? new V3(p[0], 0, p[2]) : new V3(WORLD.landing[0], 0, WORLD.landing[2]); })();
  // the meteor: the victim's chest when the animation drops them from the cube, else a stand-in path cube → crater
  const meteorReal = (() => { const p = posOf(defs.victim, 9.84); return spaceAt(9.84) === 'world' && near(p, WORLD.crater, 3); })();
  const meteorAt = (tt, out) => {
    if (meteorReal) return bonePoint(THREE, posed(defs.victim, tt), 'chest', out);
    const u = clamp((tt - 9.65) / 0.2), e = u * u * (0.4 + 0.6 * u);
    return out.set(lerp(WORLD.cube[0], craterAt.x, e), lerp(WORLD.cube[1] + 0.3, 0.45, e), lerp(WORLD.cube[2], craterAt.z, e));
  };

  S = { THREE, contacts, craterAt, landAt, blinks, clones, boneAt, defs };

  // ------------------------------------------------------------------------------------------ emit helpers
  const cam = new V3(), camQ = new THREE.Quaternion();
  let viewK = 1; // view height per unit distance: 2 tan(fov/2)
  const tmp = new V3(), tmp2 = new V3(), tmp3 = new V3();
  const spr = (pool, p, size, shape, c, gain, a, rot = 0, p1 = 0, p2 = 0, p3 = 0) => pool.spr(p.x, p.y, p.z, size, shape, c[0] * gain, c[1] * gain, c[2] * gain, a, rot, p1, p2, p3);
  const line = (pool, a, b, w, c, gain, al, p1 = 0, p2 = 0) => pool.line(a.x, a.y, a.z, b.x, b.y, b.z, w, c[0] * gain, c[1] * gain, c[2] * gain, al, p1, p2);
  const randUnit = (out, ...k) => { const z = R(...k, 101) * 2 - 1, a = R(...k, 102) * TAU, r = Math.sqrt(1 - z * z); return out.set(r * Math.cos(a), z, r * Math.sin(a)); };
  /** closed-form motion with linear drag k and gravity gy */
  const drag = (out, p0, v0, k, gy, dt) => {
    const e = Math.exp(-k * dt), a = (1 - e) / k;
    return out.set(p0.x + v0.x * a, p0.y + (gy / k) * dt + (v0.y - gy / k) * a, p0.z + v0.z * a);
  };
  const basis = (n, u, v) => { // u, v ⊥ n
    const ax = Math.abs(n.y) < 0.9 ? tmp3.set(0, 1, 0) : tmp3.set(1, 0, 0);
    u.crossVectors(n, ax).normalize(); v.crossVectors(n, u).normalize();
  };
  const U = new V3(), Vv = new V3();
  const ring3 = (c, n, rad, th, col, gain, a, pow = 1) => { basis(n, U, Vv); U.multiplyScalar(rad); Vv.multiplyScalar(rad); Q.quad(c, U, Vv, 0, col, gain, a, th, pow); };
  const groundQuad = (c, rad, shape, col, gain, a, p1 = 0, p2 = 0) => { U.set(rad, 0, 0); Vv.set(0, 0, rad); Q.quad(c, U, Vv, shape, col, gain, a, p1, p2); };
  // FX size follows the frame: 1 = a medium shot (2.6 bl of view height at the burst); close-ups shrink, wides grow
  const scaleAt = (p) => clamp(cam.distanceTo(p) * viewK / 2.6, 0.3, 1.7) * 0.62;
  let lightBest = { I: 0, p: new V3(), col: VIO };
  const offerLight = (p, I, col = VIO) => { if (I > lightBest.I) lightBest = { I, p: p.clone(), col }; };
  const ghostReq = [];
  const wantGhost = (def, tt, a, k) => { if (a > 0.02) ghostReq.push({ def, tt, a, k }); };

  // ------------------------------------------------------------------------------------------ hit bursts
  const Pt = new V3(), Pt2 = new V3(), Dv = new V3(), Vel = new V3();
  const Pc = new V3();
  function burst(kind, P0, D, tau, sf, c1, c2, sd, inside, treal = tau) {
    const k = KIND[kind], s = k.s * sf, big = kind === 'heavy' || kind === 'mega';
    // sit in front of the body surface (the contact is on/inside the victim; depth would eat the spark)
    const P = Pc.copy(P0).add(tmp3.subVectors(cam, P0).setLength(Math.min(0.3, cam.distanceTo(P0) * 0.25)));
    // local flash (first frames, real time: a light event does not freeze)
    const lf = 0.03 + k.life * 0.2;
    if (treal < lf) {
      const u = treal / lf, a = (1 - u) * (1 - u);
      const day = inside ? 1 : 0.6;
      spr(B, P, k.flash * sf * 0.75 * (1 + 0.25 * u), 0, WHT, 1.1 * day, a, 0, 0.35, 2.6);
      spr(B, P, k.flash * sf * 1.2, 0, c1, 0.8 * day, a * 0.4, 0, 0, 3);
    }
    // anime star: coloured outer + white-hot inner, spikes thin out
    if (tau < k.life) {
      const u = tau / k.life, grow = 1 + 0.4 * u, rot = R(sd, 1) * TAU, hw = 0.15 * Math.pow(1 - u, 0.8);
      const hot = kind === 'mega' ? 0.7 : 1;
      spr(B, P, s * 1.25 * grow, 1, c1, 1.35 * hot, 1, rot, k.n, sd, hw * 0.8);
      spr(B, P, s * (kind === 'mega' ? 0.45 : 0.62) * grow, 1, WHT, 1.3 * hot, 1, rot + Math.PI / k.n, k.n, sd + 3, hw * 1.2);
    }
    if (big) {
      const l2 = k.life * 1.15, tt = tau - FR;
      if (tt >= 0 && tt < l2) { const u = tt / l2; spr(B, P, s * 1.45 * (1 + 0.3 * u), 1, c2, 1.5, 1 - u * u, R(sd, 2) * TAU, 14, sd + 5, 0.035 * (1 - u)); }
    }
    // billboard ring
    const lr = 0.1 + k.s * 0.12;
    if (tau < lr && !big) { const u = tau / lr; spr(B, P, s * (0.35 + 1.25 * (1 - Math.pow(1 - u, 3))), 3, WHT, 1.5, 1 - u, 0, 0.22 * (1 - u) + 0.04, 1); }
    // pixel sparks (squares + short motion streaks)
    for (let j = 0; j < k.sparks; j++) {
      const life = 0.15 + R(sd, j, 2) * 0.22 * (1 + k.s);
      if (tau > life) continue;
      randUnit(Dv, sd, j, 4).multiplyScalar(0.95).addScaledVector(D, 1.15).normalize();
      const sp = (3 + R(sd, j, 3) * 6.5) * Math.sqrt(k.s / 0.42) * sf;
      Vel.copy(Dv).multiplyScalar(sp);
      const g = inside ? -0.5 : -7, kd = 6.5;
      drag(Pt, P, Vel, kd, g, tau);
      const u = tau / life, size = (0.02 + R(sd, j, 5) * 0.028) * sf * (big ? 1.35 : 1) * (1 - u * 0.55);
      const col = j % 3 === 0 ? WHT : j % 3 === 1 ? c1 : c2, a = 1 - u * u;
      if (j % 2 === 0) spr(B, Pt, size, 2, col, 1.9, a);
      else { drag(Pt2, P, Vel, kd, g, Math.max(0, tau - 0.03)); line(B, Pt2, Pt, size * 0.55, col, 1.8, a, 1, 0.6); }
    }
    // 3D shock rings across the push direction
    for (let rj = 0; rj < k.ring3; rj++) {
      const tt = tau - rj * 0.035, life = 0.16 + 0.05 * rj + k.s * 0.06;
      if (tt < 0 || tt > life) continue;
      const u = tt / life, rad = k.rad * (0.8 + 0.5 * rj) * sf * (1 - Math.pow(1 - u, 3));
      Pt.copy(P).addScaledVector(D, (0.06 + rj * 0.1 + u * 0.25) * sf);
      ring3(Pt, D, rad, 0.1 * (1 - u) + 0.03, rj ? c2 : WHT, rj ? 1.4 : 1.2, Math.pow(1 - u, 2), 1.5);
    }
    // impact speed lines bursting outward
    for (let j = 0; j < k.lines; j++) {
      const life = 0.09 + R(sd, j, 20) * 0.09;
      if (tau > life) continue;
      const u = tau / life;
      randUnit(Dv, sd, j, 21); Dv.addScaledVector(D, -Dv.dot(D) * 0.7).addScaledVector(D, 0.25).normalize();
      const r0 = (0.12 + u * 1.3 * (0.6 + R(sd, j, 22))) * s * 2.2, len = (0.4 + R(sd, j, 23) * 0.7) * s * 2.2 * (1 - u * 0.7);
      Pt.copy(P).addScaledVector(Dv, r0); Pt2.copy(P).addScaledVector(Dv, r0 + len);
      line(B, Pt, Pt2, (0.006 + 0.01 * k.s) * sf, WHT, 1.7, 1 - u, 0, 0.9);
    }
    // toon smoke puffs
    for (let j = 0; j < k.smoke; j++) {
      const life = (0.45 + R(sd, j, 30) * 0.4) * (1 + k.s * 0.4);
      if (tau > life) continue;
      const u = tau / life;
      randUnit(Dv, sd, j, 31); Dv.addScaledVector(D, -Dv.dot(D)).normalize().multiplyScalar(1.2 + R(sd, j, 32) * 1.4).addScaledVector(D, -0.4).multiplyScalar(sf * (1 + k.s));
      drag(Pt, P, Dv, 4.5, inside ? 0 : 0.8, tau);
      Pt.addScaledVector(Dv, 0.12 / (1 + k.s));
      const sc = (0.05 + R(sd, j, 33) * 0.06) * k.s * 2 * sf * (u < 0.12 ? sm(u / 0.12) : 1 - sm((u - 0.12) / 0.88)) * (1 + 0.6 * u);
      SM.put(Pt, null, sc * (inside ? 0.8 : 1), inside ? [0.06, 0.035, 0.12] : [0.92, 0.88, 0.84]);
    }
    // shards: bright energy diamonds + a few dark ones for contrast
    for (let j = 0; j < k.shards; j++) {
      const life = 0.35 + R(sd, j, 40) * 0.35;
      if (tau > life) continue;
      const u = tau / life;
      randUnit(Dv, sd, j, 41).multiplyScalar(1.2).addScaledVector(D, 1).normalize();
      Vel.copy(Dv).multiplyScalar((2.5 + R(sd, j, 42) * 5) * sf);
      drag(Pt, P, Vel, 3.5, inside ? -0.5 : -9.8, tau);
      const rot = R(sd, j, 43) * TAU + tau * (8 + R(sd, j, 44) * 14) * (R(sd, j, 45) < 0.5 ? -1 : 1);
      const size = (0.035 + R(sd, j, 46) * 0.05) * sf * (1 - u * u);
      if (j % 4 === 0) spr(BN, Pt, size * 1.2, 6, inside ? [0.05, 0.02, 0.1] : [0.1, 0.08, 0.07], 1, 1, rot, 2.2);
      else spr(B, Pt, size, 6, j % 2 ? c1 : WHT, 2, 1 - u * u, rot, 2.4);
    }
  }
  // smear: ribbon along the striking limb's path just before contact
  const smearPts = Array.from({ length: 10 }, () => new V3());
  function smear(h, c, tau, k, c1) {
    if (!c.id || !c.limb || !defs[c.id] || tau > 0.07) return;
    const t0 = h.t - 0.11;
    const head = tau > 0 ? h.t : h.t + tau;          // tau < 0 → real time before contact
    const tail = tau > 0 ? lerp(Math.max(t0, h.t - 0.09), h.t, tau / 0.07) : Math.max(t0, head - 0.09);
    if (head - tail < 0.008) return;
    let len = 0;
    for (let j = 0; j < 10; j++) {
      bonePoint(THREE, posed(defs[c.id], lerp(tail, head, j / 9)), c.limb, smearPts[j]);
      if (j) len += smearPts[j].distanceTo(smearPts[j - 1]);
    }
    if (len < 0.25) return;
    const fade = tau > 0 ? 1 - tau / 0.07 : 1;
    const w = (0.05 + 0.12 * k.s);
    RB.ribbon(smearPts, cam, s => w * Math.pow(s, 0.7), s => { const cc = mixc(c1, WHT, s * s); return [cc[0] * 2.2, cc[1] * 2.2, cc[2] * 2.2, fade * s * 0.9]; });
  }
  function hitFX(i, t, f) {
    const h = HITS[i], tau = since(t, h.t);
    const cs = contacts(i), k = KIND[h.kind];
    const c1 = PAL[i % 3], c2 = PAL[(i + 1) % 3], sd = i * 37 + 5;
    const inside = spaceAt(h.t) === 'inside';
    for (const c of cs) smear(h, c, tau, k, c1);
    if (tau < 0) return;
    if (h.kind === 'mega') {
      // every striker lands: a heavy burst each (staggered sizes), then one huge one at the victim
      const tr = t - h.t;
      for (let ci = 0; ci < cs.length; ci++) if (!cs[ci].fallback || cs.length === 1) burst(cs.length > 1 ? 'medium' : 'mega', cs[ci].P, cs[ci].D, tau, scaleAt(cs[ci].P) * (cs.length > 1 ? 0.55 : 1), PAL[(i + ci) % 3], PAL[(i + ci + 1) % 3], sd + ci * 101, inside, tr);
      if (cs.length > 1) {
        // the frozen tableau keeps the small strikes; the big burst goes off when time resumes
        const Vc = boneAt(defs.victim, h.t, 'chest'), t2 = t - (h.t + h.stop);
        if (t2 >= 0) burst('mega', Vc, tmp2.set(0, 1, 0), t2, scaleAt(Vc), VIO, MAG, sd + 999, inside, t2);
        offerLight(Vc, k.light * Math.exp(-tau * 10), VIO);
      } else offerLight(cs[0].P, k.light * Math.exp(-tau * 10), c1);
    } else {
      for (let ci = 0; ci < cs.length; ci++) burst(h.kind, cs[ci].P, cs[ci].D, tau, scaleAt(cs[ci].P), c1, c2, sd + ci * 101, inside, t - h.t);
      offerLight(cs[0].P, k.light * Math.exp(-tau * 16), c1);
    }
  }

  // ------------------------------------------------------------------------------------------ sections
  function charge(t, f) {
    if (t < 0.38 || t > 2.15) return;
    const I = t < 1.6 ? Math.pow(sm((t - 0.4) / 1.2), 1.2) : 1 - sm((t - 1.6) / 0.5);
    const bt = (t - 0.4) % 0.4, beat = t < 1.62 && t > 0.4 ? Math.exp(-bt * 12) : 0;
    const root = f.pose('user').pos, pel = f.bone('user', 'pelvis');
    // rising pixel motes
    for (let i = 0; i < 64; i++) {
      const per = 0.7 + R(i, 1) * 0.6, ph = R(i, 2) * per;
      const cyc = Math.floor((t + ph) / per), age = t + ph - cyc * per, t0 = t - age;
      if (t0 < 0.4 || t0 > 1.72) continue;
      const u = age / per, Ia = t0 < 1.6 ? sm((t0 - 0.3) / 1.2) : 1;
      const ang = R(i, cyc, 3) * TAU + age * (1.2 + R(i, 4) * 1.5) * (i % 2 ? 1 : -1);
      const rad = (0.28 + R(i, cyc, 5) * 0.5) * (1 - u * 0.4);
      Pt.set(root[0] + Math.cos(ang) * rad, root[1] + R(i, cyc, 6) * 0.5 + (0.9 + R(i, cyc, 7) * 1.3) * (0.6 + Ia) * age, root[2] + Math.sin(ang) * rad);
      const a = Math.sin(Math.PI * u) * (0.35 + 0.65 * Ia);
      spr(B, Pt, 0.018 + R(i, 8) * 0.024, 2, PAL[i % 3], 3 + 2 * Ia, a * (1 - 0.4 * (t > 1.6 ? sm((t - 1.6) / 0.5) : 0)));
    }
    // violet energy licking up the body
    const anchors = ['chest', 'pelvis', 'back', 'head', 'fistR', 'fistL', 'elbowR', 'elbowL', 'kneeR', 'kneeL', 'hipR', 'hipL'];
    for (let j = 0; j < 26; j++) {
      const per = 0.2 + R(j, 9) * 0.17, ph = R(j, 10) * per;
      const cyc = Math.floor((t + ph) / per), age = t + ph - cyc * per, u = age / per;
      const P0 = f.bone('user', anchors[j % anchors.length]);
      randUnit(Dv, j, cyc, 11); Dv.y *= 0.3;
      const len = (0.16 + R(j, cyc, 12) * 0.3) * Math.sin(Math.PI * u) * (0.3 + I) * (1 + beat * 0.4);
      Pt.copy(P0).addScaledVector(Dv, 0.1 + 0.05 * u); Pt.y += 0.15 * u * (0.5 + I);
      Pt2.copy(Pt); Pt2.y += len; Pt2.x += Math.sin(u * 5 + j) * 0.06; Pt2.z += Math.cos(u * 4 + j) * 0.06;
      // tip (thin, dim) → base (fat, bright): A = tip, B = base
      line(B, Pt2, Pt, (0.025 + R(j, 13) * 0.03) * (0.6 + I * 0.6), j % 3 ? VIO : MAG, 2.2 + 2 * I, I * 0.9 * Math.sin(Math.PI * u), 1.2, 1);
    }
    // ground glow + aura shell
    if (I > 0.01) {
      Pt.set(root[0], 0.025, root[2]);
      groundQuad(Pt, 0.9 + 0.5 * I + beat * 0.2, 1, VIO, 1.6, I * 0.6, 1.6);
      spr(B, pel, 0.9 + 0.4 * I, 0, VIO, 0.6, I * 0.22, 0, 0, 1.5);
      offerLight(Pt.set(pel.x, pel.y + 0.3, pel.z), 2.5 * I + 2 * beat * I, VIO);
    }
  }
  function dash(t, f) {
    if (t < 2.15 || t > 3.0) return;
    const def = defs.user;
    const p0 = posOf(def, 2.2), p1 = posOf(def, 2.45);
    Dv.set(p1[0] - p0[0], 0, p1[2] - p0[2]); const dist = Dv.length();
    if (dist < 0.3) Dv.set(0, 0, -1); else Dv.multiplyScalar(1 / dist);
    // ground dust kicked back at departure, and a skid where the user plants
    for (const [tk, n, back, sd] of [[2.2, 9, -1, 1], [2.45, 7, 1, 2]]) {
      const tau = t - tk; if (tau < 0 || tau > 1.2) continue;
      const pp = posOf(def, tk);
      for (let j = 0; j < n; j++) {
        const life = 0.55 + R(sd, j, 1) * 0.5; if (tau > life) continue;
        const u = tau / life, side = (R(sd, j, 2) - 0.5) * 2;
        Vel.set(Dv.x * back * (1.5 + R(sd, j, 3) * 2.5) - Dv.z * side * 1.2, 0.5 + R(sd, j, 4) * 1.4, Dv.z * back * (1.5 + R(sd, j, 3) * 2.5) + Dv.x * side * 1.2);
        drag(Pt, tmp.set(pp[0], 0.1, pp[2]), Vel, 4.5, 0.3, tau);
        SM.put(Pt, null, (0.08 + R(sd, j, 5) * 0.08) * sm(u / 0.1) * (1 - sm((u - 0.3) / 0.7)), [0.56, 0.47, 0.36], 0.7);
      }
      for (let j = 0; j < 10; j++) {
        Vel.set(Dv.x * back * (1 + R(sd, j, 6) * 2) + (R(sd, j, 7) - 0.5) * 2, 2 + R(sd, j, 8) * 2.5, Dv.z * back * (1 + R(sd, j, 6) * 2) + (R(sd, j, 9) - 0.5) * 2);
        drag(Pt, tmp.set(pp[0], 0.05, pp[2]), Vel, 1, -14, tau);
        if (Pt.y < 0) continue;
        spr(BN, Pt, 0.025 + R(sd, j, 10) * 0.02, 2, j % 3 ? [0.32, 0.22, 0.14] : [0.3, 0.45, 0.16], 1, 1);
      }
    }
    // speed streaks travelling with the user
    if (t > 2.2 && t < 2.5) {
      const a = posOf(def, t), b = posOf(def, t - 0.02);
      const sp = Math.hypot(a[0] - b[0], a[2] - b[2]) / 0.02;
      if (sp > 2) {
        const amt = clamp(sp / 10);
        for (let j = 0; j < 16; j++) {
          if (R(j, Math.floor(t * 40), 3) < 0.35) continue;
          const ang = R(j, 1) * TAU, rr = 0.3 + R(j, 2) * 0.45, hh = 0.1 + R(j, 3) * 1.7;
          Pt.set(a[0] + Math.cos(ang) * rr - Dv.x * 0.2, hh, a[2] + Math.sin(ang) * rr - Dv.z * 0.2);
          Pt2.copy(Pt).addScaledVector(Dv, -(0.5 + R(j, 4) * 0.9) * amt);
          line(B, Pt2, Pt, 0.008 + R(j, 5) * 0.008, j % 2 ? WHT : CYA, 2, 0.7 * amt, 1, 0.5);
        }
      }
    }
  }
  // fast-motion afterimages of the user (dash, launch, any quick reposition while visible)
  function motionGhosts(t, f) {
    const def = defs.user;
    if (!visOf(def, t)) return;
    const a = posOf(def, t), b = posOf(def, t - 0.03);
    const sp = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 0.03;
    const dashW = t > 2.18 && t < 2.62 ? 1 - sm((t - 2.47) / 0.15) : 0;
    const amt = Math.max(dashW, clamp((sp - 4) / 6));
    if (amt <= 0) return;
    for (let k = 1; k <= 5; k++) {
      const tt = t - k * 0.032;
      if (!visOf(def, tt)) continue;
      const q = posOf(def, tt);
      if (Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]) < 0.12) continue;
      wantGhost(def, tt, 0.55 * amt * (1 - k / 6), k);
    }
  }
  function blinkFX(t, f) {
    for (const b of blinks) {
      if (t < b.tOff - 0.02 || t > b.tOn + 0.4) continue;
      const sd = b.seed, inside = spaceAt(b.tOn) === 'inside';
      // departure: flash + pixel burst + the afterimage left behind
      if (b.kind === 'blink') {
        const tau = t - b.tOff;
        if (tau >= 0 && tau < 0.3) {
          const u1 = tau / 0.09;
          if (u1 < 1) { const bs = Math.min(1, scaleAt(b.A)); spr(B, b.A, 0.55 * bs * (1 + u1 * 0.4), 0, WHT, 1.4, (1 - u1) ** 2, 0, 0.5, 2.4); spr(B, b.A, 0.5 * bs, 7, CYA, 2, (1 - u1), R(sd, 1), 18); }
          for (let j = 0; j < 12; j++) {
            const life = 0.18 + R(sd, j, 2) * 0.12; if (tau > life) continue;
            randUnit(Vel, sd, j, 3).multiplyScalar(2.5 + R(sd, j, 4) * 3);
            drag(Pt, b.A, Vel, 7, 0, tau);
            spr(B, Pt, 0.02 + R(sd, j, 5) * 0.02, 2, j % 2 ? CYA : VIO, 3.5, 1 - tau / life);
          }
          wantGhost(defs.user, b.tOff - 1 / 240, 0.65 * (1 - tau / 0.2), 1);
        }
      }
      // light streak along the jump path: the head runs A→B during the gap, the tail catches up after
      if (b.A) {
        const gap = Math.max(b.tOn - b.tOff, 1 / 60);
        const tStart = b.face ? b.tOn - 0.06 : b.tOff;
        const hu = clamp((t - tStart) / Math.max(gap, 0.04)), tu = clamp((t - b.tOn) / 0.12);
        if (t >= tStart && tu < 1) {
          Pt.lerpVectors(b.A, b.B, tu); Pt2.lerpVectors(b.A, b.B, hu);
          if (Pt.distanceTo(Pt2) > 0.02) {
            line(B, Pt, Pt2, 0.035, WHT, 3, 1 - tu * 0.6, 0.6, 0.8);
            line(B, Pt, Pt2, 0.11, b.face ? MAG : VIO, 1.6, (1 - tu) * 0.7, 0.8, 0.8);
          }
        }
        if (b.face) { // the cube face the user streaks out of
          const tau = t - (b.tOn - 0.08);
          if (tau >= 0 && tau < 0.38) {
            const u = tau / 0.38;
            Dv.subVectors(b.B, b.A).normalize(); basis(Dv, U, Vv);
            const sz = 0.55 + 0.35 * sm(u * 3);
            U.multiplyScalar(sz); Vv.multiplyScalar(sz);
            Q.quad(b.A, U, Vv, 2, MAG, 2.6, (1 - u) ** 1.5, 0.12, 0.35 * (1 - u));
            U.multiplyScalar(0.7); Vv.multiplyScalar(0.7);
            Q.quad(b.A, Vv, U, 2, CYA, 2.2, (1 - u) ** 2, 0.18, 0);
            spr(B, b.A, 1.0 * (1 - u * 0.5), 0, VIO, 1.6, (1 - u) ** 2, 0, 0.6, 2);
          }
        }
      }
      // arrival: flash + converging pixels + ring
      const ta = t - b.tOn;
      if (ta > -0.07 && ta < 0) {
        const u = 1 + ta / 0.07;
        for (let j = 0; j < 10; j++) { randUnit(Dv, sd, j, 9); Pt.copy(b.B).addScaledVector(Dv, 0.7 * (1 - u * u)); spr(B, Pt, 0.022, 2, j % 2 ? WHT : MAG, 3, u); }
      }
      if (ta >= 0 && ta < 0.16) {
        const u = ta / 0.16, bs = Math.min(1, scaleAt(b.B));
        spr(B, b.B, (b.face ? 0.8 : 0.6) * bs * (1 - u * 0.3), 0, WHT, 1.4, (1 - u) ** 2.5, 0, 0.5, 2.4);
        spr(B, b.B, (0.5 + u * 0.5) * bs, 3, b.face ? MAG : CYA, 1.8, 1 - u, 0, 0.16, 1);
        offerLight(b.B, 6 * (1 - u), CYA);
      }
    }
  }
  function cloneFX(t, f) {
    for (const c of clones) {
      const pose = f.pose(c.id) || { vis: 0, ghost: 1 };
      const flick = 1 - 0.18 * R(c.i, Math.floor(t * 30), 4);
      c.mat.uniforms.uOp.value = 0.42 * (pose.ghost ?? 1) * flick; c.mat.uniforms.uTime.value = t + c.i * 0.37;
      c.dup.uniforms.uOp.value = 0.14 * (pose.ghost ?? 1) * flick; c.dup.uniforms.uTime.value = t * 1.3 + c.i;
      const jt = Math.floor(t * 20 + c.i * 3.3);
      const ox = (R(c.i, jt, 1) - 0.5) * 0.06 + Math.sin(t * 9 + c.i) * 0.02, oy = (R(c.i, jt, 2) - 0.5) * 0.02;
      for (const d of c.dups) d.position.set(ox, oy, 0);
      // spawn split: flash at the clone + a streak from the user
      const ts = t - c.spawn;
      if (ts >= -0.02 && ts < 0.3) {
        const sd = 300 + c.i * 17;
        if (ts >= 0) {
          const u = ts / 0.3;
          if (ts < 0.1) spr(B, c.spawnAt, 0.45 * (1 + ts * 3), 0, WHT, 1.4, (1 - ts / 0.1) ** 2, 0, 0.4, 2.4);
          if (ts < 0.2) spr(B, c.spawnAt, 0.18 + ts * 1.6, 3, c.i % 2 ? CYA : MAG, 1.6, 1 - ts / 0.2, 0, 0.18, 1);
          for (let j = 0; j < 10; j++) {
            const life = 0.2 + R(sd, j, 1) * 0.12; if (ts > life) continue;
            randUnit(Vel, sd, j, 2).multiplyScalar(2 + R(sd, j, 3) * 2.5); drag(Pt, c.spawnAt, Vel, 6, 0, ts);
            spr(B, Pt, 0.02 + R(sd, j, 4) * 0.02, 2, j % 2 ? CYA : VIO, 3.2, 1 - ts / life);
          }
        }
        const lu = clamp((ts + 0.02) / 0.06), tu = clamp((ts - 0.04) / 0.12);
        if (tu < 1 && c.spawnFrom.distanceTo(c.spawnAt) > 0.2) {
          Pt.lerpVectors(c.spawnFrom, c.spawnAt, tu); Pt2.lerpVectors(c.spawnFrom, c.spawnAt, lu);
          line(B, Pt, Pt2, 0.02, WHT, 1.8, 1 - tu, 0.5, 0.6);
          line(B, Pt, Pt2, 0.06, c.i % 2 ? CYA : VIO, 1.2, (1 - tu) * 0.5, 0.5, 0.6);
        }
      }
      // fist charge 8.0–8.4 (staggered)
      fistOrb(t, f, c.id, c.limb, 8.0 + c.i * 0.031 + R(c.i, 7) * 0.05, c.i + 1, c.i % 2 ? CYA : MAG, pose.vis > 0.5);
      // shatter into light shards
      const tv = t - c.vanish;
      if (tv >= -1 / 60 && tv < 0.9) {
        const sd = 500 + c.i * 23;
        if (tv >= 0 && tv < 0.1) { const u = tv / 0.1; spr(B, c.shardC, 0.4 * (1 + u), 0, c.i % 2 ? CYA : VIO, 1.2, (1 - u) ** 2, 0, 0.3, 2.4); }
        if (tv >= 0) for (let j = 0; j < c.shardPts.length * 3; j++) {
          const life = 0.45 + R(sd, j, 1) * 0.45; if (tv > life) continue;
          const P0 = c.shardPts[j % c.shardPts.length];
          Dv.subVectors(P0, c.shardC); Dv.y *= 0.6;
          randUnit(Vel, sd, j, 2).multiplyScalar(0.8).add(Dv.multiplyScalar(2.2)).multiplyScalar(1.2 + R(sd, j, 3) * 2.2);
          drag(Pt, P0, Vel, 2.6, 0.4, tv);
          const u = tv / life, rot = R(sd, j, 4) * TAU + tv * 9 * (j % 2 ? 1 : -1);
          if (j % 3 === 0) spr(B, Pt, (0.045 + R(sd, j, 5) * 0.045) * (1 - u), 6, c.i % 2 ? CYA : VIO, 2, 1 - u * u, rot, 2.6);
          else spr(B, Pt, (0.02 + R(sd, j, 6) * 0.022) * (1 - u * 0.5), 2, j % 3 === 1 ? WHT : c.i % 2 ? CYA : MAG, 2.2, 1 - u);
        }
      }
    }
  }
  function fistOrb(t, f, id, limb, t0, sd, col, visible) {
    if (!visible || t < t0 || t > 8.405) return;
    const g = sm((t - t0) / 0.27), hold = t > 8.3 ? 1 : 0;
    const P = f.bone(id, limb);
    const tremble = hold ? 1 + (R(sd, Math.floor(t * 60), 1) - 0.5) * 0.25 : 1 + 0.12 * Math.sin(t * 40 + sd);
    const r = (0.06 + 0.16 * g) * tremble;
    spr(B, P, r * 2.6, 0, col, 1.6, 0.55 * g, 0, 0, 2);
    spr(B, P, r, 0, WHT, 3, g, 0, 1.5, 1.2);
    spr(B, P, r * 1.6, 3, col, 2.5, 0.7 * g, 0, 0.18, 1);
    // motes sucked in
    for (let j = 0; j < 8; j++) {
      const per = 0.16 + R(sd, j, 2) * 0.08, ph = R(sd, j, 3) * per, cyc = Math.floor((t + ph) / per), u = (t + ph - cyc * per) / per;
      randUnit(Dv, sd, j, cyc, 4);
      Pt.copy(P).addScaledVector(Dv, r + 0.55 * (1 - u) * (1 - u));
      Pt2.copy(P).addScaledVector(Dv, r + 0.55 * (1 - u) * (1 - u) + 0.12);
      line(B, Pt2, Pt, 0.012, j % 2 ? WHT : col, 2.5, g * Math.sin(Math.PI * u), 1, 0.6);
    }
    offerLight(P, 3 * g, col);
  }
  function megaAfter(t, f) {
    // giant sphere shockwave: holds during the 8.40 freeze, bursts at 8.60
    const tau = since(t, 8.4);
    sph.visible = false;
    if (tau >= 0 && tau < 1.1 && spaceAt(t) === 'inside') {
      const C = boneAt(defs.victim, 8.4, 'chest');
      const rad = 0.35 + 11 * (1 - Math.exp(-tau * 3.4)), u = tau / 1.1;
      sph.position.copy(C); sph.scale.setScalar(rad); sph.visible = true;
      sphMat.uniforms.uCol.value.set(...mixc(VIO, CYA, u).map(v => v * 1.5 + 0.12));
      sphMat.uniforms.uA.value = Math.pow(1 - u, 2);
      // second, equatorial ring wave
      ring3(C, tmp.set(0.15, 1, 0.1).normalize(), rad * 1.15, 0.05, MAG, 1.8, (1 - u) ** 2, 1.5);
      if (tau > 0.02) ring3(C, tmp.set(0.9, 0.2, -0.3).normalize(), rad * 0.9, 0.04, CYA, 1.8, (1 - u) ** 2, 1.5);
    }
    // lingering energy crackling around the victim 8.6–9.4
    if (t > 8.58 && t < 9.45 && spaceAt(t) === 'inside') {
      const C = f.bone('victim', 'chest'), fade = (1 - sm((t - 8.62) / 0.8)) * sm((t - 8.58) / 0.04);
      for (let j = 0; j < 5; j++) {
        const fr = Math.floor(t * 30 / 2), pts = [];
        randUnit(Dv, 77, j, fr); basis(Dv, U, Vv);
        const a0 = R(77, j, fr, 2) * TAU, span = 1.6 + R(77, j, fr, 3) * 1.8, rr = 0.45 + R(77, j, 4) * 0.35;
        for (let q = 0; q < 9; q++) {
          const a = a0 + span * q / 8, jit = (R(77, j, fr, q) - 0.5) * 0.12;
          pts.push(new V3().copy(C).addScaledVector(U, Math.cos(a) * (rr + jit)).addScaledVector(Vv, Math.sin(a) * (rr + jit)));
        }
        RB.ribbon(pts, cam, s => 0.018 * Math.sin(Math.PI * s) + 0.004, s => { const c = j % 2 ? CYA : MAG; return [c[0] * 3, c[1] * 3, c[2] * 3, fade]; });
      }
      for (let j = 0; j < 14; j++) {
        const per = 0.5 + R(88, j) * 0.4, ph = R(88, j, 1) * per, cyc = Math.floor((t + ph) / per), u = (t + ph - cyc * per) / per;
        randUnit(Dv, 88, j, cyc); Pt.copy(C).addScaledVector(Dv, 0.3 + u * 0.9);
        spr(B, Pt, 0.02, 2, PAL[j % 3], 3, fade * Math.sin(Math.PI * u));
      }
    }
  }
  function gather(t, f) {
    if (t < 9.18 || t >= 9.65) return;
    const L = f.bone('user', 'fistL'), Rr = f.bone('user', 'fistR');
    const C = tmp.addVectors(L, Rr).multiplyScalar(0.5); C.y += 0.06;
    const g = sm((t - 9.2) / 0.4), pul = 1 + 0.08 * Math.sin(t * 50), os = Math.min(1, scaleAt(C) / 0.62);
    const r = (0.06 + 0.2 * g) * pul * os;
    spr(B, C, r * 2.6, 0, VIO, 1.1, 0.5 * g, 0, 0, 2.2);
    spr(B, C, r * 1.5, 0, MAG, 1.3, 0.5 * g, 0, 0.3, 1.8);
    spr(B, C, r, 0, WHT, 1.8, g, 0, 0.8, 1);
    spr(B, C, r * 2.6, 7, WHT, 1.6, 0.7 * g, t * 3, 30);
    spr(B, C, r * 1.35, 3, CYA, 1.8, 0.8 * g, 0, 0.12, 1);
    for (let j = 0; j < 30; j++) {
      const per = 0.17 + R(99, j) * 0.14, ph = R(99, j, 1) * per, cyc = Math.floor((t + ph) / per), u = (t + ph - cyc * per) / per;
      if (t - u * per < 9.17) continue;
      randUnit(Dv, 99, j, cyc);
      const r0 = (1.0 + R(99, j, cyc, 2) * 1.3) * os, rr = r + r0 * (1 - u) * (1 - u), len = (0.2 + 0.35 * R(99, j, 3)) * (1 - u * 0.6) * os;
      Pt.copy(C).addScaledVector(Dv, rr); Pt2.copy(C).addScaledVector(Dv, rr + len);
      line(B, Pt2, Pt, 0.012 + 0.01 * R(99, j, 4), PAL[j % 3], 3, Math.sin(Math.PI * u) * (0.3 + 0.7 * g), 1.2, 0.7);
    }
    // crackling arcs between the fists and the orb
    for (let j = 0; j < 3; j++) {
      const fr = Math.floor(t * 30), src = j === 0 ? L : j === 1 ? Rr : C, pts = [];
      randUnit(Dv, 66, j, fr);
      const end = tmp2.copy(C).addScaledVector(Dv, r * 2.5 + 0.2);
      for (let q = 0; q < 7; q++) { const p = new V3().lerpVectors(src, end, q / 6); randUnit(Pt, 66, j, fr, q); p.addScaledVector(Pt, 0.07 * Math.sin(Math.PI * q / 6)); pts.push(p); }
      RB.ribbon(pts, cam, () => 0.012, () => [CYA[0] * 3 + 0.5, CYA[1] * 3 + 0.5, CYA[2] * 3 + 0.5, g * 0.9]);
    }
    offerLight(C, 4 + 10 * g, VIO);
  }
  const trailPts = Array.from({ length: 22 }, () => new V3());
  function launchTrail(t, f) {
    if (t < 8.8 || t > 9.38 || spaceAt(t) !== 'inside') return;
    const fade = 1 - sm((t - 9.18) / 0.2), n = 18;
    const pts = trailPts.slice(0, n);
    // the trail runs from the pelvis' past positions and stops short of the body (the head lags 2 samples behind)
    for (let k = 0; k < n; k++) bonePoint(THREE, posed(defs.victim, Math.max(8.79, t - (n + 1 - k) * 0.013)), 'pelvis', pts[k]);
    if (pts[0].distanceTo(pts[n - 1]) < 0.15) return;
    const tw = s => Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.15)), 0.7);
    RB.ribbon(pts, cam, s => 0.13 * tw(s), s => { const c = mixc(VIO, WHT, s * s); return [c[0] * 1.8, c[1] * 1.8, c[2] * 1.8, fade * s]; });
    RB.ribbon(pts, cam, s => 0.32 * tw(s), s => [MAG[0] * 0.9, MAG[1] * 0.9, MAG[2] * 0.9, fade * s * 0.4]);
    const C = f.bone('victim', 'chest');
    Dv.subVectors(pts[n - 1], pts[n - 4]).normalize();
    for (let j = 0; j < 12; j++) {
      if (R(j, Math.floor(t * 40), 5) < 0.3) continue;
      randUnit(Pt, 55, j); Pt.addScaledVector(Dv, -Pt.dot(Dv)).normalize().multiplyScalar(0.2 + R(55, j, 1) * 0.4).add(C);
      Pt2.copy(Pt).addScaledVector(Dv, -(0.6 + R(55, j, 2) * 0.9));
      line(B, Pt2, Pt, 0.01, j % 2 ? WHT : CYA, 2.5, fade * 0.8, 1, 0.5);
    }
  }
  function meteor(t, f) {
    if (t < 9.65 || t > 10.15) return;
    const tEnd = 9.85, n = 22;
    const head = Math.min(t, tEnd), tail = Math.max(9.65, t - 0.2), fade = t > tEnd ? 1 - sm((t - tEnd) / 0.28) : 1;
    if (head - tail > 0.004) {
      const pts = trailPts.slice(0, n);
      for (let k = 0; k < n; k++) meteorAt(lerp(tail, head, k / (n - 1)), pts[k]);
      if (pts[0].distanceTo(pts[n - 1]) > 0.1) {
        RB.ribbon(pts, cam, s => 0.42 * Math.pow(s, 0.6), s => { const c = mixc(VIO, WHT, s * s * s); return [c[0] * 3, c[1] * 3, c[2] * 3, fade * Math.pow(s, 0.7)]; });
        RB.ribbon(pts, cam, s => 1.0 * Math.pow(s, 0.5), s => { const c = mixc(MAG, VIO, 1 - s); return [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6, fade * s * 0.5]; });
      }
    }
    if (t <= tEnd + 0.02) {
      const C = meteorAt(t, new V3());
      const vel = meteorAt(Math.max(9.651, t - 0.02), tmp2).sub(C);
      const vl = vel.length(); if (vl > 1e-4) vel.multiplyScalar(1 / vl); else vel.set(0, 1, 0);
      spr(B, C, 1.0, 0, WHT, 2.2, 0.9, 0, 1, 1.8);
      spr(B, C, 2.2, 0, MAG, 1.4, 0.55, 0, 0, 2.4);
      // heat streaks peeling off the comet head
      for (let j = 0; j < 18; j++) {
        if (R(j, Math.floor(t * 60), 6) < 0.3) continue;
        randUnit(Pt, 44, j); Pt.addScaledVector(vel, -Pt.dot(vel)).normalize().multiplyScalar(0.25 + R(44, j, 1) * 0.6).add(C);
        Pt2.copy(Pt).addScaledVector(vel, 0.6 + R(44, j, 2) * 1.4);
        line(B, Pt2, Pt, 0.012 + R(44, j, 3) * 0.012, j % 3 ? WHT : CYA, 2.5, 0.85, 1.2, 0.8);
      }
      offerLight(C, 25, VIO);
    }
    // embers shed along the path
    for (let j = 0; j < 36; j++) {
      const ts = 9.65 + j * 0.2 / 36; if (ts > t) break;
      const tau = t - ts, life = 0.35 + R(45, j) * 0.3; if (tau > life) continue;
      const P0 = meteorAt(ts, tmp3);
      randUnit(Vel, 45, j, 1).multiplyScalar(1.5 + R(45, j, 2) * 2);
      drag(Pt, P0, Vel, 3, 1.5, tau);
      spr(B, Pt, 0.03 * (1 - tau / life * 0.5), 2, j % 3 === 0 ? EMB : j % 3 === 1 ? MAG : WHT, 3, 1 - tau / life);
    }
  }
  const Qa = new THREE.Quaternion(), Qb = new THREE.Quaternion(), Qc = new THREE.Quaternion(), Ax = new V3();
  // a block thrown from p0 with velocity v: flies (spinning), bounces once, settles flat (closed form)
  function debrisBlock(pool, sd, j, p0, v, size, tau, col) {
    const G = 24, hs = size / 2;
    const disc = v.y * v.y + 2 * G * Math.max(0, p0.y - hs);
    const tL = (v.y + Math.sqrt(disc)) / G;
    randUnit(Ax, sd, j, 9); const w = (7 + R(sd, j, 10) * 12) * (R(sd, j, 11) < 0.5 ? -1 : 1);
    const yaw = R(sd, j, 12) * TAU;
    if (tau <= tL) {
      Pt.set(p0.x + v.x * tau, p0.y + v.y * tau - 0.5 * G * tau * tau, p0.z + v.z * tau);
      Qa.setFromAxisAngle(Ax, w * tau);
      pool.put(Pt, Qa, size, col);
      return;
    }
    const vyB = 0.28 * (G * tL - v.y), tB = 2 * vyB / G, tt = tau - tL;
    const lx = p0.x + v.x * tL, lz = p0.z + v.z * tL;
    Qa.setFromAxisAngle(Ax, w * tL); Qb.setFromAxisAngle(Ax.set(0, 1, 0), yaw);
    if (tt < tB) {
      Pt.set(lx + v.x * 0.3 * tt, hs + vyB * tt - 0.5 * G * tt * tt, lz + v.z * 0.3 * tt);
      Qc.copy(Qa).slerp(Qb, sm(tt / tB));
      pool.put(Pt, Qc, size, col);
    } else {
      Pt.set(lx + v.x * 0.3 * tB, hs - 0.002, lz + v.z * 0.3 * tB);
      pool.put(Pt, Qb, size, col);
    }
  }
  function crater(t, f) {
    const tau = t - 9.85;
    scorch.visible = cracks.visible = false;
    if (tau < 0 || spaceAt(t) !== 'world') return;
    const C = craterAt;
    // decals
    scorch.visible = true; scorch.position.set(C.x, 0.012, C.z);
    scorch.material.uniforms.uAmt.value = sm(tau / 0.05);
    scorch.material.uniforms.uGlow.value = 0.25 + 1.6 * Math.exp(-tau * 1.6);
    cracks.visible = true; cracks.position.set(C.x, 0.018, C.z);
    cracks.material.uniforms.uReveal.value = 0.08 + 1.0 * (1 - Math.exp(-tau * 14));
    cracks.material.uniforms.uGlow.value = 0.12 + 1.1 * Math.exp(-tau * 1.3);
    cracks.material.uniforms.uDark.value = 0.85;
    // flash + light pillar
    if (tau < 0.35) {
      const u = tau / 0.35;
      Pt.set(C.x, 0.5, C.z);
      spr(B, Pt, 1.4 * (1 + u), 0, WHT, 1.0, (1 - u) ** 2.5, 0, 0.3, 2.4);
      spr(B, Pt, 2.6, 0, MAG, 0.7, (1 - u) ** 2.5 * 0.4, 0, 0, 2.8);
      Pt2.set(C.x, 9, C.z);
      if (tau < 0.18) { const v = tau / 0.18; line(B, Pt, Pt2, 0.28 * (1 - v), WHT, 1.6, 1 - v, 0, 0); line(B, Pt, Pt2, 0.7 * (1 - v * 0.5), VIO, 1.1, (1 - v) * 0.45, 0, 0); }
      spr(B, Pt, 1.6 + u * 1.5, 7, WHT, 1.6, (1 - u) ** 2.5, 0.2, 40);
    }
    offerLight(Pt.set(C.x, 0.6, C.z), 70 * Math.exp(-tau * 7) + 1.5 * Math.exp(-tau * 0.8), VIO);
    // ground shockwaves
    for (let rj = 0; rj < 2; rj++) {
      const tt = tau - rj * 0.06, life = 0.6 + rj * 0.15; if (tt < 0 || tt > life) continue;
      const u = tt / life, rad = (11 - rj * 3) * (1 - Math.exp(-tt * (5 - rj)));
      Pt.set(C.x, 0.03 + rj * 0.006, C.z);
      groundQuad(Pt, rad, 0, rj === 1 ? VIO : WHT, rj === 1 ? 2.0 : 1.5, (1 - u) ** 1.6, Math.min(0.9, (0.7 * (1 - u) + 0.15) / Math.max(rad, 0.3)), 1);
    }
    // block rim: grass blocks heaved up and tilted outward
    for (let j = 0; j < 26; j++) {
      const inner = j >= 16, nn = inner ? 10 : 16, jj = inner ? j - 16 : j;
      const a = jj / nn * TAU + (R(12, j) - 0.5) * 0.35 + (inner ? 0.3 : 0);
      const rad = inner ? 0.62 + R(12, j, 1) * 0.22 : 1.12 + R(12, j, 1) * 0.42;
      const size = inner ? 0.34 + R(12, j, 2) * 0.14 : 0.42 + R(12, j, 2) * 0.32;
      const tilt = (inner ? 40 + R(12, j, 3) * 18 : 22 + R(12, j, 3) * 26) * Math.PI / 180;
      const e = backOut((tau - R(12, j, 4) * 0.04) / 0.13);
      const yF = inner ? -size * 0.12 : size * (0.08 + R(12, j, 5) * 0.12);
      Pt.set(C.x + Math.cos(a) * rad, lerp(-size * 0.9, yF, e), C.z + Math.sin(a) * rad);
      Ax.set(-Math.sin(a), 0, Math.cos(a));
      Qa.setFromAxisAngle(Ax, -tilt * e); Qb.setFromAxisAngle(tmp2.set(0, 1, 0), a + (R(12, j, 6) - 0.5) * 0.6);
      Qa.multiply(Qb);
      (inner || j % 5 === 2 ? DK : BK).put(Pt, Qa, size, inner ? [0.62, 0.5, 0.45] : [1, 1, 1]);
    }
    // flying debris blocks
    for (let j = 0; j < 46; j++) {
      const size = 0.08 + Math.pow(R(13, j), 2) * 0.22;
      const a = R(13, j, 1) * TAU, vy = 5 + R(13, j, 2) * 7.5;
      const tL = 2 * vy / 24;
      const vh = Math.min(Math.max(1 + R(13, j, 3) * 6.5, 2.1 / tL), 4.2 / tL);
      Vel.set(Math.cos(a) * vh, vy, Math.sin(a) * vh);
      tmp.set(C.x + Math.cos(a) * 0.4, 0.3, C.z + Math.sin(a) * 0.4);
      debrisBlock(j % 3 === 0 ? DK : BK, 13, j, tmp, Vel, size, tau, j % 3 === 0 ? [0.8, 0.8, 0.8] : [1, 1, 1]);
    }
    // block-break pixels
    for (let j = 0; j < 50; j++) {
      const a = R(14, j) * TAU, vh = 1.5 + R(14, j, 1) * 6, vy = 3 + R(14, j, 2) * 8;
      Vel.set(Math.cos(a) * vh, vy, Math.sin(a) * vh);
      drag(Pt, tmp.set(C.x, 0.25, C.z), Vel, 0.8, -16, tau);
      if (Pt.y < 0.01 || tau > 2) continue;
      spr(BN, Pt, 0.03 + R(14, j, 3) * 0.03, 2, j % 3 === 0 ? [0.28, 0.42, 0.14] : j % 3 === 1 ? [0.36, 0.25, 0.16] : [0.24, 0.17, 0.11], 1, 1);
    }
    // toon dust ring + low skirt + rising column
    for (let j = 0; j < 54; j++) {
      const ring = j < 40, col = j >= 46;
      if (ring && j % 4 === 3) continue;
      let life, size0, p;
      if (ring) {
        const a = j / 40 * TAU + R(15, j) * 0.15, v0 = 5 + R(15, j, 1) * 4, kd = 3.4 + R(15, j, 2) * 1.2;
        const rr = 0.9 + v0 * (1 - Math.exp(-kd * tau)) / kd;
        p = Pt.set(C.x + Math.cos(a) * rr, 0.12 + R(15, j, 3) * 0.25 + 0.45 * (1 - Math.exp(-1.2 * tau)) * R(15, j, 4), C.z + Math.sin(a) * rr);
        life = 0.75 + R(15, j, 5) * 0.5; size0 = 0.16 + R(15, j, 6) * 0.2;
      } else if (!col) {
        const a = (j - 40) / 6 * TAU + R(15, j) * 0.5, v0 = 10 + R(15, j, 1) * 3, kd = 6;
        const rr = 0.6 + v0 * (1 - Math.exp(-kd * tau)) / kd;
        p = Pt.set(C.x + Math.cos(a) * rr, 0.08, C.z + Math.sin(a) * rr);
        life = 0.7 + R(15, j, 5) * 0.3; size0 = 0.15 + R(15, j, 6) * 0.12;
      } else {
        const a = R(15, j) * TAU, rr = 0.15 + R(15, j, 1) * 0.5, vy = 2.5 + R(15, j, 2) * 3;
        p = Pt.set(C.x + Math.cos(a) * rr + tau * 0.25, 0.3 + vy * (1 - Math.exp(-1.1 * tau)) / 1.1, C.z + Math.sin(a) * rr + tau * 0.08);
        life = 1.3 + R(15, j, 5) * 0.6; size0 = 0.18 + R(15, j, 6) * 0.2;
      }
      const u = tau / life; if (u > 1) continue;
      const sc = size0 * sm(tau / (col ? 0.18 : 0.07)) * (1 + 0.5 * u) * (1 - sm((u - 0.35) / 0.65));
      const shade = 0.8 + R(15, j, 7) * 0.2;
      SM.put(p, null, sc, col ? [0.3 * shade, 0.28 * shade, 0.29 * shade] : [0.44 * shade, 0.37 * shade, 0.28 * shade], col ? 1 : 0.85);
    }
    // smoke still curling out of the crater
    for (let j = 0; j < 9; j++) {
      const per = 1.8 + R(16, j) * 0.8, ph = R(16, j, 1) * per, cyc = Math.floor((tau + ph) / per), age = tau + ph - cyc * per, st = tau - age;
      if (st < 0.6) continue;
      const u = age / per, a = R(16, j, cyc) * TAU;
      Pt.set(C.x + Math.cos(a) * 0.4 + age * 0.35, 0.2 + age * 0.9, C.z + Math.sin(a) * 0.4 + age * 0.12);
      SM.put(Pt, null, (0.08 + R(16, j, cyc, 2) * 0.08) * Math.sin(Math.PI * u) * (1 + u), [0.34, 0.32, 0.33]);
    }
  }
  function landing(t, f) {
    const tau = t - 10.4;
    lcracks.visible = lscorch.visible = false;
    if (tau < 0 || spaceAt(t) !== 'world') return;
    const C = landAt;
    lcracks.visible = true; lcracks.position.set(C.x, 0.016, C.z);
    lcracks.material.uniforms.uReveal.value = 0.1 + 1.0 * (1 - Math.exp(-tau * 22));
    lcracks.material.uniforms.uGlow.value = 0.9 * Math.exp(-tau * 3);
    lcracks.material.uniforms.uDark.value = 0.75;
    lscorch.visible = true; lscorch.position.set(C.x, 0.011, C.z);
    lscorch.material.uniforms.uAmt.value = 0.55 * sm(tau / 0.05); lscorch.material.uniforms.uGlow.value = 0.6 * Math.exp(-tau * 3);
    if (tau < 0.25) { const u = tau / 0.25; Pt.set(C.x, 0.25, C.z); spr(B, Pt, 1.3 * (1 + u), 0, WHT, 1.6, (1 - u) ** 2 * 0.8, 0, 0.6, 1.8); }
    for (let rj = 0; rj < 2; rj++) {
      const tt = tau - rj * 0.05, life = 0.4; if (tt < 0 || tt > life) continue;
      const u = tt / life; Pt.set(C.x, 0.028 + rj * 0.005, C.z);
      const lr = (3.2 - rj) * (1 - Math.exp(-tt * 7));
      groundQuad(Pt, lr, 0, rj ? VIO : WHT, 1.5, (1 - u) ** 1.6, Math.min(0.9, (0.35 * (1 - u) + 0.08) / Math.max(lr, 0.2)), 1);
    }
    offerLight(Pt.set(C.x, 0.4, C.z), 12 * Math.exp(-tau * 8), VIO);
    for (let j = 0; j < 22; j++) {
      const a = j / 22 * TAU + R(17, j) * 0.25, v0 = 3 + R(17, j, 1) * 2, kd = 4.5;
      const rr = 0.3 + v0 * (1 - Math.exp(-kd * tau)) / kd, life = 0.55 + R(17, j, 2) * 0.35, u = tau / life;
      if (u > 1) continue;
      Pt.set(C.x + Math.cos(a) * rr, 0.06 + R(17, j, 3) * 0.08 + 0.18 * (1 - Math.exp(-2 * tau)) * R(17, j, 4), C.z + Math.sin(a) * rr);
      SM.put(Pt, null, (0.1 + R(17, j, 5) * 0.08) * sm(tau / 0.05) * (1 + 0.6 * u) * (1 - sm((u - 0.3) / 0.7)), [0.44, 0.37, 0.28], 0.8);
    }
    for (let j = 0; j < 10; j++) {
      const size = 0.06 + R(18, j) * 0.08, a = R(18, j, 1) * TAU, vy = 3 + R(18, j, 2) * 3, vh = 1 + R(18, j, 3) * 2.2;
      Vel.set(Math.cos(a) * vh, vy, Math.sin(a) * vh);
      debrisBlock(j % 2 ? DK : BK, 18, j, tmp.set(C.x + Math.cos(a) * 0.35, 0.1, C.z + Math.sin(a) * 0.35), Vel, size, tau, [1, 1, 1]);
    }
  }
  function aftermath(t, f) {
    if (t < 9.95 || spaceAt(t) !== 'world') return;
    const ramp = sm((t - 10.0) / 1.2), C = craterAt, L = landAt;
    // drifting dust (wind blows +x)
    for (let j = 0; j < 44; j++) {
      const per = 2.6 + R(19, j) * 1.6, ph = R(19, j, 1) * per, cyc = Math.floor((t + ph) / per), age = t + ph - cyc * per, u = age / per;
      const base = j % 3 === 0 ? L : C;
      Pt.set(base.x + (R(19, j, cyc, 2) - 0.5) * 7 + age * 0.75, 0.15 + R(19, j, cyc, 3) * 0.9 + age * 0.08, base.z + (R(19, j, cyc, 4) - 0.5) * 6 + age * 0.22);
      const a = Math.sin(Math.PI * u) * (0.12 + R(19, j, 5) * 0.14) * ramp;
      spr(BN, Pt, 0.35 + R(19, j, 6) * 0.5, 5, [0.78, 0.71, 0.6], 1, a, R(19, j, 7) * TAU, R(19, j, 8) * 10);
    }
    // embers rising from the crater and around the user
    for (let j = 0; j < 40; j++) {
      const per = 1.5 + R(20, j) * 1.2, ph = R(20, j, 1) * per, cyc = Math.floor((t + ph) / per), age = t + ph - cyc * per, u = age / per;
      if (t - age < 9.9) continue;
      const base = j % 4 === 0 ? L : C, rr = (j % 4 === 0 ? 0.8 : 1.6) * R(20, j, cyc, 2), a = R(20, j, cyc, 3) * TAU;
      Pt.set(base.x + Math.cos(a) * rr + age * 0.35 + Math.sin(age * 3 + j) * 0.12, 0.05 + age * (0.45 + R(20, j, 4) * 0.5), base.z + Math.sin(a) * rr + age * 0.1);
      const fl = 0.6 + 0.4 * Math.sin(t * 23 + j * 1.7);
      spr(B, Pt, 0.016 + R(20, j, 5) * 0.016, 2, j % 3 === 0 ? MAG : j % 3 === 1 ? EMB : VIO, 3.5, Math.sin(Math.PI * u) * fl * (1 - 0.5 * sm((t - 12.5) / 2)));
    }
  }
  function eyes(t, f) {
    if (t < 13.35 || spaceAt(t) !== 'world') return;
    const pl = actors.user.player; if (!pl.root.visible) return;
    const g = sm((t - 13.4) / 0.35), fl = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    const head = pl.parts.head; head.updateWorldMatrix(true, false);
    for (const sx of [1.5, -1.5]) {
      Pt.set(sx / 16, 3.5 / 16, -4.7 / 16).applyMatrix4(head.matrixWorld);
      spr(B, Pt, 0.065, 0, VIO, 2, 0.42 * g * fl, 0, 0.3, 2);
      spr(B, Pt, 0.02, 0, WHT, 2, 0.6 * g * fl, 0, 0.4, 1.2);
      Pt2.set((sx + Math.sign(sx) * 2.6) / 16, 3.75 / 16, -4.7 / 16).applyMatrix4(head.matrixWorld);
      line(B, Pt2, Pt, 0.006, MAG, 2.2, 0.45 * g * fl, 1.4, 0.8);
    }
  }
  function ghostsApply(t) {
    ghostReq.sort((a, b) => b.a - a.a);
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i], r = ghostReq[i];
      if (!r) { g.pl.root.visible = false; continue; }
      const pose = poseAt(r.def, r.tt);
      applyPose(g.pl, pose);
      g.pl.root.visible = pose.vis > 0.5;
      g.m.uniforms.uOp.value = clamp(r.a);
      g.m.uniforms.uTime.value = t + i;
      const c = r.k % 2 ? CYA : VIO;
      g.m.uniforms.uCol.value.set(c[0] * 0.9, c[1] * 0.9, c[2] * 0.9);
    }
  }

  // ------------------------------------------------------------------------------------------ update
  return {
    update(t, f) {
      t += 2e-4; // frame times like 264/60 can land a hair before an event time
      for (const p of [B, BN, Q, RB, SM, BK, DK]) p.reset();
      // impact frames: only the actors (layer 1) as flat white silhouettes + the star, on black; post does mono/invert/lines
      const imp = f.space === 'inside' ? impactFrame(t) : null;
      f.camera.layers.set(imp ? IMPACT_LAYER : 0);
      scene.overrideMaterial = imp ? whiteMat : null;
      starMesh.visible = !!imp;
      if (imp) {
        scene.background = black;
        const hi = HITS.findIndex(h => Math.abs(h.t - imp.t0) < 1e-6), cs = contacts(hi);
        const C = cs.length > 1 ? boneAt(defs.victim, imp.t0, 'chest') : cs[0].P;
        f.camera.updateMatrixWorld(); cam.setFromMatrixPosition(f.camera.matrixWorld);
        const vh = cam.distanceTo(C) * 2 * Math.tan(f.camera.fov * Math.PI / 360);
        starMesh.position.copy(C); starMesh.quaternion.copy(f.camera.quaternion);
        starMesh.rotateZ(R(imp.t0, 1) * TAU + imp.fi * 0.12);
        starMesh.scale.setScalar((cs.length > 1 ? 0.42 : 0.34) * vh * (1 + imp.fi * 0.1));
      }
      ghostReq.length = 0;
      lightBest = { I: 0, p: new V3(), col: VIO };
      f.camera.updateMatrixWorld(); cam.setFromMatrixPosition(f.camera.matrixWorld);
      viewK = 2 * Math.tan(f.camera.fov * Math.PI / 360);
      const inside = f.space === 'inside';
      smokeMat.emissive.setRGB(inside ? 0.035 : 0.0, inside ? 0.012 : 0.0, inside ? 0.08 : 0.0);

      charge(t, f);
      dash(t, f);
      motionGhosts(t, f);
      for (let i = 0; i < HITS.length; i++) {
        const h = HITS[i];
        if (t < h.t - 0.12 || t > h.t + 2.5) continue;
        if (spaceAt(h.t) !== f.space) continue;
        if (since(t, h.t) > 1.2) continue;
        hitFX(i, t, f);
      }
      blinkFX(t, f);
      if (clones.length) cloneFX(t, f);
      if (t > 7.95 && t < 8.41 && inside) fistOrb(t, f, 'user', userMegaLimb, 8.04, 0, VIO, f.pose('user').vis > 0.5);
      megaAfter(t, f);
      launchTrail(t, f);
      gather(t, f);
      meteor(t, f);
      crater(t, f);
      landing(t, f);
      aftermath(t, f);
      eyes(t, f);
      ghostsApply(t);

      for (const p of [B, BN, Q, RB, SM, BK, DK]) p.flush();
      // light sits a little toward the camera from the source so the faces we see get lit; my units × 0.12
      light.intensity = lightBest.I * 0.05;
      light.position.copy(lightBest.p).add(tmp.subVectors(cam, lightBest.p).setLength(Math.min(0.25, cam.distanceTo(lightBest.p) * 0.2)));
      light.color.setRGB(lightBest.col[0] * 0.6 + 0.4, lightBest.col[1] * 0.6 + 0.4, lightBest.col[2] * 0.6 + 0.4);
    },
  };
}

// ------------------------------------------------------------------------------------------------ post
const shakeNoise = (x, seed) => {
  const i = Math.floor(x), fr = x - i, h = n => { const s = Math.sin((n + seed * 17.31) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const s2 = fr * fr * (3 - 2 * fr); return h(i) * (1 - s2) + h(i + 1) * s2;
};
export function post(t, p, f) {
  if (!S) return p;
  t += 2e-4;
  const { THREE } = S;
  const cam = f.camera;
  cam.updateMatrixWorld();
  const toUv = (v) => {
    const c = v.clone().applyMatrix4(cam.matrixWorldInverse);
    if (c.z > -0.05) return null;
    const q = v.clone().project(cam);
    return [q.x * 0.5 + 0.5, q.y * 0.5 + 0.5];
  };
  let radial = 0, rc = null, chroma = 0, flash = 0, bloom = 0;
  const rips = [];
  const kick = (r, uv) => { if (r > radial) { radial = r; rc = uv; } };
  // ---- hits ----
  for (let i = 0; i < HITS.length; i++) {
    const h = HITS[i];
    if (t < h.t || t > h.t + 1.0 || spaceAt(h.t) !== f.space) continue;
    const tau = t - h.t, fi = Math.floor((t - h.t) * 60 + 0.02);
    const c = S.contacts(i)[0], uv = toUv(c.P) || [0.5, 0.5];
    if (h.kind === 'light') { chroma += 0.08 * Math.exp(-tau * 25); bloom += 0.04 * Math.exp(-tau * 20); }
    else if (h.kind === 'medium') {
      chroma += 0.2 * Math.exp(-tau * 16); bloom += 0.08 * Math.exp(-tau * 14); kick(0.16 * Math.exp(-tau * 16), uv);
      if (tau < 0.3) rips.push({ c: uv, r: 0.45 * (1 - Math.exp(-tau * 9)), s: 0.012 * (1 - tau / 0.3) });
    } else if (h.kind === 'heavy') {
      if (fi === 0) flash = Math.max(flash, 0.4); else if (fi === 1) flash = Math.max(flash, 0.12);
      chroma += 0.5 * Math.exp(-tau * 9); bloom += 0.12 * Math.exp(-tau * 10); kick(0.3 * Math.exp(-tau * 12), uv);
      if (tau < 0.45) {
        rips.push({ c: uv, r: 0.75 * (1 - Math.exp(-tau * 7)), s: 0.028 * (1 - tau / 0.45) });
        if (tau > 0.05) rips.push({ c: uv, r: 0.5 * (1 - Math.exp(-(tau - 0.05) * 7)), s: 0.016 * (1 - tau / 0.45) });
      }
    }
  }
  // ---- mega 8.40: impact frames, frozen grade, then the sphere burst at 8.60 ----
  const vc = S.boneAt(S.defs.victim, 8.4, 'chest'), vuv = f.space === 'inside' ? toUv(vc) : null;
  if (t >= 8.4 && t < 8.6) {
    const fi = Math.floor((t - 8.4) * 60 + 0.02);
    p.radialCenter = vuv || [0.5, 0.5];
    p.monoThreshold = [0.3, 0.6];
    if (fi <= 3) { p.bloom = { ...p.bloom, strength: 0 }; p.chroma = 0; p.radial = 0; p.ripples = []; p.vignette = 0; p.grain = 0; p.exposure = 1; }
    if (fi <= 1) { p.mono = 1; p.invert = 1; p.lines = 1; p.letterbox = 0; }
    else if (fi <= 3) { p.mono = 1; p.invert = 0; p.lines = 1; p.letterbox = 0; }
    else if (fi <= 5) { flash = Math.max(flash, fi === 4 ? 0.75 : 0.4); p.flashColor = [1, 0.92, 1]; }
    else { p.saturation = 0.35; p.contrast = 1.3; p.vignette = 0.6; chroma += 0.3; p.exposure *= 0.72; }
  }
  if (t >= 8.6 && t < 9.4) {
    const tau = t - 8.6, fi = Math.floor(tau * 60 + 0.02);
    if (fi === 0) flash = Math.max(flash, 0.5);
    chroma += 0.8 * Math.exp(-tau * 6); bloom += 0.35 * Math.exp(-tau * 6);
    if (vuv) { kick(0.6 * Math.exp(-tau * 7), vuv); rips.push({ c: vuv, r: 1.1 * (1 - Math.exp(-tau * 3.4)), s: 0.045 * Math.max(0, 1 - tau / 0.7) }); }
  }
  // the gap 8.30–8.40: everything holds its breath
  if (t >= 8.3 && t < 8.4) { const u = sm((t - 8.3) / 0.05); p.saturation *= 1 - 0.4 * u; p.contrast *= 1 + 0.12 * u; p.vignette += 0.15 * u; }
  // ---- launch 8.80 is a heavy (above); the hammer 9.60: impact frames then a white flash to the cut ----
  if (t >= 9.6 && t < 9.65) {
    const fi = Math.floor((t - 9.6) * 60 + 0.02);
    const c = S.contacts(HITS.findIndex(h => h.t === 9.6))[0];
    p.radialCenter = toUv(c.P) || [0.5, 0.5]; p.monoThreshold = [0.3, 0.6];
    if (fi <= 1) { p.bloom = { ...p.bloom, strength: 0 }; p.chroma = 0; p.radial = 0; p.ripples = []; p.vignette = 0; p.grain = 0; p.exposure = 1; }
    if (fi === 0) { p.mono = 1; p.invert = 1; p.lines = 1; p.letterbox = 0; }
    else if (fi === 1) { p.mono = 1; p.invert = 0; p.lines = 1; p.letterbox = 0; }
    else { flash = Math.max(flash, 1); p.flashColor = [1, 0.96, 1]; }
  }
  if (t >= 9.65 && t < 9.75) flash = Math.max(flash, 0.5 * Math.pow(1 - (t - 9.65) / 0.1, 2));
  // ---- crater 9.85 ----
  let shake = 0;
  if (t >= 9.85 && t < 11.2 && f.space === 'world') {
    const tau = t - 9.85, fi = Math.floor(tau * 60 + 0.02);
    const uv = toUv(S.craterAt.clone().setY(0.3)) || [0.5, 0.6];
    if (fi === 0) { flash = Math.max(flash, 0.8); p.flashColor = [1, 0.94, 1]; }
    else if (fi === 1) { p.invert = 1; p.contrast = 1.3; }
    else if (fi === 2) flash = Math.max(flash, 0.3);
    kick(0.9 * Math.exp(-tau * 6), uv); chroma += 0.9 * Math.exp(-tau * 5); bloom += 0.5 * Math.exp(-tau * 6);
    if (tau < 0.9) {
      rips.push({ c: uv, r: 1.2 * (1 - Math.exp(-tau * 3.5)), s: 0.04 * (1 - tau / 0.9) });
      if (tau > 0.07) rips.push({ c: uv, r: 0.8 * (1 - Math.exp(-(tau - 0.07) * 3.5)), s: 0.022 * (1 - tau / 0.9) });
    }
    shake += 0.016 * Math.exp(-tau * 4.5);
  }
  // ---- landing 10.4 ----
  if (t >= 10.4 && t < 11.2 && f.space === 'world') {
    const tau = t - 10.4, uv = toUv(S.landAt.clone().setY(0.2)) || [0.5, 0.6];
    chroma += 0.3 * Math.exp(-tau * 9); bloom += 0.3 * Math.exp(-tau * 9);
    if (tau < 0.5) rips.push({ c: uv, r: 0.6 * (1 - Math.exp(-tau * 6)), s: 0.018 * (1 - tau / 0.5) });
    shake += 0.006 * Math.exp(-tau * 7);
  }
  if (shake > 1e-4) p.shake = [shake * shakeNoise(t * 38, 1), shake * shakeNoise(t * 41, 2) * 0.8, shake * 2.1 + 0.002];
  // ---- charge: heat shimmer around the user ----
  if (t > 0.4 && t < 2.0 && f.space === 'world') {
    const I = t < 1.6 ? sm((t - 0.4) / 1.2) : 1 - sm((t - 1.6) / 0.4);
    const head = f.bone('user', 'head'), feet = f.bone('user', 'pelvis').clone(); feet.y = 0;
    const a = toUv(head), b = toUv(feet);
    if (a && b) {
      const r = clamp(Math.hypot((a[0] - b[0]) * f.camera.aspect, a[1] - b[1]) * 0.75, 0.08, 0.9);
      p.heat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r, 0.0028 * I];
    }
  }
  // ---- clone split 6.4: a quick glitch on each spawn ----
  for (const c of S.clones) { const ts = t - c.spawn; if (ts >= 0 && ts < 0.05) { p.glitch = Math.max(p.glitch || 0, 0.5 * (1 - ts / 0.05)); p.glitchSeed = Math.floor(t * 60); } }
  // ---- blinks: a tiny aberration tick ----
  for (const b of S.blinks) { const ta = t - b.tOn; if (ta >= 0 && ta < 0.08) chroma += 0.2 * (1 - ta / 0.08); }

  if (f.space === 'inside' && impactFrame(t)) { p.flash = 0; return p; }   // silhouettes stay clean
  if (radial > p.radial) { p.radial = radial; if (rc) p.radialCenter = rc; }
  p.chroma += chroma; p.flash = Math.max(p.flash, flash); p.bloom = { ...p.bloom, strength: p.bloom.strength + bloom };
  p.ripples = (p.ripples || []).concat(rips);
  return p;
}
