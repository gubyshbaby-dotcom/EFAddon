// Post-processing: render → bloom → "fx" → output (ACES tone mapping + sRGB in OutputPass). Owned by VFX engineer B.
// The fx pass works on LINEAR HDR colour (before tone mapping): shake/zoom, glitch slices, screen ripples, heat shimmer,
// radial (zoom) blur + chromatic aberration, grading (saturation, contrast about mid-grey, tint), impact frames
// (mono / invert / speed lines), flash, vignette, grain, letterbox, fade.
// basePost(t) gives every parameter as a pure function of time (sectional grading, letterbox, fades); vfx/post_curves.js
// lets every VFX module refine it (post(t, p, f) → p). applyPost copies p into the passes.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const NRIP = 4;
export const FX_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 720) },
    uChroma: { value: 0 }, uRadial: { value: 0 }, uRadialCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uInvert: { value: 0 }, uMono: { value: 0 }, uMonoTh: { value: new THREE.Vector2(0.35, 0.5) },
    uContrast: { value: 1 }, uSaturation: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.25 }, uGrain: { value: 0.03 },
    uLetterbox: { value: 0 }, uFade: { value: 0 }, uLines: { value: 0 }, uExposure: { value: 1 },
    uRip: { value: Array.from({ length: NRIP }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uHeat: { value: new THREE.Vector4(0.5, 0.5, 0.2, 0) }, uGlitch: { value: 0 }, uGlitchSeed: { value: 0 },
    uShake: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uChroma, uRadial, uInvert, uMono, uContrast, uSaturation, uFlash, uVignette, uGrain, uLetterbox, uFade, uLines, uExposure;
    uniform float uGlitch, uGlitchSeed;
    uniform vec2 uRadialCenter, uMonoTh; uniform vec3 uTint, uFlashColor, uShake;
    uniform vec4 uRip[${NRIP}]; uniform vec4 uHeat;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 samp(vec2 uv){
      vec2 d = uv - uRadialCenter;
      if (uRadial > 0.02) {           // below this the 16-tap loop is invisible: skip it (cost)
        // radial (zoom) blur + chromatic aberration along the radius
        vec3 c = vec3(0.0);
        vec2 ca = d * uChroma * 0.06;
        for (int i = 0; i < 16; i++) {
          float k = float(i) / 15.0;
          vec2 o = uRadialCenter + d * (1.0 - uRadial * k * 0.35);
          c.r += texture2D(tDiffuse, o + ca).r;
          c.g += texture2D(tDiffuse, o).g;
          c.b += texture2D(tDiffuse, o - ca).b;
        }
        return c / 16.0;
      }
      if (uChroma > 0.01) {
        vec2 ca = d * uChroma * 0.06;
        return vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      }
      return texture2D(tDiffuse, uv).rgb;
    }
    void main(){
      vec2 uv = vUv;
      float lb = uLetterbox * 0.12;
      if (uv.y < lb || uv.y > 1.0 - lb) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      // shake: shift + a slight zoom so the frame edge never shows
      uv = (uv - 0.5) * (1.0 - uShake.z) + 0.5 + uShake.xy;
      // glitch: horizontal slices shifted sideways
      if (uGlitch > 0.0) {
        float band = floor(uv.y * (14.0 + 26.0 * hash(vec2(uGlitchSeed, 1.7))));
        float r = hash(vec2(band, uGlitchSeed));
        if (r < uGlitch * 0.6) uv.x += (hash(vec2(band + 3.1, uGlitchSeed)) - 0.5) * 0.16 * uGlitch;
      }
      // screen-space shock ripples: (centre uv, radius in screen heights, strength)
      for (int i = 0; i < ${NRIP}; i++) {
        vec4 R = uRip[i];
        if (R.w != 0.0) {
          vec2 d = (uv - R.xy) * asp; float r = length(d);
          float w = 0.035 + R.z * 0.22;
          float k = (r - R.z) / w;
          uv -= (d / max(r, 1e-4)) / asp * (R.w * k * exp(-k * k));
        }
      }
      // heat shimmer inside a soft circle
      if (uHeat.w > 0.0) {
        vec2 d = (uv - uHeat.xy) * asp; float m = 1.0 - smoothstep(uHeat.z * 0.45, uHeat.z, length(d));
        uv += m * uHeat.w * vec2(sin(uv.y * 96.0 + uTime * 23.0) + 0.6 * sin(uv.y * 41.0 - uTime * 17.0),
                                 sin(uv.x * 74.0 - uTime * 19.0) + 0.5 * sin(uv.x * 31.0 + uTime * 13.0));
      }
      vec3 c = samp(uv) * uExposure;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = 0.18 * pow(max(c, vec3(0.0)) / 0.18, vec3(uContrast));
      c *= uTint;
      // impact frame: hard black/white with radial speed lines (lines are white before an optional invert)
      if (uMono > 0.0) {
        float m = smoothstep(uMonoTh.x, uMonoTh.y, l);
        vec2 d = (uv - uRadialCenter) * asp;
        float rr = length(d);
        float fr = floor(uTime * 60.0 + 0.5);
        float a = atan(d.y, d.x) / 6.2831853 * 150.0;
        float bin = floor(a);
        float hb = hash(vec2(bin, fr));
        float wdt = 0.5 * smoothstep(0.1 + 0.3 * hash(vec2(bin, fr + 7.0)), 1.0, rr);
        float lines = step(0.55, hb) * step(abs(fract(a) - 0.5), wdt);
        m = clamp(m + lines * uLines, 0.0, 1.0);
        c = mix(c, vec3(m) * 5.0, uMono);
      }
      if (uInvert > 0.0) {
        // invert in a display-like space: d = 1 - e^(-1.6c), inverse mapped back to linear
        vec3 dsp = 1.0 - exp(-max(c, vec3(0.0)) * 1.6);
        vec3 inv = min(-log(max(dsp, vec3(0.002))) / 1.6, vec3(6.0));
        c = mix(c, inv, uInvert);
      }
      c = mix(c, uFlashColor * (1.0 + 2.0 * uFlash * uFlash), uFlash);   // full flash = HDR white
      vec2 vd = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(vd * vec2(1.0, 0.8)) * 1.4);
      c *= 1.0 + (hash(vUv * uRes + fract(uTime * 7.31) * 61.0) - 0.5) * uGrain * 2.0;
      c *= 1.0 - uFade;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, w, h) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.5, 0.85);
  composer.addPass(bloom);
  const fx = new ShaderPass(FX_SHADER);
  fx.uniforms.uRes.value.set(w, h);
  composer.addPass(fx);
  composer.addPass(new OutputPass());
  return { composer, bloom, fx };
}

