// vfx/title.js — VFX-B: the «ГИПЕРКУБ» title (HUD overlay, DOM). A pure function of t: every style is set on every update.
// 12.00 glitch-in (RGB split, slice offsets, flicker, scan flash) · subtitle types in · a rotating tesseract glyph ·
// hold with a slow push and two micro-glitches · 13.45–13.60 glitch-out collapsing to a line (CRT off).
import { fadeAt } from '../post.js';

const T_IN = 12.0, T_OUT = 13.45, T_END = 13.6;
const TEXT = 'ГИПЕРКУБ', SUB = 'УЛЬТИМЕЙТ';
const CUTS = [0, 0.17, 0.3, 0.46, 0.58, 0.73, 0.87, 1];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
function hash(a, b = 0) { const s = Math.sin(a * 127.1 + b * 311.7 + 0.13) * 43758.5453; return s - Math.floor(s); }

// tesseract glyph: 16 vertices of the 4D cube, rotated in XW and YZ, projected 4D → 3D → 2D
const V4 = []; for (let i = 0; i < 16; i++) V4.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const E4 = []; for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) E4.push([i, j]); }
function glyphPath(t) {
  const a = t * 1.25, b = t * 0.6, c = 0.5;
  const P = V4.map(([x, y, z, w]) => {
    let x1 = x * Math.cos(a) - w * Math.sin(a), w1 = x * Math.sin(a) + w * Math.cos(a);
    let y1 = y * Math.cos(b) - z * Math.sin(b), z1 = y * Math.sin(b) + z * Math.cos(b);
    const k = 1 / (3 - w1); x1 *= k; y1 *= k; z1 *= k;
    const x2 = x1 * Math.cos(c) + z1 * Math.sin(c), z2 = -x1 * Math.sin(c) + z1 * Math.cos(c);
    return [x2 * 1.9, (y1 * Math.cos(0.35) - z2 * Math.sin(0.35)) * 1.9];
  });
  return E4.map(([i, j]) => `M${P[i][0].toFixed(3)} ${P[i][1].toFixed(3)}L${P[j][0].toFixed(3)} ${P[j][1].toFixed(3)}`).join('');
}

