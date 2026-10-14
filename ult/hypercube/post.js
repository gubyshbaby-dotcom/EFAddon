// Post-processing: render → bloom → "fx" (aberration, radial blur, impact inversion, flash, vignette, grade, grain,
// letterbox, fade) → output. postAt(t) gives every parameter as a pure function of time; vfx/post_curves.js (owned by the
// VFX engineer) may override it by exporting postCurves(t, base).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const FX_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 720) },
    uChroma: { value: 0 }, uRadial: { value: 0 }, uRadialCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uInvert: { value: 0 }, uMono: { value: 0 }, uContrast: { value: 1 }, uSaturation: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.25 }, uGrain: { value: 0.03 },
    uLetterbox: { value: 0 }, uFade: { value: 0 }, uLines: { value: 0 }, uExposure: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uChroma, uRadial, uInvert, uMono, uContrast, uSaturation, uFlash, uVignette, uGrain, uLetterbox, uFade, uLines, uExposure;
    uniform vec2 uRadialCenter; uniform vec3 uTint, uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 samp(vec2 uv){
      vec2 d = uv - uRadialCenter;
      vec3 c = vec3(0.0);
      // radial (zoom) blur + chromatic aberration along the radius
      const int N = 12;
      for (int i = 0; i < N; i++) {
        float k = float(i) / float(N - 1);
        vec2 o = d * (1.0 - uRadial * k * 0.35);
        vec2 ca = d * uChroma * 0.06;
        c.r += texture2D(tDiffuse, uRadialCenter + o + ca).r;
        c.g += texture2D(tDiffuse, uRadialCenter + o).g;
        c.b += texture2D(tDiffuse, uRadialCenter + o - ca).b;
      }
      return c / float(N);
    }
    void main(){
      vec2 uv = vUv;
      vec3 c = samp(uv) * uExposure;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      // impact frame: high-contrast black/white, optionally inverted, with radial speed lines
      if (uMono > 0.0) {
        float m = smoothstep(0.42, 0.58, l);
        vec2 d = uv - uRadialCenter;
        float ang = atan(d.y, d.x);
        float lines = step(0.72, hash(vec2(floor(ang * 90.0), 1.0))) * smoothstep(0.08, 0.6, length(d));
        m = clamp(m + lines * uLines, 0.0, 1.0);
        c = mix(c, vec3(m), uMono);
      }
      c = mix(c, 1.0 - c, uInvert);
      c = mix(c, uFlashColor, uFlash);
      vec2 vd = uv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(vd * vec2(1.0, 0.8)) * 1.4);
      c += (hash(uv * uRes + uTime * 61.0) - 0.5) * uGrain;
      float lb = uLetterbox * 0.12;
      if (uv.y < lb || uv.y > 1.0 - lb) c = vec3(0.0);
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

/** Defaults; vfx/post_curves.js refines them. Values: see FX_SHADER uniforms + bloom {strength, radius, threshold}. */
export function basePost(t) {
  return {
    bloom: { strength: 0.6, radius: 0.5, threshold: 0.85 },
    chroma: 0, radial: 0, radialCenter: [0.5, 0.5], invert: 0, mono: 0, lines: 0, contrast: 1.05, saturation: 1.05,
    tint: [1, 1, 1], flash: 0, flashColor: [1, 1, 1], vignette: 0.3, grain: 0.035, letterbox: 1, fade: 0, exposure: 1,
  };
}

export function applyPost(post, p, t) {
  post.bloom.strength = p.bloom.strength; post.bloom.radius = p.bloom.radius; post.bloom.threshold = p.bloom.threshold;
  const u = post.fx.uniforms;
  u.uTime.value = t;
  u.uChroma.value = p.chroma; u.uRadial.value = p.radial; u.uRadialCenter.value.set(p.radialCenter[0], p.radialCenter[1]);
  u.uInvert.value = p.invert; u.uMono.value = p.mono; u.uLines.value = p.lines; u.uContrast.value = p.contrast;
  u.uSaturation.value = p.saturation; u.uTint.value.set(...p.tint); u.uFlash.value = p.flash; u.uFlashColor.value.set(...p.flashColor);
  u.uVignette.value = p.vignette; u.uGrain.value = p.grain; u.uLetterbox.value = p.letterbox; u.uFade.value = p.fade; u.uExposure.value = p.exposure;
}
