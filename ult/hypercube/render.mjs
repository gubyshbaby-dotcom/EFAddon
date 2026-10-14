// Frame-exact render of the ult: node render.mjs [--fps 60] [--size 1280x720] [--from 0] [--to 15] [--out out/ult]
//   [--times 0.5,1.2,...] (only these frames, as PNG) [--sheet cols] [--debug] [--noaudio] [--novfx] [--lab user:side]
// Video: out/<name>/ult.mp4 (+ audio/out/mix.wav when present). Frames: out/<name>/frames/f_%05d.jpg
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const FPS = +opt('--fps', 60);
const [W, H] = opt('--size', '1280x720').split('x').map(Number);
const FROM = +opt('--from', 0), TO = +opt('--to', 15);
const OUT = resolve(opt('--out', join(HERE, 'out', 'ult')));
const TIMES = opt('--times', null);
const SHEET = +opt('--sheet', 0);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = createServer((q, r) => {
  const p = join(HERE, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(HERE) || !existsSync(p)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  r.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.error('[pageerror]', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error('[console]', m.text()); } });
const extra = (a.includes('--debug') ? '&debug' : '') + (a.includes('--novfx') ? '&novfx' : '') + (opt('--lab', null) ? '&lab=' + encodeURIComponent(opt('--lab')) : '');
await page.goto(`http://localhost:${server.address().port}/page.html?w=${W}&h=${H}${extra}`);
await page.waitForFunction(() => window.sceneReady === true || window.sceneError, null, { timeout: 300000 });
await page.waitForTimeout(800); // textures

mkdirSync(OUT, { recursive: true });
if (TIMES) {
  const ts = TIMES.split(',').map(Number);
  for (const t of ts) {
    await page.evaluate(tt => window.renderAt(tt), t);
    await page.screenshot({ path: join(OUT, `t_${t.toFixed(3)}.png`) });
  }
  console.log(`${ts.length} frames → ${OUT}`);
} else {
  const dir = join(OUT, 'frames');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const n = Math.floor((TO - FROM) * FPS + 1e-6);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = FROM + i / FPS;
    await page.evaluate(tt => window.renderAt(tt), t);
    await page.screenshot({ path: join(dir, `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 60 === 0) console.log(`frame ${i}/${n}  t=${t.toFixed(2)}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s/frame`);
  }
  const wav = join(HERE, 'audio', 'out', 'mix.wav');
  const audio = !a.includes('--noaudio') && existsSync(wav) ? ['-ss', String(FROM), '-t', String(TO - FROM), '-i', wav] : [];
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f_%05d.jpg'), ...audio,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', ...(audio.length ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
    '-movflags', '+faststart', join(OUT, 'ult.mp4')]);
  console.log('video', join(OUT, 'ult.mp4'), audio.length ? '(with audio)' : '(no audio)');
  if (SHEET) {
    const step = Math.max(1, Math.floor(n / (SHEET * 4)));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f_%05d.jpg'),
      '-vf', `select='not(mod(n\\,${step}))',scale=384:-1,tile=${SHEET}x4`, '-frames:v', '1', join(OUT, 'sheet.jpg')]);
  }
}
if (errors.length) console.log('ERRORS:', errors.length);
await browser.close(); server.close();