export function create(ctx) {
  const hud = ctx.hud, H = ctx.H, W = ctx.W;
  if (!hud) return { update() {} };
  const fs = Math.round(H * 0.145);
  const root = document.createElement('div');
  root.style.cssText = `position:absolute;left:0;right:0;top:${Math.round(H * 0.6)}px;display:none;text-align:center;pointer-events:none;` +
    `font-family:"Inter Display","Inter","DejaVu Sans",sans-serif;font-weight:900;transform-origin:50% 60%;`;
  // subtitle row: glyph + letters + rules
  const subRow = document.createElement('div');
  subRow.style.cssText = `display:flex;align-items:center;justify-content:center;gap:${Math.round(H * 0.014)}px;height:${Math.round(H * 0.05)}px;`;
  const rule = () => { const d = document.createElement('div'); d.style.cssText = `height:${Math.max(1, Math.round(H * 0.002))}px;background:linear-gradient(90deg,transparent,#cdb8ff,transparent);`; return d; };
  const ruleL = rule(), ruleR = rule();
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  const gs = Math.round(H * 0.048);
  svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2'); svg.setAttribute('width', gs); svg.setAttribute('height', gs);
  svg.style.cssText = 'overflow:visible;filter:drop-shadow(0 0 3px #8b5cff) drop-shadow(0 0 7px #ff3df2);';
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#e9ddff'); path.setAttribute('stroke-width', '0.07'); path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  const sub = document.createElement('div');
  sub.style.cssText = `font-size:${Math.round(H * 0.036)}px;letter-spacing:0.55em;color:#f2ecff;font-weight:900;margin-right:-0.55em;` +
    `text-shadow:0.06em 0.08em 0 #1b0a3a,0 0 6px #8b5cff,0 0 16px #ff3df2;white-space:nowrap;`;
  const subSpans = [...SUB].map(ch => { const s = document.createElement('span'); s.textContent = ch; sub.appendChild(s); return s; });
  subRow.append(ruleL, svg, sub, ruleR);
  // main title: RGB ghost copies + slices of the gradient-filled text
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;display:inline-block;font-size:${fs}px;line-height:1;margin-top:${Math.round(H * 0.006)}px;`;
  const base = `display:block;white-space:nowrap;letter-spacing:0.05em;margin-right:-0.05em;font-style:normal;`;
  const sizer = document.createElement('div'); sizer.textContent = TEXT; sizer.style.cssText = base + 'visibility:hidden;';
  const copy = (color) => { const d = document.createElement('div'); d.textContent = TEXT; d.style.cssText = base + `position:absolute;left:0;top:0;color:${color};`; return d; };
  const red = copy('rgba(255,40,90,0.75)'), cyan = copy('rgba(40,230,255,0.75)');
  // dark backing so the title reads over a bright sky: a hard offset shade + a dark outline
  const shade = copy('#1b0a3a'); shade.style.webkitTextStroke = '0.07em #12052a';
  shade.style.transform = 'translate(0.03em,0.05em)';
  const glowL = copy('rgba(0,0,0,0)');
  glowL.style.filter = 'drop-shadow(0 0 0.06em #8b5cff) drop-shadow(0 0 0.22em #8b5cff) drop-shadow(0 0 0.5em rgba(255,61,242,0.55))';
  glowL.style.color = '#8b5cff';
  const slices = [];
  for (let i = 0; i < CUTS.length - 1; i++) {
    const d = copy('transparent');
    d.style.backgroundImage = 'linear-gradient(180deg,#ffffff 0%,#ffffff 46%,#e3d6ff 58%,#a585ff 82%,#7a4dff 100%)';
    d.style.webkitBackgroundClip = 'text'; d.style.backgroundClip = 'text';
    d.style.clipPath = `inset(${(CUTS[i] * 100).toFixed(1)}% -5% ${((1 - CUTS[i + 1]) * 100).toFixed(1)}% -5%)`;
    slices.push(d);
  }
  const scan = document.createElement('div');
  scan.style.cssText = 'position:absolute;left:-8%;right:-8%;height:0.12em;top:0;background:linear-gradient(180deg,transparent,rgba(255,255,255,0.95),transparent);' +
    'filter:blur(0.5px);mix-blend-mode:screen;';
  const lineFlash = document.createElement('div');
  lineFlash.style.cssText = `position:absolute;left:0;right:0;height:${Math.max(2, Math.round(H * 0.004))}px;top:50%;background:#fff;box-shadow:0 0 12px #c9b2ff,0 0 30px #8b5cff;`;
  wrap.append(sizer, shade, glowL, red, cyan, ...slices, scan);
  root.append(subRow, wrap);
  hud.appendChild(root);
  hud.appendChild(lineFlash);
  lineFlash.style.display = 'none';
  const lineTop = Math.round(H * 0.6 + H * 0.05 + fs * 0.55);

  return {
    update(t) {
      const fade = 1 - fadeAt(t);
      if (t < T_IN || t >= T_END + 0.05) { root.style.display = 'none'; lineFlash.style.display = 'none'; return; }
      const fr = Math.floor(t * 60 + 0.02);
      // glitch amount: in (decaying), two micro hits, out (rising)
      let g = 0;
      if (t < T_IN + 0.3) g = 1 - sm((t - T_IN) / 0.3);
      if (t > 12.74 && t < 12.79) g = Math.max(g, 0.35);
      if (t > 13.12 && t < 13.16) g = Math.max(g, 0.25);
      if (t > T_OUT) g = Math.max(g, sm((t - T_OUT) / 0.1));
      // visibility flicker at the start, CRT collapse at the end
      let op = 1;
      if (t < T_IN + 0.16 && hash(fr, 3) < 0.35) op = 0.15;
      if (t < T_IN + 0.02) op = 0.0;
      const out = clamp((t - (T_END - 0.08)) / 0.08);
      const sy = t < T_END - 0.08 ? 1 : Math.max(0.02, 1 - sm(out) * 0.98);
      const sx = 1 + 0.25 * sm(out);
      const push = 1 + 0.035 * sm((t - T_IN) / (T_END - T_IN)) + (t < T_IN + 0.1 ? 0.08 * (1 - (t - T_IN) / 0.1) : 0);
      root.style.display = 'block';
      root.style.opacity = String(op * fade * (t > T_END ? 0 : 1));
      root.style.transform = `scale(${(push * sx).toFixed(4)},${(push * sy).toFixed(4)}) skewX(-7deg)`;
      root.style.filter = out > 0 ? `brightness(${(1 + 2.5 * out).toFixed(2)})` : 'none';
      // RGB split and slice offsets
      const split = (0.004 + 0.06 * g) * fs;
      red.style.transform = `translate(${(-split + (hash(fr, 1) - 0.5) * g * fs * 0.04).toFixed(1)}px,${((hash(fr, 2) - 0.5) * g * fs * 0.03).toFixed(1)}px)`;
      cyan.style.transform = `translate(${(split + (hash(fr, 4) - 0.5) * g * fs * 0.04).toFixed(1)}px,0px)`;
      red.style.opacity = cyan.style.opacity = String(0.25 + 0.65 * g);
      for (let i = 0; i < slices.length; i++) {
        const on = hash(i, fr) < 0.25 + 0.6 * g;
        const dx = on ? (hash(i + 7, fr) - 0.5) * g * fs * 0.9 : 0;
        slices[i].style.transform = `translateX(${dx.toFixed(1)}px)`;
      }
      glowL.style.opacity = String(0.55 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 2.1) + 0.2 * g);
      // scan flash sweeping down the title right after it lands
      const su = (t - (T_IN + 0.06)) / 0.2;
      if (su >= 0 && su <= 1) { scan.style.display = 'block'; scan.style.top = `${(-10 + su * 110).toFixed(1)}%`; scan.style.opacity = String(1 - su * 0.5); }
      else scan.style.display = 'none';
      // letter spacing breathes open during the hold
      const ls = 0.05 + 0.035 * sm((t - T_IN - 0.2) / 1.2);
      for (const d of [sizer, shade, red, cyan, glowL, ...slices]) { d.style.letterSpacing = `${ls.toFixed(4)}em`; d.style.marginRight = `${(-ls).toFixed(4)}em`; }
      // subtitle types in, rules extend
      const n = Math.floor((t - (T_IN + 0.18)) / 0.028);
      subSpans.forEach((s, i) => { s.style.opacity = i < n ? (i === n - 1 ? '0.6' : '1') : '0'; });
      const ru = sm((t - (T_IN + 0.15)) / 0.35);
      ruleL.style.width = ruleR.style.width = `${Math.round(W * 0.12 * ru)}px`;
      svg.style.opacity = String(sm((t - (T_IN + 0.12)) / 0.15));
      path.setAttribute('d', glyphPath(t));
      // a thin horizontal flash line: at the very start (the title "prints" out of it) and at the CRT collapse
      const lf = t < T_IN + 0.06 ? 1 - (t - T_IN) / 0.06 : out > 0 ? out : 0;
      if (lf > 0) {
        lineFlash.style.display = 'block'; lineFlash.style.top = `${lineTop}px`;
        lineFlash.style.opacity = String(lf * fade);
        lineFlash.style.transform = `scaleX(${(t < T_IN + 0.06 ? 0.3 + 0.7 * (1 - lf) : 0.6 + 0.4 * (1 - out)).toFixed(3)})`;
      } else lineFlash.style.display = 'none';
    },
  };
}