// ---- sectional look (pure functions of t) ----
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** Letterbox amount (1 = bars of 12 % of the height): steps only on cuts; opens wider for the climax. */
export function letterboxAt(t) {
  if (t < 3.4) return 0.8;          // world opening
  if (t < 8.0) return 0.62;         // inside
  if (t < 9.65) return 0.32;        // climax: the frame opens up
  if (t < 11.2) return 0.5;         // meteor, crater, landing
  return 0.85;                      // aftermath + title: cinematic
}
export function fadeAt(t) {
  if (t < 0.15) return 1 - smooth(t / 0.15);
  if (t > 13.9) return smooth((t - 13.9) / 0.5);
  return 0;
}

/** Defaults; VFX modules refine them. Values: see FX_SHADER uniforms + bloom {strength, radius, threshold}.
 *  ripples: [{c:[u,v], r (screen heights), s (strength)}], heat: [u, v, radius, amount], shake: [du, dv, zoom],
 *  glitch 0..1 (+ glitchSeed), monoThreshold: [lo, hi] linear luminance for impact frames. */
export function basePost(t) {
  const inside = t >= 3.4 && t < 9.65;
  return {
    bloom: { strength: inside ? 0.7 : 0.5, radius: 0.45, threshold: 0.85 },
    chroma: 0, radial: 0, radialCenter: [0.5, 0.5], invert: 0, mono: 0, lines: 0, monoThreshold: [0.35, 0.5],
    contrast: inside ? 1.1 : 1.04, saturation: inside ? 1.12 : 1.1,
    tint: inside ? [0.95, 0.96, 1.08] : [1.05, 1.0, 0.93],
    flash: 0, flashColor: [1, 1, 1], vignette: inside ? 0.42 : 0.3, grain: 0.03, letterbox: letterboxAt(t), fade: fadeAt(t), exposure: 1,
    ripples: [], heat: [0.5, 0.5, 0.2, 0], glitch: 0, glitchSeed: 0, shake: [0, 0, 0],
  };
}

export function applyPost(post, p, t) {
  post.bloom.strength = p.bloom.strength; post.bloom.radius = p.bloom.radius; post.bloom.threshold = p.bloom.threshold;
  const u = post.fx.uniforms;
  u.uTime.value = t;
  u.uChroma.value = p.chroma; u.uRadial.value = p.radial; u.uRadialCenter.value.set(p.radialCenter[0], p.radialCenter[1]);
  u.uInvert.value = p.invert; u.uMono.value = p.mono; u.uLines.value = p.lines; u.uContrast.value = p.contrast;
  const mt = p.monoThreshold || [0.35, 0.5]; u.uMonoTh.value.set(mt[0], mt[1]);
  u.uSaturation.value = p.saturation; u.uTint.value.set(...p.tint); u.uFlash.value = p.flash; u.uFlashColor.value.set(...p.flashColor);
  u.uVignette.value = p.vignette; u.uGrain.value = p.grain; u.uLetterbox.value = p.letterbox; u.uFade.value = p.fade; u.uExposure.value = p.exposure;
  const rips = (p.ripples || []).filter(r => r && Math.abs(r.s) > 1e-4).sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
  for (let i = 0; i < NRIP; i++) {
    const r = rips[i];
    if (r) u.uRip.value[i].set(r.c[0], r.c[1], r.r, r.s); else u.uRip.value[i].set(0, 0, 0, 0);
  }
  const ht = p.heat || [0.5, 0.5, 0.2, 0]; u.uHeat.value.set(ht[0], ht[1], ht[2], ht[3]);
  u.uGlitch.value = p.glitch || 0; u.uGlitchSeed.value = p.glitchSeed || 0;
  const sk = p.shake || [0, 0, 0]; u.uShake.value.set(sk[0], sk[1], sk[2]);
}
