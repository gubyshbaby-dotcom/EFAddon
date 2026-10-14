// Post-processing per frame: starts from post.js basePost(t) and lets every VFX module adjust it through its optional
// post(t, p, f) export, in MODULES order (tesseract → hyperspace → combat → title). Keep every value a pure function of t.
import { MODULES } from './index.js';
export function postCurves(t, base, f) {
  let p = base;
  for (const m of MODULES) if (m.post) p = m.post(t, p, f) || p;
  return p;
}
